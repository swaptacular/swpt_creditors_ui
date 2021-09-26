import TinyQueue from 'tinyqueue'

const SCHEDULER_LEEWAY = 0.5
// For example, when `SCHEDULER_LEEWAY` is 0.5, and an update is
// scheduled one hour from now, the update will actually happen
// between one and one and a half hours from now.

const SCHEDULER_CHECK_INTERVAL_SECONDS = 5
const ROUTINE_UPDATES_INTERVAL_SECONDS = 3600

export type TaskCallback = () => void
type Task = {
  callback?: TaskCallback,
  notBefore: Date,
  notAfter: Date,
}

const cmpTasks = (a: Task, b: Task): number => a.notBefore.getTime() - b.notBefore.getTime()
const cmpReadyTasks = (a: Task, b: Task): number => a.notAfter.getTime() - b.notAfter.getTime()

export class UpdateScheduler {
  private tasks = new TinyQueue<Task>([], cmpTasks)
  private readyTasks = new TinyQueue<Task>([], cmpReadyTasks)
  private intervalId = setInterval(this.checkTasks.bind(this), 1000 * SCHEDULER_CHECK_INTERVAL_SECONDS)
  private updatePromise?: Promise<unknown>
  latestUpdateAt = new Date(0)

  constructor(private performUpdate: () => Promise<unknown>) {
    this.schedule(this.routineUpdateCallback.bind(this))
  }

  schedule(callback?: TaskCallback): void
  schedule(date: Date, callback?: TaskCallback): void
  schedule(seconds: number, callback?: TaskCallback): void
  schedule(param1: TaskCallback | Date | number = 0, param2?: TaskCallback): void {
    const now = Date.now()
    let callback, t
    if (typeof param1 === 'function') {
      callback = param1
      t = now
    } else {
      callback = param2
      t = Math.max(now, typeof param1 === 'number' ? now + 1000 * param1 : param1.getTime())
    }
    this.tasks.push({
      callback,
      notBefore: new Date(t),
      notAfter: new Date(t + SCHEDULER_LEEWAY * (t - now)),
    })
    this.checkTasks()
  }

  close(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId)
      this.intervalId = this.tasks = this.readyTasks = undefined as any
    }
  }

  private checkTasks(now = Date.now()): void {
    if (this.tasks) {
      this.gatherReadyTasks(now)
      if (this.findLateTask(now)) {
        const tasks = this.flushReadyTasks()
        this.triggerUpdate(tasks, now)
      }
    }
  }

  private triggerUpdate(tasks: TinyQueue<Task>, now: number): void {
    if (!this.updatePromise) {
      this.latestUpdateAt = new Date(now)
      this.updatePromise = this.performUpdate()
      this.updatePromise.catch((error) => console.error(error))
      this.updatePromise.finally(() => this.updatePromise = undefined)
    }
    this.updatePromise.finally(() => {
      let task
      while ((task = tasks.pop()) !== undefined) {
        task.callback?.()
      }
    })
  }

  private flushReadyTasks(): TinyQueue<Task> {
    const readyTasks = this.readyTasks
    this.readyTasks = new TinyQueue<Task>([], cmpReadyTasks)
    return readyTasks
  }

  private gatherReadyTasks(now: number): void {
    let task
    while ((task = this.tasks.peek()) !== undefined) {
      if (now < task.notBefore.getTime()) {
        // This task is not ready, and therefore all subsequent tasks
        // in the queue will not be ready too.
        break
      }
      this.tasks.pop()
      this.readyTasks.push(task)
    }
  }

  private findLateTask(now: number): boolean {
    const task = this.readyTasks.peek()
    return Boolean(task && task.notAfter.getTime() <= now)
  }

  private routineUpdateCallback(): void {
    this.schedule(ROUTINE_UPDATES_INTERVAL_SECONDS, this.routineUpdateCallback.bind(this))
  }
}
