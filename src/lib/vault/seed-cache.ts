import { readVaultFile } from "@/lib/vault/fs";

/**
 * Small cache for Markdown/NOTES seed reads.
 *
 * Reopening an evicted tab otherwise re-reads the file over IPC every time.
 * Only the tab-open path (`loadTabResources`) uses this; the conflict guard in
 * `persistFile` and `applyDiskChange` still read the raw file, so save-conflict
 * correctness is untouched. External edits invalidate the path from the Vault
 * watcher, and self-writes prime it after landing.
 */
const CACHE_LIMIT = 24;
const cache = new Map<string, string>();

function normalizeKey(path: string): string {
	return path.replace(/\\/g, "/");
}

function trim(): void {
	while (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (typeof oldest !== "string") break;
		cache.delete(oldest);
	}
}

/** Read a seed through the cache (falls back to a plain Vault read). */
export async function readSeedCached(path: string): Promise<string> {
	const key = normalizeKey(path);
	const cached = cache.get(key);
	if (cached !== undefined) {
		// Refresh LRU order.
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}
	const text = await readVaultFile(path);
	cache.set(key, text);
	trim();
	return text;
}

/** Record freshly written content so the next open does not re-read it. */
export function primeSeedCache(path: string, text: string): void {
	const key = normalizeKey(path);
	cache.delete(key);
	cache.set(key, text);
	trim();
}

/** Drop one path (external change / rename / delete). */
export function invalidateSeedCache(path: string): void {
	cache.delete(normalizeKey(path));
}
