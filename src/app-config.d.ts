// ../public/config.js makes this globally available.
declare var appConfig: {
  serverApiEntrypoint: string,
  serverApiTimeout: number,
  oauth2: {
    authorizationUrl: string,
    tokenUrl: string,
    clientId: string,
    redirectUrl: string,
  },
  transferDeletionDelaySeconds: number,
  outdatedDebtorInfosRevisionIntervalDays: number,
}

declare function assert(condition: any, msg?: string): asserts condition
