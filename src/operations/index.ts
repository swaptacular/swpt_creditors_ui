import type { PinInfo, Account, DebtorIdentity } from './server'
import type {
  WalletRecordWithId, ActionRecordWithId, TaskRecordWithId, ListQueryOptions, CreateTransferActionWithId,
  CreateAccountActionWithId, AckAccountInfoActionWithId, DebtorDataSource, AccountDisplayRecord,
  AccountKnowledgeRecord, ApproveDebtorNameActionWithId
} from './db'
import type {
  AccountV0, AccountKnowledgeV0, AccountConfigV0, AccountExchangeV0, AccountDisplayV0,
} from './canonical-objects'
import type { UserResetMessage } from './db-sync'
import type { DebtorData } from '../debtor-info'

import { v4 as uuidv4 } from 'uuid';
import { UpdateScheduler } from '../update-scheduler'
import {
  server as defaultServer, Oauth2TokenSource, ServerSession, ServerSessionError, AuthenticationError,
  HttpResponse, HttpError
} from './server'
import {
  getWalletRecord, getTasks, removeTask, getActionRecords, settleFetchDebtorInfoTask,
  createActionRecord, getActionRecord, AccountsMap, RecordDoesNotExist, replaceActionRecord,
  InvalidActionState, createApproveAction, getBaseDebtorDataFromAccoutKnowledge, reviseOutdatedDebtorInfos,
  getAccountRecord, getAccountObjectRecord
} from './db'
import {
  getOrCreateUserId, sync, storeObject, PinNotRequired, userResetsChannel, currentWindowUuid, IS_A_NEWBIE_KEY
} from './db-sync'
import { makePinInfo, makeAccount, makeLogObject } from './canonical-objects'
import {
  calcParallelTimeout, parseCoinUri, InvalidCoinUri, DocumentFetchError, fetchDebtorInfoDocument,
  obtainBaseDebtorData
} from './utils'
import {
  IvalidPaymentRequest, IvalidPaymentData, parsePaymentRequest, generatePayment0TransferNote
} from '../payment-requests'

export {
  InvalidActionState,
  RecordDoesNotExist,
  IvalidPaymentRequest,
  IvalidPaymentData,
  InvalidCoinUri,
  DocumentFetchError,
  AuthenticationError,
  ServerSessionError,
  IS_A_NEWBIE_KEY,
}

export type UpdatableAccountObject = AccountConfigV0 | AccountKnowledgeV0 | AccountDisplayV0 | AccountExchangeV0

export type KnownAccountData = {
  debtorData: DebtorData,
  display: AccountDisplayRecord,
}

export type {
  ActionRecordWithId,
  CreateAccountActionWithId,
  AckAccountInfoActionWithId,
  ApproveDebtorNameActionWithId,
  AccountV0,
  DebtorDataSource,
  AccountsMap,
}

export class ConflictingUpdate extends Error {
  name = 'ConflictingUpdate'
}

export class WrongPin extends Error {
  name = 'WrongPin'
}

export class UnprocessableEntity extends Error {
  name = 'UnprocessableEntity'
}

/* Logs out the user and redirects to home, never resolves. */
export async function logout(server = defaultServer): Promise<never> {
  return await server.logout()
}

/* If the user is logged in -- does nothing. Otherwise, redirects to
 * the login page, and never resolves. */
export async function login(server = defaultServer): Promise<void> {
  await server.login(async (login) => await login())
}

/* If the user is logged in -- does nothing. Otherwise, redirects to
 * the login page that request PIN reset authorization, and never
 * resolves. */
export async function authorizePinReset(): Promise<void> {
  const server = new ServerSession({
    tokenSource: new Oauth2TokenSource(true),
    onLoginAttempt: async (login) => await login()
  })
  await server.login()
}

/* Tries to update the local database, reading the latest data from
 * the server. Any network failures will be swallowed. */
