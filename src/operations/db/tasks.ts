import type { TaskRecordWithId, FetchDebtorInfoTask, DocumentRecord } from './schema'
import type { AccountsMap } from './accounts-map'

import { Dexie } from 'dexie'
import { db } from './schema'
import { tryToParseDebtorInfoDocument } from '../../debtor-info'
import { putDocumentRecord, verifyAccountKnowledge, getBaseDebtorDataFromAccoutKnowledge } from './common'
import { postAccountsMapMessage } from './accounts-map'

const MAX_INT64 = (1n << 63n) - 1n

export async function getTasks(userId: number, scheduledFor: Date = new Date(), limit = 1e9): Promise<TaskRecordWithId[]> {
  let collection = db.tasks
    .where('[userId+scheduledFor]')
    .between([userId, Dexie.minKey], [userId, scheduledFor], false, true)
    .limit(limit)
  return await collection.toArray() as TaskRecordWithId[]
}

export async function removeTask(taskId: number): Promise<void> {
  await db.tasks.delete(taskId)
}

export async function reviseOutdatedDebtorInfos(userId: number, accountsMap: AccountsMap): Promise<void> {
  const accountUris = await db.accounts.where({ userId }).primaryKeys()
  for (const accountUri of accountUris) {
    // NOTE: As an optimization here, we do not trigger updates for
    // currencies that do not have any other currencies pegged to
    // them. Such currencies are probably useless, and the user should
    // not be interested in knowing their latest settings.
    if (accountsMap.getRecursivelyPeggedDebtorNames(accountUri).length > 0) {
      await triggerOutdatedDebtorInfoUpdate(accountUri)
    }
  }
}

export async function triggerOutdatedDebtorInfoUpdate(accountUri: string): Promise<void> {
  await db.transaction('rw', [db.accounts, db.accountObjects, db.tasks], async () => {
    const account = await db.accounts.get(accountUri)
    if (!account) return

    const info = await db.accountObjects.get(account.info.uri)
    assert(info && info.type === 'AccountInfo')
    if (info.debtorInfo) return

    const display = await db.accountObjects.get(account.display.uri)
    assert(display && display.type === 'AccountDisplay')
    if (display.debtorName === undefined) return

    const knowledge = await db.accountObjects.get(account.knowledge.uri)
    assert(knowledge && knowledge.type === 'AccountKnowledge')
    const debtorData = getBaseDebtorDataFromAccoutKnowledge(knowledge, false)
    if (debtorData.willNotChangeUntil && new Date(debtorData.willNotChangeUntil) > new Date()) return

    const newIri = debtorData.latestDebtorInfo.uri
    const tasks = await db.tasks
      .where({ accountUri })
      .filter(task => task.taskType === 'FetchDebtorInfo')
      .toArray() as (FetchDebtorInfoTask & TaskRecordWithId)[]
    for (const task of tasks) {
      if (task.forAccountInfo || task.iri === newIri) return
      await db.tasks.delete(task.taskId)
    }
    await db.tasks.add({
      taskType: 'FetchDebtorInfo',
      userId: account.userId,
      iri: newIri,
      scheduledFor: new Date(),
      backoffSeconds: 0,
      forAccountInfo: false,
      accountUri,
    })
  })
}

export async function settleFetchDebtorInfoTask(
  task: FetchDebtorInfoTask & TaskRecordWithId,
  debtorInfoDocument?: DocumentRecord,
): Promise<void> {
  let { taskId, backoffSeconds, accountUri } = task
  if (debtorInfoDocument) {
    await db.transaction('rw', db.allTables, async () => {
      const debtorData = tryToParseDebtorInfoDocument(debtorInfoDocument)
      const saved = await putDocumentRecord(debtorInfoDocument)
      if (saved && debtorData !== undefined) {
        postAccountsMapMessage({
          deleted: false,
          object: {
            ...debtorData,
            type: 'ParsedDebtorInfoDocument',
            uri: debtorInfoDocument.uri,
            contentType: debtorInfoDocument.contentType,
            sha256: debtorInfoDocument.sha256,
            latestUpdateId: MAX_INT64,
          },
        })
      }
      await db.tasks.delete(taskId)
      await verifyAccountKnowledge(accountUri, debtorData)
    })
  } else {
    await db.tasks.where({ taskId }).modify(task => {
      // At the beginning, the back-off time is randomly chosen
      // between 15 and 30 minutes, and it is doubled on every
      // failure. Also, we make sure that the back-off time does not
      // exceed 2-4 weeks. The goal is to randomly spread the
      // continuously failing tasks over an interval of several weeks.
      assert(backoffSeconds >= 0)
      backoffSeconds *= 2
      backoffSeconds = backoffSeconds || T_15M_SECONDS * (1 + Math.random())
      backoffSeconds = Math.min(backoffSeconds, T_2W__SECONDS * (1 + Math.random()))

      assert(task.taskType === 'FetchDebtorInfo')
      task.backoffSeconds = backoffSeconds
      task.scheduledFor = new Date(Date.now() + 1000 * backoffSeconds)
    })
  }
}

export async function putDeleteAccountTask(userId: number, accountUri: string): Promise<number> {
  return await db.transaction('rw', [db.tasks], async () => {
    await db.tasks
      .where({ accountUri })
      .filter(t => t.userId === userId && t.taskType === 'DeleteAccount')
      .delete()
    return await db.tasks.add({
      taskType: 'DeleteAccount',
      scheduledFor: new Date(),
      userId,
      accountUri,
    })
  })
}

const T_15M_SECONDS = 15 * 60
const T_2W__SECONDS = 14 * 24 * 60 * 60
