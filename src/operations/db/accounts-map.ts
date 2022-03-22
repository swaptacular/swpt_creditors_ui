import type { BaseDebtorData, PegDisplay, Peg } from '../../debtor-info'
import type {
  AccountRecord, AccountObjectRecord, AccountExchangeRecord, AccountDisplayRecord, AccountLedgerRecord,
  AccountKnowledgeRecord, AccountInfoRecord, AccountConfigRecord
} from './schema'

import { getBaseDebtorDataFromAccoutKnowledge } from './common'
import { tryToParseDebtorInfoDocument, matchBaseDebtorData } from '../../debtor-info'
import { db } from './schema'

const MAX_INT64 = (1n << 63n) - 1n

/* This channel is used to publish all changes to account and account
 * sub-object records. The message contains an [objectUri, objectType,
 * objectRecord] tuple.
 */
const accountsMapChannelName = 'creditors.accountsMap'
const accountsMapChannel = new BroadcastChannel(accountsMapChannelName)

export type ParsedDebtorInfoDocument = BaseDebtorData & {
  type: 'ParsedDebtorInfoDocument',
  contentType: string,
  sha256: string,
  uri: string,
  latestUpdateId: bigint,
}
export type AddedObject = AccountRecord | AccountObjectRecord | ParsedDebtorInfoDocument
export type DeletedObjectType = AccountRecord['type'] | AccountObjectRecord['type'] | 'ParsedDebtorInfoDocument'

export type AddedObjectMessage = {
  deleted: false,
  object: AddedObject,
}

export type DeletedObjectMessage = {
  deleted: true,
  objectUri: string,
  objectType: DeletedObjectType,
  objectUpdateId: bigint,
}

export type AccountsMapMessage = AddedObjectMessage | DeletedObjectMessage

export type PegBound = {
  accountUri: string,
  debtorName: string | undefined,
  exchangeRate: number,
  display: PegDisplay,
}

export type AccountFullData = AccountDataForDisplay & {
  account: AccountRecord,
  ledger: AccountLedgerRecord,
  config: AccountConfigRecord,
  info: AccountInfoRecord,
  knowledge: AccountKnowledgeRecord,
  exchange: AccountExchangeRecord,
  debtorData: BaseDebtorData,
  debtorInfoDocument?: ParsedDebtorInfoDocument,
  secureCoin: boolean,
}

export type AccountDataForDisplay = {
  display: AccountDisplayRecord & { debtorName: string },
  amount: bigint,
  pegBounds: PegBound[],
}

type RecursiveSearchNodeData = {
  debtorName: string,
  knownDebtor: boolean,
  latestDebtorInfoUri: string,
  peg?: Peg,
}

export function postAccountsMapMessage(message: AccountsMapMessage): void {
  accountsMapChannel.postMessage(message)
}

/** All instances of this class will be automatically updated when the
 * local database is updated. The idea is to have all the information
 * about user's accounts in memory, so that we can quickly traverse
 * the peg-graph, find an account by name, etc. */
export class AccountsMap {
  private objects = new Map<string, AddedObject>()  // object URI -> object
  private accounts = new Map<string, string>()  // debtor URI -> account URI (the "accounts list")
  private initialized = false
  private channel = new BroadcastChannel(accountsMapChannelName)

  // Until the instance gets initialized, the received messages are
  // stored here. They will be processed after the instance have been
  // successfully initialized.
  private messageQueue = new Array<AccountsMapMessage>()

  constructor() {
    this.channel.onmessage = (evt: MessageEvent<AccountsMapMessage>) => {
      if (this.initialized) {
        this.processMessage(evt.data)
      } else {
        this.messageQueue.push(evt.data)
      }
    }
    this.channel.onmessageerror = (evt: unknown) => {
      console.error('A broadcast channel message error has occured.', evt)
    }
  }

  async init(userId: number): Promise<void> {
    await db.transaction('r', [db.accounts, db.accountObjects, db.documents], async () => {
      for (const obj of await db.accounts.where({ userId }).toArray()) {
        this.processObjectAddition(obj)
      }
      for (const obj of await db.accountObjects.where({ userId }).toArray()) {
        this.processObjectAddition(obj)
        if (obj.type === 'AccountInfo' && obj.debtorInfo) {
          const documentUri = obj.debtorInfo.iri
          const document = await db.documents.get(documentUri)
          if (document) {
            const debtorData = tryToParseDebtorInfoDocument(document)
            if (debtorData) {
              this.processObjectAddition({
                ...debtorData,
                type: 'ParsedDebtorInfoDocument',
                uri: document.uri,
                contentType: document.contentType,
                sha256: document.sha256,
                latestUpdateId: MAX_INT64,
              })
            }
          }
        }
      }
    })
    this.initialized = true
    this.processMessageQueue()
  }

  getObjectByUri(accountUri: string): AddedObject | undefined {
    return this.objects.get(accountUri)
  }

  getAccountUri(debtorIdentityUri: string): string | undefined {
    return this.accounts.get(debtorIdentityUri)
  }

