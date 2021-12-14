import type { PaymentInfo } from '../../payment-requests'
import type { DebtorData, Peg, ResourceReference, DocumentWithHash } from '../../debtor-info'
import type {
  LedgerEntryV0, TransferV0, CommittedTransferV0, PinInfoV0, CreditorV0, WalletV0, AccountV0,
  AccountLedgerV0, AccountInfoV0, AccountKnowledgeV0, AccountExchangeV0, AccountDisplayV0,
  AccountConfigV0, DebtorInfoV0, TransferCreationRequestV0, WebApiError, ObjectReference
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
  | ApprovePegAction
  | ApproveDisplayAction
  | ApproveDebtorNameAction
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
  debtorData: DebtorData,
  debtorInfo?: DebtorInfoV0,
  interestRate: number,
  interestRateChangedAt: string,
  configError?: string,
}

// Informs the user about updated account info. After the user
// acknowledges, updates the account's AccountKnowledge record. Then,
// if necessary creates ApproveDebtorNameAction, ApproveDisplayAction,
// ApprovePegAction. When account's peg parameters has been changed --
// remove the peg from the AccountExchange record (so that not to
// allow exchanges at non-standard rates).
//
// Important notes:
//
// * We probably should present the option to the user to set
//   `AccountKnowledge.knownDebtor` to false, in case the user
//   suspects that he/she is not dealing with the same debtor anymore.
//
// * When the known debtor info becomes confirmed, this allows the
//   user to accept payments, and therefore the user should be
//   informed about it.
//
// * Changes in the fields `noteMaxBytes`, `identity`,
//   `debtorData.summary`, `debtorData.debtorIdentity`,
//   `debtorData.willNotChangeUntil`, and `debtorData.revision` should
//   be ignored, because they are either unimportant or never shown to
//   the user.
//
// * No more that one AckAccountInfoAction per account should exist at
//   a given time.
//
// * A new AckAccountInfoAction record should be created when it is
//   known that one or more of the important (tracked) fields has
//   been updated, and currently there are no `AckAccountInfoAction`s
//   for the given account. (Therefore, when an AckAccountInfoAction
//   gets deleted, the `AccountInfo` record should be checked, and if
//   there has been a change -- another AckAccountInfoAction created.)
//   
// * When one or more of the important (tracked) fields in the
//   account's `AccountKnowledge` record has been changed, and an
//   AckAccountInfoAction record exists, it should be deleted.
//
// * AckAccountInfoAction records never be created for accounts that
//   does not have a `debtorName` set.
export type AckAccountInfoAction =
  & ActionData
  & {
    actionType: 'AckAccountFacts',
    accountUri: string,
    before: EssentialAccountInfo,
    after: EssentialAccountInfo,
  }

export type AckAccountInfoActionWithId =
  & ActionRecordWithId
  & AckAccountInfoAction

// TODO: Here is how this action is supposed to work:
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
//   - If *confirmed* debtor info can be obtained from
//     `account.AccountInfo.debtorInfo`, set `state.debtorInfo` to it,
//     `state.initializationInProgress` to false, and
//     `state.verifyLatestDebtorInfoUri` to false.
//
//   - If `account.AccountDisplay.debtorName !== undefined` and
//     `account.AccountKnowledge.debtorInfo !== undefined`, set
//     `state.debtorInfo` to it, `state.initializationInProgress` to
//     false, and `state.verifyLatestDebtorInfoUri` to false.
//
//   - Otherwise, GET `latestDebtorInfoUri` and expect a redirect. Set
//     `state.debtorInfo` to `{ iri: <the redirect location> }`,
//     `state.initializationInProgress` to false, and
//     `state.verifyLatestDebtorInfoUri` to true. In case of a network
//     problem, set `showRetryFetchDialog` to true, and show an error.
//
// * Fetch, store, and parse the document referenced by `debtorInfo`
//   as DOC. If `sha256` and/or `contentType` fields are available,
//   ensure that their values are correct. Ensure that
//   `debtorIdentityUri === DOC.debtorIdentity.uri`. If
//   `state.verifyLatestDebtorInfoUri === true`, ensure that
//   `latestDebtorInfoUri === DOC.latestDebtorInfo.uri`. If the debtor
//   info document can not be fetched correctly, set
//   `showRetryFetchDialog` to true, and show an error.
//
// (dialog 2)
//
// * If `state.initializationInProgress === false` and
//   `account.AccountDisplay.debtorName !== undefined`, show the
//   "accept debtor screen". If the user have accepted the debtor:
//
//   a) If changed, update `AccountDisplay.debtorName`.
//
//   b) If changed, update `AccountConfig.negligibleAmount`, and if
//      `AccountConfig.scheduledForDeletion` is true, set it to false.
//
//   c) If `AccountKnowledge.knownDebtor` is false, set it to true.
//
//   NOTE: While updating, if the `latestUpdateId` happens to be wrong
//         (or some other network failure occurs), an error should be
//         shown, and the user redirected to the "actions" page.
//
// * If `account.AccountDisplay.debtorName === undefined` (the
//   account's AccountKnowledge must be ignored), show the "accept
//   debtor screen". If the user have accepted the debtor:
//
//   a) Set `state.initializationInProgress` to true (and commit).
//
//   b) Initialize account's AccountKnowledge (`knownDebtor = true`).
//
//   c) Initialize account's `AccountConfig (including
//      `negligibleAmount` and `scheduledForDeletion` = false).
//
//   d) Initialize account's AccountDisplay (including the
//     `debtorName` field).
//
//   NOTE: While initializing, if the `latestUpdateId` happens to be
//         wrong (or some other network failure occurs), an error
//         should be shown, and the user redirected to the "actions"
//         page.
//
// * If `state.initializationInProgress === true` and DOC declares a
//   peg, create an ApprovePegAction for the peg, and delete the
//   create account action. (We may need to ensure that the currency
//   is not pegged to itself.)
export type CreateAccountAction =
  & ActionData
  & {
    actionType: 'CreateAccount',
    debtorIdentityUri: string,
    latestDebtorInfoUri: string,
    showRetryFetchDialog: boolean,
    state?: {
      initializationInProgress: boolean,
      verifyLatestDebtorInfoUri: boolean,
      debtorInfo?: DebtorInfoV0,
      editedDebtorName?: string,
      editedNegligibleAmount?: number,
    }
  }

