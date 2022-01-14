import type { Writable } from 'svelte/store'
import type { Observable } from 'dexie'
import type { ActionRecordWithId, CreateAccountActionWithId, AccountV0, DebtorDataSource } from './operations'
import type { BaseDebtorData } from './debtor-info'

import equal from 'fast-deep-equal'
import { liveQuery } from 'dexie'
import { writable } from 'svelte/store'
import {
  obtainUserContext, UserContext, AuthenticationError, ServerSessionError, IS_A_NEWBIE_KEY,
  IvalidPaymentData, IvalidPaymentRequest, InvalidCoinUri, DocumentFetchError, RecordDoesNotExist,
  WrongPin, ConflictingUpdate, UnprocessableEntity
} from './operations'
import { InvalidDocument } from './debtor-info'

type AttemptOptions = {
  alerts?: [Function, Alert | (() => void)][],
  startInteraction?: boolean,
  waitingDelay?: number,
}

export { IS_A_NEWBIE_KEY }

export const INVALID_REQUEST_MESSAGE = 'Invalid payment request. '
  + 'Make sure that you are scanning the correct QR code, '
  + 'for the correct payment request.'

export const CAN_NOT_PERFORM_ACTOIN_MESSAGE = 'The requested action can not be performed.'

export const WRONG_PIN_MESSAGE = 'A wrong PIN have been entered.'

export const NETWORK_ERROR_MESSAGE = 'A network problem has occured. '
  + 'Please check your Internet connection.'

export const ACTION_DOES_NOT_EXIST_MESSAGE = 'The requested action record does not exist.'

export const INVALID_COIN_MESSAGE = 'Invalid digital coin. '
  + 'Make sure that you are scanning the correct QR code, '
  + 'for the correct digital coin.'

export const UNEXPECTED_ERROR_MESSAGE = 'Oops, something went wrong.'

export type AlertOptions = {
  continue?: () => void,
}

