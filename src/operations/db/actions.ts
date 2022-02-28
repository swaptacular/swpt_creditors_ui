import type {
  ActionRecord, ActionRecordWithId, ListQueryOptions, ApprovePegAction, ApproveAmountDisplayAction,
  ApproveDebtorNameAction
} from './schema'

import { Dexie } from 'dexie'
import equal from 'fast-deep-equal'
import { db, RecordDoesNotExist } from './schema'
import {
  UserDoesNotExist, isInstalledUser, verifyAccountKnowledge, getBaseDebtorDataFromAccoutKnowledge
} from './common'
import { abortTransfer } from './transfers'
import type { BaseDebtorData } from 'src/debtor-info'

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
            if (changes.debtorName) {
              await createApproveAction({
                actionType: 'ApproveDebtorName',
                createdAt: new Date(),
                debtorName: debtorData.debtorName,
                editedDebtorName: debtorData.debtorName,
                unsetKnownDebtor: true,
                userId,
                accountUri,
              })
            }
            if (changes.amountDivisor || changes.decimalPlaces || changes.unit) {
              await createApproveAction({
                actionType: 'ApproveAmountDisplay',
                createdAt: new Date(),
                amountDivisor: debtorData.amountDivisor,
                decimalPlaces: debtorData.decimalPlaces,
                unit: debtorData.unit,
                userId,
                accountUri,
              })
            }
            if ((changes.pegParams || changes.pegDebtorInfoUri) && debtorData.peg) {
              const peg = debtorData.peg
              const approvePegAction = {
                actionType: 'ApprovePeg' as const,
                createdAt: new Date(),
                onlyTheCoinHasChanged: !changes.pegParams,
                ignoreCoinMismatch: false,
                alreadyHasApproval: false,
                peg,
                userId,
                accountUri,
              }
              if (changes.pegParams) {
                await createApproveAction(approvePegAction, true)
              } else {
                const pegDebtorData = await getDebtorDataFromDebtorUri(peg.debtorIdentity.uri)
                if (pegDebtorData?.latestDebtorInfo.uri !== peg.latestDebtorInfo.uri) {
                  await createApproveAction(approvePegAction, false)
                }
              }
            }
            if (changes.latestDebtorInfo) {
              // TODO: Go through the existing 'ApprovePeg' actions
              // which want to create a peg to `action.accountUri`,
              // and if `a.onlyTheCoinHasChanged === true &&
              // a.peg.latestDebtorInfo.uri ===
              // debtorData.latestDebtorInfo.uri` -- delete the
              // action.
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

export async function createApproveAction(action: ApproveAction, overrideExisting: boolean = true): Promise<number> {
  const { accountUri, actionType } = action
  return await db.transaction('rw', [db.wallets, db.actions], async () => {
    const existingActionQuery = db.actions
      .where({ accountUri })
      .filter(a => a.actionType === actionType)
    if (overrideExisting) {
      await existingActionQuery.delete()
    } else {
      const existingAction = await existingActionQuery.first() as ActionRecordWithId | undefined
      if (existingAction) {
        // Even when we do not want to override the existing action,
        // we still want to update the `peg.latestDebtorInfo.uri`
        // field of 'ApprovePeg' actions. This should be unnoticeable
        // to the user, and makes using the wrong URI less probable.
        if (actionType === 'ApprovePeg') {
          const uri = action.peg.latestDebtorInfo.uri
          await existingActionQuery.modify((a: ApprovePegAction) => {
            if (
              a.peg.exchangeRate === action.peg.exchangeRate &&
              a.peg.debtorIdentity.uri === action.peg.debtorIdentity.uri &&
              equal(a.peg.display, action.peg.display) &&
              a.peg.latestDebtorInfo.uri !== uri
            ) {
              a.peg.latestDebtorInfo.uri = uri
              a.ignoreCoinMismatch = false
            }
          })
        }
        return existingAction.actionId
      }
    }
    return await createActionRecord(action)
  })
}

async function getDebtorDataFromDebtorUri(debtorUri: string): Promise<BaseDebtorData | undefined> {
  return await db.transaction('rw', [db.accounts, db.accountObjects], async () => {
    let debtorData
    const accounts = await db.accounts.filter(account => account.debtor.uri === debtorUri).toArray()
    if (accounts.length > 0) {
      assert(accounts.length == 1)
      const account = accounts[1]
      const display = await db.accountObjects.get(account.display.uri)
      const knowledge = await db.accountObjects.get(account.knowledge.uri)
      if (display && knowledge) {
        assert(display.type === 'AccountDisplay')
        assert(knowledge.type === 'AccountKnowledge')
        if (display.debtorName !== undefined) {
          debtorData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
        }
      }
    }
    return debtorData
  })
}
