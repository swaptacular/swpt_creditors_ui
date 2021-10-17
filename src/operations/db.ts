import equal from 'fast-deep-equal'
import { Dexie } from 'dexie'
import type { Collection } from 'dexie'
import type {
  Wallet,
  Creditor,
  PinInfo,
  Account,
  AccountConfig,
  AccountLedger,
  AccountInfo,
  AccountKnowledge,
  AccountExchange,
  AccountDisplay,
  Transfer,
  TransferCreationRequest,
  LedgerEntry,
  LogEntry,
  CommittedTransfer,
  Error as WebApiError,
  ObjectReference,
  PaginatedList,
  PaginatedStream,
  TransferOptions,
  TransferResult,
  TransferError,
} from '../web-api-schemas'
import { parseTransferNote } from '../payment-requests'
import type { PaymentInfo } from '../payment-requests'
import type { ResourceReference, DocumentWithHash } from '../debtor-info'

export type TypeMatcher = {
  test(t: string): boolean,
}

export const MAX_INT64 = (1n << 63n) - 1n
export const WALLET_TYPE = /^Wallet(-v[1-9][0-9]{0,5})?$/
export const CREDITOR_TYPE = /^Creditor(-v[1-9][0-9]{0,5})?$/
export const PIN_INFO_TYPE = /^PinInfo(-v[1-9][0-9]{0,5})?$/
export const OBJECT_REFERENCE_TYPE = /^ObjectReference$/
export const ACCOUNTS_LIST_TYPE = /^(AccountsList(-v[1-9][0-9]{0,5})?|PaginatedList(-v[1-9][0-9]{0,5})?)$/
export const ACCOUNT_TYPE = /^Account(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_INFO_TYPE = /^AccountInfo(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_DISPLAY_TYPE = /^AccountDisplay(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_KNOWLEDGE_TYPE = /^AccountKnowledge(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_EXCHANGE_TYPE = /^AccountExchange(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_LEDGER_TYPE = /^AccountLedger(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_CONFIG_TYPE = /^AccountConfig(-v[1-9][0-9]{0,5})?$/
export const TRANSFERS_LIST_TYPE = /^(TransfersList(-v[1-9][0-9]{0,5})?|PaginatedList(-v[1-9][0-9]{0,5})?)$/
export const TRANSFER_TYPE = /^Transfer(-v[1-9][0-9]{0,5})?$/
export const LOG_ENTRY_TYPE = /^LogEntry(-v[1-9][0-9]{0,5})?$/
export const LOG_ENTRIES_PAGE_TYPE = /^LogEntriesPage(-v[1-9][0-9]{0,5})?$/
export const PAGINATED_STREAM_TYPE = /^PaginatedStream(-v[1-9][0-9]{0,5})?$/
export const LEDGER_ENTRY_TYPE = /^LedgerEntry(-v[1-9][0-9]{0,5})?$/
export const LEDGER_ENTRIES_LIST_TYPE = /^PaginatedList(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_RESULT_TYPE = /^TransferResult(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_ERROR_TYPE = /^TransferError(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_OPTIONS_TYPE = /^TransferOptions(-v[1-9][0-9]{0,5})?$/
export const COMMITTED_TRANSFER_TYPE = /^CommittedTransfer(-v[1-9][0-9]{0,5})?$/

export type LogEntryV0 = LogEntry & { type: 'LogEntry' }
export type LogEntriesPageV0 = {
  type: 'LogEntriesPage',
  items: LogEntryV0[],
  next?: string,
  forthcoming?: string
}
export type PinInfoV0 = PinInfo & { type: 'PinInfo' }
export type CreditorV0 = Creditor & { type: 'Creditor' }
export type LedgerEntryV0 = LedgerEntry & { type: 'LedgerEntry' }
export type CommittedTransferV0 = CommittedTransfer & { type: 'CommittedTransfer' }
export type AccountInfoV0 = AccountInfo & { type: 'AccountInfo' }
export type AccountKnowledgeV0 = AccountKnowledge & { type: 'AccountKnowledge' }
export type AccountExchangeV0 = AccountExchange & { type: 'AccountExchange' }
export type AccountDisplayV0 = AccountDisplay & { type: 'AccountDisplay' }
export type AccountConfigV0 = AccountConfig & { type: 'AccountConfig' }
export type TransferOptionsV0 = TransferOptions & { type: 'TransferOptions' }
export type TransferErrorV0 = TransferError & { type: 'TransferError' }
export type TransferResultV0 = TransferResult & {
  type: 'TransferResult',
  error?: TransferErrorV0,
}
export type TransferV0 = Transfer & {
  type: 'Transfer',
  options: TransferOptionsV0,
  result?: TransferResultV0,
}
export type PaginatedListV0<ItemsType> = PaginatedList & {
  type: 'PaginatedList',
  itemsType: ItemsType,
}
export type PaginatedStreamV0<ItemsType> = PaginatedStream & {
  type: 'PaginatedStream',
  itemsType: ItemsType,
}
export type AccountLedgerV0 = AccountLedger & {
  type: 'AccountLedger',
  entries: PaginatedListV0<'LedgerEntry'>,
}
export type AccountV0 = Account & {
  type: 'Account',
  ledger: AccountLedgerV0,
  info: AccountInfoV0,
  knowledge: AccountKnowledgeV0,
  exchange: AccountExchangeV0,
  display: AccountDisplayV0,
  config: AccountConfigV0,
}
export type WalletV0 = Wallet & {
  type: 'Wallet',
  log: PaginatedStreamV0<'LogEntry'>,
}

type UserReference = {
  userId: number,
}

type ActionData =
  & UserReference
  & {
    actionId?: number,
    actionType: string,
    createdAt: Date,
  }

export type ListQueryOptions = {
  before?: number,
  after?: number,
  limit?: number,
  latestFirst?: boolean,
}

export type UserData = {
  collectedAfter: Date,
  accounts: AccountV0[],
  wallet: WalletV0,
  creditor: CreditorV0,
  pinInfo: PinInfoV0,
}

export type LogStream = {
  latestEntryId: bigint,
  forthcoming: string,
  loadedTransfers: boolean,
  syncedAt?: Date,
  isBroken: boolean,
}

export type ObjectUpdateInfo = {
  objectUri: string,
  objectType: string,
  logInfo?: {
    addedAt: string,
    deleted: boolean,
    objectUpdateId?: bigint,
    data?: { [key: string]: unknown },
  }
}

export type LogObjectRecord =
  | AccountRecord
  | AccountConfigRecord
  | AccountDisplayRecord
  | AccountKnowledgeRecord
  | AccountExchangeRecord
  | AccountInfoRecord
  | AccountLedgerRecord
  | TransferRecord
  | CommittedTransferRecord
  | CreditorRecord
  | PinInfoRecord

export type WalletRecord =
  & Partial<UserReference>
  & Omit<WalletV0, 'requirePin' | 'log' | 'logLatestEntryId'>
  & {
    logStream: LogStream,
  }

export type WalletRecordWithId =
  & WalletRecord
  & UserReference

export type AccountRecord =
  & UserReference
  & Omit<AccountV0, 'knowledge' | 'info' | 'exchange' | 'config' | 'ledger' | 'display'>
  & {
    knowledge: ObjectReference,
    info: ObjectReference,
    exchange: ObjectReference,
    config: ObjectReference,
    ledger: ObjectReference,
    display: ObjectReference,
  }

type BaseObjectRecord =
  & ResourceReference
  & UserReference
  & { type: string }

export type WalletObjectRecord =
  | PinInfoRecord
  | CreditorRecord

export type PinInfoRecord =
  & PinInfoV0
  & BaseObjectRecord

export type CreditorRecord =
  & CreditorV0
  & BaseObjectRecord

export type AccountObjectRecord =
  | AccountConfigRecord
  | AccountDisplayRecord
  | AccountExchangeRecord
  | AccountKnowledgeRecord
  | AccountInfoRecord
  | AccountLedgerRecord

export type AccountConfigRecord =
  & AccountConfigV0
  & BaseObjectRecord

export type AccountDisplayRecord =
  & AccountDisplayV0
  & BaseObjectRecord

export type AccountExchangeRecord =
  & AccountExchangeV0
  & BaseObjectRecord

export type AccountKnowledgeRecord =
  & AccountKnowledgeV0
  & BaseObjectRecord

export type AccountInfoRecord =
  & AccountInfoV0
  & BaseObjectRecord

export type AccountLedgerRecord =
  & AccountLedgerV0
  & BaseObjectRecord

export type CommittedTransferRecord =
  & CommittedTransferV0
  & BaseObjectRecord

export type TransferRecord =
  & UserReference
  & TransferV0
  & {
    time: number,
    paymentInfo: PaymentInfo,
    aborted: boolean,
    originatesHere: boolean,
  }

export type LedgerEntryRecord =
  & UserReference
  & LedgerEntryV0
  & {
    account: ObjectReference,
    id?: number,  // an autoincremented ID
  }

export type LedgerEntryRecordWithId =
  & LedgerEntryRecord
  & { id: number }

export type DocumentRecord =
  & ResourceReference
  & DocumentWithHash

export type ActionRecord =
  | CreateTransferAction
  | AbortTransferAction

export type ActionRecordWithId =
  & ActionRecord
  & { actionId: number }

export type ExecutionState = {
  startedAt: Date,
  unresolvedRequestAt?: Date,
  result?: { ok: true, transferUri: string } | { ok: false } & WebApiError,
}

export type CreateTransferAction =
  & ActionData
  & {
    actionType: 'CreateTransfer',
    creationRequest: TransferCreationRequest,
    paymentInfo: PaymentInfo,
    requestedAmount: bigint,
    requestedDeadline?: Date,
    execution?: ExecutionState,
  }

export type CreateTransferActionWithId =
  & ActionRecordWithId
  & CreateTransferAction

export type CreateTransferActionStatus =
  | 'Draft'
  | 'Not sent'
  | 'Not confirmed'
  | 'Initiated'
  | 'Failed'
  | 'Timed out'

export type AbortTransferAction =
  & ActionData
  & {
    actionType: 'AbortTransfer',
    transferUri: string,
    transfer: TransferRecord,
  }

export type AbortTransferActionWithId =
  & ActionRecordWithId
  & AbortTransferAction

export type TaskData =
  & UserReference
  & {
    taskId?: number,
    taskType: string,
    scheduledFor: Date,
  }

export type TaskRecord =
  | DeleteTransferTask

export type TaskRecordWithId =
  & TaskRecord
  & { taskId: number }

export type DeleteTransferTask =
  & TaskData
  & {
    taskType: 'DeleteTransfer',
    transferUri: string,
  }

export type DeleteTransferTaskWithId =
  & TaskRecordWithId
  & DeleteTransferTask

export class UserDoesNotExist extends Error {
  name = 'UserDoesNotExist'
}

export class RecordDoesNotExist extends Error {
  name = 'RecordDoesNotExist'
}

const MAX_PROCESSING_DELAY_MILLISECONDS = 2 * appConfig.serverApiTimeout + 3_600_000  // to be on the safe side
const TRANSFER_NORMAL_WAIT_SECONDS = 86400  // 24 hours before the transfer is considered delayed.
const TRANSFER_DELETION_MIN_DELAY_SECONDS = 5 * 86400  // 5 days
const TRANSFER_DELETION_DELAY_SECONDS = Math.max(
  appConfig.TransferDeletionDelaySeconds, TRANSFER_DELETION_MIN_DELAY_SECONDS)

function hasTimedOut(startedAt: Date, currentTime: number = Date.now()): boolean {
  const deadline = startedAt.getTime() + 1000 * TRANSFER_DELETION_MIN_DELAY_SECONDS
  return currentTime + MAX_PROCESSING_DELAY_MILLISECONDS > deadline
}

function getTransferState(transfer: Transfer): 'waiting' | 'delayed' | 'successful' | 'unsuccessful' {
  switch (transfer.result?.committedAmount) {
    case undefined:
      const initiatedAt = new Date(transfer.initiatedAt)
      const delayThreshold = new Date(initiatedAt.getTime() + 1000 * TRANSFER_NORMAL_WAIT_SECONDS)
      const now = new Date()
      return now <= delayThreshold ? 'waiting' : 'delayed'
    case 0n:
      return 'unsuccessful'
    default:
      return 'successful'
  }
}

export function getCreateTransferActionStatus(
  action: CreateTransferAction,
  currentTime: number = Date.now()
): CreateTransferActionStatus {
  if (action.execution === undefined) return 'Draft'
  const { startedAt, unresolvedRequestAt, result } = action.execution
  switch (result?.ok) {
    case undefined:
      if (hasTimedOut(startedAt, currentTime)) return 'Timed out'
      if (unresolvedRequestAt) return 'Not confirmed'
      return 'Not sent'
    case true:
      return 'Initiated'
    case false:
      return 'Failed'
  }
}

class CreditorsDb extends Dexie {
  wallets: Dexie.Table<WalletRecord, number>
  walletObjects: Dexie.Table<WalletObjectRecord, string>
  accounts: Dexie.Table<AccountRecord, string>
  accountObjects: Dexie.Table<AccountObjectRecord, string>
  committedTransfers: Dexie.Table<CommittedTransferRecord, string>
  transfers: Dexie.Table<TransferRecord, string>
  ledgerEntries: Dexie.Table<LedgerEntryRecord, number>
  documents: Dexie.Table<DocumentRecord, string>
  actions: Dexie.Table<ActionRecord, number>
  tasks: Dexie.Table<TaskRecord, number>

  constructor() {
    super('creditors')

    this.version(1).stores({
      wallets: '++userId,&uri',
      walletObjects: 'uri,userId',
      accounts: 'uri,userId',
      accountObjects: 'uri,userId,account.uri',

      // Committed transfers are objects that belong to a specific
      // account, but we will have lots of them, and in order to keep
      // the `accountObjects` table lean, committed transfers are
      // separated in their own table.
      committedTransfers: 'uri,userId,account.uri',

      // Here '[userId+time],&uri' / '[account.uri+entryId],userId'
      // would probably be a bit more efficient, because the records
      // would be ordered physically in the same way as they are
      // normally queried. The problem is that it seems
      // "fake-indexeddb", which we use for testing, does not support
      // compound primary keys.
      transfers: 'uri,&[userId+time]',
      ledgerEntries: '++id,&[account.uri+entryId],userId',

      // Contains debtor info documents. They are shared by all users.
      documents: 'uri',

      actions: '++actionId,[userId+createdAt],creationRequest.transferUuid,transferUri',
      tasks: '++taskId,[userId+scheduledFor]',
    })

    this.wallets = this.table('wallets')
    this.walletObjects = this.table('walletObjects')
    this.accounts = this.table('accounts')
    this.accountObjects = this.table('accountObjects')
    this.committedTransfers = this.table('committedTransfers')
    this.transfers = this.table('transfers')
    this.ledgerEntries = this.table('ledgerEntries')
    this.documents = this.table('documents')
    this.actions = this.table('actions')
    this.tasks = this.table('tasks')
  }

  async clearAllTables(): Promise<void> {
    await this.transaction('rw', this.allTables, async () => {
      for (const table of this.allTables) {
        await table.clear()
      }
    })
  }

  async getUserId(walletUri: string): Promise<number | undefined> {
    return (await this.wallets.where({ uri: walletUri }).primaryKeys())[0]
  }

  async uninstallUser(userId: number): Promise<void> {
    await this.transaction('rw', this.allTables, async () => {
      for (const table of this.allTables) {
        if (table !== this.documents) {
          await table.where({ userId }).delete()
        }
      }
    })
  }

  async getWalletRecord(userId: number): Promise<WalletRecordWithId> {
    const walletRecord = await this.wallets.get(userId)
    if (!walletRecord) {
      throw new UserDoesNotExist()
    }
    return walletRecord as WalletRecordWithId
  }

  async updateWalletRecord(walletRecord: WalletRecordWithId): Promise<void> {
    const updated = await this.wallets
      .where({ userId: walletRecord.userId })
      .modify(function(this: any) {
        this.value = walletRecord
      })
    if (updated === 0) {
      throw new UserDoesNotExist()
    }
    assert(updated === 1)
  }

  async getLogObjectRecord(
    { objectUri, objectType }: { objectUri: string, objectType: string }
  ): Promise<LogObjectRecord | undefined> {
    const table = this.getLogObjectTable(objectType)
    return await table.get(objectUri)
  }

  async updateLogObjectRecord(updateInfo: ObjectUpdateInfo, objectRecord: LogObjectRecord | null): Promise<void> {
    const { objectUri, objectType,  logInfo } = updateInfo
    const deleted = logInfo?.deleted
    const objectUpdateId = logInfo?.objectUpdateId
    const table = this.getLogObjectTable(objectType)
    if (objectUpdateId) {
      const existingRecord = await table.get(objectUri)
      if (existingRecord) {
        assert(existingRecord.latestUpdateId !== undefined)
        if (existingRecord.latestUpdateId >= objectUpdateId) {
          return  // The record already exists and is up-to-date.
        }
      }
    }
    if (deleted) {
      assert(!objectRecord)
      await table.delete(objectUri)
    } else {
      assert(objectRecord)
      await table.put(objectRecord)
    }
  }

  async getDocumentRecord(uri: string): Promise<DocumentRecord | undefined> {
    return await this.documents.get(uri)
  }

  async putDocumentRecord(documentRecord: DocumentRecord): Promise<void> {
    await this.documents.put(documentRecord)
  }

  async getTasks(userId: number, scheduledFor: Date = new Date(), limit = 1e9): Promise<TaskRecordWithId[]> {
    let collection = this.tasks
      .where('[userId+scheduledFor]')
      .between([userId, Dexie.minKey], [userId, scheduledFor], false, true)
      .limit(limit)
    return await collection.toArray() as TaskRecordWithId[]
  }

  async removeTask(taskId: number): Promise<void> {
    await this.tasks.delete(taskId)
  }

  async getActionRecords(userId: number, options: ListQueryOptions = {}): Promise<ActionRecordWithId[]> {
    const { before = Dexie.maxKey, after = Dexie.minKey, limit = 1e9, latestFirst = true } = options
    let collection = this.actions
      .where('[userId+createdAt]')
      .between([userId, after], [userId, before], false, false)
      .limit(limit)
    if (latestFirst) {
      collection = collection.reverse()
    }
    return await collection.toArray() as ActionRecordWithId[]
  }

  async getActionRecord(actionId: number): Promise<ActionRecordWithId | undefined> {
    return await this.actions.get(actionId) as ActionRecordWithId | undefined
  }

  /* Creates a new `ActionRecord` and returns its `actionId`. Note
   * that the passed `action` object should not have an `actionId`
   * field, and it will be added automatically. */
  async createActionRecord(action: ActionRecord): Promise<number> {
    if (action.actionId !== undefined) throw new Error('actionId must be undefined')
    return await this.transaction('rw', [this.wallets, this.actions], async () => {
      if (!await this.isInstalledUser(action.userId)) {
        throw new UserDoesNotExist()
      }
      return await this.actions.add(action)
    })
  }

  async removeActionRecord(actionId: number): Promise<void> {
    await this.transaction('rw', [this.transfers, this.actions, this.tasks], async () => {
      const action = await this.actions.get(actionId)
      if (action) {
        const abortTransfer = async (transferUri: string): Promise<void> => {
          let transferRecord = await this.transfers.get(transferUri)
          if (transferRecord && transferRecord.userId === action.userId) {
            if (getTransferState(transferRecord) !== 'successful') {
              const initiationTime = getIsoTimeOrNow(transferRecord.initiatedAt)
              transferRecord.aborted = true
              await this.transfers.put(transferRecord)
              await this.tasks.put({
                userId: action.userId,
                taskType: 'DeleteTransfer',
                scheduledFor: new Date(initiationTime + 1000 * TRANSFER_DELETION_MIN_DELAY_SECONDS),
                transferUri,
              })
            }
          }
        }
        await this.actions.delete(actionId)
        if (action.actionType === 'AbortTransfer') {
          await abortTransfer(action.transferUri)
        }
      }
    })
  }

  /* Replaces, updates, or deletes the passed action record. Will
   * throw `RecordDoesNotExist` if the original action record does not
   * exist, or has been changed. Note that an `actionId` field will be
   * added to the passed `replacement` object if it does not have
   * one. */
  async replaceActionRecord(original: ActionRecordWithId, replacement: ActionRecord | null): Promise<void> {
    await this.transaction('rw', [this.transfers, this.actions, this.tasks], async () => {
      const { actionId, userId } = original
      const existing = await this.actions.get(actionId)
      if (!equal(existing, original)) {
        throw new RecordDoesNotExist()
      }
      assert(!replacement || replacement.userId === userId, 'wrong userId')
      assert(!replacement || replacement.actionId === undefined || replacement.actionId === actionId, 'wrong actionId')
      if (replacement && replacement.actionId === actionId) {
        // Update the action record "in place".
        assert(replacement.actionType === original.actionType, 'wrong actionType')
        assert(replacement.createdAt.getTime() === original.createdAt.getTime(), 'wrong createdAt')
        await this.actions.put(replacement)
      } else {
        // Delete the original record.
        await this.removeActionRecord(actionId)

        // Put a replacement, if available.
        if (replacement) {
          await this.actions.add(replacement)
        }
      }
    })
  }

  async getTransferRecords(userId: number, options: ListQueryOptions = {}): Promise<TransferRecord[]> {
    const { before = Dexie.maxKey, after = Dexie.minKey, limit = 1e9, latestFirst = true } = options
    let collection = this.transfers
      .where('[userId+time]')
      .between([userId, after], [userId, before], false, false)
      .limit(limit)
    if (latestFirst) {
      collection = collection.reverse()
    }
    return await collection.toArray()
  }

  async getTransferRecord(uri: string): Promise<TransferRecord | undefined> {
    return await this.transfers.get(uri)
  }

  /* Deletes the passed create transfer action record, and ensures
   * that a corresponding transfer record does exist.  Will throw
   * `RecordDoesNotExist` if the passed action record does not exist,
   * or has been changed. */
  async createTransferRecord(
    action: CreateTransferActionWithId,
    transfer: TransferV0,
  ): Promise<TransferRecord> {
    return await this.transaction('rw', this.allTables, async () => {
      const { actionId, userId } = action

      // The validation of the action record must be done before the
      // call to `storeTransfer`, because the call will change the
      // action record.
      const existing = await this.actions.get(actionId)
      if (!equal(existing, action)) {
        throw new RecordDoesNotExist()
      }
      const transferRecord = await this.storeTransfer(userId, transfer)

      // The action record must be deleted after the `storeTransfer`
      // call, otherwise the `originatesHere` field in the transfer
      // record will not be set correctly.
      await this.actions.delete(actionId)

      return transferRecord
    })
  }

  async storeTransfer(userId: number, transfer: TransferV0): Promise<TransferRecord> {
    const { uri: transferUri, transferUuid, initiatedAt, result } = transfer

    const getAbortTransferActionQuery = () => this.actions
      .where({ transferUri })
      .filter(
        action => action.actionType === 'AbortTransfer' && action.userId === userId
      ) as Collection<AbortTransferActionWithId, number>

    const deleteAbortTransferAction = async () => {
      const actionsToDelete = await getAbortTransferActionQuery().toArray()
      for (const { actionId } of actionsToDelete) {
        await this.actions.delete(actionId)
      }
      if (actionsToDelete.length > 1) {
        console.warn(`There were more than one abort transfer actions for ${transferUri}.`)
      }
    }

    const matchCreateTransferAction = async (): Promise<boolean> => {
      const matched = await this.actions
        .where({ 'creationRequest.transferUuid': transferUuid })
        .filter(action => action.actionType === 'CreateTransfer')
        .modify((action: CreateTransferAction) => {
          action.execution = {
            startedAt: action.execution?.startedAt ?? new Date(),
            result: { ok: true, transferUri },
          }
        })
      return matched !== 0
    }

    const putTransferRecord = async (): Promise<TransferRecord> => {
      let transferRecord
      const existingTransferRecord = await this.transfers.get(transferUri)
      if (existingTransferRecord) {
        assert(existingTransferRecord.userId === userId, 'wrong userId')
        if (existingTransferRecord.latestUpdateId >= transfer.latestUpdateId) {
          transferRecord = existingTransferRecord
        } else {
          const { time, paymentInfo, originatesHere, aborted } = existingTransferRecord
          transferRecord = { ...transfer, userId, time, paymentInfo, originatesHere, aborted }
        }
      } else {
        const time = getIsoTimeOrNow(initiatedAt)
        const paymentInfo = parseTransferNote(transfer)
        const originatesHere = await matchCreateTransferAction()
        transferRecord = { ...transfer, userId, time, paymentInfo, originatesHere, aborted: false }
      }
      let attemptsLeft = 100
      while (true) {
        try {
          await this.transfers.put(transferRecord)
          break
        } catch (e: unknown) {
          if (!(e instanceof Dexie.ConstraintError && attemptsLeft--)) throw e
          transferRecord.time *= (1 + Number.EPSILON)
        }
      }
      return transferRecord
    }

    const scheduleTransferDeletion = async (): Promise<void> => {
      const finalizationTime = getIsoTimeOrNow(result?.finalizedAt)
      await this.tasks.put({
        userId,
        taskType: 'DeleteTransfer',
        scheduledFor: new Date(finalizationTime + 1000 * TRANSFER_DELETION_DELAY_SECONDS),
        transferUri,
      })
    }

    const putAbortTransferAction = async (t: TransferRecord): Promise<void> => {
      let abortTransferAction: AbortTransferAction | undefined
      const existingAbortTransferAction = await getAbortTransferActionQuery().first()
      if (!existingAbortTransferAction) {
        abortTransferAction = {
          userId,
          actionType: 'AbortTransfer',
          createdAt: new Date(),
          transferUri,
          transfer: t,
        }
      } else if (!existingAbortTransferAction.transfer.result && t.result) {
        existingAbortTransferAction.transfer.result = t.result
        abortTransferAction = existingAbortTransferAction
      }
      if (abortTransferAction) {
        await this.actions.put(abortTransferAction)
      }
    }

    return await this.transaction('rw', this.allTables, async () => {
      if (!await this.isInstalledUser(userId)) {
        throw new UserDoesNotExist()
      }
      const transferRecord = await putTransferRecord()
      switch (getTransferState(transferRecord)) {
        case 'successful':
          await scheduleTransferDeletion()
          await deleteAbortTransferAction()
          break
        case 'delayed':
        case 'unsuccessful':
          if (!transferRecord.aborted) {
            await putAbortTransferAction(transferRecord)
          }
          break
      }
      return transferRecord
    })
  }

  async storeUserData(data: UserData): Promise<number> {
    // TODO: Delete user's existing actions (excluding
    // `CreateTransferAction`s and `PaymentRequestAction`s). Also,
    // consider deleting some of user's tasks.

    const { accounts, wallet, creditor, pinInfo } = data
    const { requirePin, log, ...walletRecord } = {
      ...wallet,
      logStream: {
        latestEntryId: wallet.logLatestEntryId,
        forthcoming: wallet.log.forthcoming,
        loadedTransfers: false,
        isBroken: false,
      },
    }

    return await this.transaction('rw', this.allTables, async () => {
      let userId = await this.getUserId(wallet.uri)
      userId = await this.wallets.put({ ...walletRecord, userId })
      await this.walletObjects.put({ ...creditor, userId })
      await this.walletObjects.put({ ...pinInfo, userId })
      const oldAccountRecordsArray = await this.accounts.where({ userId }).toArray()
      const oldAccountRecordsMap = new Map(oldAccountRecordsArray.map(x => [x.uri, x]))

      for (const account of accounts) {
        const {
          accountRecord,
          accountInfoRecord,
          accountDisplayRecord,
          accountKnowledgeRecord,
          accountExchangeRecord,
          accountLedgerRecord,
          accountConfigRecord,
        } = splitIntoRecords(userId, account)
        await this.accounts.put(accountRecord)
        await this.accountObjects.where({ 'account.uri': account.uri }).delete()
        await this.accountObjects.bulkPut([
          accountInfoRecord,
          accountDisplayRecord,
          accountKnowledgeRecord,
          accountExchangeRecord,
          accountLedgerRecord,
          accountConfigRecord,
        ])
        oldAccountRecordsMap.delete(account.uri)
      }

      // Delete all old accounts, which are missing from the received
      // `accounts` array.
      for (const accountUri of oldAccountRecordsMap.keys()) {
        await this.deleteAccount(accountUri)
      }
      return userId
    })
  }

  async deleteAccount(accountUri: string): Promise<void> {
    const tables = [this.accounts, this.accountObjects, this.ledgerEntries, this.committedTransfers]
    await this.transaction('rw', tables, async () => {
      await this.accounts.delete(accountUri)
      await this.accountObjects.where({ 'account.uri': accountUri }).delete()
      await this.ledgerEntries.where({ 'account.uri': accountUri }).delete()
      await this.committedTransfers.where({ 'account.uri': accountUri }).delete()
    })
  }

  async isConcludedTransfer(transferUri: string): Promise<boolean> {
    const transferRecord = await this.transfers.get(transferUri)
    return transferRecord !== undefined && (transferRecord.result !== undefined || transferRecord.aborted === true)
  }

  async executeTransaction<Result>(func: () => Promise<Result>): Promise<Result> {
    return await this.transaction('rw', this.allTables, async () => {
      return await func()
    })
  }

  private getLogObjectTable(objectType: string): Dexie.Table<LogObjectRecord, string> {
    switch (true) {
      case ACCOUNT_TYPE.test(objectType):
        return this.accounts
      case ACCOUNT_DISPLAY_TYPE.test(objectType):
      case ACCOUNT_KNOWLEDGE_TYPE.test(objectType):
      case ACCOUNT_EXCHANGE_TYPE.test(objectType):
      case ACCOUNT_LEDGER_TYPE.test(objectType):
      case ACCOUNT_CONFIG_TYPE.test(objectType):
      case ACCOUNT_INFO_TYPE.test(objectType):
        return this.accountObjects
      case CREDITOR_TYPE.test(objectType):
      case PIN_INFO_TYPE.test(objectType):
        return this.walletObjects
      case COMMITTED_TRANSFER_TYPE.test(objectType):
        return this.committedTransfers
      case TRANSFER_TYPE.test(objectType):
        return this.transfers
      default:
        throw new Error('unknown object type')
    }
  }

  private async isInstalledUser(userId: number): Promise<boolean> {
    return await this.wallets.where({ userId }).count() === 1
  }

  private get allTables() {
    return [
      this.wallets,
      this.walletObjects,
      this.accounts,
      this.accountObjects,
      this.committedTransfers,
      this.transfers,
      this.ledgerEntries,
      this.documents,
      this.actions,
      this.tasks,
    ]
  }

}

export function splitIntoRecords(userId: number, account: AccountV0): {
  accountRecord: AccountRecord,
  accountDisplayRecord: AccountDisplayRecord,
  accountConfigRecord: AccountConfigRecord,
  accountKnowledgeRecord: AccountKnowledgeRecord,
  accountExchangeRecord: AccountExchangeRecord,
  accountLedgerRecord: AccountLedgerRecord,
  accountInfoRecord: AccountInfoRecord,
} {
  const { info, display, knowledge, exchange, ledger, config, ...sanitizedAccount } = account
  return {
    accountRecord: {
      ...sanitizedAccount,
      info: { uri: info.uri },
      display: { uri: display.uri },
      knowledge: { uri: knowledge.uri },
      exchange: { uri: exchange.uri },
      ledger: { uri: ledger.uri },
      config: { uri: config.uri },
      userId,
    },
    accountInfoRecord: { ...info, userId },
    accountDisplayRecord: { ...display, userId },
    accountKnowledgeRecord: { ...knowledge, userId },
    accountExchangeRecord: { ...exchange, userId },
    accountLedgerRecord: { ...ledger, userId },
    accountConfigRecord: { ...config, userId },
  }
}

function getIsoTimeOrNow(isoTime?: string): number {
  const time = isoTime ? new Date(isoTime).getTime() : NaN
  return Number.isFinite(time) ? time : Date.now()
}

export const db = new CreditorsDb()
