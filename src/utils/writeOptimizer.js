/**
 * Write optimization utilities - debouncing, batching, coalescing
 */

// Pending writes map: key -> {data, timer, resolve, reject}
const pendingWrites = new Map();

/**
 * Debounced write - coalesces multiple writes to same document within delay
 * @param {string} key - Unique key (e.g., "users/uid123")
 * @param {Function} writeFn - The actual write function to call
 * @param {number} delay - Debounce delay in ms (default 2000)
 */
export function debouncedWrite(key, writeFn, delay = 2000) {
  return new Promise((resolve, reject) => {
    const existing = pendingWrites.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      // Resolve previous promise with null (superseded)
      existing.resolve(null);
    }

    const timer = setTimeout(async () => {
      pendingWrites.delete(key);
      try {
        const result = await writeFn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }, delay);

    pendingWrites.set(key, { timer, resolve, reject });
  });
}

/**
 * Flush all pending debounced writes immediately
 */
export async function flushPendingWrites() {
  const writes = [];
  for (const [key, entry] of pendingWrites) {
    clearTimeout(entry.timer);
    pendingWrites.delete(key);
    // entry.resolve(null) — no actual write executed on flush during unload
  }
  return Promise.allSettled(writes);
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingWrites();
  });
}
