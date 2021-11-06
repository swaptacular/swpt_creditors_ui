import type { BaseDebtorData } from '../../debtor-info'
import type { CommittedTransferRecord, LedgerEntryRecord } from './schema'
import type { AccountV0 } from '../canonical-objects'
import type {
  AccountInfoRecord, AccountLedgerRecord, AccountExchangeRecord, AccountKnowledgeRecord,
  AccountConfigRecord, AccountDisplayRecord, AccountRecord, InterestRateInfo, AckDebtorInfoActionWithId,
  AckInterestRateActionWithId, AckConfigErrorActionWithId
} from './schema'
import { Dexie } from 'dexie'
import { db, RecordDoesNotExist } from './schema'

type PendingAck<T> = {
  before: T,
  after: T,
  actionId?: number,
}

type AccountFacts = {
  account: AccountRecord
  config: AccountConfigRecord
  display: AccountDisplayRecord
  knowledge: AccountKnowledgeRecord
  exchange: AccountExchangeRecord
  info: AccountInfoRecord
  ledger: AccountLedgerRecord
  ackConfigError?: PendingAck<string | undefined>
  ackInterestRate?: PendingAck<InterestRateInfo>
  ackDebtorData?: PendingAck<BaseDebtorData>
}

class AccountData {
  constructor(public facts: AccountFacts) { }
}

export async function getAccountData(accountUri: string): Promise<AccountData> {
  const account = await db.accounts.get(accountUri)
  if (!account) {
    throw new RecordDoesNotExist()
  }
  const config = await db.accountObjects.get(account.config.uri)
  const knowledge = await db.accountObjects.get(account.knowledge.uri)
  const display = await db.accountObjects.get(account.display.uri)
  const ledger = await db.accountObjects.get(account.ledger.uri)
  const exchange = await db.accountObjects.get(account.exchange.uri)
  const info = await db.accountObjects.get(account.info.uri)
  assert(config && config.type === 'AccountConfig' && config.account.uri === accountUri)
  assert(knowledge && knowledge.type === 'AccountKnowledge' && knowledge.account.uri === accountUri)
  assert(display && display.type === 'AccountDisplay' && display.account.uri === accountUri)
  assert(ledger && ledger.type === 'AccountLedger' && ledger.account.uri === accountUri)
  assert(exchange && exchange.type === 'AccountExchange' && exchange.account.uri === accountUri)
  assert(info && info.type === 'AccountInfo' && info.account.uri === accountUri)

  const actions = await db.actions.where({ 'account.uri': accountUri }).toArray()
  const actionsByType = new Map(actions.map(action => [action.actionType, action]))
  return new AccountData({
    account, config, info, knowledge, exchange, ledger, display,
    ackConfigError: actionsByType.get('AckConfigError') as AckConfigErrorActionWithId | undefined,
    ackInterestRate: actionsByType.get('AckInterestRate') as AckInterestRateActionWithId | undefined,
    ackDebtorData: actionsByType.get('AckDebtorInfo') as AckDebtorInfoActionWithId | undefined,
  })
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
  const tables = [db.accounts, db.accountObjects, db.ledgerEntries, db.committedTransfers]
  await db.transaction('rw', tables, async () => {
    await db.accounts.delete(accountUri)
    await db.committedTransfers.where({ 'account.uri': accountUri }).delete()
    const accountObjectUris = await db.accountObjects.where({ 'account.uri': accountUri }).primaryKeys()
    for (const accountObjectUri of accountObjectUris) {
      await deleteAccountObject(accountObjectUri)
    }
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
        if (accountObject.type === 'AccountLedger') {
          await db.ledgerEntries.where({ 'ledger.uri': accountObject.uri }).delete()
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
