import type { Collection } from 'dexie'
import type { TransferV0 } from '../canonical-objects'
import type {
  CreateTransferAction, CreateTransferActionWithId, TransferRecord, AbortTransferActionWithId,
  AbortTransferAction
} from './schema'
import type { ListQueryOptions } from './common'

import equal from 'fast-deep-equal'
import { Dexie } from 'dexie'
import { parseTransferNote } from '../../payment-requests'
import { getIsoTimeOrNow } from './common'
import { db, RecordDoesNotExist } from './schema'
import { UserDoesNotExist, isInstalledUser } from './users'

export const MAX_PROCESSING_DELAY_MILLISECONDS = 2 * appConfig.serverApiTimeout + 3_600_000  // to be on the safe side
export const TRANSFER_NORMAL_WAIT_SECONDS = 86400  // 24 hours before the transfer is considered delayed.
export const TRANSFER_DELETION_MIN_DELAY_SECONDS = 5 * 86400  // 5 days
export const TRANSFER_DELETION_DELAY_SECONDS = Math.max(
  appConfig.TransferDeletionDelaySeconds, TRANSFER_DELETION_MIN_DELAY_SECONDS)

export type TransferState = 'waiting' | 'delayed' | 'successful' | 'unsuccessful'

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

export async function getTransferRecords(userId: number, options: ListQueryOptions = {}): Promise<TransferRecord[]> {
  const { before = Dexie.maxKey, after = Dexie.minKey, limit = 1e9, latestFirst = true } = options
  let collection = db.transfers
    .where('[userId+time]')
    .between([userId, after], [userId, before], false, false)
    .limit(limit)
  if (latestFirst) {
    collection = collection.reverse()
  }
  return await collection.toArray()
}

export async function getTransferRecord(uri: string): Promise<TransferRecord | undefined> {
  return await db.transfers.get(uri)
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

  const getAbortTransferActionQuery = () => db.actions
    .where({ transferUri })
    .filter(
      action => action.actionType === 'AbortTransfer' && action.userId === userId
    ) as Collection<AbortTransferActionWithId, number>

  const deleteAbortTransferAction = async () => {
    const actionsToDelete = await getAbortTransferActionQuery().toArray()
    for (const { actionId } of actionsToDelete) {
      await db.actions.delete(actionId)
    }
    if (actionsToDelete.length > 1) {
      console.warn(`There were more than one abort transfer actions for ${transferUri}.`)
    }
  }

  const matchCreateTransferAction = async (): Promise<boolean> => {
    const matched = await db.actions
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
    const existingTransferRecord = await db.transfers.get(transferUri)
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
      await db.actions.put(abortTransferAction)
    }
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
    let transferRecord = await db.transfers.get(transferUri)
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

function hasTimedOut(startedAt: Date, currentTime: number = Date.now()): boolean {
  const deadline = startedAt.getTime() + 1000 * TRANSFER_DELETION_MIN_DELAY_SECONDS
  return currentTime + MAX_PROCESSING_DELAY_MILLISECONDS > deadline
}
