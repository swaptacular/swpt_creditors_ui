import type { WalletRecordWithId, DocumentRecord } from './schema'
import { db } from './schema'

export class UserDoesNotExist extends Error {
  name = 'UserDoesNotExist'
}

export async function clearAllTables(): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) {
      await table.clear()
    }
  })
}

export async function isInstalledUser(userId: number): Promise<boolean> {
  return await db.wallets.where({ userId }).count() === 1
}

export async function uninstallUser(userId: number): Promise<void> {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) {
      if (table !== db.documents) {
        await table.where({ userId }).delete()
      }
    }
  })
}

export async function getUserId(walletUri: string): Promise<number | undefined> {
  return (await db.wallets.where({ uri: walletUri }).primaryKeys())[0]
}

export async function getWalletRecord(userId: number): Promise<WalletRecordWithId> {
  const walletRecord = await db.wallets.get(userId)
  if (!walletRecord) {
    throw new UserDoesNotExist()
  }
  return walletRecord as WalletRecordWithId
}

export async function updateWalletRecord(walletRecord: WalletRecordWithId): Promise<void> {
  const updated = await db.wallets
    .where({ userId: walletRecord.userId })
    .modify(function(this: any) {
      this.value = walletRecord
    })
  if (updated === 0) {
    throw new UserDoesNotExist()
  }
  assert(updated === 1)
}

export async function getDocumentRecord(uri: string): Promise<DocumentRecord | undefined> {
  return await db.documents.get(uri)
}
