import equal from 'fast-deep-equal'
import { liveQuery } from 'dexie'
import type { Observable } from 'dexie'
import { writable } from 'svelte/store'
import type { Writable } from 'svelte/store'
import {
  obtainUserContext,
  UserContext,
  AuthenticationError,
  ServerSessionError,
} from './operations'
import type {
  ActionRecordWithId,
} from './operations'

type AttemptOptions = {
  alerts?: [Function, Alert | null][],
  startInteraction?: boolean
}

export const NETWORK_ERROR_MESSAGE = 'A network problem has occured. '
  + 'Please check your Internet connection.'

export const UNEXPECTED_ERROR_MESSAGE = 'Oops, something went wrong.'

export type AlertOptions = {
  continue?: () => void,
}

let nextAlertId = 1

export class Alert {
  readonly id: number

  constructor(public message: string, public options: AlertOptions = {}) {
    this.id = nextAlertId++
  }
}

export type Store<T> = {
  subscribe(next: (value: T) => void): (() => void)
}

export type PageModel =
  | ActionsModel

type BasePageModel = {
  type: string,
  reload: () => void,
  goBack?: () => void,
}

export type ActionsModel = BasePageModel & {
  type: 'ActionsModel',
  actions: Store<ActionRecordWithId[]>,
  scrollTop?: number,
  scrollLeft?: number,
}

export class AppState {
  private interactionId: number = 0
  readonly successfulPinReset: Writable<boolean>
  readonly waitingInteractions: Writable<Set<number>>
  readonly alerts: Writable<Alert[]>
  readonly pageModel: Writable<PageModel>
  goBack?: () => void

  constructor(private uc: UserContext, actions: Store<ActionRecordWithId[]>) {
    this.successfulPinReset = writable(false)
    this.waitingInteractions = writable(new Set())
    this.alerts = writable([])
    this.pageModel = writable({
      type: 'ActionsModel',
      reload: () => { this.showActions() },
      actions,
    })
  }

  fetchDataFromServer(callback?: () => void): Promise<void> {
    let interactionId = this.interactionId
    const executeCallbackAfterUpdate = () => new Promise(resolve => {
      this.uc.scheduleUpdate(() => {
        if (this.interactionId === interactionId) {
          callback?.()
        }
        resolve(undefined)
      })
    })

    return this.attempt(async () => {
      interactionId = this.interactionId
      await this.uc.ensureAuthenticated()
      await executeCallbackAfterUpdate()
    }, {
      alerts: [
        [AuthenticationError, null],
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
      ],
    })
  }

  addAlert(alert: Alert): Promise<void> {
    return this.attempt(async () => {
      this.alerts.update(arr => [...arr, alert])
    }, {
      startInteraction: false,
    })
  }

  dismissAlert(alert: Alert): Promise<void> {
    return this.attempt(async () => {
      this.alerts.update(arr => arr.filter(a => !equal(a, alert)))
      alert.options.continue?.()
    }, {
      startInteraction: false,
    })
  }

  resetPin(newPin: string): Promise<void> {
    const retry = () => dispatchEvent(new Event('pin-not-required', { cancelable: true }))

    return this.attempt(async () => {
      await this.uc.resetPin(newPin)
      this.successfulPinReset.set(true)
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: retry })],
      ],
    })
  }

  showActions(): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const actions = await createLiveQuery(() => this.uc.getActionRecords())
      if (this.interactionId === interactionId) {
        this.pageModel.set({
          type: 'ActionsModel',
          reload: () => { this.showActions() },
          actions,
        })
      }
    })
  }

  /* Awaits `func()`, catching and logging thrown
   * errors. `options.alerts` determines what alert should be shown on
   * what error. `option.startInteraction` determines whether a
   * hourglass should be shown when the operation had not been
   * completed after some time. */
  private async attempt(func: () => unknown, options: AttemptOptions = {}): Promise<void> {
    const { alerts = [], startInteraction = true } = options

    const addWaitingInteraction = () => {
      this.waitingInteractions.update(originalSet => {
        const updatedSet = new Set(originalSet)
        updatedSet.add(interactionId)
        return updatedSet
      })
      addedWaitingInteraction = true
    }
    const clearWaitingInteraction = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      if (addedWaitingInteraction) {
        this.waitingInteractions.update(originalSet => {
          const updatedSet = new Set(originalSet)
          updatedSet.delete(interactionId)
          return updatedSet
        })
      }
    }
    const alertFromError = (error: unknown): Alert | null | undefined => {
      for (const [errorConstructor, alert] of alerts) {
        if (error instanceof errorConstructor) {
          return alert
        }
      }
      return undefined
    }

    let addedWaitingInteraction = false
    let timeoutId: any
    let interactionId: number
    if (startInteraction) {
      interactionId = ++this.interactionId
      timeoutId = setTimeout(addWaitingInteraction, 250)
    } else {
      interactionId = this.interactionId
    }

    try {
      await func()
    } catch (e: unknown) {
      const alert = alertFromError(e)
      switch (alert) {
        case undefined:
          console.error(e)
          this.addAlert(new Alert(UNEXPECTED_ERROR_MESSAGE))
          throw e
        case null:
          // ignore the error
          break
        default:
          this.addAlert(alert)
      }
    } finally {
      clearWaitingInteraction()
    }
  }

}

/* Returns a promise for an object that satisfies Svelte's store
 * contract. Svelte stores are required to call the `onNext` method
 * synchronously, but observables are not required to do so. This
 * function awaits for the first value on the observable to appear, so
 * that the created store can return it on subscription. */
export async function createStore<T>(observable: Observable<T>): Promise<Store<T>> {
  let onNext: any
  let onError: any
  const valuePromise = new Promise<T>((resolve, reject) => {
    onNext = resolve
    onError = reject
  })
  const subscription = observable.subscribe(onNext, onError, () => onError(new Error('no value')))
  let currentValue = await valuePromise
  subscription.unsubscribe()

  return {
    subscribe(next) {
      let called = false
      const callNext = (value: T) => {
        if (!(called && currentValue === value)) {
          next(currentValue = value)
          called = true
        }
      }
      const subscription = observable.subscribe(callNext, error => { console.error(error) })
      callNext(currentValue)
      return subscription.unsubscribe
    }
  }
}

export function createLiveQuery<T>(querier: () => T | Promise<T>): Promise<Store<T>> {
  return createStore(liveQuery(querier))
}

export async function createAppState(): Promise<AppState | undefined> {
  const uc = await obtainUserContext()
  if (uc) {
    const actions = await createLiveQuery(() => uc.getActionRecords())
    return new AppState(uc, actions)
  }
  return undefined
}
