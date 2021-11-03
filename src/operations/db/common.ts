export type ListQueryOptions = {
  before?: number,
  after?: number,
  limit?: number,
  latestFirst?: boolean,
}

export function getIsoTimeOrNow(isoTime?: string): number {
  const time = isoTime ? new Date(isoTime).getTime() : NaN
  return Number.isFinite(time) ? time : Date.now()
}
