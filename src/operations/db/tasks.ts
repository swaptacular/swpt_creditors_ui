import type { TaskRecordWithId, FetchDebtorInfoTask, DocumentRecord } from './schema'
import { Dexie } from 'dexie'
import { db } from './schema'
import { putDocumentRecord } from './users'
import { postAccountsMapMessage } from './accounts-map'
import { MAX_INT64 } from '../utils'

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

export async function settleFetchDebtorInfoTask(
  task: FetchDebtorInfoTask & TaskRecordWithId,
  debtorInfoDocument?: DocumentRecord,
): Promise<void> {
  let { taskId, backoffSeconds } = task
  if (debtorInfoDocument) {
    await db.transaction('rw', [db.documents, db.tasks], async () => {
      if (await putDocumentRecord(debtorInfoDocument)) {
        postAccountsMapMessage({
          deleted: false,
          object: { ...debtorInfoDocument, type: 'DebtorInfoDocument', latestUpdateId: MAX_INT64 },
        })
      }
      await db.tasks.delete(taskId)
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

const T_15M_SECONDS = 15 * 60
const T_2W__SECONDS = 14 * 24 * 60 * 60