  getAccountRecordsMatchingDebtorName(regex: RegExp): AccountRecord[] {
    let matchingAccountRecords: AccountRecord[] = []
    for (const accountUri of this.getAccountUrisMatchingDebtorName(regex)) {
      const accountRecord = this.getObjectByUri(accountUri)
      if (accountRecord) {
        assert(accountRecord.type === 'Account')
        matchingAccountRecords.push(accountRecord)
      }
    }
    return matchingAccountRecords
  }

  getPeggedAccountExchangeRecords(pegAccountUri: string): AccountExchangeRecord[] {
    let result: AccountExchangeRecord[] = []
    for (const accountUri of this.accounts.values()) {
      const accountRecord = this.getObjectByUri(accountUri)
      assert(accountRecord && accountRecord.type === 'Account')
      const accountExchangeRecord = this.getObjectByUri(accountRecord.exchange.uri)
      if (accountExchangeRecord) {
        assert(accountExchangeRecord.type === 'AccountExchange')
        if (accountExchangeRecord.peg?.account.uri === pegAccountUri) {
          result.push(accountExchangeRecord)
        }
      }
    }
    return result
  }

  getRecursivelyPeggedDebtorNames(pegAccountUri: string): string[] {
    let accountUris: Map<string, RecursiveSearchNodeData | undefined> = new Map([[pegAccountUri, undefined]])
    while (this.addRecursivelyPeggedAccountUris(accountUris));
    const data = [...accountUris.values()].filter(x => x !== undefined) as RecursiveSearchNodeData[]
    return data.map(x => x.debtorName)
  }

  getDebtorNamesSuggestingGivenCoin(pegAccountUri: string, latestDebtorInfoUri: string): string[] {
    const pegNodeData = { debtorName: '', knownDebtor: false, latestDebtorInfoUri }
    let accountUris: Map<string, RecursiveSearchNodeData | undefined> = new Map([[pegAccountUri, pegNodeData]])
    while (this.addRecursivelyPeggedAccountUris(accountUris, true));
    const data = [...accountUris.values()].filter(x => x !== undefined && x.knownDebtor) as RecursiveSearchNodeData[]
    return data.map(x => x.debtorName)
  }

  followPegChain(accountUri: string, stopAt?: string, visited: Set<string> = new Set()): PegBound[] {
    const account = this.getObjectByUri(accountUri)
    if (account) {
      assert(account.type === 'Account')
      const exchange = this.getObjectByUri(account.exchange.uri)
      const display = this.getObjectByUri(account.display.uri)
      if (exchange && display) {
        assert(exchange.type === 'AccountExchange')
        assert(display.type === 'AccountDisplay')
        visited.add(accountUri)
        let bounds: PegBound[] = []
        if (accountUri !== stopAt && exchange.peg && !visited.has(exchange.peg.account.uri)) {
          bounds = this.followPegChain(exchange.peg.account.uri, stopAt, visited)
          for (const bound of bounds) {
            bound.exchangeRate *= exchange.peg.exchangeRate
          }
        }
        const { debtorName, amountDivisor, decimalPlaces, unit } = display
        const identity = {
          accountUri,
          debtorName,
          exchangeRate: 1,
          display: {
            type: 'PegDisplay' as const,
            unit: unit ?? "\u00a4",
            amountDivisor,
            decimalPlaces,
          },
        }
        return [identity, ...bounds]
      }
    }
    return []  // Can not find a proper account corresponding to `accountUri`.
  }

  getAccountsDataForDisplay(): AccountDataForDisplay[] {
    const accountUris = [...this.accounts.values()]
    const accounts = accountUris.map(uri => this.objects.get(uri)).filter(a => a !== undefined) as AccountRecord[]
    assert(accounts.every(x => x.type === 'Account'))
    const displays = accounts.map(x => this.objects.get(x.display.uri)) as (AccountDisplayRecord | undefined)[]
    assert(displays.every(x => x === undefined || x.type === 'AccountDisplay'))
    const ledgers = accounts.map(x => this.objects.get(x.ledger.uri)) as (AccountLedgerRecord | undefined)[]
    assert(ledgers.every(x => x === undefined || x.type === 'AccountLedger'))
    const data: (AccountDataForDisplay | undefined)[] = accounts.map((account, index) => {
      const display = displays[index]
      const ledger = ledgers[index]
      const pegBounds = this.followPegChain(account.uri)
      if (display && display.debtorName !== undefined && ledger && pegBounds.length > 0) {
        return {
          display: display as AccountDataForDisplay['display'],
          pegBounds,
          amount: ledger.principal,
        }
      } else {
        return undefined
      }
    })
    return data.filter(x => x !== undefined) as AccountDataForDisplay[]
  }

