import type { CommittedTransferRecord, LedgerEntryRecord } from './schema'
import type { AccountV0 } from '../canonical-objects'
import type {
  AccountInfoRecord, AccountLedgerRecord, AccountExchangeRecord, AccountKnowledgeRecord,
  AccountConfigRecord, AccountDisplayRecord, AccountRecord, EssentialAccountFacts,
  AccountObjectRecord, DocumentRecord
} from './schema'
import { Dexie } from 'dexie'
import { db, RecordDoesNotExist  } from './schema'

type PendingAck = { before: EssentialAccountFacts, after: EssentialAccountFacts }

/* This channel is used to publish all changes to account and account
 * sub-object records. The message contains an [objectUri, objectType,
 * objectRecord] tuple.
 */
export const accountsChannel = new BroadcastChannel('creditors.accounts')

export type AccountMessageObjectType = AccountRecord['type'] | AccountObjectRecord['type'] | 'Document'

export type AccountMessageObject = AccountRecord | AccountObjectRecord | DocumentRecord

export function postAccountMessage(
  objectUri: string,
  objectType: AccountMessageObjectType,
  record: AccountMessageObject | null,
): void {
  accountsChannel.postMessage([objectUri, objectType, record])
}

export class AccountsMap {
  private objects: Map<string, AccountMessageObject> = new Map()
  private accounts: Map<string, string> = new Map()

  async init(userId: number): Promise<void> {
    const accountRecords = await db.accounts.where({ userId }).toArray()
    for (const obj of accountRecords) {
      this.objects.set(obj.uri, obj)
      this.accounts.set(obj.debtor.uri, obj.uri)
    }
    const accountObjectRecords = await db.accountObjects.where({ userId }).toArray()
    for (const obj of accountObjectRecords) {
      this.objects.set(obj.uri, obj)
      if ((obj.type === 'AccountKnowledge' || obj.type === 'AccountInfo') && obj.debtorInfo) {
        await this.loadDocument(obj.debtorInfo.iri)
      }
    }
  }

  private async loadDocument(documentUri: string): Promise<void> {
    const document = await db.documents.get(documentUri)
    if (document) {
      this.objects.set(documentUri, document)
    }
  }
}

// TODO: Is this what we need?
export class AccountFacts {
  account!: AccountRecord
  config!: AccountConfigRecord
  display!: AccountDisplayRecord
  knowledge!: AccountKnowledgeRecord
  exchange!: AccountExchangeRecord
  info!: AccountInfoRecord
  ledger!: AccountLedgerRecord
  pendingAck?: PendingAck
  hasAckAction!: boolean

  static async fromUri(accountUri: string): Promise<AccountFacts> {
    async function getAccountObject<T extends AccountObjectRecord>(
      objUri: string,
      objType: AccountObjectRecord['type'],
    ): Promise<T> {
      const obj = await db.accountObjects.get(objUri)
      assert(obj && obj.type === objType && obj.account.uri === objUri)
      return obj as T
    }

    return await db.transaction('rw', [db.accounts, db.accountObjects, db.actions], async () => {
      const account = await db.accounts.get(accountUri)
      if (!account) {
        throw new RecordDoesNotExist()
      }
      let facts = new AccountFacts()
      facts.account = account
      facts.config = await getAccountObject(account.config.uri, 'AccountConfig')
      facts.display = await getAccountObject(account.display.uri, 'AccountDisplay')
      facts.knowledge = await getAccountObject(account.knowledge.uri, 'AccountKnowledge')
      facts.exchange = await getAccountObject(account.exchange.uri, 'AccountExchange')
      facts.info = await getAccountObject(account.info.uri, 'AccountInfo')
      facts.ledger = await getAccountObject(account.ledger.uri, 'AccountLedger')
      const ackActionsCount = await db.actions
        .where({ accountUri })
        .filter(action => action.actionType === 'AckAccountFacts')
        .count()
      assert(ackActionsCount === 0 || ackActionsCount === 1)
      facts.hasAckAction = ackActionsCount === 1
      return facts
    })
  }
}

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

export function storeAccountKnowledgeRecord(record: AccountKnowledgeRecord): Promise<void> {
  return storeKnowledgeOrInfoRecord(record)
}
export function storeAccountInfoRecord(record: AccountInfoRecord): Promise<void> {
  return storeKnowledgeOrInfoRecord(record)
}

async function storeKnowledgeOrInfoRecord(record: AccountKnowledgeRecord | AccountInfoRecord): Promise<void> {
  await db.transaction('rw', [db.accountObjects, db.tasks], async () => {
    let newIri = record.debtorInfo?.iri
    const accountUri = record.account.uri
    const accountObjectUri = record.uri
    const existingRecord = await db.accountObjects.get(accountObjectUri)
    if (existingRecord) {
      assert(existingRecord.type === record.type)
      assert(existingRecord.userId === record.userId)
      assert(existingRecord.account.uri === accountUri)
      if (newIri === existingRecord.debtorInfo?.iri) {
        newIri = undefined  // The IRI has not changed.
      } else {
        await db.tasks
          .where({ accountUri })
          .filter(task => task.taskType === 'FetchDebtorInfo' && task.accountObjectUri === accountObjectUri)
          .delete()
      }
    }
    if (newIri !== undefined) {
      await db.tasks.add({
        taskType: 'FetchDebtorInfo',
        userId: record.userId,
        iri: newIri,
        scheduledFor: new Date(),
        backoffSeconds: 0,
        accountUri,
        accountObjectUri,
      })
    }
    await db.accountObjects.put(record)
  })
}
