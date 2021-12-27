import type { DocumentRecord } from './db'
import type { ServerSession, HttpResponse, PaginatedList, Transfer } from './server'
import type { TransferV0, LedgerEntryV0, AccountLedgerV0 } from './canonical-objects'
import { HttpError } from './server'
import {
  makeLedgerEntry, makeObjectReference, makeTransfersList, makeAccountsList, makeTransfer
} from './canonical-objects'
import { getDocumentRecord } from './db'


export const MAX_INT64 = (1n << 63n) - 1n

export class InvalidCoinUri extends Error {
  name = 'InvalidCoinUri'
}

export class DocumentFetchError extends Error {
  name = 'DocumentFetchError'
}

export function calcParallelTimeout(numberOfParallelRequests: number): number {
  const n = 6  // a rough guess for the maximum number of parallel connections
  return appConfig.serverApiTimeout * (numberOfParallelRequests + n - 1) / n
}

export async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number }) {
  const { timeout } = options;

  if (timeout === undefined) {
    return await fetch(resource, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  return response;
}

export const iterAccountsList = (
  server: ServerSession,
  accountsListUri: string,
) => iterPaginatedList(server, accountsListUri, makeAccountsList, makeObjectReference)

export const iterTransfersList = (
  server: ServerSession,
  transfersListUri: string,
) => iterPaginatedList(server, transfersListUri, makeTransfersList, makeObjectReference)

export async function fetchTransfers(server: ServerSession, uris: string[]): Promise<TransferV0[]> {
  const timeout = calcParallelTimeout(uris.length)
  const responsePromises = uris.map(uri => server.get(uri, { timeout }) as Promise<HttpResponse<Transfer>>)
  const responses = await settleAndIgnore404(responsePromises)
  return responses.map(response => makeTransfer(response))
}

export async function settleAndIgnore404<T>(responsePromises: Promise<HttpResponse<T>>[]): Promise<HttpResponse<T>[]> {
  const results = await Promise.allSettled(responsePromises)
  const rejected = results.filter(x => x.status === 'rejected') as PromiseRejectedResult[]
  const errors = rejected.map(x => x.reason)
  for (const e of errors) {
    if (e instanceof HttpError && e.status === 404) { /* ingnore */ }
    else throw e
  }
  const fulfilled = results.filter(x => x.status === 'fulfilled') as PromiseFulfilledResult<HttpResponse<T>>[]
  const responses = fulfilled.map(x => x.value)
  return responses
}

export async function fetchNewLedgerEntries(
  server: ServerSession,
  accountLedger: AccountLedgerV0,
  latestEntryId: bigint,
  timeout: number,
): Promise<LedgerEntryV0[]> {
  let newLedgerEntries: LedgerEntryV0[] = []
  let iteratedId = accountLedger.nextEntryId

  // NOTE: The entries are iterated in reverse-chronological order
  // (bigger entryIds go first).
  if (latestEntryId + 1n < iteratedId) {
    const first = new URL(accountLedger.entries.first)
    first.searchParams.append('stop', String(latestEntryId))
    try {
      for await (const entry of iterLedgerEntries(server, first.href, timeout)) {
        const { entryId } = entry
        assert(entryId < iteratedId)
        if (iteratedId - entryId !== 1n) {
          break  // There are missing entries.
        }
        if (entryId <= latestEntryId) {
          break  // This is an already known entry.
        }
        newLedgerEntries.push(entry)
        iteratedId = entryId
      }
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 404) { /* The account seems to have been deleted. */ }
      else throw e
    }
  }
  return newLedgerEntries
}

export function buffer2hex(buffer: ArrayBuffer, options = { toUpperCase: true }) {
  const bytes = [...new Uint8Array(buffer)]
  const hex = bytes.map(n => n.toString(16).padStart(2, '0')).join('')
  return options.toUpperCase ? hex.toUpperCase() : hex
}

export async function calcSha256(buffer: ArrayBuffer): Promise<string> {
  return buffer2hex(await crypto.subtle.digest('SHA-256', buffer))
}

export async function fetchDebtorInfoDocument(
  documentUri: string,
  timeout: number = appConfig.serverApiTimeout,
): Promise<DocumentRecord> {
  let document = await getDocumentRecord(documentUri)
  if (!document) {
    let response, content
    try {
      response = await fetchWithTimeout(documentUri, { timeout })
      if (!response.ok) throw new Error()
      content = await response.arrayBuffer()
    } catch {
      throw new DocumentFetchError()
    }
    document = {
      content,
      contentType: response.headers.get('Content-Type') ?? 'text/plain',
      sha256: await calcSha256(content),
      uri: response.url,
    }
  }
  return document
}

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

const iterLedgerEntries = (
  server: ServerSession,
  firstPageUri: string,
  timeout: number,
) => iterPages(server, firstPageUri, makeLedgerEntry, timeout)

async function* iterPages<OriginalItem, TransformedItem>(
  server: ServerSession,
  next: string,
  transformItem: (item: OriginalItem, pageUrl: string) => TransformedItem,
  timeout?: number,
): AsyncIterable<TransformedItem> {
  do {
    const pageResponse = await server.get(next, { timeout }) as HttpResponse<Page<OriginalItem>>
    const pageUrl = pageResponse.url
    const data = pageResponse.data
    assert(data.next === undefined || typeof data.next === 'string')
    assert(data.items instanceof Array)

    for (const item of data.items) {
      yield transformItem(item, pageUrl)
    }
    next = data.next !== undefined ? pageResponse.buildUri(data.next) : ''
  } while (next)
}

async function* iterPaginatedList<OriginalItem, TransformedItem>(
  server: ServerSession,
  listUri: string,
  makeList: (response: HttpResponse<PaginatedList>) => PaginatedList,
  transformItem: (item: OriginalItem, pageUrl: string) => TransformedItem,
): AsyncIterable<TransformedItem> {
  const response = await server.get(listUri) as HttpResponse<PaginatedList>
  const list = makeList(response)
  yield* iterPages(server, list.first, transformItem)
}

export function parseCoinUri(coinUri: string): [string, string] {
  let latestDebtorInfoUri, debtorIdentityUri
  try {
    const url = new URL(coinUri)
    const { href, hash } = url
    latestDebtorInfoUri = href.slice(0, href.lastIndexOf(hash))
    debtorIdentityUri = hash.slice(1)
  } catch {
    throw new InvalidCoinUri()
  }
  if (`${latestDebtorInfoUri}#${debtorIdentityUri}` !== coinUri) {
    throw new InvalidCoinUri()
  }
  return [latestDebtorInfoUri, debtorIdentityUri]
}
