import type { TaskRecordWithId } from './schema'
import { Dexie } from 'dexie'
import { db } from './schema'

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
