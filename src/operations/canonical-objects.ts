/*
 * This module implements functions that read parsed JSON objects,
 * ensure that the application can understand them, and transform them
 * in their canonical form. The transformation does two things:
 *
 * 1) Sets a well known generic object type, independent from the
 *    version of the actual object, as long as it is compatible.
 *
 * 2) Rewrites relative URIs as absolute URIs.
 *
 * NOTE: The `uri` field on each object is being rewritten as an
 * absolute URI by the `web-api` module. Therefore we do not need to
 * deal with it here. Accounts' sub-objects are an exception, because
 * they may come either from a direct request or from an account
 * request that embeds them.
 */

import type { HttpResponse } from '../web-api'
import type {
  Creditor,
  PinInfo,
  Account,
  AccountDisplay,
  AccountConfig,
  AccountKnowledge,
  AccountExchange,
  AccountInfo,
  AccountLedger,
  Transfer,
  CommittedTransfer,
  Wallet,
  LogEntry,
  LogEntriesPage,
  LedgerEntriesPage,
  PaginatedStream,
  PaginatedList,
  TransferError,
  TransferOptions,
  TransferResult,
  LedgerEntry,
  CurrencyPeg,
  TransferCreationRequest,
  DebtorInfo,
  AccountsList,
  TransfersList,
} from '../web-api-schemas'

export type {
  Error as WebApiError,
  ObjectReference,
  AccountIdentity,
  DebtorIdentity,
} from '../web-api-schemas'

export type TypeMatcher = {
  test(t: string): boolean,
}

/* 
 * Regular expressions that determine whether a given object type is
 * compatible with the object types (and versions) which the
 * implementation understands.
 */
