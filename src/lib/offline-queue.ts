// =============================
// OFFLINE QUEUE FOR ATTENDANCE
// Uses IndexedDB to store pending submissions
// =============================

interface PendingSubmission {
  id: string;
  token: string;
  data: FormData;
  timestamp: number;
  retries: number;
}

const DB_NAME = 'attendance-offline';
const STORE_NAME = 'pending-submissions';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function queueAttendanceSubmission(
  token: string,
  formData: FormData
): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const submission: PendingSubmission = {
    id: crypto.randomUUID(),
    token,
    data: formData,
    timestamp: Date.now(),
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const request = store.add(submission);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeSubmission(id: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateSubmissionRetries(
  id: string,
  retries: number
): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const submission = getRequest.result;
      if (submission) {
        submission.retries = retries;
        const updateRequest = store.put(submission);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function processPendingSubmissions(): Promise<{
  processed: number;
  failed: number;
}> {
  const pending = await getPendingSubmissions();
  let processed = 0;
  let failed = 0;

  for (const submission of pending) {
    try {
      // Attempt to submit
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendance-submit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: submission.data,
        }
      );

      if (response.ok) {
        await removeSubmission(submission.id);
        processed++;
      } else {
        // Increment retry count
        await updateSubmissionRetries(submission.id, submission.retries + 1);
        
        // Remove if too many retries (> 5) or too old (> 24 hours)
        if (
          submission.retries >= 5 ||
          Date.now() - submission.timestamp > 24 * 60 * 60 * 1000
        ) {
          await removeSubmission(submission.id);
          failed++;
        }
      }
    } catch (error) {
      console.error('Failed to process pending submission:', error);
      await updateSubmissionRetries(submission.id, submission.retries + 1);
    }
  }

  return { processed, failed };
}

// Check if offline
export function isOnline(): boolean {
  return navigator.onLine;
}
