import type { BaseDebtorData } from '../../debtor-info'
import type { AccountRecord, AccountObjectRecord } from './schema'

import { tryToParseDebtorInfoDocument } from '../../debtor-info'
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

  getAccountUrisMatchingDebtorName(regex: RegExp): string[] {
    let matchingAccountUris: string[] = []
    for (const [_, obj] of this.objects) {
      if (obj.type === 'AccountDisplay' && obj.debtorName?.match(regex)) {
        matchingAccountUris.push(obj.account.uri)
      }
    }
    return matchingAccountUris
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