export async function update(server: ServerSession, userId: number): Promise<void> {
  try {
    await sync(server, userId)
    await reviseOutdatedDebtorInfosIfNecessary(userId)
    await executeReadyTasks(server, userId)

  } catch (error: unknown) {
    let event
    switch (true) {
      case error instanceof AuthenticationError:
        event = new Event('update-authentication-error', { cancelable: true })
        break
      case error instanceof ServerSessionError:
        event = new Event('update-network-error', { cancelable: true })
        break
      case error instanceof HttpError:
        event = new Event('update-http-error', { cancelable: true })
        break
      case error instanceof PinNotRequired:
        event = new Event('pin-not-required', { cancelable: true })
        break
      default:
        throw error
    }
    if (dispatchEvent(event)) {
      console.error(error)
    }
  }
}

async function reviseOutdatedDebtorInfosIfNecessary(userId: number): Promise<void> {
  const storage_key = 'creditors.latestOutdatedDebtorInfosRevisionDate'
  const storage_value = localStorage.getItem(storage_key) ?? '1970-01-01T00:00:00.000Z'
  const latestRevisionTime = new Date(storage_value).getTime()
  const intervalSeconds = 86400 * appConfig.outdatedDebtorInfosRevisionIntervalDays
  const now = new Date()
  if (latestRevisionTime + intervalSeconds < now.getTime()) {
    await reviseOutdatedDebtorInfos(userId)
    console.log('Created update tasks for outdated debtor infos.')
  }
  localStorage.setItem(storage_key, now.toISOString())
}

async function executeReadyTasks(server: ServerSession, userId: number): Promise<void> {
  const createTaskExecutor = (task: TaskRecordWithId): ((timeout: number) => Promise<void>) => {
    switch (task.taskType) {
      case 'DeleteTransfer':
        return async (timeout) => {
          try {
            await server.delete(task.transferUri, { timeout })
          } catch (e: unknown) {
            if (!(e instanceof HttpError && e.status === 404)) throw e  // Ignore 404 errors.
          }
          await removeTask(task.taskId)
        }
      case 'FetchDebtorInfo':
        return async (timeout) => {
          let document
          try {
            document = await fetchDebtorInfoDocument(task.iri, timeout)
          } catch (e: unknown) {
            if (!(e instanceof DocumentFetchError)) throw e  // Ignore network errors.
          }
          await settleFetchDebtorInfoTask(task, document)
        }
      default:
        throw new Error('unknown task type')  // This must never happen.
    }
  }
  const limit = 100
  let tasks
  do {
    tasks = await getTasks(userId, new Date(), limit)
    const timeout = calcParallelTimeout(tasks.length)
    const taskExecutors = tasks.map(task => createTaskExecutor(task))
    await Promise.all(taskExecutors.map(taskExecutor => taskExecutor(timeout)))
  } while (tasks.length >= limit)
}

export class UserContext {
  private server: ServerSession
  private updateScheduler: UpdateScheduler
  private walletRecord: WalletRecordWithId

  readonly userId: number
  readonly scheduleUpdate: UpdateScheduler['schedule']
  readonly accountsMap: AccountsMap
  readonly getActionRecords: (options?: ListQueryOptions) => Promise<ActionRecordWithId[]>
  readonly getActionRecord = getActionRecord
  readonly replaceActionRecord = replaceActionRecord
  readonly obtainBaseDebtorData = obtainBaseDebtorData

  constructor(
    server: ServerSession,
    updateScheduler: UpdateScheduler,
    accountsMap: AccountsMap,
    walletRecord: WalletRecordWithId,
  ) {
    this.server = server
    this.updateScheduler = updateScheduler
    this.accountsMap = accountsMap
    this.userId = walletRecord.userId
    this.walletRecord = walletRecord
    this.scheduleUpdate = this.updateScheduler.schedule.bind(this.updateScheduler)
    this.getActionRecords = getActionRecords.bind(undefined, this.userId)
  }

  /* The caller must be prepared this method to throw
   * `ServerSessionError` or `AuthenticationError`. */
  async ensureAuthenticated(): Promise<void> {
    const entrypoint = await this.server.entrypointPromise
    if (entrypoint === undefined) {
      throw new Error('undefined entrypoint')
    }
    try {
      await this.server.get(entrypoint, { attemptLogin: true })
    } catch (e: unknown) {
      if (e instanceof HttpError) throw new ServerSessionError(`unexpected status code (${e.status})`)
      else throw e
    }
  }

