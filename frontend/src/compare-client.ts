import type { CompareOperations } from "./compare-service.ts";
import { LocalizedError } from "./i18n-core.ts";
export function createCompareClient() {
  const worker = new Worker(new URL("./compare.worker.ts", import.meta.url), {
    type: "module",
  });
  let sequence = 0,
    failed = false;
  const pending = new Map<
    number,
    { resolve: (value: never) => void; reject: (error: unknown) => void }
  >();
  worker.addEventListener("message", ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error)
      request.reject(new LocalizedError(data.error.code, data.error.params));
    else request.resolve(data.value as never);
  });
  const dispose = () => {
    failed = true;
    for (const request of pending.values())
      request.reject(new LocalizedError("compare.workerError"));
    pending.clear();
    worker.terminate();
  };
  worker.addEventListener("error", dispose);
  worker.addEventListener("messageerror", dispose);
  return {
    call<K extends keyof CompareOperations>(
      operation: K,
      payload: Parameters<CompareOperations[K]>[0],
    ): Promise<Awaited<ReturnType<CompareOperations[K]>>> {
      if (failed)
        return Promise.reject(new LocalizedError("compare.workerError"));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve: resolve as (value: never) => void, reject });
        try {
          worker.postMessage({ id, operation, payload });
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
    },
    dispose,
  };
}
