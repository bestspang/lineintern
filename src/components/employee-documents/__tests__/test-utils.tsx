import { vi } from "vitest";

/**
 * Phase 1A.2 — Mock factory for the Supabase client used by EmployeeDocumentsTab.
 * Lets tests queue results for `from("employee_documents").select(...)` and for
 * each `functions.invoke(name)` call.
 */
export function createMockSupabase() {
  // Queue of rows returned by the next .select() chain on employee_documents.
  const selectResults: Array<{ data: any; error: any }> = [];
  // Map of function name -> queue of results.
  const invokeQueues = new Map<string, Array<{ data: any; error: any }>>();
  // Map of function name -> array of received bodies (for assertions).
  const invokeCalls = new Map<string, any[]>();
  // Storage upload result.
  let storageUploadResult: { data: any; error: any } = { data: { path: "ok" }, error: null };
  const storageCalls: any[] = [];

  const queueSelect = (data: any, error: any = null) =>
    selectResults.push({ data, error });

  const queueInvoke = (name: string, data: any, error: any = null) => {
    if (!invokeQueues.has(name)) invokeQueues.set(name, []);
    invokeQueues.get(name)!.push({ data, error });
  };

  const setStorageUpload = (data: any, error: any = null) => {
    storageUploadResult = { data, error };
  };

  // Chainable query builder — each method returns `this`. Awaiting it resolves
  // to the next queued select result.
  const makeQuery = (): any => {
    const q: any = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      in: () => q,
      ilike: () => q,
      order: () => q,
      limit: () => q,
      then: (onFulfilled: any) => {
        const r = selectResults.shift() ?? { data: [], error: null };
        return Promise.resolve(r).then(onFulfilled);
      },
    };
    return q;
  };

  const supabase = {
    from: vi.fn((_table: string) => makeQuery()),
    functions: {
      invoke: vi.fn(async (name: string, opts?: { body?: any }) => {
        if (!invokeCalls.has(name)) invokeCalls.set(name, []);
        invokeCalls.get(name)!.push(opts?.body);
        const queue = invokeQueues.get(name);
        const r = queue?.shift();
        if (!r) {
          return { data: null, error: { message: `unmocked invoke: ${name}` } };
        }
        return r;
      }),
    },
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: vi.fn(async (...args: any[]) => {
          storageCalls.push(args);
          return storageUploadResult;
        }),
      })),
    },
  };

  return {
    supabase,
    queueSelect,
    queueInvoke,
    setStorageUpload,
    invokeCalls,
    storageCalls,
  };
}

export type MockSupabaseHandle = ReturnType<typeof createMockSupabase>;
