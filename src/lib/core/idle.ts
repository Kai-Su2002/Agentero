/**
 * Run `fn` when the main thread is idle (bounded by `timeout`), falling back to
 * a short timer where `requestIdleCallback` is unavailable (WebKit). Returns a
 * canceller for effect cleanup.
 */
export function scheduleIdle(fn: () => void, timeout = 2000): () => void {
	if (typeof window === "undefined") {
		fn();
		return () => {};
	}
	const idle = window as unknown as {
		requestIdleCallback?: (
			callback: () => void,
			options?: { timeout: number },
		) => number;
		cancelIdleCallback?: (handle: number) => void;
	};
	if (idle.requestIdleCallback) {
		const handle = idle.requestIdleCallback(fn, { timeout });
		return () => idle.cancelIdleCallback?.(handle);
	}
	const handle = window.setTimeout(fn, Math.min(timeout, 250));
	return () => window.clearTimeout(handle);
}
