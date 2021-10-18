import type {
  HttpResponse,
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
  LogEntriesPage,
} from './server'
import {
  WALLET_TYPE,
  CREDITOR_TYPE,
  PIN_INFO_TYPE,
  ACCOUNT_TYPE,
  LOG_ENTRY_TYPE,
  PAGINATED_STREAM_TYPE,
  ACCOUNT_INFO_TYPE,
  ACCOUNT_DISPLAY_TYPE,
  ACCOUNT_KNOWLEDGE_TYPE,
  ACCOUNT_EXCHANGE_TYPE,
  ACCOUNT_LEDGER_TYPE,
  ACCOUNT_CONFIG_TYPE,
  LEDGER_ENTRY_TYPE,
  LEDGER_ENTRIES_LIST_TYPE,
  COMMITTED_TRANSFER_TYPE,
  TRANSFER_TYPE,
  TRANSFER_RESULT_TYPE,
  TRANSFER_ERROR_TYPE,
  TRANSFER_OPTIONS_TYPE,
  LOG_ENTRIES_PAGE_TYPE,
} from './db'
import type {
  TransferV0,
  AccountV0,
  WalletV0,
  CreditorV0,
  PinInfoV0,
  AccountDisplayV0,
  AccountConfigV0,
  AccountKnowledgeV0,
  AccountExchangeV0,
  AccountInfoV0,
  AccountLedgerV0,
  CommittedTransferV0,
  LogEntriesPageV0,
} from './db'

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

export function parseCreditor(response: HttpResponse<Creditor>): CreditorV0 {
  const data = response.data
  assert(CREDITOR_TYPE.test(data.type ?? 'Creditor'))
  return {
    ...data,
    type: 'Creditor',
    wallet: { uri: response.buildUri(data.wallet.uri) }
  }
}

export function parsePinInfo(response: HttpResponse<PinInfo>): PinInfoV0 {
  const data = response.data
  assert(PIN_INFO_TYPE.test(data.type ?? 'PinInfo'))
  return {
    ...data,
    type: 'PinInfo',
    wallet: { uri: response.buildUri(data.wallet.uri) }
  }
}

export function parseAccount(response: HttpResponse<Account>): AccountV0 {
  const data = response.data
  assert(ACCOUNT_TYPE.test(data.type))
  return {
    ...data,
    type: 'Account',
    config: parseAccountConfig(data.config, response.url),
    exchange: parseAccountExchange(data.exchange, response.url),
    knowledge: parseAccountKnowledge(data.knowledge, response.url),
    display: parseAccountDisplay(data.display, response.url),
    info: parseAccountInfo(data.info, response.url),
    ledger: parseAccountLedger(data.ledger, response.url),
  }
}

export function parseAccountDisplay(data: AccountDisplay, baseUri: string): AccountDisplayV0 {
  assert(ACCOUNT_DISPLAY_TYPE.test(data.type ?? 'AccountDisplay'))
  return {
    ...data,
    type: 'AccountDisplay',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href }
  }
}

export function parseAccountConfig(data: AccountConfig, baseUri: string): AccountConfigV0 {
  assert(ACCOUNT_CONFIG_TYPE.test(data.type ?? 'AccountConfig'))
  return {
    ...data,
    type: 'AccountConfig',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href }
  }
}

export function parseAccountExchange(data: AccountExchange, baseUri: string): AccountExchangeV0 {
  assert(ACCOUNT_EXCHANGE_TYPE.test(data.type ?? 'AccountExchange'))
  return {
    ...data,
    type: 'AccountExchange',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href }
  }
}

export function parseAccountKnowledge(data: AccountKnowledge, baseUri: string): AccountKnowledgeV0 {
  assert(ACCOUNT_KNOWLEDGE_TYPE.test(data.type ?? 'AccountKnowledge'))
  return {
    ...data,
    type: 'AccountKnowledge',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href }
  }
}

