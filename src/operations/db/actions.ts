import type {
  ActionRecord, ActionRecordWithId, ListQueryOptions, AccountKnowledgeRecord, AccountInfoRecord,
} from './schema'
import type { DebtorInfoV0 } from '../canonical-objects'
import type { DebtorData, BaseDebtorData } from '../../debtor-info'

import { Dexie } from 'dexie'
import equal from 'fast-deep-equal'
import { db, RecordDoesNotExist } from './schema'
import { UserDoesNotExist, isInstalledUser, getDocumentRecord } from './users'
import { abortTransfer } from './transfers'
import { parseDebtorInfoDocument, serializeDebtorData, InvalidDocument } from '../../debtor-info'

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
          // TODO: If `action.acknowledged` is `true`, if necessary,
          // create corresponding `ApproveDebtorNameAction`,
          // `ApproveAmountDisplayAction`, `ApprovePegAction` actions.
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

export async function verifyAccountKnowledge(accountUri: string, debtorData?: DebtorData): Promise<void> {
  await db.transaction('rw', [db.accounts, db.accountObjects, db.actions, db.documents], async () => {
    const hasAckAccountInfoAction = await db.actions
      .where({ accountUri })
      .filter(action => action.actionType === 'AckAccountInfo')
      .count() > 0
    if (!hasAckAccountInfoAction) {
      const account = await db.accounts.get(accountUri)
      if (account) {
        const display = await db.accountObjects.get(account.display.uri)
        if (display) {
          assert(display.type === 'AccountDisplay')
          if (display.debtorName !== undefined) {
            const info = await db.accountObjects.get(account.info.uri)
            const knowledge = await db.accountObjects.get(account.knowledge.uri)
            if (info && knowledge) {
              assert(info.type === 'AccountInfo')
              assert(knowledge.type === 'AccountKnowledge')
              await addAckAccountInfoActionIfThereAreChanges(info, knowledge, debtorData)
            }
          }
        }
      }
    }
  })
}

async function addAckAccountInfoActionIfThereAreChanges(
  info: AccountInfoRecord,
  knowledge: AccountKnowledgeRecord,
  newData?: DebtorData,
): Promise<void> {
  await db.transaction('rw', [db.actions, db.documents], async () => {
    assert(info.account.uri === knowledge.account.uri)
    let changes = {
      configError: info.configError !== knowledge.configError,
      interestRate: info.interestRate !== undefined && (info.interestRate !== (knowledge.interestRate ?? 0) || (
        info.interestRateChangedAt !== undefined &&
        info.interestRateChangedAt !== (knowledge.interestRateChangedAt ?? info.interestRateChangedAt)
      )),
      latestDebtorInfo: false,
      summary: false,
      debtorName: false,
      debtorHomepage: false,
      amountDivisor: false,
      decimalPlaces: false,
      unit: false,
      peg: false,
      otherChanges: false,
    }
    const knownData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
    newData = info.debtorInfo ? await tryToGetDebtorDataFromDebtorInfo(info.debtorInfo) : newData
    if (newData) {
      changes.latestDebtorInfo = newData.latestDebtorInfo.uri !== knownData.latestDebtorInfo.uri
      changes.summary = newData.summary !== knownData.summary
      changes.debtorName = newData.debtorName !== knownData.debtorName
      changes.debtorHomepage = newData.debtorHomepage?.uri !== knownData.debtorHomepage?.uri
      changes.amountDivisor = newData.amountDivisor !== knownData.amountDivisor
      changes.decimalPlaces = newData.decimalPlaces !== knownData.decimalPlaces
      changes.unit = newData.unit !== knownData.unit
      changes.peg = !equal(newData.peg, knownData.peg)
      changes.otherChanges = newData.willNotChangeUntil !== knownData.willNotChangeUntil
    }
    const thereAreChanges = (
      changes.configError || changes.interestRate ||
      changes.latestDebtorInfo || changes.summary || changes.debtorName ||
      changes.debtorHomepage || changes.amountDivisor || changes.decimalPlaces ||
      changes.unit || changes.peg || changes.otherChanges
    )
    if (thereAreChanges) {
      await db.actions.add({
        userId: info.userId,
        actionType: 'AckAccountInfo',
        createdAt: new Date(),
        knowledgeUpdateId: knowledge.latestUpdateId,
        debtorData: newData ?? knownData,
        interestRate: info.interestRate,
        interestRateChangedAt: info.interestRateChangedAt,
        configError: info.configError,
        acknowledged: false,
        accountUri: info.account.uri,
        changes,
      })
    }
  })
}

async function tryToGetDebtorDataFromDebtorInfo(debtorInfo: DebtorInfoV0): Promise<DebtorData | undefined> {
  let debtorData
  const document = await getDocumentRecord(debtorInfo.iri)
  if (
    document &&
    document.sha256 === (debtorInfo.sha256 ?? document.sha256) &&
    document.contentType === (debtorInfo.contentType ?? document.contentType)
  ) {
    try {
      debtorData = parseDebtorInfoDocument(document)
    } catch (e: unknown) {
      if (e instanceof InvalidDocument) { /* ignore */ }
      else throw e
    }
  }
  return debtorData
}

function getBaseDebtorDataFromAccoutKnowledge(knowledge: AccountKnowledgeRecord): BaseDebtorData {
  if (knowledge.debtorData) {
    try {
      // To ensure that the contained data is valid, we try to
      // serialize it. If an `InvalidDocument` error is thrown, we
      // return dummy data.
      serializeDebtorData({
        ...knowledge.debtorData,
        debtorIdentity: { type: 'DebtorIdentity' as const, uri: '' },
        revision: 0n,
      })
      return knowledge.debtorData
    } catch (e: unknown) {
      if (e instanceof InvalidDocument) { /* ignore */ }
      throw e
    }
  }
  // Generate a dummy data.
  return {
    latestDebtorInfo: { uri: '' },
    debtorName: 'unknown',
    amountDivisor: 1,
    decimalPlaces: 0n,
    unit: '\u00A4',
  }
}
