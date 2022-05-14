import type { PaymentInfo } from '../../payment-requests'
import type { BaseDebtorData, ResourceReference, DocumentWithHash, Peg } from '../../debtor-info'
import type {
  LedgerEntryV0, TransferV0, CommittedTransferV0, PinInfoV0, CreditorV0, WalletV0, AccountV0,
  AccountLedgerV0, AccountInfoV0, AccountKnowledgeV0, AccountExchangeV0, AccountDisplayV0,
  AccountConfigV0, WebApiError, ObjectReference
} from '../canonical-objects'

import { Dexie } from 'dexie'

export class RecordDoesNotExist extends Error {
  name = 'RecordDoesNotExist'
}

export class InvalidActionState extends Error {
  name = 'InvalidActionState'
}

export type ListQueryOptions = {
  before?: number,
  after?: number,
  limit?: number,
  latestFirst?: boolean,
}

export type LedgerEntriesQueryOptions = {
  before?: bigint,
  after?: bigint,
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
  & {
    id?: number, // an autoincremented ID
    entryIdString: string, // the `entryId` field as a string (to avoid using bigint IndexedDB keys).
  }

export type DocumentRecord =
  & ResourceReference
  & DocumentWithHash

export type AccountSortPriority =
  & ResourceReference
  & UserReference
  & { priority: number }

export type DefaultPayeeName =
  & UserReference
  & { payeeName: string }

export type ExpectedPayment =
  & UserReference
  & {
    accountUri: string,
    payeeReference: string,
    receivedAmount: bigint,
  }

export type ActionRecord =
  | CreateTransferAction
  | AbortTransferAction
  | CreateAccountAction
  | ApprovePegAction
  | ApproveAmountDisplayAction
  | ApproveDebtorNameAction
  | AckAccountInfoAction
  | ConfigAccountAction
  | UpdatePolicyAction
  | PaymentRequestAction

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
    accountUri: string,
    transferUuid: string,
    recipientUri: string,
    paymentInfo: PaymentInfo,
    noteFormat: string,
    note: string
    requestedAmount: bigint,
    requestedDeadline?: Date,
    editedAmount: bigint
    editedDeadline?: Date,
    execution?: ExecutionState,
  }

export type CreateTransferActionWithId =
  & ActionRecordWithId
  & CreateTransferAction

export type AccountCreationState = {
  accountUri: string,
  accountInitializationInProgress: boolean,
  debtorData: BaseDebtorData,
  debtorDataSource: DebtorDataSource,
  hasDebtorInfo: boolean,
  confirmed: boolean,
  editedDebtorName: string,
  editedNegligibleAmount: number,
  tinyNegligibleAmount: number,
}

export type AbortTransferAction =
  & ActionData
  & {
    actionType: 'AbortTransfer',
    transferUri: string,
    transfer: TransferRecord,
    accountUri?: string,
  }

export type AbortTransferActionWithId =
  & ActionRecordWithId
  & AbortTransferAction

export type DebtorDataSource = 'info' | 'knowledge' | 'uri'

// NOTE: Here is how this action works (roughly):
//
// * Make a "get account" HTTP request for the account
//   (accountUri). This ensures that we have got the most recent
//   version of the account.
//
// * Ensure that the account (accountUri) exists, and
//   `account.AccountDisplay.debtorName` is not undefined.
//
// * Ensure that `knowledgeUpdateId ===
//   account.AccountKnowledge.latestUpdateId`.
//
// * Show the "acknowledge account changes screen", and wait for the
//   user to acknowledge.
//
// * If the pegs described in
//   `account.AccountKnowledge.debtorData.peg`, and the
//   `debtorData.peg` field *actually* differ (Note that peg's
//   latestDebtorInfo.uri field can change without actually changing
//   the peg.), and the old peg is set in the
//   `account.AccountExchange` record, remove it.
//
// * Set `acknowledged` to true (and commit).
//
// * Write the `info` settings to `account.AccountKnowledge`.
//
// Important notes:
//
// * Changes in the fields `noteMaxBytes`, `identity`,
//   `debtorData.debtorIdentity`, and `debtorData.revision` should be
//   ignored, because they are either unimportant or never shown to
//   the user.
//
// * AckAccountInfoAction records must never be created for accounts
//   that does not have a `debtorName` set.
//
// * No more that one AckAccountInfoAction per account should exist at
//   a given time.
//
// * A new AckAccountInfoAction record should be created when it is
//   known that one or more of the important (tracked) fields has been
//   updated, and currently there are no `AckAccountInfoAction` for
//   the given account. (Therefore, when an AckAccountInfoAction gets
//   deleted, the `AccountKnowledge` and `AccountInfo` records should
//   be checked, and if there has been a change -- another
//   AckAccountInfoAction created.)
//
// * If there is a change (any change) in the account's
//   `AccountKnowledge` record, and an AckAccountInfoAction record for
//   the account exists, it should be deleted. And if the
//   AckAccountInfoAction action has its `acknowledged` field set to
//   true, if necessary, corresponding `ApproveDebtorNameAction`,
//   `ApproveAmountDisplayAction`, `ApprovePegAction` actions must be
//   created.
export type AckAccountInfoAction =
  & ActionData
  & {
    actionType: 'AckAccountInfo',
    accountUri: string,
    knowledgeUpdateId: bigint,
    interestRate: number,
    interestRateChangedAt: string,
    debtorData: BaseDebtorData,
    configError?: string,
    acknowledged: boolean,
    previousPeg?: Peg,
    changes: {
      configError: boolean,
      interestRate: boolean,
      latestDebtorInfo: boolean,
      debtorName: boolean,
      debtorHomepage: boolean,
      summary: boolean,
      amountDivisor: boolean,
      decimalPlaces: boolean,
      unit: boolean,
      pegParams: boolean,
      pegDebtorInfoUri: boolean,
      otherChanges: boolean,
    },
  }

