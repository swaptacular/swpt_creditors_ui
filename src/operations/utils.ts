import type { ServerSession, HttpResponse } from './server'
import type { PaginatedList } from './server'
import type { TypeMatcher } from './canonical-objects'
import {
  OBJECT_REFERENCE_TYPE,
  ACCOUNTS_LIST_TYPE,
  TRANSFERS_LIST_TYPE,
  makeLedgerEntry,
  matchType,
  makeObjectReference,
} from './canonical-objects'


type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

export function calcParallelTimeout(numberOfParallelRequests: number): number {
  const n = 6  // a rough guess for the maximum number of parallel connections
  return appConfig.serverApiTimeout * (numberOfParallelRequests + n - 1) / n
}

export const iterAccountsList = (
  server: ServerSession,
  accountsListUri: string,
) => iterPaginatedList(
  server,
  accountsListUri,
  ACCOUNTS_LIST_TYPE,
  OBJECT_REFERENCE_TYPE,
  makeObjectReference,
)

export const iterTransfersList = (
  server: ServerSession,
  transfersListUri: string,
) => iterPaginatedList(
  server,
  transfersListUri,
  TRANSFERS_LIST_TYPE,
  OBJECT_REFERENCE_TYPE,
  makeObjectReference,
)

export const iterLedgerEntries = (
  server: ServerSession,
  firstPageUri: string,
) => iterPages(
  server,
  firstPageUri,
  makeLedgerEntry,
)

export async function* iterPages<OriginalItem, TransformedItem>(
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
  listTypeMatcher: TypeMatcher,
  itemsTypeMatcher: TypeMatcher,
  transformItem: (item: OriginalItem, pageUrl: string) => TransformedItem,
): AsyncIterable<TransformedItem> {
  const listResponse = await server.get(listUri) as HttpResponse<PaginatedList>
  const data = listResponse.data
  matchType(listTypeMatcher, data.type)
  matchType(itemsTypeMatcher, data.itemsType)
  const first = listResponse.buildUri(data.first)
  yield* iterPages(server, first, transformItem)
}
