import { UpdateScheduler } from '../src/update-scheduler'

test("Create update scheduler", async () => {
  let run = 0
  let callbacks = 0
  const sch: any = new UpdateScheduler(async () => run++)
  await sch.updatePromise
  expect(sch.updatePromise).toBeUndefined()
  expect(run).toBe(1)
  expect(callbacks).toBe(0);
  sch.schedule(100, () => callbacks++)
  sch.schedule(101, () => callbacks++)
  sch.schedule(99)
  await sch.updatePromise
  expect(sch.updatePromise).toBeUndefined()
  expect(run).toBe(1);
  expect(callbacks).toBe(0);
  sch.checkTasks(Date.now() + 200 * 1000)
  await sch.updatePromise
  expect(sch.updatePromise).toBeUndefined()
  expect(run).toBe(2)
  expect(callbacks).toBe(2);
  sch.schedule(() => callbacks++)
  await sch.updatePromise
  expect(sch.updatePromise).toBeUndefined()
  expect(run).toBe(3)
  expect(callbacks).toBe(3)
  expect(sch.tasks.peek()).toBeDefined()
  sch.close()
  sch.close()
})
