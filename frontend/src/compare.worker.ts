import {
  createCompareService,
  type CompareOperations,
} from "./compare-service.ts";
import { LocalizedError } from "./i18n-core.ts";
const service = createCompareService();
let queue = Promise.resolve();
self.addEventListener("message", ({ data }) => {
  const { id, operation, payload } = data as {
    id: number;
    operation: keyof CompareOperations;
    payload: never;
  };
  queue = queue.then(async () => {
    try {
      self.postMessage({ id, value: await service[operation](payload) });
    } catch (error) {
      self.postMessage({
        id,
        error: {
          code: error instanceof LocalizedError ? error.code : "compare.failed",
          params: error instanceof LocalizedError ? error.params : {},
        },
      });
    }
  });
});
