import type {} from './performance.js'; // Pull in global type.

/**
 * Invokes the given callback and returns the difference in memory usage before
 * and after execution. Automatically invokes garbage collection so the number
 * *should* represent real retained memory.
 *
 * A positive result means additional memory was allocated. A negative result
 * means memory was freed.
 */
export async function trackMemory(callback: () => void): Promise<number> {
    await gc();
    const beforeMem = await performance.measureUserAgentSpecificMemory!();

    callback();

    await gc();
    const afterMem = await performance.measureUserAgentSpecificMemory!();

    return afterMem.bytes - beforeMem.bytes;
}

/** Invoke the garbage collector. */
async function gc(): Promise<void> {
    // `FinalizationRegistry` callbacks are not invoked consistently in
    // `window.gc()`, no matter how many times it is synchronously called. Best
    // way we can enforce that all callbacks are invoked is to wait some time
    // and GC again.
    window.gc!();
    await new Promise<void>((resolve) => {
        queueMicrotask(() => { resolve(); });
    });
    window.gc!();
}
