import type { AccountRecord, AccountObjectRecord, DocumentRecord } from './schema'
import { db } from './schema'
import { MAX_INT64 } from '../utils'

/* This channel is used to publish all changes to account and account
 * sub-object records. The message contains an [objectUri, objectType,
 * objectRecord] tuple.
 */
const accountsMapChannel = new BroadcastChannel('creditors.accountsMap')

export type DebtorInfoDocument = DocumentRecord & { type: 'DebtorInfoDocument', latestUpdateId: bigint }
export type AddedObject = AccountRecord | AccountObjectRecord | DebtorInfoDocument
export type DeletedObjectType = AccountRecord['type'] | AccountObjectRecord['type'] | 'DebtorInfoDocument'

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
  private objects = new Map<string, AddedObject>()
  private accounts = new Map<string, string>()
  private messageQueue = new Array<AccountsMapMessage>()
  private initialized = false

  constructor() {
    accountsMapChannel.onmessage = (evt: MessageEvent<AccountsMapMessage>) => {
      if (this.initialized) {
        this.processMessage(evt.data)
      } else {
        // Until the instance gets initialized, the received messages
        // are stored in `this.messageQueue`. They will be processed
        // after the instance have been successfully initialized.
        this.messageQueue.push(evt.data)
      }
    }
  }

  async init(userId: number): Promise<void> {
    await db.transaction('r', [db.accounts, db.accountObjects, db.documents], async () => {
      for (const obj of await db.accounts.where({ userId }).toArray()) {
        this.processObjectAddition(obj)
      }
      for (const obj of await db.accountObjects.where({ userId }).toArray()) {
        this.processObjectAddition(obj)
        if ((obj.type === 'AccountKnowledge' || obj.type === 'AccountInfo') && obj.debtorInfo) {
          const documentUri = obj.debtorInfo.iri
          const document = await db.documents.get(documentUri)
          if (document) {
            this.processObjectAddition({
              ...document,
              type: 'DebtorInfoDocument',
              latestUpdateId: MAX_INT64,
            })
          }
        }
      }
    })
    this.initialized = true
    this.processMessageQueue()
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
        // Delete the account from the accounts list.
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
        // Add the account to accounts list. Note that here we make
        // sure that every account points to an unique debtor URI.
        const accountUri = this.accounts.get(obj.debtor.uri)
        assert(!accountUri || accountUri === obj.uri)
        this.accounts.set(obj.debtor.uri, obj.uri)
      }
    }
  }
}
