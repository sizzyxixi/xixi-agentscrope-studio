import type { CollectionTask } from './collection-service';

export type LinkCollectionFailure = { input: string; inputLine?: number; code: string; message: string };

/** Failed inputs are collection attempts, not product records. */
export function linkCollectionResults(task: CollectionTask) {
  const failures: LinkCollectionFailure[] = task.results.filter(row => row.status === '失败').map(row => ({
    input: row.input, inputLine: row.inputLine, code: row.code, message: row.message,
  }));
  const success = task.results.filter(row => row.status === '成功').length;
  return { total: task.results.length, success, failed: failures.length, failures };
}
