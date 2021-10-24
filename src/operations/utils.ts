import type { ServerSession, HttpResponse, PaginatedList, Transfer } from './server'
import type { AccountLedgerRecord } from './db'
import type { TransferV0, LedgerEntryV0 } from './canonical-objects'

import { HttpError } from './server'
import {
  makeLedgerEntry, makeObjectReference, makeTransfersList, makeAccountsList, makeTransfer
} from './canonical-objects'

export function calcParallelTimeout(numberOfParallelRequests: number): number {
  const n = 6  // a rough guess for the maximum number of parallel connections
  return appConfig.serverApiTimeout * (numberOfParallelRequests + n - 1) / n
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
  const results = await Promise.allSettled(
    uris.map(uri => server.get(uri, { timeout }) as Promise<HttpResponse<Transfer>>)
  )
  const rejected = results.filter(x => x.status === 'rejected') as PromiseRejectedResult[]
  const errors = rejected.map(x => x.reason)
  for (const e of errors) {
    if (e instanceof HttpError && e.status === 404) { /* ingnore */ }
    else throw e
  }
  const fulfilled = results.filter(x => x.status === 'fulfilled') as PromiseFulfilledResult<HttpResponse<Transfer>>[]
  const responses = fulfilled.map(x => x.value)
  return responses.map(response => makeTransfer(response))
}

export async function fetchNewLedgerEntries(
  server: ServerSession,
  accountLedgerRecord: AccountLedgerRecord,
  latestEntryId: bigint,
): Promise<LedgerEntryV0[]> {
  let newLedgerEntries: LedgerEntryV0[] = []
  let iteratedId = accountLedgerRecord.nextEntryId

  // NOTE: The entries are iterated in reverse-chronological order
  // (bigger entryIds go first).
  if (latestEntryId + 1n < iteratedId) {
    const first = new URL(accountLedgerRecord.entries.first)
    first.searchParams.append('stop', String(latestEntryId))
    for await (const entry of iterLedgerEntries(server, first.href)) {
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
  }
  return newLedgerEntries
}

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

const iterLedgerEntries = (
  server: ServerSession,
  firstPageUri: string,
) => iterPages(server, firstPageUri, makeLedgerEntry)

async function* iterPages<OriginalItem, TransformedItem>(
  server: ServerSession,
  next: string,
  transformItem: (item: OriginalItem, pageUrl: string) => TransformedItem,
): AsyncIterable<TransformedItem> {
  do {
    const pageResponse = await server.get(next) as HttpResponse<Page<OriginalItem>>
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