  /* Resets users PIN. The caller must be prepared this method to
   * throw `ServerSessionError`. */
  async resetPin(newPin: string): Promise<void> {
    const pinInfoUri = this.walletRecord.pinInfo.uri
    try {
      let attemptsLeft = 10
      while (true) {
        const pinInfo = await this.fetchPinInfo(pinInfoUri)
        const requestBody = {
          type: 'PinInfo',
          status: 'on',
          latestUpdateId: pinInfo.latestUpdateId + 1n,
          newPin,
        }
        try {
          const response = await this.server.patch(pinInfoUri, requestBody) as HttpResponse<PinInfo>
          await storeObject(this.userId, makePinInfo(response))
        } catch (e: unknown) {
          if (e instanceof HttpError && e.status === 409 && attemptsLeft--) continue
          else throw e
        }
        break
      }

    } catch (e: unknown) {
      if (e instanceof HttpError) throw new ServerSessionError(`unexpected status code (${e.status})`)
      else throw e
    }
  }

  /* Add a new create account action record, and returns its action
   * ID. The caller must be prepared this method to throw
   * `InvalidCoinUri`. */
  async createCreateAccountAction(coinUri: string): Promise<number> {
    const [latestDebtorInfoUri, debtorIdentityUri] = parseCoinUri(coinUri)

    return await createActionRecord({
      userId: this.userId,
      actionType: 'CreateAccount',
      createdAt: new Date(),
      latestDebtorInfoUri,
      debtorIdentityUri,
    })
  }

