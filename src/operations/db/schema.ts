import type { PaymentInfo } from '../../payment-requests'
import type { BaseDebtorData, ResourceReference, DocumentWithHash } from '../../debtor-info'
import type {
  LedgerEntryV0, TransferV0, CommittedTransferV0, PinInfoV0, CreditorV0, WalletV0, AccountV0,
  AccountLedgerV0, AccountInfoV0, AccountKnowledgeV0, AccountExchangeV0, AccountDisplayV0,
  AccountConfigV0, DebtorInfoV0, TransferCreationRequestV0, WebApiError, ObjectReference,
  AccountIdentity
} from '../canonical-objects'

import { Dexie } from 'dexie'

export class RecordDoesNotExist extends Error {
  name = 'RecordDoesNotExist'
}

export type ListQueryOptions = {
  before?: number,
  after?: number,
  limit?: number,
  latestFirst?: boolean,
}

type UserReference = {
  userId: number,
}

type ActionData =
  & UserReference
  & {
    actionId?: number,
    actionType: string,
    createdAt: Date,
  }

export type WalletRecord =
  & Partial<UserReference>
  & Omit<WalletV0, 'requirePin' | 'log' | 'logLatestEntryId'>
  & {
    logStream: {
      latestEntryId: bigint,
      forthcoming: string,
      loadedTransfers: boolean,
      syncedAt?: Date,
      isBroken: boolean,
    },
  }

export type WalletRecordWithId =
  & WalletRecord
  & UserReference

export type AccountRecord =
  & UserReference
  & Omit<AccountV0, 'knowledge' | 'info' | 'exchange' | 'config' | 'ledger' | 'display'>
  & {
    knowledge: ObjectReference,
    info: ObjectReference,
    exchange: ObjectReference,
    config: ObjectReference,
    ledger: ObjectReference,
    display: ObjectReference,
  }

export type BaseObjectRecord =
  & ResourceReference
  & UserReference
  & { type: string }

export type WalletObjectRecord =
  | PinInfoRecord
  | CreditorRecord

export type PinInfoRecord =
  & PinInfoV0
  & BaseObjectRecord

export type CreditorRecord =
  & CreditorV0
  & BaseObjectRecord

export type AccountObjectRecord =
  | AccountConfigRecord
  | AccountDisplayRecord
  | AccountExchangeRecord
  | AccountKnowledgeRecord
  | AccountInfoRecord
  | AccountLedgerRecord

export type AccountConfigRecord =
  & AccountConfigV0
  & BaseObjectRecord

export type AccountDisplayRecord =
  & AccountDisplayV0
  & BaseObjectRecord

export type AccountExchangeRecord =
  & AccountExchangeV0
  & BaseObjectRecord

export type AccountKnowledgeRecord =
  & AccountKnowledgeV0
  & BaseObjectRecord

export type AccountInfoRecord =
  & AccountInfoV0
  & BaseObjectRecord

export type AccountLedgerRecord =
  & AccountLedgerV0
  & BaseObjectRecord

export type CommittedTransferRecord =
  & CommittedTransferV0
  & BaseObjectRecord

export type TransferRecord =
  & UserReference
  & TransferV0
  & {
    time: number,
    paymentInfo: PaymentInfo,
    aborted: boolean,
    originatesHere: boolean,
  }

export type LedgerEntryRecord =
  & UserReference
  & LedgerEntryV0
  & { id?: number }  // an autoincremented ID

export type DocumentRecord =
  & ResourceReference
  & DocumentWithHash

export type ActionRecord =
  | CreateTransferAction
  | AbortTransferAction
  | CreateAccountAction
  | AckAccountInfoAction

export type ActionRecordWithId =
  & ActionRecord
  & { actionId: number }

export type ExecutionState = {
  startedAt: Date,
  unresolvedRequestAt?: Date,
  result?: { ok: true, transferUri: string } | { ok: false } & WebApiError,
}

export type CreateTransferAction =
  & ActionData
  & {
    actionType: 'CreateTransfer',
    creationRequest: TransferCreationRequestV0,
    paymentInfo: PaymentInfo,
    requestedAmount: bigint,
    requestedDeadline?: Date,
    execution?: ExecutionState,
  }

export type CreateTransferActionWithId =
  & ActionRecordWithId
  & CreateTransferAction

export type AbortTransferAction =
  & ActionData
  & {
    actionType: 'AbortTransfer',
    transferUri: string,
    transfer: TransferRecord,
  }

