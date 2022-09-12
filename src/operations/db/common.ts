import type {
  WalletRecordWithId, DocumentRecord, AccountKnowledgeRecord, AccountInfoRecord, AccountRecord,
  AccountObjectRecord
} from './schema'
import type { DebtorInfoV0, AccountKnowledgeV0 } from '../canonical-objects'
import type { DebtorData, BaseDebtorData } from '../../debtor-info'

import { db } from './schema'
import {
  tryToParseDebtorInfoDocument, serializeDebtorData, sanitizeBaseDebtorData, parseDebtorInfoDocument,
  InvalidDocument
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

export async function getDefaultPayeeName(userId: number): Promise<string> {
  const defaultPayeeName = await db.defaultPayeeNames.get(userId)
  return defaultPayeeName?.payeeName ?? ''
}

export async function setDefaultPayeeName(userId: number, payeeName: string): Promise<void> {
  await db.defaultPayeeNames.put({ userId, payeeName })
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

export function getBaseDebtorDataFromAccoutKnowledge(knowledge: AccountKnowledgeV0, sanitize = true): BaseDebtorData {
  if (typeof knowledge.debtorData === 'object' && knowledge.debtorData !== null) {
    // To validate the debtor data obtained from the account knowledge
    // object, we try to serialize it to a debtor info document
    // (adding some dummy required values), an then we parse it back
    // to debtor data, which we know will be in a canonical form.
    let document
    try {
      document = serializeDebtorData({
        ...knowledge.debtorData,
        debtorIdentity: { type: 'DebtorIdentity' as const, uri: '' },
        revision: 0n,
      })
    } catch (e: unknown) {
      if (e instanceof InvalidDocument) { console.warn(e) }
      else throw e
    }
    if (document) {
      const debtorData = sanitizeBaseDebtorData(parseDebtorInfoDocument(document))
      return sanitize ? debtorData : { ...knowledge.debtorData, ...debtorData }
    }
  }
  // Generate a dummy data.
  return {
    latestDebtorInfo: { uri: '' },
    debtorName: 'unknown',
    debtorHomepage: undefined,
    summary: undefined,
    amountDivisor: 1,
    decimalPlaces: 0n,
    unit: '\u00A4',
    peg: undefined,
    willNotChangeUntil: undefined,
  }
}

/* For the configured account `accountUri`, compares the information
 * contained in `account.knowledge` and the `account.info`. If it
 * differs, creates an `AckAccountInfo` action. Does nothing if an
 * `AckAccountInfo` action for the account already exists, or the
 * account is not configured yet. Returns the action ID of the created
 * `AckAccountInfo` action, or `undefined` if action has not been
 * created.
 *
 * If `account.info.debtorInfo` is undefined (that is: a disconnected
 * currency), and `debtorData` is passed, it will be used instead for
 * the comparison. This is used to decect changes in disconnected
 * currencies.
 */
export async function verifyAccountKnowledge(
  accountUri: string,
  debtorData?: DebtorData,
  override: boolean = false
): Promise<number | undefined> {
  return await db.transaction('rw', [db.accounts, db.accountObjects, db.actions, db.documents], async () => {
    const ackAccountInfoActionQuery = db.actions
      .where({ accountUri })
      .filter(action => action.actionType === 'AckAccountInfo')
    if (override) {
      await ackAccountInfoActionQuery.delete()
    }
    if (await ackAccountInfoActionQuery.count() === 0) {
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
              return await addAckAccountInfoActionIfThereAreChanges(account, info, knowledge, debtorData)
            }
          }
        }
      }
    }
    return undefined
  })
}

