import type { Collection } from 'dexie'
import type { TransferV0 } from '../canonical-objects'
import type {
  CreateTransferAction, CreateTransferActionWithId, TransferRecord, AbortTransferActionWithId,
  AbortTransferAction, ListQueryOptions, ExecutionState, AccountDisplayRecord
} from './schema'
import equal from 'fast-deep-equal'
import { Dexie } from 'dexie'
import { parseTransferNote } from '../../payment-requests'
import { db, RecordDoesNotExist } from './schema'
import {
  UserDoesNotExist, isInstalledUser, getWalletRecord, getAccountRecordByDebtorUri,
  getAccountObjectRecord, getDebtorIdentityFromAccountIdentity
} from './common'

export const MAX_PROCESSING_DELAY_MILLISECONDS = 2 * appConfig.serverApiTimeout + 3_600_000  // to be on the safe side
export const TRANSFER_NORMAL_WAIT_SECONDS = 86400  // 24 hours before the transfer is considered delayed.
export const TRANSFER_DELETION_MIN_DELAY_SECONDS = 5 * 86400  // 5 days
export const TRANSFER_DELETION_DELAY_SECONDS = Math.max(
  appConfig.transferDeletionDelaySeconds, TRANSFER_DELETION_MIN_DELAY_SECONDS)

export type TransferState = 'waiting' | 'delayed' | 'successful' | 'unsuccessful'

export type ExtendedTransferRecord = TransferRecord & {
  display?: AccountDisplayRecord,
}