export type AbortTransferActionWithId =
  & ActionRecordWithId
  & AbortTransferAction

export type EssentialAccountInfo = {
  debtorData?: BaseDebtorData,
  debtorInfo?: DebtorInfoV0,
  interestRate?: number,
  interestRateChangedAt?: string,
  identity?: AccountIdentity,
  noteMaxBytes?: bigint,
  configError?: string,
}

export type AckAccountInfoAction =
  & ActionData
  & {
    actionType: 'AckAccountFacts',
    accountUri: string,
    before: EssentialAccountInfo,
    after: EssentialAccountInfo,
  }

export type AckAccountFactsActionWithId =
  & ActionRecordWithId
  & AckAccountInfoAction

export type CreateAccountAction =
  & ActionData
  & {
    actionType: 'CreateAccount',
    documentUri: string,
    accountUri: string,
    debtorName?: string,
  }

export type CreateAccountActionWithId =
  & ActionRecordWithId
  & CreateAccountAction

type TaskData =
  & UserReference
  & {
    taskId?: number,
    taskType: string,
    scheduledFor: Date,
  }

export type TaskRecord =
  | DeleteTransferTask
  | FetchDebtorInfoTask

export type TaskRecordWithId =
  & TaskRecord
  & { taskId: number }

export type DeleteTransferTask =
  & TaskData
  & {
    taskType: 'DeleteTransfer',
    transferUri: string,
  }

export type FetchDebtorInfoTask =
  & TaskData
  & {
    taskType: 'FetchDebtorInfo',
    iri: string,
    accountUri: string,
    accountObjectUri: string,
    backoffSeconds: number,
  }

export type DeleteTransferTaskWithId =
  & TaskRecordWithId
  & DeleteTransferTask

class CreditorsDb extends Dexie {
  wallets: Dexie.Table<WalletRecord, number>
  walletObjects: Dexie.Table<WalletObjectRecord, string>
  accounts: Dexie.Table<AccountRecord, string>
  accountObjects: Dexie.Table<AccountObjectRecord, string>
  committedTransfers: Dexie.Table<CommittedTransferRecord, string>
  transfers: Dexie.Table<TransferRecord, string>
  ledgerEntries: Dexie.Table<LedgerEntryRecord, number>
  documents: Dexie.Table<DocumentRecord, string>
  actions: Dexie.Table<ActionRecord, number>
  tasks: Dexie.Table<TaskRecord, number>

  constructor() {
    super('creditors')

    this.version(1).stores({
      wallets: '++userId,&uri',
      walletObjects: 'uri,userId',
      accounts: 'uri,userId',
      accountObjects: 'uri,userId,account.uri',

      // Committed transfers are objects that belong to a specific
      // account, but we will have lots of them, and in order to keep
      // the `accountObjects` table lean, committed transfers are
      // separated in their own table.
      committedTransfers: 'uri,userId,account.uri',

      // Here '[userId+time],&uri' / '[ledger.uri+entryId],userId'
      // would probably be a bit more efficient, because the records
      // would be ordered physically in the same way as they are
      // normally queried. The problem is that it seems
      // "fake-indexeddb", which we use for testing, does not support
      // compound primary keys.
      transfers: 'uri,&[userId+time]',
      ledgerEntries: '++id,&[ledger.uri+entryId],userId',

      // Contains debtor info documents. They are shared by all users.
      documents: 'uri',

      actions: '++actionId,[userId+createdAt],creationRequest.transferUuid,transferUri,accountUri',
      tasks: '++taskId,[userId+scheduledFor],transferUri,accountUri',
    })

    this.wallets = this.table('wallets')
    this.walletObjects = this.table('walletObjects')
    this.accounts = this.table('accounts')
    this.accountObjects = this.table('accountObjects')
    this.committedTransfers = this.table('committedTransfers')
    this.transfers = this.table('transfers')
    this.ledgerEntries = this.table('ledgerEntries')
    this.documents = this.table('documents')
    this.actions = this.table('actions')
    this.tasks = this.table('tasks')
  }

  get allTables() {
    return [
      this.wallets,
      this.walletObjects,
      this.accounts,
      this.accountObjects,
      this.committedTransfers,
      this.transfers,
      this.ledgerEntries,
      this.documents,
      this.actions,
      this.tasks,
    ]
  }
}

export const db = new CreditorsDb()