async function addAckAccountInfoActionIfThereAreChanges(
  account: AccountRecord,
  info: AccountInfoRecord,
  knowledge: AccountKnowledgeRecord,
  newData?: DebtorData,
): Promise<number | undefined> {
  return await db.transaction('rw', [db.actions, db.documents], async () => {
    assert(info.account.uri === knowledge.account.uri)
    assert(info.interestRate !== undefined)
    assert(info.interestRateChangedAt !== undefined)
    let changes = {
      configError: info.configError !== knowledge.configError,
      interestRate: (
        info.interestRate !== (knowledge.interestRate ?? 0) ||
        info.interestRateChangedAt !== (knowledge.interestRateChangedAt ?? info.interestRateChangedAt)
      ),
      latestDebtorInfo: false,
      summary: false,
      debtorName: false,
      debtorHomepage: false,
      amountDivisor: false,
      decimalPlaces: false,
      unit: false,
      pegParams: false,
      pegDebtorInfoUri: false,
      otherChanges: false,
    }
    const knownData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
    const previousPeg = knownData.peg
    if (info.debtorInfo) {
      newData = await tryToGetDebtorDataFromDebtorInfo(info.debtorInfo, account.debtor.uri)
    } else {
      // Ensure `newData.debtorIdentity` is correct.
      newData = newData && newData.debtorIdentity.uri === account.debtor.uri ? newData : undefined
    }
    if (newData) {
      const newPeg = newData.peg
      changes.pegParams = !(
        newPeg?.debtorIdentity.uri === previousPeg?.debtorIdentity.uri &&
        newPeg?.exchangeRate === previousPeg?.exchangeRate &&
        newPeg?.display.amountDivisor === previousPeg?.display.amountDivisor &&
        newPeg?.display.decimalPlaces === previousPeg?.display.decimalPlaces &&
        newPeg?.display.unit === previousPeg?.display.unit
      )
      changes.pegDebtorInfoUri = !(
        newPeg?.latestDebtorInfo.uri === previousPeg?.latestDebtorInfo.uri
      )
      changes.latestDebtorInfo = newData.latestDebtorInfo.uri !== knownData.latestDebtorInfo.uri
      changes.summary = newData.summary !== knownData.summary
      changes.debtorName = newData.debtorName !== knownData.debtorName
      changes.debtorHomepage = newData.debtorHomepage?.uri !== knownData.debtorHomepage?.uri
      changes.amountDivisor = newData.amountDivisor !== knownData.amountDivisor
      changes.decimalPlaces = newData.decimalPlaces !== knownData.decimalPlaces
      changes.unit = newData.unit !== knownData.unit
      changes.otherChanges = newData.willNotChangeUntil !== knownData.willNotChangeUntil
    }
    const thereAreChanges = (
      changes.configError || changes.interestRate ||
      changes.latestDebtorInfo || changes.summary || changes.debtorName ||
      changes.debtorHomepage || changes.amountDivisor || changes.decimalPlaces ||
      changes.unit || changes.pegParams || changes.pegDebtorInfoUri || changes.otherChanges
    )
    if (thereAreChanges) {
      return await db.actions.add({
        userId: info.userId,
        actionType: 'AckAccountInfo',
        createdAt: new Date(),
        knowledgeUpdateId: knowledge.latestUpdateId,
        debtorData: newData ? sanitizeBaseDebtorData(newData) : knownData,
        interestRate: info.interestRate,
        interestRateChangedAt: info.interestRateChangedAt,
        configError: info.configError,
        acknowledged: false,
        accountUri: info.account.uri,
        previousPeg,
        changes,
      })
    }
    await db.documents.get('')  // This ensures that the transaction is kept alive.
    return undefined
  })
}

async function tryToGetDebtorDataFromDebtorInfo(
  debtorInfo: DebtorInfoV0,
  debtorIdentityUri: string,
): Promise<DebtorData | undefined> {
  let url: URL
  try {
    url = new URL(debtorInfo.iri)
  } catch {
    return undefined
  }
  const document = await getDocumentRecord(url.href)
  if (
    document &&
    document.sha256 === (debtorInfo.sha256 ?? document.sha256) &&
    document.contentType === (debtorInfo.contentType ?? document.contentType)
  ) {
    const debtorData = tryToParseDebtorInfoDocument(document)
    if (debtorData && debtorData.debtorIdentity.uri === debtorIdentityUri) {
      return debtorData
    }
  }
  return undefined
}

export async function getAccountRecord(accountUri: string): Promise<AccountRecord | undefined> {
  return await db.accounts.get(accountUri)
}

export async function getAccountObjectRecord(objectUri: string): Promise<AccountObjectRecord | undefined> {
  return await db.accountObjects.get(objectUri)
}

export async function getAccountRecordByDebtorUri(
  userId: number,
  debtorUri: string,
): Promise<AccountRecord | undefined> {
  return await db.accounts.where({ userId, 'debtor.uri': debtorUri }).first()
}

export function getDebtorIdentityFromAccountIdentity(uri: string): string | undefined {
  const parts = uri.split('/')
  if (uri.startsWith('swpt:') && parts.length === 2) {
    return parts[0]
  }
  return undefined
}
