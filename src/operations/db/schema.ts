import type { PaymentInfo } from '../../payment-requests'
import type { BaseDebtorData, ResourceReference, DocumentWithHash, Peg } from '../../debtor-info'
import type {
  LedgerEntryV0, TransferV0, CommittedTransferV0, PinInfoV0, CreditorV0, WalletV0, AccountV0,
  AccountLedgerV0, AccountInfoV0, AccountKnowledgeV0, AccountExchangeV0, AccountDisplayV0,
  AccountConfigV0, TransferCreationRequestV0, WebApiError, ObjectReference
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
    creationRequest: TransferCreationRequestV0,
    paymentInfo: PaymentInfo,
    requestedAmount: bigint,
    requestedDeadline?: Date,
    execution?: ExecutionState,
  }

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

export type DebtorDataSource = 'info' | 'knowledge' | 'uri'

// TODO: Here is how this action should work:
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

// TODO: Here is how this action should work:
//
// (dialog 1 -- optional)
//
// * If `showRetryFetchDialog === true`, show a "retry fetch
//   screen". If retried, set `showRetryFetchDialog` to false.
//
// * Make a "create account" HTTP request for the account
//   (debtorIdentityUri). This ensures that we have got the most
//   recent version of the account.
//
// * If `state` is undefined, set it:
//
//   - If `account.AccountDisplay.debtorName !== undefined`, set
//     `state.debtorInfo` to `account.AccountKnowledge.debtorInfo`
//     (???), `state.accountInitializationInProgress` to false, and
//     `state.verifyLatestDebtorInfoUri` to false.
//
//   - If debtor info can be obtained from
//     `account.AccountInfo.debtorInfo`, set `state.debtorInfo` to it,
//     `state.accountInitializationInProgress` to false, and
//     `state.verifyLatestDebtorInfoUri` to false.
//
//   - Otherwise, GET `latestDebtorInfoUri` and expect a redirect. Set
//     `state.debtorInfo` to `{ iri: <the redirect location> }`,
//     `state.accountInitializationInProgress` to false, and
//     `state.verifyLatestDebtorInfoUri` to true. In case of a network
//     problem, set `showRetryFetchDialog` to true, and show an error.
//
// * Fetch, store, and parse the document referenced by
//   `state.debtorInfo` as DOC. If `sha256` and/or `contentType`
//   fields are available, ensure that their values are
//   correct. Ensure that `debtorIdentityUri ===
//   DOC.debtorIdentity.uri`. If `state.verifyLatestDebtorInfoUri ===
//   true`, ensure that `latestDebtorInfoUri ===
//   DOC.latestDebtorInfo.uri`. If the debtor info document can not be
//   fetched correctly, set `showRetryFetchDialog` to true, and show
//   an error. If `state.debtorInfo === undefined`, generate a dummy
//   debtor info document.
//
// (dialog 2 - optional)
//
// * At most one of the following things will happen:
//
//   - If `state.accountInitializationInProgress === false` and
//     `account.AccountDisplay.debtorName !== undefined`, show the
//     "accept debtor screen". If the user have accepted the debtor:
//
//     a) If changed, update `AccountDisplay.debtorName`. If
//       `AccountDisplay.knownDebtor` is false, set it to true.
//
//     b) If changed, update `AccountConfig.negligibleAmount`. If
//        `AccountConfig.scheduledForDeletion` is true, set it to
//        false.
//
//   - If `account.AccountDisplay.debtorName === undefined` (the
//     account's AccountKnowledge must be ignored), show the "accept
//     debtor screen". If the user have accepted the debtor:
//
//     a) Set `state.accountInitializationInProgress` to true (and commit).
//
//     b) Initialize account's AccountKnowledge.
//
//     c) Initialize account's `AccountConfig (including
//        `negligibleAmount` and `scheduledForDeletion` = false).
//
//     d) Initialize account's AccountDisplay (including the
//        `debtorName` field, setting `knownDebtor to true).
//
// * If `state.accountInitializationInProgress === true` and DOC
//   declares a peg, create an ApprovePegAction for the peg, and
//   delete the create account action. (We may need to ensure that the
//   currency is not pegged to itself.)
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

