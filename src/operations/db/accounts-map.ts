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
        this.messageQueue.push(evt.data)
      }
    }
  }

  async init(userId: number): Promise<void> {
    await db.transaction('r', [db.accounts, db.accountObjects, db.documents], async () => {
      for (const obj of await db.accounts.where({ userId }).toArray()) {
        this.addObject(obj)
      }
      for (const obj of await db.accountObjects.where({ userId }).toArray()) {
        this.addObject(obj)
        if ((obj.type === 'AccountKnowledge' || obj.type === 'AccountInfo') && obj.debtorInfo) {
          const documentUri = obj.debtorInfo.iri
          const document = await db.documents.get(documentUri)
          if (document) {
            this.addObject({
              ...document,
              type: 'DebtorInfoDocument',
              latestUpdateId: MAX_INT64,
            })
          }
        }
      }
    })
    this.processMessageQueue()
    this.initialized = true
  }

  private addObject(obj: AddedObject): void {
    this.processMessage({ deleted: false, object: obj })
  }

  private processMessageQueue(): void {
    for (const message of this.messageQueue) {
      this.processMessage(message)
    }
  }

  private processMessage(message: AccountsMapMessage): void {
    if (message.deleted) {
      // Delete the object if it exists.
      const { objectUri, objectType, objectUpdateId } = message
      const existingObject = this.objects.get(objectUri)
      if (existingObject && existingObject.latestUpdateId < objectUpdateId) {
        this.objects.delete(objectUri)
        if (objectType === 'Account') {
          assert(existingObject.type === objectType)
          this.accounts.delete(existingObject.debtor.uri)
        }
      }
    } else {
      // Create or update the object.
      const obj = message.object
      const existingObject = this.objects.get(obj.uri)
      if (!existingObject || existingObject.latestUpdateId < obj.latestUpdateId) {
        this.objects.set(obj.uri, obj)
        if (obj.type === 'Account') {
          const existingUri = this.accounts.get(obj.debtor.uri)
          assert(!existingUri || existingUri === obj.uri)
          this.accounts.set(obj.debtor.uri, obj.uri)
        }
      }
    }
  }
}