export type ActionManager<T> = {
  currentValue: T,
  markDirty: () => void
  save: () => Promise<void>,
  saveAndClose: () => Promise<void>,
  remove: () => Promise<void>,
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
  | CreateAccountActionModel
  | AccountsModel

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

export type CreateAccountActionData = {
  account: AccountV0,
  debtorData: BaseDebtorData,
  debtorDataSource: DebtorDataSource,
  unit: string,
  amountDivisor: number,
  decimalPlaces: bigint,
}

export type CreateAccountActionModel = BasePageModel & {
  type: 'CreateAccountActionModel',
  action: CreateAccountActionWithId,
  data?: CreateAccountActionData,
}

export type AccountsModel = BasePageModel & {
  type: 'AccountsModel',
}

export const HAS_LOADED_PAYMENT_REQUEST_KEY = 'creditors.hasLoadedPaymentRequest'
export const HAS_SCANNED_DIGITAL_COIN_KEY = 'creditors.hasScannedDigitalCoin'

export const authenticated = writable(true)

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
      authenticated.set(true)
      await executeCallbackAfterUpdate()
    }, {
      alerts: [
        [AuthenticationError, () => { }],
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

  showAction(actionId: number, back?: () => void): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const action = await this.uc.getActionRecord(actionId)
      if (this.interactionId === interactionId) {
        if (action !== undefined) {
          switch (action.actionType) {
            case 'CreateAccount':
              this.showCreateAccountAction(this.createActionManager(action), back)
              break
            default:
              throw new Error('unknown action type')
          }
        } else {
          this.addAlert(new Alert(ACTION_DOES_NOT_EXIST_MESSAGE, { continue: () => this.showActions() }))
        }
      }
    })
  }

  showCreateAccountAction(actionManager: ActionManager<CreateAccountActionWithId>, back?: () => void): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    const obtainData = async (): Promise<CreateAccountActionData> => {
      const { latestDebtorInfoUri, debtorIdentityUri } = action
      const account = await this.uc.ensureAccountExists(debtorIdentityUri)
      assert(account.debtor.uri === debtorIdentityUri)
      const { debtorData, debtorDataSource } = action.state?.debtorData ?
        action.state : await this.uc.obtainBaseDebtorData(account, latestDebtorInfoUri)
      if (debtorDataSource === 'uri' && debtorData.latestDebtorInfo.uri !== latestDebtorInfoUri) {
        throw new InvalidDocument('obsolete debtor info URI')
      }
      const useDisplay = account.display.debtorName !== undefined
      return {
        account,
        debtorData,
        debtorDataSource,
        unit: useDisplay ? (account.display.unit ?? '\u00A4') : debtorData.unit,
        amountDivisor: useDisplay ? account.display.amountDivisor : debtorData.amountDivisor,
        decimalPlaces: useDisplay ? account.display.decimalPlaces : debtorData.decimalPlaces,
      }
    }

    const initializeActionStateIfNecessary = async (data?: CreateAccountActionData): Promise<void> => {
      if (action.state === undefined && data !== undefined) {
        const { account, debtorData, debtorDataSource } = data
        const debtorName = account.display.debtorName
        const editedDebtorName = debtorName ?? debtorData.debtorName
        const neglibibleAmount = debtorName ? account.config.negligibleAmount : undefined
        const tinyNegligibleAmount = calcTinyNegligibleAmount(debtorData)
        const editedNegligibleAmount = BigInt(Math.ceil(neglibibleAmount ?? tinyNegligibleAmount))
        const state = {
          accountInitializationInProgress: false,
          debtorData,
          debtorDataSource,
          editedDebtorName,
          editedNegligibleAmount,
          tinyNegligibleAmount: BigInt(Math.ceil(tinyNegligibleAmount)),
        }
        await this.uc.replaceActionRecord(action, action = { ...action, state })
      }
    }

    const snowData = (data?: CreateAccountActionData): void => {
      this.pageModel.set({
        type: 'CreateAccountActionModel',
        reload: () => { this.showAction(action.actionId, back) },
        goBack,
        action,
        data,
      })
    }

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      let data
      try {
        data = await obtainData()
      } catch (e: unknown) {
        // We can ignore some of the possible errors, because the
        // action page will show an appropriate error message when
        // `data` is undefined.
        switch (true) {
          case e instanceof InvalidCoinUri:
          case e instanceof DocumentFetchError:
          case e instanceof InvalidDocument:
            assert(data === undefined)
            assert(action.state === undefined)
            break
          default:
            throw e
        }
      }
      await initializeActionStateIfNecessary(data)
      if (action.state?.accountInitializationInProgress && data?.account.display.debtorName !== undefined) {
        // It looks like the procedure to initialize a new account has
        // been started, the `debtorName` has been set, but then
        // something went wrong and the action record has not been
        // removed. Here we try to automatically recover from the
        // crash.
        await this.uc.finishAccountInitialization(action)
      } else if (this.interactionId === interactionId) {
        snowData(data)
      }
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  confirmCreateAccountAction(
    actionManager: ActionManager<CreateAccountActionWithId>,
    data: CreateAccountActionData,
    pin: string,
  ): Promise<void> {
    let interactionId: number
    const checkAndShowActions = () => { if (this.interactionId === interactionId) this.showActions() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      if (data.account.display.debtorName === undefined) {
        await this.uc.initializeNewAccount(action, data.account, true, pin)
      } if (action.state?.accountInitializationInProgress) {
        await this.uc.finishAccountInitialization(action)
      } else {
        await this.uc.confirmKnownAccount(action, data.account, pin)
      }
      checkAndShowActions()
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: checkAndShowActions })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndShowActions })],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndShowActions })],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE, { continue: checkAndShowActions })],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE, { continue: checkAndShowActions })],
      ],
    })
  }

  showAccounts(): Promise<void> {
    return this.attempt(async () => {
      this.pageModel.set({
        type: 'AccountsModel',
        reload: () => { this.showAccounts() },
        goBack: () => { this.showActions() },
      })
    })
  }

  createAccount(coinUri: string): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const actionId = await this.uc.createAccount(coinUri)
      if (this.interactionId === interactionId) {
        this.showAction(actionId)
      }
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
        [InvalidCoinUri, new Alert(INVALID_COIN_MESSAGE)],
      ],
    })
  }

  initiatePayment(paymentRequestFile: Blob | Promise<Blob>): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const blob = await paymentRequestFile
      const action = await this.uc.processPaymentRequest(blob)
      if (this.interactionId === interactionId) {
        this.showAction(action.actionId)
      }
    }, {
      alerts: [
        [IvalidPaymentRequest, new Alert(INVALID_REQUEST_MESSAGE)],
        [IvalidPaymentData, new Alert(INVALID_REQUEST_MESSAGE)],
      ],
    })
  }

  /** Create an action manager instance. The action manager queues the
   * consequent asynchronous updates of the action. This is useful in
   * forms/dialogs that may modify the action, and then trigger the
   * execution of the action.
   */
  createActionManager<T extends ActionRecordWithId>(action: T, createModifiedValue = () => action): ActionManager<T> {
    let updatePromise = Promise.resolve()
    let latestValue = action
    let isDirty = false
    let isClosed = false

    const ignoreRecordDoesNotExistErrors = (error: unknown) => {
      if (error instanceof RecordDoesNotExist) {
        console.log('A "RecordDoesNotExist" error has occured during saving.')
        return Promise.resolve()
      } else {
        return Promise.reject(error)
      }
    }
    const store = async (value: T): Promise<void> => {
      await updatePromise
      if (!equal(action, value)) {
        assert(action.actionId === value.actionId)
        assert(action.actionType === value.actionType)
        await this.uc.replaceActionRecord(action, action = value)
      }
    }
    const markDirty = (): void => {
      if (!isDirty) {
        isDirty = true
        addEventListener('beforeunload', save, { capture: true })
        setTimeout(save, 5000)
      }
    }
    const save = (): Promise<void> => {
      if (!isClosed) {
        latestValue = createModifiedValue()
        updatePromise = store(latestValue).catch(ignoreRecordDoesNotExistErrors)
        isDirty = false
      }
      removeEventListener('beforeunload', save, { capture: true })
      return updatePromise
    }
    const saveAndClose = (): Promise<void> => {
      const savePromise = save()
      isClosed = true
      return savePromise
    }
    const remove = async (): Promise<void> => {
      let interactionId: number
      const showActions = () => {
        if (this.interactionId === interactionId) {
          this.showActions()
        }
      }
      const reloadAction = () => {
        if (this.interactionId === interactionId) {
          this.showAction(action.actionId)
        }
      }
      return this.attempt(async () => {
        interactionId = this.interactionId
        await store(latestValue)
        await this.uc.replaceActionRecord(latestValue, null)
        showActions()
      }, {
        alerts: [
          [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: reloadAction })],
        ],
      })
    }

    return {
      get currentValue() { return latestValue },
      markDirty,
      save,
      saveAndClose,
      remove,
    }
  }

  /* Awaits `func()`, catching and logging thrown
   * errors. `options.alerts` determines what alert should be shown on
   * what error. `option.startInteraction` determines whether a
   * hourglass should be shown when the operation had not been
   * completed after some time. */
  private async attempt(func: () => unknown, options: AttemptOptions = {}): Promise<void> {
    const { alerts = [], startInteraction = true, waitingDelay = 250 } = options

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
    const alertFromError = (error: unknown): Alert | (() => void) | undefined => {
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
      if (waitingDelay > 0) {
        timeoutId = setTimeout(addWaitingInteraction, waitingDelay)
      } else {
        addWaitingInteraction()
      }
    } else {
      interactionId = this.interactionId
    }

    try {
      await func()
    } catch (e: unknown) {
      const alert = alertFromError(e)
      if (alert === undefined) {
        console.error(e)
        this.addAlert(new Alert(UNEXPECTED_ERROR_MESSAGE))
        throw e
      } else if (typeof alert === 'function') {
        alert()
      } else {
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

function calcTinyNegligibleAmount(debtroData: BaseDebtorData): number {
  return Math.pow(10, -Number(debtroData.decimalPlaces)) * debtroData.amountDivisor * (1 + Number.EPSILON)
}