// TODO: Here is how this action should work:
//
// * Ensure that the pegged account (accountUri) exists,
//   `peggedAccount.AccountDisplay.debtorName` is not undefined, and
//   `peggedAccount.AccountKnowledge.debtorData` describes the same
//   peg as `peg`. (Maybe check for circular pegs as well.)
//
// (dialog 1 -- optional)
//
// * If `showRetryFetchDialog === true`, show a "retry fetch
//   screen". If retried, set `showRetryFetchDialog` to false.
//
// * Make a "create account" HTTP request for the peg currency
//   (peg.debtorIdentity.uri). This ensures that we have got the most
//   recent version of the peg account.
//
// * If `state` is undefined, set it:
//
//   - If debtor info can be obtained from
//     `pegAccount.AccountInfo.debtorInfo`, set `state.debtorInfo` to
//     it, set `state.verifyLatestDebtorInfoUri` to false, and
//     `state.accountInitializationInProgress` to false.
//
//   - If `pegAccount.AccountDisplay.debtorName !== undefined`, set
//     `state.debtorInfo` to `pegAccount.AccountKnowledge.debtorInfo`
//     (???), `state.verifyLatestDebtorInfoUri` to true, and
//     `state.accountInitializationInProgress` to false.
//
//   - Otherwise, GET `peg.latestDebtorInfo.uri` and expect a
//     redirect. Set `state.debtorInfo` to `{ iri: <the redirect
//     location> }`, `state.verifyLatestDebtorInfoUri` to false,
//     `state.accountInitializationInProgress` to false. In case of a
//     network problem, set `showRetryFetchDialog` to true, and show
//     an error.
//
// * Fetch, store, and parse the document referenced by
//   `state.debtorInfo` as PEG_DOC. If `sha256` and/or `contentType`
//   fields are available, ensure that their values are
//   correct. Ensure that `peg.debtorIdentity.uri ===
//   PEG_DOC.debtorIdentity.uri`. If the debtor info document can not
//   be fetched correctly, set `showRetryFetchDialog` to true, and
//   show an error. If `state.debtorInfo === undefined`, generate a
//   dummy debtor info document.
//
// (dialog 2 -- optional)
//
// * At most one of the following things will happen:
//
//   - If `state.verifyLatestDebtorInfoUri === true &&
//     pegAccount.AccountKnowledge.debtorData.latestDebtorInfo.uri !==
//     peg.latestDebtorInfo.uri`, show the "coin URI override screen",
//     and if accepted, fetch the document from
//     `peg.latestDebtorInfo.uri` as NEW_PEG_INFO, delete all existing
//     AckAccountInfo actions for the peg account, and call
//     `verifyAccountKnowledge(pegAccount.uri, NEW_PEG_INFO)`; if
//     rejected, delete the action as unsuccessful.
//
//   - If `pegAccount.AccountDisplay.debtorName === undefined` (the
//     account's AccountKnowledge must be ignored), show the "accept
//     debtor screen". If the user have accepted the debtor:
//
//     a) Set `state.accountInitializationInProgress` to true (and
//        commit).
//
//     b) Initialize peg account's AccountKnowledge.
//
//     c) Initialize peg account's `AccountConfig (including
//        `negligibleAmount` and `scheduledForDeletion` = false).
//
//     d) Initialize peg account's AccountDisplay (including the
//        `debtorName` field, setting `knownDebtor to false).
//
// * If `state.accountInitializationInProgress === true` and PEG_DOC
//   declares a peg itself, create an ApprovePegAction for the next
//   peg, and set `state.accountInProgress` to false. (We may need to
//   ensure that the currency is not pegged to itself.)
//
// (dialog 3)
//
// * Show the "approve peg screen", and if accepted:
//
//   a) Make a "get account" HTTP request for the pegged currency
//      (accountUri). This ensures that we have got the most recent
//      version of the pegged account.
//
//   b) Ensure that the pegged account (accountUri) still exists,
//      `peggedAccount.AccountDisplay.debtorName` is not undefined,
//      and `peggedAccount.AccountKnowledge.debtorData.peg` describes
//      the same peg as `peg`.
//
//   c) Write the new peg to `peggedAccount.AccountExchange`.
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

// TODO: Here is how this action should work:
//
// * Ensure that the account (accountUri) exists,
//   `account.AccountDisplay.debtorName` is not undefined, and
//   `account.AccountKnowledge.debtorData` describes the same
//   `amountDivisor`, `decimalPlaces`, and `unit`.
//
// * Show the "approve amount display screen", and if accepted:
//
//   a) Make a "get account" HTTP request for the account
//      (accountUri). This ensures that we have got the most recent
//      version of the account.
//
//   b) Ensure that the account (accountUri) still exists,
//      `account.AccountDisplay.debtorName` is not undefined, and
//      `account.AccountKnowledge.debtorData` describes the same
//      `amountDivisor`, `decimalPlaces`, and `unit`.
//
//   c) For all accounts pegged to `account`, remove the peg from
//      their `AccountExchange` records. (And execute a "sync"
//      before.)
//
//   d) If changed, update `account.AccountConfig.negligibleAmount`.
//
//   e) Write the amount display parameters to
//      `account.AccountDisplay`.
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

// TODO: Here is how this action should work:
//
// * Ensure that the account (accountUri) exists,
//   `account.AccountDisplay.debtorName` is not undefined (it shall be
//   used as an initial value for `editedDebtorName`), and
//   `account.AccountKnowledge.debtorData` describes the same
//   `debtorName`.
//
// * Show the "approve debtor name screen", and if accepted:
//
//   a) Make a "get account" HTTP request for the account
//      (accountUri). This ensures that we have got the most recent
//      version of the account.
//
//   b) Ensure that the account (accountUri) still exists,
//      `account.AccountDisplay.debtorName` is not undefined, and
//      `account.AccountKnowledge.debtorData` describes the same
//      `debtorName`.
//
//   d) Write the (possibly edited) debtor name to
//      `account.AccountDisplay`. Optionally, set
//      `AccountDisplay.knownDebtor` to false.
//
//      NOTE: In the "approve debtor name screen" the option is
//      presented to the user to set `AccountDisplay.knownDebtor` to
//      false, in case the user suspects that he/she is not dealing
//      with the same debtor anymore. That is, the user can select
//      between: "Use the new name", "Keep the current name", and "I
//      am confused".
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
      accounts: 'uri,userId',
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

      actions: '++actionId,&payeeReference,[userId+createdAt],creationRequest.transferUuid,transferUri,accountUri',
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
