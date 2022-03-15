import type { CommittedTransferRecord, LedgerEntryRecord, AccountSortPriority } from './schema'
import type { AccountV0 } from '../canonical-objects'
import type {
  AccountInfoRecord, AccountLedgerRecord, AccountExchangeRecord, AccountKnowledgeRecord,
  AccountConfigRecord, AccountDisplayRecord, AccountRecord, AccountObjectRecord
} from './schema'

import { Dexie } from 'dexie'
import { db } from './schema'
import { verifyAccountKnowledge } from './common'
import { removeActionRecord } from './actions'

export async function storeCommittedTransferRecord(record: CommittedTransferRecord): Promise<void> {
  await db.transaction('rw', [db.accounts, db.committedTransfers], async () => {
    const accountQuery = db.accounts.where({ uri: record.account.uri })
    const hasAccount = await accountQuery.count() > 0
    if (hasAccount) {
      await db.committedTransfers.put(record)
    } else {
      console.log(
        `An attempt to store an orphaned committed transfer record has been ignored. Committed ` +
        `transfers will be stored only if a corresponding account record exists.`
      )
    }
  })
}

export async function getAccountRecord(accountUri: string): Promise<AccountRecord | undefined> {
  return await db.accounts.get(accountUri)
}

export async function getAccountObjectRecord(objectUri: string): Promise<AccountObjectRecord | undefined> {
  return await db.accountObjects.get(objectUri)
}

export async function deleteAccount(accountUri: string): Promise<void> {
  const tables = [db.accounts, db.accountObjects, db.ledgerEntries, db.committedTransfers, db.actions, db.tasks]
  await db.transaction('rw', tables, async () => {
    await db.accounts.delete(accountUri)
    await db.committedTransfers.where({ 'account.uri': accountUri }).delete()
    const accountObjectUris = await db.accountObjects.where({ 'account.uri': accountUri }).primaryKeys()
    for (const accountObjectUri of accountObjectUris) {
      await deleteAccountObject(accountObjectUri)
    }
    await db.actions.where({ accountUri }).delete()
    await db.tasks.where({ accountUri }).delete()
  })
}

export async function deleteAccountObject(accountObjectUri: string): Promise<void> {
  await db.transaction('rw', [db.accounts, db.accountObjects, db.ledgerEntries], async () => {
    const accountObject = await db.accountObjects.get(accountObjectUri)
    if (accountObject) {
      const accountQuery = db.accounts.where({ uri: accountObject.account.uri })
      const hasAccount = await accountQuery.count() > 0
      if (hasAccount) {
        console.log(
          `An attempt to delete an account sub-object has been ignored. Account sub-objects ` +
          `will be deleted when the corresponding account gets deleted. This guarantees ` +
          `that all sub-objects always exist for every account.`
        )
      } else {
        await db.accountObjects.delete(accountObjectUri)
        switch (accountObject.type) {
          case 'AccountLedger':
            await db.ledgerEntries.where({ 'ledger.uri': accountObject.uri }).delete()
            break
        }
      }
    }
  })
}

export async function storeLedgerEntryRecord(record: LedgerEntryRecord): Promise<void> {
  try {
    await db.ledgerEntries.put(record)
  } catch (e: unknown) {
    if (e instanceof Dexie.ConstraintError) { /* already stored*/ }
    else throw e
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

export async function storeAccountKnowledgeRecord(record: AccountKnowledgeRecord): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    await db.accountObjects.put(record)
    const accountUri = record.account.uri
    const ackAccountInfoActions = await db.actions
      .where({ accountUri })
      .filter(action => action.actionType === 'AckAccountInfo')
      .toArray()
    if (ackAccountInfoActions.length === 0) {
      await verifyAccountKnowledge(accountUri)
    } else {
      const action = ackAccountInfoActions[0]
      assert(ackAccountInfoActions.length === 1)
      assert(action.actionType === 'AckAccountInfo')
      assert(action.actionId !== undefined)
      await removeActionRecord(action.actionId)  // This also calls verifyAccountKnowledge() internally.
    }
  })
}

export async function storeAccountInfoRecord(record: AccountInfoRecord): Promise<void> {
  await db.transaction('rw', [db.accounts, db.accountObjects, db.actions, db.documents, db.tasks], async () => {
    const newIri = record.debtorInfo?.iri
    const accountUri = record.account.uri
    const existingRecord = await db.accountObjects.get(record.uri) as AccountInfoRecord | undefined
    if (!(existingRecord && existingRecord.debtorInfo?.iri === newIri)) {
      if (newIri === undefined) {
        await db.tasks
          .where({ accountUri })
          .filter(task => task.taskType === 'FetchDebtorInfo' && task.forAccountInfo)
          .delete()
      } else {
        await db.tasks
          .where({ accountUri })
          .filter(task => task.taskType === 'FetchDebtorInfo')
          .delete()
        await db.tasks.add({
          taskType: 'FetchDebtorInfo',
          userId: record.userId,
          iri: newIri,
          scheduledFor: new Date(),
          backoffSeconds: 0,
          forAccountInfo: true,
          accountUri,
        })
      }
    }
    await db.accountObjects.put(record)
    await verifyAccountKnowledge(accountUri)
  })
}

export async function getAccountSortPriorities(userId: number): Promise<AccountSortPriority[]> {
  return await db.accountPriorities.where({ userId }).toArray()
}

export async function setAccountSortPriority(userId: number, uri: string, priority: number): Promise<void> {
  await db.accountPriorities.put({ userId, uri, priority })
}