export type AckAccountInfoActionWithId =
  & ActionRecordWithId
  & AckAccountInfoAction

export type CreateAccountAction =
  & ActionData
  & {
    actionType: 'CreateAccount',
    debtorIdentityUri: string,
    latestDebtorInfoUri: string,
    accountCreationState?: AccountCreationState,
  }

export type CreateAccountActionWithId =
  & ActionRecordWithId
  & CreateAccountAction

export type ApprovePegAction =
  & ActionData
  & {
    actionType: 'ApprovePeg',
    accountUri: string,
    peg: Peg,
    onlyTheCoinHasChanged: boolean,
    ignoreCoinMismatch: boolean,
    alreadyHasApproval: boolean | undefined,
    editedApproval?: boolean,
    editedReplaceCoin?: boolean,
    accountCreationState?: AccountCreationState,
  }

export type ApprovePegActionWithId =
  & ActionRecordWithId
  & ApprovePegAction

export type ApproveAmountDisplayAction =
  & ActionData
  & {
    actionType: 'ApproveAmountDisplay',
    accountUri: string,
    amountDivisor: number,
    decimalPlaces: bigint,
    unit: string,
    state?: {
      editedNegligibleAmount: number,
      tinyNegligibleAmount: number,
      approved: 'yes' | 'no'
    },
  }

export type ApproveAmountDisplayActionWithId =
  & ActionRecordWithId
  & ApproveAmountDisplayAction

export type ApproveDebtorNameAction =
  & ActionData
  & {
    actionType: 'ApproveDebtorName',
    accountUri: string,
    debtorName: string,
    editedDebtorName: string,
    unsetKnownDebtor: boolean,
  }

export type ApproveDebtorNameActionWithId =
  & ActionRecordWithId
  & ApproveDebtorNameAction

export type ConfigAccountAction =
  & ActionData
  & {
    actionType: 'ConfigAccount',
    accountUri: string,
    editedDebtorName: string,
    editedNegligibleAmount: number,
    editedScheduledForDeletion: boolean,
    editedAllowUnsafeDeletion: boolean,
    approveNewDisplay: boolean,
  }

export type ConfigAccountActionWithId =
  & ActionRecordWithId
  & ConfigAccountAction

export type UpdatePolicyAction =
  & ActionData
  & {
    actionType: 'UpdatePolicy',
    accountUri: string,
    editedPolicy: string | undefined
    editedMinPrincipal: bigint,
    editedMaxPrincipal: bigint,
    editedUseNonstandardPeg: boolean,
    editedIgnoreDeclaredPeg: boolean,
    editedReviseApprovedPeg: boolean,
  }

export type UpdatePolicyActionWithId =
  & ActionRecordWithId
  & UpdatePolicyAction

export type PaymentRequestAction =
  & ActionData
  & {
    actionType: 'PaymentRequest',
    accountUri: string,
    sealedAt?: Date,
    payeeReference: string,
    editedAmount: bigint | undefined,
    editedPayeeName: string,
    editedDeadline: string,
    editedNote: string,
  }

export type PaymentRequestActionWithId =
  & ActionRecordWithId
  & PaymentRequestAction

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
  | DeleteAccountTask

export type TaskRecordWithId =
  & TaskRecord
  & { taskId: number }

export type DeleteTransferTask =
  & TaskData
  & {
    taskType: 'DeleteTransfer',
    transferUri: string,
  }

export type DeleteTransferTaskWithId =
  & TaskRecordWithId
  & DeleteTransferTask

export type FetchDebtorInfoTask =
  & TaskData
  & {
    taskType: 'FetchDebtorInfo',
    iri: string,
    accountUri: string,
    forAccountInfo: boolean,
    backoffSeconds: number,
  }

export type DeleteAccountTask =
  & TaskData
  & {
    taskType: 'DeleteAccount',
    accountUri: string,
  }

export type DeleteAccountTaskWithId =
  & TaskRecordWithId
  & DeleteAccountTask

class CreditorsDb extends Dexie {
  wallets: Dexie.Table<WalletRecord, number>
  walletObjects: Dexie.Table<WalletObjectRecord, string>
  accounts: Dexie.Table<AccountRecord, string>
  accountObjects: Dexie.Table<AccountObjectRecord, string>
  accountPriorities: Dexie.Table<AccountSortPriority, string>
  defaultPayeeNames: Dexie.Table<DefaultPayeeName, number>
  expectedPayments: Dexie.Table<ExpectedPayment, string>
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
      accounts: 'uri,&[userId+debtor.uri]',
      accountObjects: 'uri,userId,account.uri',
      accountPriorities: 'uri,userId',
      defaultPayeeNames: 'userId',
      expectedPayments: 'payeeReference,userId,accountUri',

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
      ledgerEntries: '++id,&[ledger.uri+entryIdString],userId',

      // Contains debtor info documents. They are shared by all users.
      documents: 'uri',

      actions: '++actionId,&payeeReference,[userId+createdAt],transferUuid,transferUri,accountUri',
      tasks: '++taskId,[userId+scheduledFor],transferUri,accountUri',
    })

    this.wallets = this.table('wallets')
    this.walletObjects = this.table('walletObjects')
    this.accounts = this.table('accounts')
    this.accountObjects = this.table('accountObjects')
    this.accountPriorities = this.table('accountPriorities')
    this.defaultPayeeNames = this.table('defaultPayeeNames')
    this.expectedPayments = this.table('expectedPayments')
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
      this.accountPriorities,
      this.defaultPayeeNames,
      this.expectedPayments,
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
