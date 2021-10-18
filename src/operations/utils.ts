import type { ServerSession, HttpResponse } from './server'
import type { PaginatedList, ObjectReference } from './server'
import type { TypeMatcher } from './canonical-objects'
import { ACCOUNTS_LIST_TYPE, OBJECT_REFERENCE_TYPE, TRANSFERS_LIST_TYPE } from './canonical-objects'

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

type PageItem<ItemsType> = {
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

async function* iterPaginatedList<T>(
  server: ServerSession,
  listUri: string,
  listTypeMatcher: TypeMatcher,
  itemsTypeMatcher: TypeMatcher,
): AsyncIterable<PageItem<T>> {
  const listResponse = await server.get(listUri) as HttpResponse<PaginatedList>
  const data = listResponse.data
  assert(listTypeMatcher.test(data.type))
  assert(itemsTypeMatcher.test(data.itemsType))
  const first = listResponse.buildUri(data.first)
  yield* iterPage<T>(server, first)
}

async function* iterPage<T>(server: ServerSession, next: string): AsyncIterable<PageItem<T>> {
  do {
    const pageResponse = await server.get(next) as HttpResponse<Page<T>>
    const pageUrl = pageResponse.url
    const data = pageResponse.data
    for (const item of data.items) {
      yield { item, pageUrl }
    }
    next = data.next !== undefined ? pageResponse.buildUri(data.next) : ''
  } while (next)
}