export function parseAccountInfo(data: AccountInfo, baseUri: string): AccountInfoV0 {
  assert(ACCOUNT_INFO_TYPE.test(data.type))
  return {
    ...data,
    type: 'AccountInfo',
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href }
  }
}

export function parseAccountLedger(data: AccountLedger, baseUri: string): AccountLedgerV0 {
  assert(ACCOUNT_LEDGER_TYPE.test(data.type))
  assert(LEDGER_ENTRIES_LIST_TYPE.test(data.entries.type))
  assert(LEDGER_ENTRY_TYPE.test(data.entries.itemsType))
  return {
    ...data,
    type: 'AccountLedger',
    entries: {
      ...data.entries,
      type: 'PaginatedList',
      itemsType: 'LedgerEntry',
    },
    uri: new URL(data.uri, baseUri).href,
    account: { uri: new URL(data.account.uri, baseUri).href }
  }
}

export function parseTransfer(response: HttpResponse<Transfer>): TransferV0 {
  const data = response.data
  assert(TRANSFER_TYPE.test(data.type))
  assert(TRANSFER_OPTIONS_TYPE.test(data.options.type ?? 'TransferOptions'))
  assert(TRANSFER_RESULT_TYPE.test(data.result?.type ?? 'TransferResult'))
  assert(TRANSFER_ERROR_TYPE.test(data.result?.error?.type ?? 'TransferError'))
  return {
    ...data,
    type: 'Transfer',
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

export function parseCommittedTransfer(response: HttpResponse<CommittedTransfer>): CommittedTransferV0 {
  const data = response.data
  assert(COMMITTED_TRANSFER_TYPE.test(data.type))
  return {
    ...data,
    type: 'CommittedTransfer',
    account: { uri: response.buildUri(data.account.uri) },
  }
}

export function parseWallet(response: HttpResponse<Wallet>): WalletV0 {
  const data = response.data
  assert(WALLET_TYPE.test(data.type))
  assert(PAGINATED_STREAM_TYPE.test(data.log.type))
  assert(LOG_ENTRY_TYPE.test(data.log.itemsType))
  return {
    ...data,
    type: 'Wallet',
    log: {
      ...data.log,
      type: 'PaginatedStream',
      itemsType: 'LogEntry',
    },
  }
}

export function parseLogEntriesPage(response: HttpResponse<LogEntriesPage>): LogEntriesPageV0 {
  const data = response.data
  assert(LOG_ENTRIES_PAGE_TYPE.test(data.type))
  assert(data.next !== undefined || data.forthcoming !== undefined)
  assert(data.items.every(item => LOG_ENTRY_TYPE.test(item.type)))
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

export function parseLogObject(response: HttpResponse<any>): LogObject {
  const data = response.data
  const objectType = String(data.type)
  switch (true) {
    case (ACCOUNT_TYPE.test(objectType)):
      return parseAccount(response)
    case (ACCOUNT_DISPLAY_TYPE.test(objectType)):
      return parseAccountDisplay(response.data, response.url)
    case (ACCOUNT_CONFIG_TYPE.test(objectType)):
      return parseAccountConfig(response.data, response.url)
    case (ACCOUNT_KNOWLEDGE_TYPE.test(objectType)):
      return parseAccountKnowledge(response.data, response.url)
    case (ACCOUNT_EXCHANGE_TYPE.test(objectType)):
      return parseAccountExchange(response.data, response.url)
    case (ACCOUNT_LEDGER_TYPE.test(objectType)):
      return parseAccountLedger(response.data, response.url)
    case (ACCOUNT_INFO_TYPE.test(objectType)):
      return parseAccountInfo(response.data, response.url)
    case (CREDITOR_TYPE.test(objectType)):
      return parseCreditor(response)
    case (PIN_INFO_TYPE.test(objectType)):
      return parsePinInfo(response)
    case (TRANSFER_TYPE.test(objectType)):
      return parseTransfer(response)
    case (COMMITTED_TRANSFER_TYPE.test(objectType)):
      return parseCommittedTransfer(response)
    default:
      throw new Error('unknown object type')
  }
}