export type CreateAccountActionWithId =
  & ActionRecordWithId
  & CreateAccountAction

// TODO: Here is how this action is supposed to work:
//
// * Ensure that the pegged account (accountUri) exists, and
//   `peggedAccount.AccountDisplay.debtorName` is not undefined.
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
//   - If *confirmed* debtor info can be obtained from
//     `pegAccount.AccountInfo.debtorInfo`, set `state.debtorInfo` to
//     it, set `state.verifyLatestDebtorInfoUri` to false,
//     `state.initializationInProgress` to false, and
//     `state.askForOverride` to false.
//
//   - If `pegAccount.AccountDisplay.debtorName !== undefined` and
//     `pegAccount.AccountKnowledge.debtorInfo !== undefined`, set
//     `state.debtorInfo` to it, `state.verifyLatestDebtorInfoUri` to
//     <debtorInfo IS NOT confirmed>, `state.initializationInProgress`
//     to false, and `state.askForOverride` to false.
//
//   - Otherwise, GET `peg.latestDebtorInfo.uri` and expect a
//     redirect. Set `state.debtorInfo` to `{ iri: <the redirect
//     location> }`, `state.verifyLatestDebtorInfoUri` to false,
//     `state.initializationInProgress` to false, and
//     `state.askForOverride` to `pegAccount.AccountDisplay.debtorName
//     !== undefined`. In case of a network problem, set
//     `showRetryFetchDialog` to true, and show an error.
//
// * Fetch, store, and parse the document referenced by
//   `state.debtorInfo` as PEG_DOC. If `sha256` and/or `contentType`
//   fields are available, ensure that their values are
//   correct. Ensure that `peg.debtorIdentity.uri ===
//   PEG_DOC.debtorIdentity.uri`. If the debtor info document can not
//   be fetched correctly, set `showRetryFetchDialog` to true, and show an
//   error.
//
// (dialog 2 -- optional)
//
// * If `state.askForOverride === true ||
//   state.verifyLatestDebtorInfoUri === true &&
//   PEG_DOC.latestDebtorInfo.uri !== peg.latestDebtorInfo.uri`, show
//   the "coin URI override screen", and if accepted, create a new
//   AckAccountInfoAction for the peg account.
//
// * If `pegAccount.AccountDisplay.debtorName === undefined` (the
//   account's AccountKnowledge must be ignored), show the "accept
//   debtor screen". If the user have accepted the debtor:
//
//   a) Set `state.initializationInProgress` to true (and commit).
//
//   b) Initialize peg account's AccountKnowledge (`knownDebtor =
//      false`).
//
//   c) Initialize peg account's `AccountConfig (including
//      `negligibleAmount` and `scheduledForDeletion` = false).
//
//   d) Initialize peg account's AccountDisplay (including the
//     `debtorName` field).
//
//   NOTE: While initializing, if the `latestUpdateId` happens to be
//         wrong (or some other network failure occurs), an error
//         should be shown, and the user redirected to the "actions"
//         page.
//
// * If `state.initializationInProgress === true` and PEG_DOC declares
//   a peg itself, create an ApprovePegAction for the next peg, and
//   set `state.initializationInProgress` to false. (We may need to
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
//      `peggedAccount.AccountDisplay.debtorName` is not undefined, and
//      the `peggedAccount.AccountKnowledge.debtorInfo.iri` document
//      describes the same peg as `peg`.
//
//   c) Write the new peg to `peggedAccount.AccountExchange` (check
//      latestUpdateId).
export type ApprovePegAction =
  & Omit<CreateAccountAction, 'latestDebtorInfoUri' | 'debtorIdentityUri'>
  & {
    actionType: 'ApprovePeg',
    accountUri: string,
    peg: Peg,
    askForOverride: boolean,
  }

export type ApprovePegActionWithId =
  & ActionRecordWithId
  & ApprovePegAction

/** If the user accepts the new account display parameters -- write
 * them to the account display record. Otherwise, do nothing.
 */
export type ApproveDisplayAction =
  & ActionData
  & {
    // TODO: more fields?
    actionType: 'ApproveDisplay',
    accountUri: string,
  }

export type ApproveDisplayActionWithId =
  & ActionRecordWithId
  & ApproveDisplayAction

/** If the user accepts the new debtor name (possibly edited) -- write
 * it to the account display record. Otherwise, do nothing.
 */
export type ApproveDebtorNameAction =
  & ActionData
  & {
    // TODO: more fields?
    actionType: 'ApproveDebtorName',
    accountUri: string,
    editedDebtorName?: string,
  }

export type ApproveDebtorNameActionWithId =
  & ActionRecordWithId
  & ApproveDebtorNameAction

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
