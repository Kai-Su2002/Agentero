/**
 * Minimal least-recently-used cache on a `Map` (insertion order = recency).
 * Reads refresh an entry; writes past `capacity` evict the oldest.
 */
export class LruCache<K, V> {
	private readonly entries = new Map<K, V>();

	constructor(private readonly capacity: number) {}

	get(key: K): V | undefined {
		if (!this.entries.has(key)) return undefined;
		const value = this.entries.get(key) as V;
		this.entries.delete(key);
		this.entries.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		this.entries.delete(key);
		this.entries.set(key, value);
		while (this.entries.size > this.capacity) {
			const oldest = this.entries.keys().next();
			if (oldest.done) break;
			this.entries.delete(oldest.value);
		}
	}

	delete(key: K): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}
