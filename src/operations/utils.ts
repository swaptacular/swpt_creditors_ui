import type { ServerSession, HttpResponse } from './server'
import type { PaginatedList, LedgerEntry, ObjectReference } from './server'
import type { TypeMatcher } from './canonical-objects'
import {
  OBJECT_REFERENCE_TYPE,
  LEDGER_ENTRY_TYPE,
  ACCOUNTS_LIST_TYPE,
  TRANSFERS_LIST_TYPE,
  PAGINATED_LIST_TYPE,
  createTypeValidationFunction,
  matchType,
  WrongObjectType,
} from './canonical-objects'


type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

export type PageItem<ItemsType> = {
  item: ItemsType,
  pageUrl: string,
}

export function calcParallelTimeout(numberOfParallelRequests: number): number {
  const n = 6  // a rough guess for the maximum number of parallel connections
  return appConfig.serverApiTimeout * (numberOfParallelRequests + n - 1) / n
}

export const iterAccountsList = (server: ServerSession, accountsListUri: string) => iterPaginatedList<ObjectReference>(
  server,
  accountsListUri,
  ACCOUNTS_LIST_TYPE,
  OBJECT_REFERENCE_TYPE,
)

export const iterTransfersList = (server: ServerSession, transfersListUri: string) => iterPaginatedList<ObjectReference>(
  server,
  transfersListUri,
  TRANSFERS_LIST_TYPE,
  OBJECT_REFERENCE_TYPE,
)

export const iterLedgerEntriesList = (server: ServerSession, entriesListUri: string) => iterPaginatedList<LedgerEntry>(
  server,
  entriesListUri,
  PAGINATED_LIST_TYPE,
  LEDGER_ENTRY_TYPE,
)

export async function* iterPages<T>(server: ServerSession, next: string, itemsType: string): AsyncIterable<PageItem<T>> {
  const isValidType = createTypeValidationFunction(itemsType)
  do {
    const pageResponse = await server.get(next) as HttpResponse<Page<T>>
    const pageUrl = pageResponse.url
    const data = pageResponse.data
    assert(data.next === undefined || typeof data.next === 'string')
    assert(data.items instanceof Array)

    for (const item of data.items) {
      if (!isValidType(item)) {
        throw new WrongObjectType()
      }
      yield { item, pageUrl }
    }
    next = data.next !== undefined ? pageResponse.buildUri(data.next) : ''
  } while (next)
}

async function* iterPaginatedList<T>(
  server: ServerSession,
  listUri: string,
  listTypeMatcher: TypeMatcher,
  itemsTypeMatcher: TypeMatcher,
): AsyncIterable<PageItem<T>> {
  const listResponse = await server.get(listUri) as HttpResponse<PaginatedList>
  const data = listResponse.data
  matchType(listTypeMatcher, data.type)
  matchType(itemsTypeMatcher, data.itemsType)
  const first = listResponse.buildUri(data.first)
  yield* iterPages<T>(server, first, data.itemsType)
}
