import type {
  ActionRecord, ActionRecordWithId, ListQueryOptions, ApprovePegAction, ApproveAmountDisplayAction,
  ApproveDebtorNameAction
} from './schema'

import { Dexie } from 'dexie'
import equal from 'fast-deep-equal'
import { db, RecordDoesNotExist } from './schema'
import { UserDoesNotExist, isInstalledUser, verifyAccountKnowledge } from './users'
import { abortTransfer } from './transfers'

export type ApproveAction = ApprovePegAction | ApproveAmountDisplayAction | ApproveDebtorNameAction

export async function getActionRecords(userId: number, options: ListQueryOptions = {}): Promise<ActionRecordWithId[]> {
  const { before = Dexie.maxKey, after = Dexie.minKey, limit = 1e9, latestFirst = true } = options
  let collection = db.actions
    .where('[userId+createdAt]')
    .between([userId, after], [userId, before], false, false)
    .limit(limit)
  if (latestFirst) {
    collection = collection.reverse()
  }
  return await collection.toArray() as ActionRecordWithId[]
}

export async function getActionRecord(actionId: number): Promise<ActionRecordWithId | undefined> {
  return await db.actions.get(actionId) as ActionRecordWithId | undefined
}

/* Creates a new `ActionRecord` and returns its `actionId`. Note
 * that the passed `action` object should not have an `actionId`
 * field, and it will be added automatically. */
export async function createActionRecord(action: ActionRecord): Promise<number> {
  if (action.actionId !== undefined) throw new Error('actionId must be undefined')
  return await db.transaction('rw', [db.wallets, db.actions], async () => {
    if (!await isInstalledUser(action.userId)) {
      throw new UserDoesNotExist()
    }
    return await db.actions.add(action)
  })
}

export async function removeActionRecord(actionId: number): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    const action = await db.actions.get(actionId)
    if (action) {
      await db.actions.delete(actionId)
      switch (action.actionType) {
        case 'AbortTransfer':
          await abortTransfer(action.userId, action.transferUri)
          break
        case 'AckAccountInfo':
          if (action.acknowledged) {
            const { userId, accountUri, changes, debtorData } = action
            const createAction= (actionType: ApproveAction['actionType']) => createApproveAction({
              actionType,
              userId,
              accountUri,
              createdAt: new Date(),
            })
            if (changes.debtorName) {
              await createAction('ApproveDebtorName')
            }
            if (changes.amountDivisor || changes.decimalPlaces || changes.unit) {
              await createAction('ApproveAmountDisplay')
            }
            if (changes.peg && debtorData.peg) {
              await createAction('ApprovePeg')
            }
          }
          verifyAccountKnowledge(action.accountUri)
          break
        default:
        // Do nothing more.
      }
    }
  })
}

/* Replaces, updates, or deletes the passed action record. Will
 * throw `RecordDoesNotExist` if the original action record does not
 * exist, or has been changed. Note that an `actionId` field will be
 * added to the passed `replacement` object if it does not have
 * one. */
export async function replaceActionRecord(original: ActionRecordWithId, replacement: ActionRecord | null): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    const { actionId, userId } = original
    const existing = await db.actions.get(actionId)
    if (!equal(existing, original)) {
      throw new RecordDoesNotExist()
    }
    assert(!replacement || replacement.userId === userId, 'wrong userId')
    assert(!replacement || replacement.actionId === undefined || replacement.actionId === actionId, 'wrong actionId')
    if (replacement && replacement.actionId === actionId) {
      // Update the action record "in place".
      assert(replacement.actionType === original.actionType, 'wrong actionType')
      assert(replacement.createdAt.getTime() === original.createdAt.getTime(), 'wrong createdAt')
      await db.actions.put(replacement)
    } else {
      // Delete the original record.
      await removeActionRecord(actionId)

      // Put a replacement, if available.
      if (replacement) {
        await db.actions.add(replacement)
      }
    }
  })
}

export async function createApproveAction(action: ApproveAction): Promise<number> {
  const { accountUri, actionType } = action
  return await db.transaction('rw', [db.wallets, db.actions], async () => {
    await db.actions
      .where({ accountUri })
      .filter(action => action.actionType === actionType)
      .delete()
    return await createActionRecord(action)
  })
}
