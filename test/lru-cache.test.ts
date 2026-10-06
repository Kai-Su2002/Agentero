import { describe, expect, it } from "vitest";
import { LruCache } from "@/lib/core/lru-cache";

describe("LruCache", () => {
	it("evicts the least recently used entry past capacity", () => {
		const cache = new LruCache<string, number>(2);
		cache.set("a", 1);
		cache.set("b", 2);
		// Reading "a" makes "b" the oldest.
		expect(cache.get("a")).toBe(1);
		cache.set("c", 3);
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("a")).toBe(1);
		expect(cache.get("c")).toBe(3);
		expect(cache.size).toBe(2);
	});

	it("overwrites, deletes and clears", () => {
		const cache = new LruCache<string, number>(3);
		cache.set("a", 1);
		cache.set("a", 2);
		expect(cache.get("a")).toBe(2);
		expect(cache.size).toBe(1);
		cache.delete("a");
		expect(cache.get("a")).toBeUndefined();
		cache.set("b", 1);
		cache.clear();
		expect(cache.size).toBe(0);
	});
});