export const WALLET_TYPE = /^Wallet(-v[1-9][0-9]{0,5})?$/
export const CREDITOR_TYPE = /^Creditor(-v[1-9][0-9]{0,5})?$/
export const PIN_INFO_TYPE = /^PinInfo(-v[1-9][0-9]{0,5})?$/
export const DEBTOR_INFO_TYPE = /^DebtorInfo(-v[1-9][0-9]{0,5})?$/
export const OBJECT_REFERENCE_TYPE = /^ObjectReference$/
export const ACCOUNTS_LIST_TYPE = /^AccountsList(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_TYPE = /^Account(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_INFO_TYPE = /^AccountInfo(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_DISPLAY_TYPE = /^AccountDisplay(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_KNOWLEDGE_TYPE = /^AccountKnowledge(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_EXCHANGE_TYPE = /^AccountExchange(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_LEDGER_TYPE = /^AccountLedger(-v[1-9][0-9]{0,5})?$/
export const ACCOUNT_CONFIG_TYPE = /^AccountConfig(-v[1-9][0-9]{0,5})?$/
export const CURRENCY_PEG_TYPE = /^CurrencyPeg(-v[1-9][0-9]{0,5})?$/
export const TRANSFERS_LIST_TYPE = /^TransfersList(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_TYPE = /^Transfer(-v[1-9][0-9]{0,5})?$/
export const LOG_ENTRY_TYPE = /^LogEntry(-v[1-9][0-9]{0,5})?$/
export const LOG_ENTRIES_PAGE_TYPE = /^.*$/
export const LEDGER_ENTRIES_PAGE_TYPE = /^.*$/
export const PAGINATED_LIST_TYPE = /^PaginatedList(-v[1-9][0-9]{0,5})?$/
export const PAGINATED_STREAM_TYPE = /^PaginatedStream(-v[1-9][0-9]{0,5})?$/
export const LEDGER_ENTRY_TYPE = /^LedgerEntry(-v[1-9][0-9]{0,5})?$/
export const LEDGER_ENTRIES_LIST_TYPE = /^PaginatedList(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_RESULT_TYPE = /^TransferResult(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_ERROR_TYPE = /^TransferError(-v[1-9][0-9]{0,5})?$/
export const TRANSFER_OPTIONS_TYPE = /^TransferOptions(-v[1-9][0-9]{0,5})?$/
export const COMMITTED_TRANSFER_TYPE = /^CommittedTransfer(-v[1-9][0-9]{0,5})?$/

/* 
 * The types which the implementation understands.
 */
export type PaginatedListV0<ItemsType> = PaginatedList & {
  type: 'PaginatedList',
  itemsType: ItemsType,
}
export type PaginatedStreamV0<ItemsType> = PaginatedStream & {
  type: 'PaginatedStream',
  itemsType: ItemsType,
}
export type WalletV0 = Wallet & {
  type: 'Wallet',
  log: PaginatedStreamV0<'LogEntry'>,
}
export type LogEntryV0 = LogEntry & {
  type: 'LogEntry',
}
export type LogEntriesPageV0 = LogEntriesPage & {
  type: 'LogEntriesPage',
  items: LogEntryV0[],
  next?: string,
  forthcoming?: string,
}
export type LedgerEntriesPageV0 = LedgerEntriesPage & {
  type: 'LedgerEntriesPage',
  items: LedgerEntryV0[],
  next?: string,
}
export type PinInfoV0 = PinInfo & {
  type: 'PinInfo',
}
export type CreditorV0 = Creditor & {
  type: 'Creditor',
}
export type TransfersListV0 = TransfersList & {
  type: 'TransfersList',
  itemsType: 'ObjectReference',
}
export type TransferV0 = Transfer & {
  type: 'Transfer',
  options: TransferOptionsV0,
  result?: TransferResultV0,
}
export type TransferOptionsV0 = TransferOptions & {
  type: 'TransferOptions',
}
export type TransferResultV0 = TransferResult & {
  type: 'TransferResult',
  error?: TransferErrorV0,
}
export type TransferErrorV0 = TransferError & {
  type: 'TransferError',
}
export type LedgerEntryV0 = LedgerEntry & {
  type: 'LedgerEntry',
}
export type CommittedTransferV0 = CommittedTransfer & {
  type: 'CommittedTransfer',
}
export type DebtorInfoV0 = DebtorInfo & {
  type: 'DebtorInfo',
}
export type AccountsListV0 = AccountsList & {
  type: 'AccountsList',
  itemsType: 'ObjectReference',
}
export type AccountV0 = Account & {
  type: 'Account',
  ledger: AccountLedgerV0,
  info: AccountInfoV0,
  knowledge: AccountKnowledgeV0,
  exchange: AccountExchangeV0,
  display: AccountDisplayV0,
  config: AccountConfigV0,
}
export type AccountLedgerV0 = AccountLedger & {
  type: 'AccountLedger',
  entries: PaginatedListV0<'LedgerEntry'>,
}
export type AccountInfoV0 = AccountInfo & {
  type: 'AccountInfo',
  debtorInfo?: DebtorInfoV0,
}
export type AccountKnowledgeV0 = AccountKnowledge & {
  type: 'AccountKnowledge',
  debtorInfo?: DebtorInfoV0,
}
export type AccountExchangeV0 = AccountExchange & {
  type: 'AccountExchange',
  peg?: CurrencyPegV0,
}
export type AccountDisplayV0 = AccountDisplay & {
  type: 'AccountDisplay',
}
export type AccountConfigV0 = AccountConfig & {
  type: 'AccountConfig',
}
export type CurrencyPegV0 = CurrencyPeg & {
  type: 'CurrencyPeg',
}
export type TransferCreationRequestV0 = TransferCreationRequest & {
  type: 'TransferCreationRequest',
  options?: TransferOptionsV0,
}

/* 
 * Types of objects for which entries in the log are generated by the
 * server, which we are interested to follow. `AccountsList` and
 * `TransersList` are not listed here, because we are not interested
 * to follow them.
 */
export type LogObject =
  | AccountV0
  | AccountDisplayV0
  | AccountConfigV0
  | AccountKnowledgeV0
  | AccountExchangeV0
  | AccountInfoV0
  | AccountLedgerV0
  | CreditorV0
  | PinInfoV0
  | TransferV0
  | CommittedTransferV0

export class WrongObjectType extends Error {
  name = 'WrongObjectType'
}

export function matchType(matcher: TypeMatcher, objType: string): void {
  if (!matcher.test(objType)) {
    throw new WrongObjectType(objType)
  }
}

export function makeCreditor(response: HttpResponse<Creditor>): CreditorV0 {
  const data = response.data
  matchType(CREDITOR_TYPE, data.type ?? 'Creditor')
  return {
    ...data,
    type: 'Creditor',
    wallet: { uri: response.buildUri(data.wallet.uri) },
  }
}

export function makePinInfo(response: HttpResponse<PinInfo>): PinInfoV0 {
  const data = response.data
  matchType(PIN_INFO_TYPE, data.type ?? 'PinInfo')
  return {
    ...data,
    type: 'PinInfo',
    wallet: { uri: response.buildUri(data.wallet.uri) },
  }
}

export function makeAccountsList(response: HttpResponse<AccountsList>): AccountsListV0 {
  const data = response.data
  matchType(ACCOUNTS_LIST_TYPE, data.type)
  matchType(OBJECT_REFERENCE_TYPE, data.itemsType)
  return {
    ...data,
    type: 'AccountsList',
    itemsType: 'ObjectReference',
    wallet: { uri: response.buildUri(data.wallet.uri) },
    first: response.buildUri(data.first),
  }
}

export function makeTransfersList(response: HttpResponse<TransfersList>): TransfersListV0 {
  const data = response.data
  matchType(TRANSFERS_LIST_TYPE, data.type)
  matchType(OBJECT_REFERENCE_TYPE, data.itemsType)
  return {
    ...data,
    type: 'TransfersList',
    itemsType: 'ObjectReference',
    wallet: { uri: response.buildUri(data.wallet.uri) },
    first: response.buildUri(data.first),
  }
}

export function makeAccount(response: HttpResponse<Account>): AccountV0 {
  const data = response.data
  matchType(ACCOUNT_TYPE, data.type)
  return {
    ...data,
    type: 'Account',
    config: makeAccountConfig(data.config, response.url),
    exchange: makeAccountExchange(data.exchange, response.url),
    knowledge: makeAccountKnowledge(data.knowledge, response.url),
    display: makeAccountDisplay(data.display, response.url),
    info: makeAccountInfo(data.info, response.url),
    ledger: makeAccountLedger(data.ledger, response.url),
    accountsList: { uri: response.buildUri(data.accountsList.uri) },
  }
}

export function makeAccountDisplay(data: AccountDisplay, baseUri: string): AccountDisplayV0 {
  matchType(ACCOUNT_DISPLAY_TYPE, data.type ?? 'AccountDisplay')
  return {
    ...data,
    type: 'AccountDisplay',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href },
  }
}

export function makeAccountConfig(data: AccountConfig, baseUri: string): AccountConfigV0 {
  matchType(ACCOUNT_CONFIG_TYPE, data.type ?? 'AccountConfig')
  return {
    ...data,
    type: 'AccountConfig',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href },
  }
}

export function makeAccountExchange(data: AccountExchange, baseUri: string): AccountExchangeV0 {
  matchType(ACCOUNT_EXCHANGE_TYPE, data.type ?? 'AccountExchange')
  matchType(CURRENCY_PEG_TYPE, data.peg?.type ?? 'CurrencyPeg')
  return {
    ...data,
    type: 'AccountExchange',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href },
    peg: data.peg ? {
      ...data.peg,
      type: 'CurrencyPeg',
      account: { uri: new URL(data.peg.account.uri, baseUri).href },
    } : undefined,
  }
}

export function makeAccountKnowledge(data: AccountKnowledge, baseUri: string): AccountKnowledgeV0 {
  matchType(ACCOUNT_KNOWLEDGE_TYPE, data.type ?? 'AccountKnowledge')
  matchType(DEBTOR_INFO_TYPE, data.debtorInfo?.type ?? 'DebtorInfo')
  return {
    ...data,
    type: 'AccountKnowledge',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href },
    debtorInfo: data.debtorInfo ? {
      ...data.debtorInfo,
      type: 'DebtorInfo',
    } : undefined,
  }
}

export function makeAccountInfo(data: AccountInfo, baseUri: string): AccountInfoV0 {
  matchType(ACCOUNT_INFO_TYPE, data.type)
  matchType(DEBTOR_INFO_TYPE, data.debtorInfo?.type ?? 'DebtorInfo')
  return {
    ...data,
    type: 'AccountInfo',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href },
    debtorInfo: data.debtorInfo ? {
      ...data.debtorInfo,
      type: 'DebtorInfo',
    } : undefined,
  }
}

export function makeAccountLedger(data: AccountLedger, baseUri: string): AccountLedgerV0 {
  matchType(ACCOUNT_LEDGER_TYPE, data.type)
  matchType(LEDGER_ENTRIES_LIST_TYPE, data.entries.type)
  matchType(LEDGER_ENTRY_TYPE, data.entries.itemsType)
  return {
    ...data,
    type: 'AccountLedger',
    entries: {
      ...data.entries,
      type: 'PaginatedList',
      itemsType: 'LedgerEntry',
      first: new URL(data.entries.first, baseUri).href,
    },
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href },
  }
}

export function makeTransfer(response: HttpResponse<Transfer>): TransferV0 {
  const data = response.data
  matchType(TRANSFER_TYPE, data.type)
  matchType(TRANSFER_OPTIONS_TYPE, data.options.type ?? 'TransferOptions')
  matchType(TRANSFER_RESULT_TYPE, data.result?.type ?? 'TransferResult')
  matchType(TRANSFER_ERROR_TYPE, data.result?.error?.type ?? 'TransferError')
  return {
    ...data,
    type: 'Transfer',
    transfersList: { uri: response.buildUri(data.transfersList.uri) },
    options: {
      ...data.options,
      type: 'TransferOptions',
    },
    result: data.result ? {
      ...data.result,
      type: 'TransferResult',
      error: data.result.error ? {
        ...data.result.error,
        type: 'TransferError',
      } : undefined,
    } : undefined,
  }
}

export function makeCommittedTransfer(response: HttpResponse<CommittedTransfer>): CommittedTransferV0 {
  const data = response.data
  matchType(COMMITTED_TRANSFER_TYPE, data.type)
  return {
    ...data,
    type: 'CommittedTransfer',
    account: { uri: response.buildUri(data.account.uri) },
  }
}

export function makeWallet(response: HttpResponse<Wallet>): WalletV0 {
  const data = response.data
  matchType(WALLET_TYPE, data.type)
  matchType(PAGINATED_STREAM_TYPE, data.log.type)
  matchType(LOG_ENTRY_TYPE, data.log.itemsType)
  return {
    ...data,
    type: 'Wallet',
    creditor: { uri: response.buildUri(data.creditor.uri) },
    createAccount: { uri: response.buildUri(data.createAccount.uri) },
    createTransfer: { uri: response.buildUri(data.createTransfer.uri) },
    pinInfo: { uri: response.buildUri(data.pinInfo.uri) },
    debtorLookup: { uri: response.buildUri(data.debtorLookup.uri) },
    transfersList: { uri: response.buildUri(data.transfersList.uri) },
    accountLookup: { uri: response.buildUri(data.accountLookup.uri) },
    accountsList: { uri: response.buildUri(data.accountsList.uri) },
    log: {
      ...data.log,
      type: 'PaginatedStream',
      itemsType: 'LogEntry',
      first: response.buildUri(data.log.first),
      forthcoming: response.buildUri(data.log.forthcoming),
    },
  }
}

export function makeLogEntriesPage(response: HttpResponse<LogEntriesPage>): LogEntriesPageV0 {
  const data = response.data
  matchType(LOG_ENTRIES_PAGE_TYPE, data.type)
  for (const item of data.items) {
    matchType(LOG_ENTRY_TYPE, item.type)
  }
  assert(data.next !== undefined || data.forthcoming !== undefined)
  return {
    ...data,
    type: 'LogEntriesPage',
    items: data.items.map(item => ({
      ...item,
      type: 'LogEntry',
      object: { uri: response.buildUri(item.object.uri) },
    })),
  }
}

export function makeLedgerEntriesPage(response: HttpResponse<LedgerEntriesPage>): LedgerEntriesPageV0 {
  const data = response.data
  matchType(LEDGER_ENTRIES_PAGE_TYPE, data.type)
  for (const item of data.items) {
    matchType(LEDGER_ENTRY_TYPE, item.type)
  }
  return {
    ...data,
    type: 'LedgerEntriesPage',
    items: data.items.map(item => ({
      ...item,
      type: 'LedgerEntry',
      transfer: item.transfer ? { uri: response.buildUri(item.transfer.uri) } : undefined,
      ledger: { uri: response.buildUri(item.ledger.uri)},
    })),
  }
}

export function makeLogObject(response: HttpResponse<any>): LogObject {
  const data = response.data
  switch (getCanonicalType(String(data.type))) {
    case 'Account':
      return makeAccount(response)
    case 'AccountDisplay':
      return makeAccountDisplay(response.data, response.url)
    case 'AccountConfig':
      return makeAccountConfig(response.data, response.url)
    case 'AccountKnowledge':
      return makeAccountKnowledge(response.data, response.url)
    case 'AccountExchange':
      return makeAccountExchange(response.data, response.url)
    case 'AccountLedger':
      return makeAccountLedger(response.data, response.url)
    case 'AccountInfo':
      return makeAccountInfo(response.data, response.url)
    case 'Creditor':
      return makeCreditor(response)
    case 'PinInfo':
      return makePinInfo(response)
    case 'Transfer':
      return makeTransfer(response)
    case 'CommittedTransfer':
      return makeCommittedTransfer(response)
    default:
      throw new WrongObjectType()
  }
}

export function getCanonicalType(objectType: string) {
  switch (true) {
    case ACCOUNT_TYPE.test(objectType):
      return 'Account'
    case ACCOUNT_DISPLAY_TYPE.test(objectType):
      return 'AccountDisplay'
    case ACCOUNT_KNOWLEDGE_TYPE.test(objectType):
      return 'AccountKnowledge'
    case ACCOUNT_EXCHANGE_TYPE.test(objectType):
      return 'AccountExchange'
    case ACCOUNT_LEDGER_TYPE.test(objectType):
      return 'AccountLedger'
    case ACCOUNT_CONFIG_TYPE.test(objectType):
      return 'AccountConfig'
    case ACCOUNT_INFO_TYPE.test(objectType):
      return 'AccountInfo'
    case CREDITOR_TYPE.test(objectType):
      return 'Creditor'
    case PIN_INFO_TYPE.test(objectType):
      return 'PinInfo'
    case COMMITTED_TRANSFER_TYPE.test(objectType):
      return 'CommittedTransfer'
    case TRANSFER_TYPE.test(objectType):
      return 'Transfer'
    case ACCOUNTS_LIST_TYPE.test(objectType):
      return 'AccountsList'
    case TRANSFERS_LIST_TYPE.test(objectType):
      return 'TransfersList'
    default:
      return undefined
  }
}

export function createTypeValidationFunction(expectedType: string): ((value: unknown) => boolean) {
  switch (expectedType) {
    case 'number':
      return (value: unknown) => typeof value === 'number'
    case 'bigint':
      return (value: unknown) => typeof value === 'bigint'
    case 'string':
      return (value: unknown) => typeof value === 'string'
    case 'boolean':
      return (value: unknown) => typeof value === 'boolean'
    case 'ObjectReference':
      return (value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          const propertyNames = Object.getOwnPropertyNames(value)
          return propertyNames.length === 1 && propertyNames[0] === 'uri'
        }
        return false
      }
    default:
      return (value: unknown) => (
        typeof value === 'object'
        && value !== null
        && (value as { type: unknown }).type === expectedType
      )
  }
}
