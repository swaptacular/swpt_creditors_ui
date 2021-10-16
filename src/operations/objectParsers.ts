import type { HttpResponse } from './server'
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

export type ParsedObject =
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
  return { ...data, type: 'Creditor' }
}

export function parsePinInfo(response: HttpResponse<PinInfo>): PinInfoV0 {
  const data = response.data
  assert(PIN_INFO_TYPE.test(data.type ?? 'PinInfo'))
  return { ...data, type: 'PinInfo' }
}

export function parseAccount(response: HttpResponse<Account>): AccountV0 {
  const data = response.data
  assert(ACCOUNT_TYPE.test(data.type))
  assert(ACCOUNT_CONFIG_TYPE.test(data.config.type ?? 'AccountConfig'))
  assert(ACCOUNT_EXCHANGE_TYPE.test(data.exchange.type ?? 'AccountExchange'))
  assert(ACCOUNT_KNOWLEDGE_TYPE.test(data.knowledge.type ?? 'AccountKnowledge'))
  assert(ACCOUNT_DISPLAY_TYPE.test(data.display.type ?? 'AccountDisplay'))
  assert(ACCOUNT_INFO_TYPE.test(data.info.type))
  assert(ACCOUNT_LEDGER_TYPE.test(data.ledger.type))
  assert(LEDGER_ENTRIES_LIST_TYPE.test(data.ledger.entries.type))
  assert(LEDGER_ENTRY_TYPE.test(data.ledger.entries.itemsType))
  return {
    ...data,
    type: 'Account',
    config: { ...data.config, type: 'AccountConfig' },
    exchange: { ...data.exchange, type: 'AccountExchange' },
    knowledge: { ...data.knowledge, type: 'AccountKnowledge' },
    display: { ...data.display, type: 'AccountDisplay' },
    info: { ...data.info, type: 'AccountInfo' },
    ledger: {
      ...data.ledger,
      type: 'AccountLedger',
      entries: {
        ...data.ledger.entries,
        type: 'PaginatedList',
        itemsType: 'LedgerEntry',
      },
    },
  }
}

export function parseAccountDisplay(response: HttpResponse<AccountDisplay>): AccountDisplayV0 {
  const data = response.data
  assert(ACCOUNT_DISPLAY_TYPE.test(data.type ?? 'AccountDisplay'))
  return { ...data, type: 'AccountDisplay' }
}

export function parseAccountConfig(response: HttpResponse<AccountConfig>): AccountConfigV0 {
  const data = response.data
  assert(ACCOUNT_CONFIG_TYPE.test(data.type ?? 'AccountConfig'))
  return { ...data, type: 'AccountConfig' }
}

export function parseAccountExchange(response: HttpResponse<AccountExchange>): AccountExchangeV0 {
  const data = response.data
  assert(ACCOUNT_EXCHANGE_TYPE.test(data.type ?? 'AccountExchange'))
  return { ...data, type: 'AccountExchange' }
}

export function parseAccountKnowledge(response: HttpResponse<AccountKnowledge>): AccountKnowledgeV0 {
  const data = response.data
  assert(ACCOUNT_KNOWLEDGE_TYPE.test(data.type ?? 'AccountKnowledge'))
  return { ...data, type: 'AccountKnowledge' }
}

export function parseAccountInfo(response: HttpResponse<AccountInfo>): AccountInfoV0 {
  const data = response.data
  assert(ACCOUNT_INFO_TYPE.test(data.type))
  return { ...data, type: 'AccountInfo' }
}

export function parseAccountLedger(response: HttpResponse<AccountLedger>): AccountLedgerV0 {
  const data = response.data
  assert(ACCOUNT_LEDGER_TYPE.test(data.type))
  assert(LEDGER_ENTRIES_LIST_TYPE.test(data.entries.type))
  return {
    ...data,
    type: 'AccountLedger',
    entries: {
      ...data.entries,
      type: 'PaginatedList',
      itemsType: 'LedgerEntry',
    },
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
  return { ...data, type: 'CommittedTransfer' }
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

export function parseObject(response: HttpResponse<any>): ParsedObject {
  const data = response.data
  const objectType = String(data.type)
  switch (true) {
    case (ACCOUNT_TYPE.test(objectType)):
      return parseAccount(response)
    case (ACCOUNT_DISPLAY_TYPE.test(objectType)):
      return parseAccountDisplay(response)
    case (ACCOUNT_CONFIG_TYPE.test(objectType)):
      return parseAccountConfig(response)
    case (ACCOUNT_KNOWLEDGE_TYPE.test(objectType)):
      return parseAccountKnowledge(response)
    case (ACCOUNT_EXCHANGE_TYPE.test(objectType)):
      return parseAccountExchange(response)
    case (ACCOUNT_LEDGER_TYPE.test(objectType)):
      return parseAccountLedger(response)
    case (ACCOUNT_INFO_TYPE.test(objectType)):
      return parseAccountInfo(response)
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
