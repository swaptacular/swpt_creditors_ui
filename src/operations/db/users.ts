import type { WalletRecordWithId, DocumentRecord, AccountKnowledgeRecord, AccountInfoRecord } from './schema'
import type { DebtorInfoV0, AccountKnowledgeV0 } from '../canonical-objects'
import type { DebtorData, BaseDebtorData } from '../../debtor-info'

import equal from 'fast-deep-equal'
import { db } from './schema'
import {
  tryToParseDebtorInfoDocument, serializeDebtorData, sanitizeBaseDebtorData, InvalidDocument
} from '../../debtor-info'

export class UserDoesNotExist extends Error {
  name = 'UserDoesNotExist'
}

export async function clearAllTables(): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) {
      await table.clear()
    }
  })
}

export async function isInstalledUser(userId: number): Promise<boolean> {
  return await db.wallets.where({ userId }).count() === 1
}

export async function uninstallUser(userId: number): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) {
      if (table !== db.documents) {
        await table.where({ userId }).delete()
      }
    }
  })
}

export async function getUserId(walletUri: string): Promise<number | undefined> {
  return (await db.wallets.where({ uri: walletUri }).primaryKeys())[0]
}

export async function getWalletRecord(userId: number): Promise<WalletRecordWithId> {
  const walletRecord = await db.wallets.get(userId)
  if (!walletRecord) {
    throw new UserDoesNotExist()
  }
  return walletRecord as WalletRecordWithId
}

export async function updateWalletRecord(walletRecord: WalletRecordWithId): Promise<void> {
  const updated = await db.wallets
    .where({ userId: walletRecord.userId })
    .modify(function(this: any) {
      this.value = walletRecord
    })
  if (updated === 0) {
    throw new UserDoesNotExist()
  }
  assert(updated === 1)
}

export async function getDocumentRecord(uri: string): Promise<DocumentRecord | undefined> {
  return await db.documents.get(uri)
}

export async function putDocumentRecord(document: DocumentRecord): Promise<boolean> {
  return await db.transaction('rw', [db.documents], async () => {
    let success = true
    const existingDocument = await db.documents.get(document.uri)
    if (!existingDocument) {
      await db.documents.put(document)
    } else if (existingDocument.sha256 !== document.sha256 || existingDocument.contentType !== document.contentType) {
      success = false
      console.warn(`The supposedly immutable debtor info document at ${document.uri} has changed.`)
    }
    return success
  })
}

export function getBaseDebtorDataFromAccoutKnowledge(knowledge: AccountKnowledgeV0): BaseDebtorData {
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
      return sanitizeBaseDebtorData(knowledge.debtorData)
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
        debtorData: sanitizeBaseDebtorData(newData ?? knownData),
        interestRate: info.interestRate,
        interestRateChangedAt: info.interestRateChangedAt,
        configError: info.configError,
        hasPreviousPeg: knownData.peg !== undefined,
        acknowledged: false,
        accountUri: info.account.uri,
        changes,
      })
    }
  })
}

async function tryToGetDebtorDataFromDebtorInfo(debtorInfo: DebtorInfoV0): Promise<DebtorData | undefined> {
  const document = await getDocumentRecord(debtorInfo.iri)
  if (
    document &&
    document.sha256 === (debtorInfo.sha256 ?? document.sha256) &&
    document.contentType === (debtorInfo.contentType ?? document.contentType)
  ) {
    return tryToParseDebtorInfoDocument(document)
  }
  return undefined
}