  /* Make an HTTP request to obtain the most recent version of the
   * account, and return it. The caller must be prepared this method
   * to throw `ServerSessionError`. */
  async getAccount(accountUri: string): Promise<AccountV0 | undefined> {
    let response
    try {
      response = await this.server.get(accountUri, { attemptLogin: true }) as HttpResponse<Account>
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 404) return undefined
      else throw e
    }
    const account = makeAccount(response)
    await storeObject(this.userId, account)
    return account
  }

  /* Ensures that the account (accountUri) exists,
   * `account.display.debtorName` is not undefined, and
   * `account.knowledge.debtorData` matches `debtorName`. Returns
   * account's `account.display.debtorName` on success, or `undefined`
   * on failure.
   */
  async getKnownAccountData(accountUri: string): Promise<KnownAccountData | undefined> {
    const account = await getAccountRecord(accountUri)
    if (account === undefined) {
      return undefined
    }
    const display = await getAccountObjectRecord(account.display.uri) as AccountDisplayRecord | undefined
    if (display?.debtorName === undefined) {
      return undefined
    }
    const knowledge = await getAccountObjectRecord(account.knowledge.uri) as AccountKnowledgeRecord | undefined
    if (knowledge === undefined) {
      return undefined
    }
    const baseDebtorData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
    const debtorData = {
      ...baseDebtorData,
      debtorIdentity: { type: 'DebtorIdentity' as const, uri: account.debtor.uri },
      revision: 0n,
    }
    return { debtorData, display }
  }

  /* Create an account if necessary. Return the most recent version of
   * the account. The caller must be prepared this method to throw
   * `InvalidCoinUri` or `ServerSessionError`. */
  async ensureAccountExists(debtorIdentityUri: string): Promise<AccountV0> {
    let response
    try {
      const request: DebtorIdentity = { type: 'DebtorIdentity', uri: debtorIdentityUri }
      response = await this.server.post(
        this.walletRecord.createAccount.uri,
        request,
        { attemptLogin: true },
      ) as HttpResponse<Account>
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 422) throw new InvalidCoinUri()
      else throw e
    }
    const account = makeAccount(response)
    await storeObject(this.userId, account)
    return account
  }

  /* Initialize new account's knowledge, config and display
   * records. The caller must be prepared this method to throw
   * `RecordDoesNotExist` or `ConflictingUpdate`,
   * `WrongPin`,`UnprocessableEntity` or `ServerSessionError`. */
  async initializeNewAccount(
    action: CreateAccountActionWithId,
    account: AccountV0,
    knownDebtor: boolean,
    pin: string,
  ): Promise<void> {
    assert(action.state)
    assert(account.display.debtorName === undefined)

    // Start the process of account initialization. If something goes
    // wrong, we will use the `accountInitializationInProgress` flag
    // to detect the problem and try to automatically recover from the
    // crash.
    await this.replaceActionRecord(action, action = {
      ...action,
      state: {
        ...action.state,
        accountInitializationInProgress: true,
      },
    })
    assert(action.state)

    const debtorData = action.state.debtorData
    const knowledge: AccountKnowledgeV0 = {
      type: account.knowledge.type,
      uri: account.knowledge.uri,
      latestUpdateAt: account.knowledge.latestUpdateAt,
      latestUpdateId: account.knowledge.latestUpdateId + 1n,
      account: account.knowledge.account,
      debtorData,
    }
    const config: AccountConfigV0 = {
      ...account.config,
      negligibleAmount: action.state.editedNegligibleAmount,
      latestUpdateId: account.config.latestUpdateId + 1n,
      scheduledForDeletion: false,
      pin,
    }
    const display: AccountDisplayV0 = {
      ...account.display,
      debtorName: action.state.editedDebtorName,
      decimalPlaces: debtorData.decimalPlaces,
      amountDivisor: debtorData.amountDivisor,
      unit: debtorData.unit,
      latestUpdateId: account.display.latestUpdateId + 1n,
      knownDebtor,
      pin,
    }
    await this.updateAccountObject(knowledge)
    await this.updateAccountObject(config)
    await this.updateAccountObject(display)
    await this.finishAccountInitialization(action)
  }

  /* Finalize the initialization of a new account and remove the
   * corresponding create account action. The caller must be prepared
   * this method to throw `RecordDoesNotExist`.
   */
  async finishAccountInitialization(action: CreateAccountActionWithId): Promise<void> {
    assert(action.state)
    assert(action.state.accountInitializationInProgress)
    const peg = action.state.debtorData.peg
    if (peg) {
      await createApproveAction({
        actionType: 'ApprovePeg',
        userId: this.userId,
        createdAt: new Date(),
        accountUri: action.state.accountUri,
        peg,
      }, false)
    }
    await this.replaceActionRecord(action, null)
  }

  /* Update the display and config records of an already initialized
   * (known) account. The caller must be prepared this method to throw
   * `RecordDoesNotExist` or `ConflictingUpdate`,
   * `WrongPin`,`UnprocessableEntity` or `ServerSessionError`. */
  async confirmKnownAccount(action: CreateAccountActionWithId, account: AccountV0, pin: string): Promise<void> {
    assert(action.state)
    assert(!action.state.accountInitializationInProgress && account.display.debtorName !== undefined)

    const display: AccountDisplayV0 = {
      ...account.display,
      knownDebtor: true,
      debtorName: action.state.editedDebtorName,
      latestUpdateId: account.display.latestUpdateId + 1n,
      pin,
    }
    const config: AccountConfigV0 = {
      ...account.config,
      negligibleAmount: action.state.editedNegligibleAmount,
      scheduledForDeletion: false,
      latestUpdateId: account.config.latestUpdateId + 1n,
      pin,
    }
    await this.updateAccountObject(display)
    await this.updateAccountObject(config)
    await this.replaceActionRecord(action, null)
  }

  /* Updates account's knowledge. May throw `ConflictingUpdate` or
   * `ServerSessionError`.  (Normally, `WrongPin` and
   * `UnprocessableEntity` should never be thrown.) */
  async updateAccountKnowledge(action: AckAccountInfoActionWithId, account: AccountV0): Promise<void> {
    const oldDebtorData = getBaseDebtorDataFromAccoutKnowledge(account.knowledge, false)

    // Update the properties that the app understands and tracks,
    // but also preserve the unknown properties.
    const updatedKnowledge = {
      ...account.knowledge,
      configError: action.configError,
      interestRateChangedAt: action.interestRateChangedAt,
      interestRate: action.interestRate,
      debtorData: {
        ...oldDebtorData,
        ...action.debtorData,
      },
      latestUpdateId: account.knowledge.latestUpdateId + 1n,
    }

    // This will automatically delete the action.
    await this.updateAccountObject(updatedKnowledge)
  }

  /* Remove account's exchange peg. May throw `ConflictingUpdate`,
   * `WrongPin`, `UnprocessableEntity`, or `ServerSessionError`. */
  async removePeg(account: AccountV0, pin: string): Promise<void> {
    const updatedExchange = {
      ...account.exchange,
      peg: undefined,
      latestUpdateId: account.exchange.latestUpdateId + 1n,
      pin,
    }
    await this.updateAccountObject(updatedExchange)
  }

  /* Reads a payment request, and adds and returns a new
   * create transfer action. May throw `IvalidPaymentRequest`. */
  async processPaymentRequest(blob: Blob): Promise<CreateTransferActionWithId> {
    const request = await parsePaymentRequest(blob)
    const noteMaxBytes = 500  // TODO: read this from the accounts-facts.
    const actionRecord = {
      userId: this.userId,
      actionType: 'CreateTransfer' as const,
      createdAt: new Date(),
      creationRequest: {
        type: 'TransferCreationRequest' as const,
        recipient: { uri: request.accountUri },
        amount: request.amount,
        transferUuid: uuidv4(),
        noteFormat: request.amount ? 'PAYMENT0' : 'payment0',
        note: generatePayment0TransferNote(request, noteMaxBytes),
      },
      paymentInfo: {
        payeeReference: request.payeeReference,
        payeeName: request.payeeName,
        description: request.description,
      },
      requestedAmount: request.amount,
      requestedDeadline: request.deadline,
    }
    await createActionRecord(actionRecord)  // adds the `actionId` field
    return actionRecord as CreateTransferActionWithId
  }

  async logout(): Promise<never> {
    return await this.server.logout()
  }

  /* Updates account's config, knowledge, display, or exchange.
   * Returns the new version. May throw `ServerSessionError`,
   * `ConflictingUpdate`, `WrongPin` or `UnprocessableEntity`. */
  private async updateAccountObject<T extends UpdatableAccountObject>(obj: T): Promise<T> {
    let response
    try {
      const { uri, account, latestUpdateAt, ...request } = obj
      response = await this.server.patch(uri, request, { attemptLogin: true })
    } catch (e: unknown) {
      if (e instanceof HttpError) {
        switch (e.status) {
          case 409:
            throw new ConflictingUpdate()
          case 403:
            throw new WrongPin()
          case 422:
            throw new UnprocessableEntity()
        }
      }
      throw e
    }
    const accountObject = makeLogObject(response) as T
    await storeObject(this.userId, accountObject)
    return accountObject
  }

  private async fetchPinInfo(pinInfoUri: string): Promise<PinInfo> {
    const response = await this.server.get(pinInfoUri) as HttpResponse<PinInfo>
    return response.data
  }
}