export function getTransferState(transfer: TransferV0): TransferState {
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

export type CreateTransferActionStatus =
  | 'Draft'
  | 'Not sent'
  | 'Not confirmed'
  | 'Initiated'
  | 'Failed'
  | 'Timed out'

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

export async function getTransferRecords(
  userId: number,
  options: ListQueryOptions = {},
): Promise<ExtendedTransferRecord[]> {
  const { before = Dexie.maxKey, after = Dexie.minKey, limit = 1e9, latestFirst = true } = options
  let collection = db.transfers
    .where('[userId+time]')
    .between([userId, after], [userId, before], false, false)
    .limit(limit)
  if (latestFirst) {
    collection = collection.reverse()
  }
  const transferRecords = await collection.toArray()
  return await Promise.all(transferRecords.map(extendTransferRecord))
}

export async function getTransferRecord(uri: string): Promise<TransferRecord | undefined> {
  return await db.transfers.get({ uri })
}

export async function getExtendedTransferRecord(uri: string): Promise<ExtendedTransferRecord | undefined> {
  const transferRecord = await db.transfers.get({ uri })
  if (transferRecord) {
    return await extendTransferRecord(transferRecord)
  }
  return undefined
}

/* Deletes the passed create transfer action record, and ensures
 * that a corresponding transfer record does exist.  Will throw
 * `RecordDoesNotExist` if the passed action record does not exist,
 * or has been changed. */
export async function createTransferRecord(
  action: CreateTransferActionWithId,
  transfer: TransferV0,
): Promise<TransferRecord> {
  return await db.transaction('rw', db.allTables, async () => {
    const { actionId, userId } = action

    // The validation of the action record must be done before the
    // call to `storeTransfer`, because the call will change the
    // action record.
    const existing = await db.actions.get(actionId)
    if (!equal(existing, action)) {
      throw new RecordDoesNotExist()
    }
    const transferRecord = await storeTransfer(userId, transfer)

    // The action record must be deleted after the `storeTransfer`
    // call, otherwise the `originatesHere` field in the transfer
    // record will not be set correctly.
    await db.actions.delete(actionId)

    return transferRecord
  })
}

export async function storeTransfer(userId: number, transfer: TransferV0): Promise<TransferRecord> {
  const { uri: transferUri, transferUuid, initiatedAt, result } = transfer

  const deleteAbortTransferAction = async () => {
    const actionsToDelete = await getAbortTransferActionQuery(userId, transferUri).toArray()
    for (const { actionId } of actionsToDelete) {
      await db.actions.delete(actionId)
    }
    if (actionsToDelete.length > 1) {
      console.warn(`There were more than one abort transfer actions for ${transferUri}.`)
    }
  }

  const matchCreateTransferAction = async (): Promise<boolean> => {
    const matched = await db.actions
      .where({ transferUuid })
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
    const existingTransferRecord = await db.transfers.get({ uri: transferUri })
    if (existingTransferRecord) {
      assert(existingTransferRecord.userId === userId, 'wrong userId')
      assert(existingTransferRecord.transfersList.uri === transfer.transfersList.uri)
      assert(existingTransferRecord.transferUuid === transfer.transferUuid)
      assert(existingTransferRecord.initiatedAt === transfer.initiatedAt)
      assert(existingTransferRecord.amount === transfer.amount)
      assert(existingTransferRecord.recipient.uri === transfer.recipient.uri)
      assert(existingTransferRecord.noteFormat === transfer.noteFormat)
      assert(existingTransferRecord.note === transfer.note)
      if (existingTransferRecord.latestUpdateId >= transfer.latestUpdateId) {
        transferRecord = existingTransferRecord
      } else {
        const { time, paymentInfo, originatesHere, aborted } = existingTransferRecord
        const couldBeDelayed = (result === undefined && !aborted) ? "yes" as const : undefined
        transferRecord = { ...transfer, userId, time, paymentInfo, originatesHere, couldBeDelayed, aborted }
      }
    } else {
      const time = getIsoTimeOrNow(initiatedAt)
      const paymentInfo = parseTransferNote(transfer)
      const originatesHere = await matchCreateTransferAction()
      const couldBeDelayed = (result === undefined) ? "yes" as const: undefined
      transferRecord = { ...transfer, userId, time, paymentInfo, originatesHere, couldBeDelayed, aborted: false }
    }
    let attemptsLeft = 100
    while (true) {
      try {
        await db.transfers.put(transferRecord)
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
    await db.tasks.put({
      userId,
      taskType: 'DeleteTransfer',
      scheduledFor: new Date(finalizationTime + 1000 * TRANSFER_DELETION_DELAY_SECONDS),
      transferUri,
    })
  }

  return await db.transaction('rw', db.allTables, async () => {
    if (!await isInstalledUser(userId)) {
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

export async function abortTransfer(userId: number, transferUri: string): Promise<void> {
  await db.transaction('rw', [db.transfers, db.tasks], async () => {
    let transferRecord = await db.transfers.get({ uri: transferUri })
    if (transferRecord && transferRecord.userId === userId) {
      if (getTransferState(transferRecord) !== 'successful') {
        const initiationTime = getIsoTimeOrNow(transferRecord.initiatedAt)
        transferRecord.aborted = true
        await db.transfers.put(transferRecord)
        await db.tasks.put({
          userId,
          taskType: 'DeleteTransfer',
          scheduledFor: new Date(initiationTime + 1000 * TRANSFER_DELETION_MIN_DELAY_SECONDS),
          transferUri,
        })
      }
    }
  })
}

export async function registerTranferDeletion(transferUri: string): Promise<void> {
  // Transfers must remain in the local database, even after they
  // have been deleted from the server. This allows the user to
  // review transfers history. Here we only remove actions and tasks
  // related to the deleted transfer.

  await db.transaction('rw', [db.actions, db.tasks], async () => {
    await db.actions
      .where({ transferUri })
      .filter(action => action.actionType === 'AbortTransfer')
      .delete()
    await db.tasks
      .where({ transferUri })
      .filter(task => task.taskType === 'DeleteTransfer')
      .delete()
  })
}

export async function resolveOldNotConfirmedCreateTransferRequests(userId: number): Promise<void> {
  await db.transaction('rw', [db.wallets, db.actions], async () => {
    const walletRecord = await getWalletRecord(userId)
    const syncedAt = walletRecord.logStream.syncedAt
    if (syncedAt) {
      assert(!Number.isNaN(syncedAt.getTime()))
      const currentTime = Date.now()
      const cutoffTime = syncedAt.getTime() - MAX_PROCESSING_DELAY_MILLISECONDS
      await db.actions
        .where('[userId+createdAt]')
        .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
        .filter(action => (
          action.actionType === 'CreateTransfer' &&
          getCreateTransferActionStatus(action, currentTime) === 'Not confirmed' &&
          action.execution!.unresolvedRequestAt!.getTime() < cutoffTime
        ))
        .modify((action: { execution: ExecutionState }) => {
          delete action.execution.unresolvedRequestAt
        })
    }
  })
}

export async function detectDelayedTransfers(userId: number): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    const now = new Date()
    const delayedTransfers = await db.transfers
      .where({userId, couldBeDelayed: 'yes'})
      .filter(transfer => {
        assert(transfer.result === undefined && !transfer.aborted)
        const initiatedAt = new Date(transfer.initiatedAt)
        const delayThreshold = new Date(initiatedAt.getTime() + 1000 * TRANSFER_NORMAL_WAIT_SECONDS)
        return now > delayThreshold
      })
      .toArray()
    for (const transfer of delayedTransfers) {
      await putAbortTransferAction(transfer)
    }
  })
}

function hasTimedOut(startedAt: Date, currentTime: number = Date.now()): boolean {
  const deadline = startedAt.getTime() + 1000 * TRANSFER_DELETION_MIN_DELAY_SECONDS
  return currentTime + MAX_PROCESSING_DELAY_MILLISECONDS > deadline
}

function getIsoTimeOrNow(isoTime?: string): number {
  const time = isoTime ? new Date(isoTime).getTime() : NaN
  return Number.isFinite(time) ? time : Date.now()
}

async function extendTransferRecord(transferRecord: TransferRecord): Promise<ExtendedTransferRecord> {
  let t: ExtendedTransferRecord = { ...transferRecord }
  const debtorIdentityUri = getDebtorIdentityFromAccountIdentity(t.recipient.uri)
  if (debtorIdentityUri) {
    const account = await getAccountRecordByDebtorUri(t.userId, debtorIdentityUri)
    if (account) {
      const display = await getAccountObjectRecord(account.display.uri)
      if (display) {
        assert(display.type === 'AccountDisplay')
        if (display.debtorName !== undefined) {
          t.display = display
        }
      }
    }
  }
  await db.transfers.get({ uri: '' })  // This ensures that the transaction is kept alive.
  return t
}

function getAbortTransferActionQuery(userId: number, transferUri: string) {
  return db.actions
    .where({ transferUri })
    .filter(
      action => action.actionType === 'AbortTransfer' && action.userId === userId
    ) as Collection<AbortTransferActionWithId, number>
}

async function putAbortTransferAction(transfer: TransferRecord): Promise<void>  {
  let abortTransferAction: AbortTransferAction | undefined
  const { uri: transferUri, userId, result } = transfer
  const existingAbortTransferAction = await getAbortTransferActionQuery(userId, transferUri).first()
  if (!existingAbortTransferAction) {
    const accountUri = (await extendTransferRecord(transfer))?.display?.account.uri
    abortTransferAction = {
      userId,
      accountUri,
      actionType: 'AbortTransfer',
      createdAt: new Date(),
      transferUri,
      transfer,
    }
  } else if (!existingAbortTransferAction.transfer.result && result) {
    existingAbortTransferAction.transfer.result = result
    abortTransferAction = existingAbortTransferAction
  }
  if (abortTransferAction) {
    await db.actions.put(abortTransferAction)
  }
}
