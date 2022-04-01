import type { PinInfo, Account, DebtorIdentity } from './server'
import type {
  WalletRecordWithId, ActionRecordWithId, TaskRecordWithId, ListQueryOptions, CreateTransferActionWithId,
  CreateAccountActionWithId, AckAccountInfoActionWithId, DebtorDataSource, AccountDisplayRecord,
  AccountKnowledgeRecord, AccountLedgerRecord, ApproveDebtorNameActionWithId, ApproveAmountDisplayActionWithId,
  AccountRecord, ApprovePegActionWithId, AccountExchangeRecord, AccountDataForDisplay,
  CommittedTransferRecord, AccountFullData, PegBound, ConfigAccountActionWithId, AccountConfigRecord
} from './db'
import type {
  AccountV0, AccountKnowledgeV0, AccountConfigV0, AccountExchangeV0, AccountDisplayV0
} from './canonical-objects'
import type { UserResetMessage } from './db-sync'
import type { BaseDebtorData } from '../debtor-info'

import equal from 'fast-deep-equal'
import { v4 as uuidv4 } from 'uuid';
import { UpdateScheduler } from '../update-scheduler'
import { InvalidDocument } from '../debtor-info'
import {
  server as defaultServer, Oauth2TokenSource, ServerSession, ServerSessionError, AuthenticationError,
  HttpResponse, HttpError
} from './server'
import {
  getWalletRecord, getTasks, removeTask, getActionRecords, settleFetchDebtorInfoTask,
  createActionRecord, getActionRecord, AccountsMap, RecordDoesNotExist, replaceActionRecord,
  InvalidActionState, createApproveAction, getBaseDebtorDataFromAccoutKnowledge, reviseOutdatedDebtorInfos,
  getAccountRecord, getAccountObjectRecord, verifyAccountKnowledge, getAccountSortPriorities,
  getAccountSortPriority, setAccountSortPriority, ensureUniqueAccountAction, ensureDeleteAccountTask
} from './db'
import {
  getOrCreateUserId, sync, storeObject, PinNotRequired, userResetsChannel, currentWindowUuid, IS_A_NEWBIE_KEY
} from './db-sync'
import { makePinInfo, makeAccount, makeLogObject } from './canonical-objects'
import {
  calcParallelTimeout, parseCoinUri, InvalidCoinUri, DocumentFetchError, fetchDebtorInfoDocument,
  obtainBaseDebtorData, getDataFromDebtorInfo
} from './utils'
import {
  IvalidPaymentRequest, IvalidPaymentData, parsePaymentRequest, generatePayment0TransferNote
} from '../payment-requests'

export {
  parseCoinUri,
  InvalidDocument,
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
  account: AccountRecord,
  knowledge: AccountKnowledgeRecord,
  display: AccountDisplayRecord,
  exchange: AccountExchangeRecord
  ledger: AccountLedgerRecord,
  debtorData: BaseDebtorData,
}