/* If the user is logged in, returns an user context
 * instance. Otherise, returns `undefined`. The obtained user context
 * instance can be used to perform operations on user's behalf. */
export async function obtainUserContext(
  server = defaultServer,
  updateScheduler?: UpdateScheduler,
): Promise<UserContext | undefined> {
  let userId: number
  try {
    const entrypoint = await server.entrypointPromise
    if (entrypoint === undefined) {
      return undefined
    }
    userId = await getOrCreateUserId(server, entrypoint)
  } catch (e: unknown) {
    switch (true) {
      case e instanceof AuthenticationError:
      case e instanceof HttpError:
        console.error(e)
        alert('There seems to be a problem on the server. Please try again later.')
        await server.logout()
        break
      case e instanceof ServerSessionError:
        console.error(e)
        alert('A network problem has occured. Please check your Internet connection.')
        await server.logout()
        break
    }
    throw e
  }

  userResetsChannel.onmessage = async (evt: MessageEvent<UserResetMessage>) => {
    if (evt.data.userId === userId && evt.data.windowUuid !== currentWindowUuid) {
      // The user's data has been reset by another app window. This
      // is likely to disturb the interaction with the UI.
      alert('Failed to synchronize with the server. The app is being automatically restarted.')
      location.reload()
    }
  }
  const accountsMap = new AccountsMap()
  await accountsMap.init(userId)

  return new UserContext(
    server,
    updateScheduler ?? new UpdateScheduler(update.bind(undefined, server, userId)),
    accountsMap,
    await getWalletRecord(userId),
  )
}
