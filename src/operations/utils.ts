import type { ServerSession, HttpResponse, PaginatedList } from './server'
import {
  makeLedgerEntry, makeObjectReference, makeTransfersList, makeAccountsList,
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

export const iterLedgerEntries = (
  server: ServerSession,
  firstPageUri: string,
) => iterPages(server, firstPageUri, makeLedgerEntry)

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

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
