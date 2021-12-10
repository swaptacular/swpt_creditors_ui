import type { PaymentInfo } from '../../payment-requests'
import type { BaseDebtorData, Peg, ResourceReference, DocumentWithHash } from '../../debtor-info'
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
  debtorData?: BaseDebtorData,
  debtorInfo?: DebtorInfoV0,
  interestRate?: number,
  interestRateChangedAt?: string,
  identity?: AccountIdentity,
  noteMaxBytes?: bigint,
  configError?: string,
}

// Informs the user about updated account info. After the user
// acknowledges, updates the account's AccountKnowledge record. Then,
// if necessary creates ApproveDebtorNameAction, ApproveDisplayAction,
// ApprovePegAction. When account's peg parameters has been changed --
// remove the peg from the AccountExchange record (so that not to
// allow exchanges at non-standard rates).
//
// NOTE: Probably Should present the option to the user to set
// `AccountKnowledge.knownDebtor` to false, in case the user suspects
// that he/she is not dealing with the same debtor anymore.
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
// 1. If the account (accountUri), or the debtor info document
//    (documentUri) do not exist -- show an error.
//
// 2. If confirmed debtor info can be obtained from the account's
//    AccountInfo, it is used instead of the available document
//    (documentUri). In that case, the `CONFIRMED_DEBTOR_INFO`
//    variable is set to true.
//
// 3. If the account's `AccountDisplay.debtorName` IS NOT undefined,
//    then the "accept debtor screen" is shown. If accepted, first
//    `AccountDisplay.debtorName` is updated, then
//    `AccountConfig.negligibleAmount` is updated, then
//    `AccountKnowledge.knownDebtor` is set to true. If rejected,
//    nothing happens.
//
// 4. If the account's `AccountDisplay.debtorName` IS undefined, the
//    account's AccountKnowledge must be ignored. Then the "accept
//    debtor screen" is shown, and if accepted, first the account's
//    AccountKnowledge is updated (including `knownDebtor=true` and
//    `confirmedDebtorInfo=CONFIRMED_DEBTOR_INFO` fields), then
//    `AccountConfig.negligibleAmount` is set, then AccountDisplay is
//    updated (including the `debtorName` field.)  If the new account
//    declares a peg, create new ApprovePegAction.
export type CreateAccountAction =
  & ActionData
  & {
    actionType: 'CreateAccount',
    documentUri: string,
    accountUri: string,
    editedDebtorName?: string,
  }

export type CreateAccountActionWithId =
  & ActionRecordWithId
  & CreateAccountAction

// TODO: Here is how this action is supposed to work:
//
// (dialog 1 -- optional)
//
// * Ensure that the pegged account (accountUri) exists, and
//   `peggedAccount.AccountDisplay.debtorName` is not undefined.
//
// * Make a "create account" HTTP request for the peg currency
//   (peg.debtorIdentity.uri). This ensures that we have got the most
//   recent version of the peg account.
//
// * If `debtorInfoDocumentUri === undefined`:
//
//   - If confirmed debtor info can be obtained from
//     `pegAccount.AccountInfo.debtorInfo.iri`, set
//     `confirmedDebtorInfo` to true, and `debtorInfoDocumentUri` to
//     the document's IRI.
//
//   - Otherwise, fetch the debtor info document for the peg currency
//     (GET `peg.latestDebtorInfo.uri` and expect a redirect). Store
//     the obtained document, save its URI in `debtorInfoDocumentUri`,
//     and set `confirmedDebtorInfo` to false.
//
// * Parse the document at `debtorInfoDocumentUri` as PEG_DOC. Ensure
//   that `peg.debtorIdentity.uri === PEG_DOC.debtorIdentity.uri &&
//   `peg.latestDebtorInfo.uri === PEG_DOC.latestDebtorInfo.uri`.
//
// (dialog 2 -- optional)
//
// * If `pegAccount.AccountDisplay.debtorName !== undefined &&
//   pegAccount.AccountKnowledge.confirmedDebtorInfo === false &&
//   confirmedDebtorInfo === false`, fetch and parse the debtor info
//   document at `pegAccount.AccountKnowledge.debtorInfo.iri` as
//   KNOWN_PEG_DOC. Then if `KNOWN_PEG_DOC.latestDebtorInfo.uri !==
//   peg.latestDebtorInfo.uri`, show the "coin URI override screen",
//   and if accepted, create a new AckAccountInfoAction for the peg
//   account.
//
// * If `pegAccount.AccountDisplay.debtorName === undefined` (the
//   account's AccountKnowledge must be ignored), show the "accept
//   debtor screen". If the user have accepted the debtor:
//
//   a) Set `newAccount` to true (and commit).
//
//   b) Initialize peg account's AccountKnowledge (`knownDebtor =
//      false`, `confirmedDebtorInfo = confirmedDebtorInfo`).
//
//   c) Initialize peg account's `AccountConfig.negligibleAmount`.
//
//   d) Initialize peg account's AccountDisplay (including the
//     `debtorName` field).
//
//   NOTE: While initializing, if the `latestUpdateId` happens to be
//         wrong (or some other network failure occurs), an error
//         should be shown, and the user redirected to the "actions"
//         page.
//
// * If `newAccount === true` and PEG_DOC declares a peg itself,
//   create an ApprovePegAction for the next peg, and set `newAccount`
//   to false. (We may need to ensure that the currency is not pegged
//   to itself.)
//
// (dialog 3)
//
// * Show the "approve peg screen", and if accepted, write the new peg
//   to the AccountExchange record. If rejected, remove the current
//   peg from the AccountExchange record.
export type ApprovePegAction =
  & ActionData
  & {
    actionType: 'ApprovePeg',
    accountUri: string,
    peg: Peg,
    confirmedDebtorInfo: boolean
    debtorInfoDocumentUri?: string,
    newAccount?: boolean,
    editedDebtorName?: string,
    editedNegligibleAmount?: number,
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