  getAccountFullData(accountUri: string): AccountFullData | undefined {
    const account = this.getObjectByUri(accountUri)
    if (account) {
      assert(account.type === 'Account')
      const display = this.getObjectByUri(account.display.uri)
      const ledger = this.getObjectByUri(account.ledger.uri)
      const config = this.getObjectByUri(account.config.uri)
      const info = this.getObjectByUri(account.info.uri)
      const knowledge = this.getObjectByUri(account.knowledge.uri)
      const exchange = this.getObjectByUri(account.exchange.uri)
      if (display && ledger && config && info && knowledge && exchange) {
        assert(display.type === 'AccountDisplay')
        assert(ledger.type === 'AccountLedger')
        assert(config.type === 'AccountConfig')
        assert(info.type === 'AccountInfo')
        assert(knowledge.type === 'AccountKnowledge')
        assert(exchange.type === 'AccountExchange')
        const pegBounds = this.followPegChain(accountUri)
        let debtorInfoDocument: ParsedDebtorInfoDocument | undefined
        if (info.debtorInfo) {
          const { contentType, sha256, iri } = info.debtorInfo
          const obj = this.getObjectByUri(iri)
          if (
            obj &&
            obj.type === 'ParsedDebtorInfoDocument' &&
            obj.contentType === (contentType ?? obj.contentType) &&
            obj.sha256 === (sha256 ?? obj.sha256)
          ) {
            debtorInfoDocument = obj
          }
        }
        const debtorData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
        const secureCoin = (
          display.knownDebtor &&
          debtorInfoDocument !== undefined &&
          matchBaseDebtorData(debtorInfoDocument, debtorData)
        )
        if (display.debtorName !== undefined && pegBounds.length > 0) {
          return {
            account,
            ledger,
            config,
            knowledge,
            info,
            exchange,
            pegBounds,
            debtorInfoDocument,
            debtorData,
            secureCoin,
            display: display as AccountFullData['display'],
            amount: ledger.principal,
          }
        }
      }
    }
    return undefined
  }

  private addRecursivelyPeggedAccountUris(
    accountUris: Map<string, RecursiveSearchNodeData | undefined>,
    matchCoins: boolean = false,
  ): boolean {
    let added = false
    for (const accountUri of this.accounts.values()) {
      if (!accountUris.has(accountUri)) {
        const account = this.getObjectByUri(accountUri)
        assert(account && account.type === 'Account')
        const exchange = this.getObjectByUri(account.exchange.uri)
        const display = this.getObjectByUri(account.display.uri)
        const knowledge = this.getObjectByUri(account.knowledge.uri)
        if (exchange && display && knowledge) {
          assert(exchange.type === 'AccountExchange')
          assert(display.type === 'AccountDisplay')
          assert(knowledge.type === 'AccountKnowledge')
          if (exchange.peg && accountUris.has(exchange.peg.account.uri)) {
            let nodeData
            if (display.debtorName !== undefined) {
              const debtorData = getBaseDebtorDataFromAccoutKnowledge(knowledge)
              nodeData = {
                debtorName: display.debtorName,
                knownDebtor: display.knownDebtor,
                latestDebtorInfoUri: debtorData.latestDebtorInfo.uri,
                peg: debtorData.peg,
              }
            }
            let pegNodeData
            if (
              !matchCoins ||
              (pegNodeData = accountUris.get(exchange.peg.account.uri)) &&
              pegNodeData.latestDebtorInfoUri === nodeData?.peg?.latestDebtorInfo.uri
            ) {
              accountUris.set(accountUri, nodeData)
              added = true
            }
          }
        }
      }
    }
    return added
  }

  private getAccountUrisMatchingDebtorName(regex: RegExp): string[] {
    let matchingAccountUris: string[] = []
    for (const [_, obj] of this.objects) {
      if (obj.type === 'AccountDisplay' && obj.debtorName?.match(regex)) {
        matchingAccountUris.push(obj.account.uri)
      }
    }
    return matchingAccountUris
  }

  private processMessageQueue(): void {
    for (const message of this.messageQueue) {
      this.processMessage(message)
    }
  }

  private processMessage(message: AccountsMapMessage): void {
    if (message.deleted) {
      this.processObjectDeletion(message.objectUri, message.objectType, message.objectUpdateId)
    } else {
      this.processObjectAddition(message.object)
    }
  }

  private processObjectDeletion(objectUri: string, objectType: DeletedObjectType, objectUpdateId: bigint): void {
    const existingObject = this.objects.get(objectUri)
    if (existingObject && existingObject.latestUpdateId < objectUpdateId) {
      this.objects.delete(objectUri)
      if (objectType === 'Account') {
        // Delete the account from the "accounts list".
        assert(existingObject.type === objectType)
        this.accounts.delete(existingObject.debtor.uri)
      }
    }
  }

  private processObjectAddition(obj: AddedObject): void {
    const existingObject = this.objects.get(obj.uri)
    if (!existingObject || existingObject.latestUpdateId < obj.latestUpdateId) {
      this.objects.set(obj.uri, obj)
      if (obj.type === 'Account') {
        // Add the account to the "accounts list". Note that here we
        // also make sure that every account points to an unique
        // debtor URI.
        const accountUri = this.accounts.get(obj.debtor.uri)
        assert(!accountUri || accountUri === obj.uri)
        this.accounts.set(obj.debtor.uri, obj.uri)
      }
    }
  }
}