export type {
  ActionRecordWithId,
  CreateAccountActionWithId,
  AckAccountInfoActionWithId,
  ApproveDebtorNameActionWithId,
  ApproveAmountDisplayActionWithId,
  ApprovePegActionWithId,
  ConfigAccountActionWithId,
  AccountV0,
  DebtorDataSource,
  AccountsMap,
  AccountRecord,
  AccountDisplayRecord,
  AccountConfigRecord,
  AccountDataForDisplay,
  CommittedTransferRecord,
  AccountFullData,
  PegBound,
  BaseDebtorData,
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

export class ResourceNotFound extends Error {
  name = 'ResourceNotFound'
}

export class CircularPegError extends Error {
  name = 'CircularPegError'
}

export class PegDisplayMismatch extends Error {
  name = 'PegDisplayMismatch'
}

export class ServerSyncError extends Error {
  name = 'ServerSyncError'
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
export async function update(server: ServerSession, userId: number, accountsMap: AccountsMap): Promise<void> {
  try {
    await sync(server, userId)
    await reviseOutdatedDebtorInfosIfNecessary(userId, accountsMap)
    await createAccountDeletionTasksIfNecessary(userId, accountsMap)
    if (await executeReadyTasks(server, userId)) {
      await sync(server, userId)
    }
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

async function createAccountDeletionTasksIfNecessary(userId: number, accountsMap: AccountsMap): Promise<void> {
  for (const accountUri of accountsMap.getDeletableAccountUris()) {
    await ensureDeleteAccountTask(userId, accountUri)
  }
}

async function reviseOutdatedDebtorInfosIfNecessary(userId: number, accountsMap: AccountsMap): Promise<void> {
  const storage_key = 'creditors.latestOutdatedDebtorInfosRevisionDate'
  const storage_value = localStorage.getItem(storage_key) ?? '1970-01-01T00:00:00.000Z'
  const latestRevisionTime = new Date(storage_value).getTime()
  const intervalMilliseconds = 1000 * 86400 * appConfig.outdatedDebtorInfosRevisionIntervalDays
  const now = new Date()
  if (latestRevisionTime + intervalMilliseconds < now.getTime()) {
    await reviseOutdatedDebtorInfos(userId, accountsMap)
    console.log('Created update tasks for outdated debtor infos.')
  }
  localStorage.setItem(storage_key, now.toISOString())
}

async function executeReadyTasks(server: ServerSession, userId: number): Promise<boolean> {
  let resyncIsNeeded = false

  const createTaskExecutor = (task: TaskRecordWithId): ((timeout: number) => Promise<void>) => {
    switch (task.taskType) {
      case 'DeleteTransfer':
        return async (timeout) => {
          try {
            await server.delete(task.transferUri, { timeout })
          } catch (e: unknown) {
            // Ignore 404 errors.
            if (!(e instanceof HttpError && e.status === 404)) throw e
          }
          await removeTask(task.taskId)
        }
      case 'FetchDebtorInfo':
        return async (timeout) => {
          let document
          try {
            document = await fetchDebtorInfoDocument(task.iri, timeout)
          } catch (e: unknown) {
            // Ignore network errors.
            if (!(e instanceof DocumentFetchError)) throw e
          }
          await settleFetchDebtorInfoTask(task, document)
        }
      case 'DeleteAccount':
        return async (timeout) => {
          try {
            await server.delete(task.accountUri, { timeout })
            resyncIsNeeded = true
          } catch (e: unknown) {
            // Ignore 403 and 404 errors.
            if (!(e instanceof HttpError && (e.status === 403 || e.status === 404))) throw e
          }
          await removeTask(task.taskId)
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

  return resyncIsNeeded
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
  readonly getAccountSortPriority = getAccountSortPriority
  readonly setAccountSortPriority: (uri: string, priority: number) => Promise<void>
  readonly ensureUniqueAccountAction = ensureUniqueAccountAction

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
    this.setAccountSortPriority = setAccountSortPriority.bind(undefined, this.userId)
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
   * ID. */
  async createCreateAccountAction(latestDebtorInfoUri: string, debtorIdentityUri: string): Promise<number> {
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

  /* Ensures that the account (accountUri) exists, and
   * `account.display.debtorName` is not undefined. Returns account's
   * known data on success, or `undefined` on failure.
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
    const exchange = await getAccountObjectRecord(account.exchange.uri) as AccountExchangeRecord | undefined
    if (exchange === undefined) {
      return undefined
    }
    const ledger = await getAccountObjectRecord(account.ledger.uri) as AccountLedgerRecord | undefined
    if (ledger === undefined) {
      return undefined
    }
    assert(account.type === 'Account')
    assert(display.type === 'AccountDisplay')
    assert(knowledge.type === 'AccountKnowledge')
    assert(exchange.type === 'AccountExchange')
    assert(ledger.type === 'AccountLedger')
    const debtorData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
    return { account, display, knowledge, exchange, ledger, debtorData }
  }

  /* Changes the display name (and possibly clears `knownDebtor`) as
   * the given action states. The caller must be prepared this method
   * to throw `RecordDoesNotExist`, `ConflictingUpdate`,
   * `WrongPin`,`UnprocessableEntity`, `ResourceNotFound`,
   * `ServerSessionError`. */
  async resolveApproveDebtorNameAction(
    action: ApproveDebtorNameActionWithId,
    displayLatestUpdateId: bigint,
    pin: string,
  ): Promise<void> {
    assert(action.userId === this.userId)
    const account = await this.getAccount(action.accountUri)
    if (
      account &&
      account.display.debtorName !== undefined &&
      getBaseDebtorDataFromAccoutKnowledge(account.knowledge).debtorName === action.debtorName
    ) {
      const display: AccountDisplayV0 = {
        ...account.display,
        debtorName: action.editedDebtorName,
        knownDebtor: account.display.knownDebtor && !action.unsetKnownDebtor,
        latestUpdateId: displayLatestUpdateId + 1n,
        pin,
      }
      await this.updateAccountObject(display)
    }
    await this.replaceActionRecord(action, null)
  }

  /* Changes the amount display settings as the given action
   * states. The caller must be prepared this method to throw
   * `RecordDoesNotExist`, `ConflictingUpdate`, `ResourceNotFound`,
   * `WrongPin`,`UnprocessableEntity`, `ServerSyncError`,
   * `ServerSessionError`. */
  async resolveApproveAmountDisplayAction(
    action: ApproveAmountDisplayActionWithId,
    displayLatestUpdateId: bigint,
    pin: string,
  ): Promise<void> {
    assert(action.userId === this.userId)
    assert(action.state !== undefined)
    const account = await this.getAccount(action.accountUri)
    let debtorData: BaseDebtorData
    if (
      account &&
      account.display.debtorName !== undefined &&
      (debtorData = getBaseDebtorDataFromAccoutKnowledge(account.knowledge)) &&
      debtorData.amountDivisor === action.amountDivisor &&
      debtorData.decimalPlaces === action.decimalPlaces &&
      debtorData.unit === action.unit
    ) {
      if (account.display.latestUpdateId !== displayLatestUpdateId) {
        throw new RecordDoesNotExist()
      }
      await this.removeExistingPegs(action.accountUri, pin)
      const config: AccountConfigV0 = {
        ...account.config,
        negligibleAmount: Math.max(action.state.editedNegligibleAmount, account.config.negligibleAmount),
        latestUpdateId: account.config.latestUpdateId + 1n,
        pin,
      }
      const display: AccountDisplayV0 = {
        ...account.display,
        amountDivisor: action.amountDivisor,
        decimalPlaces: action.decimalPlaces,
        unit: action.unit,
        latestUpdateId: account.display.latestUpdateId + 1n,
        pin,
      }
      await this.updateAccountObject(config)
      await this.updateAccountObject(display)
    }
    await this.replaceActionRecord(action, null)
  }

  /* Saves the the peg in account's exchange record. The caller must
   * be prepared this method to throw `CircularPegError`,
   * `PegDisplayMismatch`, `RecordDoesNotExist`, `ConflictingUpdate`,
   * `WrongPin`,`UnprocessableEntity`, `ResourceNotFound`, `ServerSyncError`,
   * `ServerSessionError`.
   */
  async resolveApprovePegAction(
    action: ApprovePegActionWithId,
    approve: boolean,
    pegAccountUri: string,
    exchangeLatestUpdateId: bigint,
    pin: string | undefined,
  ): Promise<void> {
    await this.sync()
    const { accountUri, peg } = action
    const expectedApprovalValue = pin !== undefined ? undefined : approve
    const peggedAccountData = await this.validatePeggedAccount(action, accountUri, expectedApprovalValue)
    if (peggedAccountData === undefined) {
      throw new RecordDoesNotExist()
    }
    if (pin !== undefined) {
      const { userId, ...exchange } = peggedAccountData.exchange  // Remove the `userId` field.
      let updatedExchange: AccountExchangeV0 = {
        ...exchange,
        peg: undefined,
        latestUpdateId: exchangeLatestUpdateId + 1n,
        pin,
      }
      if (approve) {
        if (!await this.validatePegAccount(action, pegAccountUri)) {
          await this.replaceActionRecord(action, { ...action, ignoreCoinMismatch: false })
          throw new PegDisplayMismatch()
        }
        updatedExchange.peg = {
          type: 'CurrencyPeg',
          account: { uri: pegAccountUri },
          exchangeRate: peg.exchangeRate,
        }
        const bounds = this.accountsMap.followPegChain(pegAccountUri, accountUri)
        const bound = bounds[bounds.length - 1]
        if (!bound) {
          throw new RecordDoesNotExist()
        }
        if (bound.accountUri === accountUri) {
          throw new CircularPegError()
        }
      }
      await this.updateAccountObject(updatedExchange)
    }
    await this.replaceActionRecord(action, null)
  }

  /* Updates account's configuration as the given action states. The
   * caller must be prepared this method to throw
   * `RecordDoesNotExist`, `ConflictingUpdate`,
   * `WrongPin`,`UnprocessableEntity`, `ResourceNotFound`,
   * `ServerSessionError`. */
  async executeConfigAccountAction(
    action: ConfigAccountActionWithId,
    displayLatestUpdateId: bigint,
    configLatestUpdateId: bigint,
    pin: string,
  ): Promise<void> {
    const account = await this.getAccount(action.accountUri)
    if (account && account.display.debtorName !== undefined) {
      const config: AccountConfigV0 = {
        ...account.config,
        negligibleAmount: action.editedNegligibleAmount,
        scheduledForDeletion: action.editedScheduledForDeletion,
        allowUnsafeDeletion: action.editedAllowUnsafeDeletion,
        latestUpdateId: configLatestUpdateId + 1n,
        pin,
      }
      const display: AccountDisplayV0 = {
        ...account.display,
        debtorName: action.editedDebtorName,
        latestUpdateId: displayLatestUpdateId + 1n,
        pin,
      }
      await this.updateAccountObject(config)
      await this.updateAccountObject(display)
      if (action.approveNewDisplay) {
        const debtorData = getBaseDebtorDataFromAccoutKnowledge(account.knowledge)
        await createApproveAction({
          actionType: 'ApproveAmountDisplay',
          createdAt: new Date(),
          amountDivisor: debtorData.amountDivisor,
          decimalPlaces: debtorData.decimalPlaces,
          unit: debtorData.unit,
          userId: this.userId,
          accountUri: action.accountUri,
        })
      }
      if (action.editedAllowUnsafeDeletion) {
        this.scheduleUpdate()
      }
    }
    await this.replaceActionRecord(action, null)
  }

  /* If `approve` is true, downloads the debtor info document for the
   * peg currency, compares it with the known debtor info, and if
   * necessary, creates an "AckAccountInfo" action. The caller must be
   * prepared this method throw `ServerSessionError`, `InvalidDocument`,
   * `DocumentFetchError`, `RecordDoesNotExist`. */
  async resolveCoinConflict(
    action: ApprovePegActionWithId,
    approve: boolean,
    pegAccountUri: string,
  ): Promise<number | undefined> {
    let ackAccountInfoActionId
    if (approve) {
      // Before we get the not-so-reliable debtor data from the coin
      // link, we make a "last chance" attempt to obtain reliable
      // debtor info directly from the server.
      await this.getAccount(pegAccountUri)

      const debtorInfo = { type: 'DebtorInfo' as const, iri: action.peg.latestDebtorInfo.uri }
      const debtorData = await getDataFromDebtorInfo(debtorInfo, action.peg.debtorIdentity.uri)
      ackAccountInfoActionId = await verifyAccountKnowledge(pegAccountUri, debtorData, true)
    }
    await this.replaceActionRecord(action, { ...action, ignoreCoinMismatch: true })
    return ackAccountInfoActionId
  }

  /* Returns the known account data for the pegged account, but only *
   * if it matches the peg described in the `ApprovePeg` action. If
   * `expectedApprovalValue` is passed, it should match as well. */
  async validatePeggedAccount(
    action: ApprovePegActionWithId,
    pegAccountUri: string,
    expectedApprovalValue?: boolean,
  ): Promise<KnownAccountData | undefined> {
    const peggedAccountData = await this.getKnownAccountData(action.accountUri)
    if (peggedAccountData) {
      const knownPeg = peggedAccountData.debtorData.peg
      const exchangePeg = peggedAccountData.exchange.peg
      const approval = (
        exchangePeg !== undefined &&
        exchangePeg.account.uri === pegAccountUri &&
        exchangePeg.exchangeRate === action.peg.exchangeRate
      )
      if (
        !equal(action.peg, knownPeg) ||
        !(expectedApprovalValue === undefined || approval === expectedApprovalValue)
      ) {
        return undefined
      }
    }
    return peggedAccountData
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
   * `RecordDoesNotExist`, `ConflictingUpdate`,
   * `WrongPin`,`UnprocessableEntity`, `ServerSessionError`. */
  async initializeNewAccount(
    action: CreateAccountActionWithId | ApprovePegActionWithId,
    account: AccountV0,
    knownDebtor: boolean,
    pin: string,
  ): Promise<void> {
    assert(action.userId === this.userId)
    assert(action.accountCreationState)
    assert(account.display.debtorName === undefined)

    // Start the process of account initialization. If something goes
    // wrong, we will use the `accountInitializationInProgress` flag
    // to detect the problem and try to automatically recover from the
    // crash.
    await this.setInitializationInProgressFlag(action, true)

    const debtorData = action.accountCreationState.debtorData
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
      negligibleAmount: action.accountCreationState.editedNegligibleAmount,
      latestUpdateId: account.config.latestUpdateId + 1n,
      scheduledForDeletion: false,
      allowUnsafeDeletion: false,
      pin,
    }
    const display: AccountDisplayV0 = {
      ...account.display,
      debtorName: action.accountCreationState.editedDebtorName,
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
  async finishAccountInitialization(action: CreateAccountActionWithId | ApprovePegActionWithId): Promise<void> {
    assert(action.accountCreationState)
    assert(action.accountCreationState.accountInitializationInProgress)
    const peg = action.accountCreationState.debtorData.peg
    if (peg) {
      await createApproveAction({
        actionType: 'ApprovePeg',
        userId: this.userId,
        createdAt: new Date(),
        onlyTheCoinHasChanged: false,
        alreadyHasApproval: false,
        ignoreCoinMismatch: false,
        accountUri: action.accountCreationState.accountUri,
        peg,
      }, false)
    }
    await this.setInitializationInProgressFlag(action, false)
  }

  /* Update the display and config records of an already initialized
   * (known) account. The caller must be prepared this method to throw
   * `RecordDoesNotExist`, `ConflictingUpdate`, `WrongPin`,
   * `UnprocessableEntity`, `ServerSessionError`. */
  async confirmKnownAccount(
    action: CreateAccountActionWithId | ApprovePegActionWithId,
    account: AccountV0,
    pin: string,
    knownDebtor: boolean,
  ): Promise<void> {
    assert(action.userId === this.userId)
    assert(action.accountCreationState)
    assert(!action.accountCreationState.accountInitializationInProgress && account.display.debtorName !== undefined)

    const display: AccountDisplayV0 = {
      ...account.display,
      knownDebtor: account.display.knownDebtor || knownDebtor,
      debtorName: action.accountCreationState.editedDebtorName,
      latestUpdateId: account.display.latestUpdateId + 1n,
      pin,
    }
    const config: AccountConfigV0 = {
      ...account.config,
      negligibleAmount: action.accountCreationState.editedNegligibleAmount,
      scheduledForDeletion: false,
      allowUnsafeDeletion: false,
      latestUpdateId: account.config.latestUpdateId + 1n,
      pin,
    }
    await this.updateAccountObject(display)
    await this.updateAccountObject(config)
    await this.setInitializationInProgressFlag(action, false)
  }

  /* Updates account's knowledge. May throw `ConflictingUpdate` or
   * `ServerSessionError`.  (Normally, `WrongPin` and
   * `UnprocessableEntity` should never be thrown.) */
  async updateAccountKnowledge(action: AckAccountInfoActionWithId, account: AccountV0): Promise<void> {
    assert(action.userId === this.userId)
    const oldDebtorData = getBaseDebtorDataFromAccoutKnowledge(account.knowledge, false)

    // Update the properties that the app understands and tracks,
    // but also preserve the unknown properties.
    const updatedKnowledge: AccountKnowledgeV0 = {
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
   * `WrongPin`, `UnprocessableEntity`, `ServerSessionError`. */
  async removePeg(exchange: AccountExchangeV0, pin: string, timeout?: number): Promise<void> {
    const updatedExchange: AccountExchangeV0 = {
      ...exchange,
      peg: undefined,
      latestUpdateId: exchange.latestUpdateId + 1n,
      pin,
    }
    await this.updateAccountObject(updatedExchange, { timeout, ignore404: true })
    console.log(`Removed exchange peg for account ${exchange.account.uri}`)
  }

  /* Try to delete the given account URIs. The caller must be prepared
   * this method to throw `ServerSessionError`. */
  async deleteUnnamedAccounts(accountUris: string[]): Promise<void> {
    const timeout = calcParallelTimeout(accountUris.length)
    const deleteAccount = async (accountUri: string) => {
      try {
        await this.server.delete(accountUri, { timeout, attemptLogin: true })
      } catch (e: unknown) {
        // Ignore 403 and 404 errors.
        if (!(e instanceof HttpError && (e.status === 403 || e.status === 404))) throw e
      }
    }
    await Promise.all(accountUris.map(uri => deleteAccount(uri)))
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

  /* Returns the properly sorted list of configured accounts for the
   * current user. */
  async getAccountsDataForDisplay(): Promise<AccountDataForDisplay[]> {
    const priorities = await getAccountSortPriorities(this.userId)
    const prioritiesMap = new Map(priorities.map(p => [p.uri, p.priority]))
    return this.accountsMap
      .getAccountsDataForDisplay()
      .sort((a, b) => {
        // Sort by priority. If priorities are equal, sort by debtor name.
        const displayA = a.display
        const displayB = b.display
        const priorityA = prioritiesMap.get(displayA.account.uri) ?? 0
        const priorityB = prioritiesMap.get(displayB.account.uri) ?? 0
        if (priorityA > priorityB) {
          return -1
        }
        if (priorityA < priorityB) {
          return 1
        }
        const nameA = (displayA.debtorName ?? '').toLowerCase()
        const nameB = (displayB.debtorName ?? '').toLowerCase()
        return nameA > nameB ? 1 : (nameA === nameB ? 0 : -1)
      })
  }

  /* Forgets authentication credentials, and goes to the login page. */
  async logout(): Promise<never> {
    return await this.server.logout()
  }

  private async validatePegAccount(action: ApprovePegActionWithId, pegAccountUri: string): Promise<boolean> {
    const { amountDivisor, decimalPlaces, unit } = action.peg.display
    const data = await this.getKnownAccountData(pegAccountUri)
    return (
      data !== undefined &&
      action.peg.debtorIdentity.uri === data.account.debtor.uri &&
      amountDivisor === data.display.amountDivisor &&
      decimalPlaces === data.display.decimalPlaces &&
      unit === data.display.unit
    )
  }

  private async setInitializationInProgressFlag(
    action: CreateAccountActionWithId | ApprovePegActionWithId,
    value: boolean,
  ): Promise<void> {
    assert(action.accountCreationState)
    await this.replaceActionRecord(action, {
      ...action,
      accountCreationState: {
        ...action.accountCreationState,
        accountInitializationInProgress: value,
      },
    })
    action.accountCreationState.accountInitializationInProgress = value
  }

  private async removeExistingPegs(pegAccountUri: string, pin: string): Promise<void> {
    await this.sync()
    const exchanges = this.accountsMap
      .getPeggedAccountExchangeRecords(pegAccountUri)
      .map(accountExchangeRecord => {
        const { userId, ...exchange } = accountExchangeRecord
        return exchange
      })
    const timeout = calcParallelTimeout(exchanges.length)
    await Promise.all(exchanges.map(exchange => this.removePeg(exchange, pin, timeout)))
  }

  /* Updates account's config, knowledge, display, or exchange.
   * Returns the new version. May throw `ServerSessionError`,
   * `ConflictingUpdate`, `WrongPin`, `UnprocessableEntity`,
   * `ResourceNotFound`. */
  private async updateAccountObject<T extends UpdatableAccountObject>(
    obj: T,
    options: { timeout?: number, ignore404?: boolean } = {},
  ): Promise<void> {
    const { timeout, ignore404 = false } = options
    let response
    try {
      const { uri, account, latestUpdateAt, ...request } = obj
      response = await this.server.patch(uri, request, { timeout, attemptLogin: true })
    } catch (e: unknown) {
      if (e instanceof HttpError) {
        switch (e.status) {
          case 404:
            if (ignore404) return
            this.scheduleUpdate()
            throw new ResourceNotFound()
          case 409:
            this.scheduleUpdate()
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
  }

  private async fetchPinInfo(pinInfoUri: string): Promise<PinInfo> {
    const response = await this.server.get(pinInfoUri) as HttpResponse<PinInfo>
    return response.data
  }

  private async sync(): Promise<void> {
    try {
      await sync(this.server, this.userId)
    } catch (e: unknown) {
      switch (true) {
        case e instanceof AuthenticationError:
          await this.ensureAuthenticated()
          await sync(this.server, this.userId)
          break
        case e instanceof HttpError:
          throw new ServerSyncError()
        default:
          throw e
      }
    }
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
    updateScheduler ?? new UpdateScheduler(update.bind(undefined, server, userId, accountsMap)),
    accountsMap,
    await getWalletRecord(userId),
  )
}
