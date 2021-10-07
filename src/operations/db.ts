import equal from 'fast-deep-equal'
import { Dexie } from 'dexie'
import type { Collection } from 'dexie'
import type {
  Wallet,
  Creditor,
  PinInfo,
  AccountConfig,
  AccountLedger,
  AccountInfo,
  AccountKnowledge,
  AccountExchange,
  AccountDisplay,
  Transfer,
  TransferCreationRequest,
  LedgerEntry,
  CommittedTransfer,
  Error as WebApiError,
} from '../web-api-schemas'
import { parseTransferNote } from '../payment-requests'
import type { PaymentInfo } from '../payment-requests'
import type { ResourceReference, DocumentWithHash } from '../debtor-info'

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
  wallet: Wallet,
  creditor: Creditor,
  pinInfo: PinInfo,
}

export type WalletRecord =
  & Partial<UserReference>
  & Omit<Wallet, 'requirePin' | 'log'>
  & {
    logStream: ResourceReference,
    loadedTransfers: boolean,
    loadedAccounts: boolean,
  }

export type WalletRecordWithId =
  & WalletRecord
  & UserReference

export type ObjectRecord =
  | PinInfoRecord
  | CreditorRecord
  | AccountConfigRecord
  | AccountDisplayRecord
  | AccountExchangeRecord
  | AccountKnowledgeRecord
  | AccountInfoRecord
  | AccountLedgerRecord
  | CommittedTransferRecord

type BaseObjectRecord =
  & UserReference
  & { type: string }

export type PinInfoRecord =
  & PinInfo
  & BaseObjectRecord
  & { type: 'PinInfo' }

export type CreditorRecord =
  & Creditor
  & BaseObjectRecord
  & { type: 'Creditor' }

export type AccountConfigRecord =
  & AccountConfig
  & BaseObjectRecord
  & { type: 'AccountConfig' }

export type AccountDisplayRecord =
  & AccountDisplay
  & BaseObjectRecord
  & { type: 'AccountDisplay' }

export type AccountExchangeRecord =
  & AccountExchange
  & BaseObjectRecord
  & { type: 'AccounExchange' }

export type AccountKnowledgeRecord =
  & AccountKnowledge
  & BaseObjectRecord
  & { type: 'AccountKnowledge' }

export type AccountInfoRecord =
  & AccountInfo
  & BaseObjectRecord
  & { type: 'AccountInfo' }

export type AccountLedgerRecord =
  & AccountLedger
  & BaseObjectRecord
  & { type: 'AccountLedger' }

export type CommittedTransferRecord =
  & CommittedTransfer
  & BaseObjectRecord
  & { type: 'CommittedTransfer' }

export type TransferRecord =
  & UserReference
  & Transfer
  & {
    time: number,
    paymentInfo: PaymentInfo,
    aborted: boolean,
    originatesHere: boolean,
  }

export type LedgerEntryRecord =
  & UserReference
  & LedgerEntry
  & { id?: number }  // an autoincremented ID

export type LedgerEntryRecordWithId =
  & LedgerEntryRecord
  & { id: number }

export type DocumentRecord =
  & UserReference
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
  objects: Dexie.Table<ObjectRecord, string>
  transfers: Dexie.Table<TransferRecord, string>
  ledgerEntries: Dexie.Table<LedgerEntryRecord, number>
  documents: Dexie.Table<DocumentRecord, string>
  actions: Dexie.Table<ActionRecord, number>
  tasks: Dexie.Table<TaskRecord, number>

  constructor() {
    super('creditors')

    this.version(1).stores({
      wallets: '++userId,&uri',
      objects: 'uri,userId',

      // Here '[userId+time],&uri' / '[ledger.uri+entryId],userId'
      // would probably be a bit more efficient, because the records
      // would be ordered physically in the same way as they are
      // normally queried. The problem is that it seems
      // "fake-indexeddb", which we use for testing, does not support
      // compound primary keys.
      transfers: 'uri,&[userId+time]',
      ledgerEntries: '++id,[ledger.uri+entryId],userId',

      documents: 'uri,userId',
      actions: '++actionId,[userId+createdAt],creationRequest.transferUuid,transferUri',
      tasks: '++taskId,[userId+scheduledFor]',
    })

    this.wallets = this.table('wallets')
    this.objects = this.table('objects')
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
        await table.where({ userId }).delete()
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

  async getDocumentRecord(uri: string): Promise<DocumentRecord | undefined> {
    return await this.documents.get(uri)
  }

  async putDocumentRecord(documentRecord: DocumentRecord): Promise<void> {
    await this.transaction('rw', [this.wallets, this.documents], async () => {
      if (!await this.isInstalledUser(documentRecord.userId)) {
        throw new UserDoesNotExist()
      }
      const existingDocumentRecord = await this.documents.get(documentRecord.uri)
      assert(!existingDocumentRecord || existingDocumentRecord.userId === documentRecord.userId, 'wrong userId')
      await this.documents.put(documentRecord)
    })
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
  async createTransferRecord(action: CreateTransferActionWithId, transfer: Transfer): Promise<TransferRecord> {
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

  async storeTransfer(userId: number, transfer: Transfer): Promise<TransferRecord> {
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
        const { time, paymentInfo, originatesHere, aborted } = existingTransferRecord
        transferRecord = { ...transfer, userId, time, paymentInfo, originatesHere, aborted }
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

    const putAbortTransferAction = async (transfer: TransferRecord): Promise<void> => {
      let abortTransferAction: AbortTransferAction | undefined
      const existingAbortTransferAction = await getAbortTransferActionQuery().first()
      if (!existingAbortTransferAction) {
        abortTransferAction = {
          userId,
          actionType: 'AbortTransfer',
          createdAt: new Date(),
          transferUri,
          transfer,
        }
      } else if (!existingAbortTransferAction.transfer.result && transfer.result) {
        existingAbortTransferAction.transfer.result = transfer.result
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
      switch (getTransferState(transfer)) {
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
    const { wallet, creditor, pinInfo } = data

    return await this.transaction('rw', this.allTables, async () => {
      let userId = await this.getUserId(wallet.uri)
      if (userId === undefined) {
        const { requirePin, log, ...walletRecord } = {
          ...wallet,
          logStream: { uri: wallet.log.forthcoming },
          loadedTransfers: false,
          loadedAccounts: false,
        }
        userId = await this.wallets.add(walletRecord)
        await this.objects.add({...creditor, userId, type: 'Creditor'})
        await this.objects.add({...pinInfo, userId, type: 'PinInfo'})
      }
      return userId
    })
  }

  async isConcludedTransfer(transferUri: string): Promise<boolean> {
    const transferRecord = await this.transfers.get(transferUri)
    return transferRecord !== undefined && (transferRecord.result !== undefined || transferRecord.aborted === true)
  }

  private async isInstalledUser(userId: number): Promise<boolean> {
    return await this.wallets.where({ userId }).count() === 1
  }

  private get allTables() {
    return [
      this.wallets,
      this.objects,
      this.transfers,
      this.ledgerEntries,
      this.documents,
      this.actions,
      this.tasks,
    ]
  }

}

function getIsoTimeOrNow(isoTime?: string): number {
  const time = isoTime ? new Date(isoTime).getTime() : NaN
  return Number.isFinite(time) ? time : Date.now()
}

export const db = new CreditorsDb()
