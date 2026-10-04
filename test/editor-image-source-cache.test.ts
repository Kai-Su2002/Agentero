import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paper/media", () => ({
	localImageToViewerSource: vi.fn(async (abs: string) => `blob:${abs}`),
	revokePdfViewerSource: vi.fn(),
}));

import {
	localImageToViewerSource,
	revokePdfViewerSource,
} from "@/lib/paper/media";

const loadSource = () => import("@/lib/markdown/image-source-cache");

describe("image source cache", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("reads a path once and shares the object URL", async () => {
		const { acquireImageSource } = await loadSource();
		const [a, b] = await Promise.all([
			acquireImageSource("/v/a.png", "image/png"),
			acquireImageSource("/v/a.png", "image/png"),
		]);
		expect(a).toBe("blob:/v/a.png");
		expect(b).toBe("blob:/v/a.png");
		expect(localImageToViewerSource).toHaveBeenCalledTimes(1);
	});

	it("revokes an unreferenced entry once the cache is over its bound", async () => {
		const { acquireImageSource, releaseImageSource } = await loadSource();
		await acquireImageSource("/v/old.png", "image/png");
		releaseImageSource("/v/old.png", "image/png");

		for (let i = 0; i < 60; i++) {
			await acquireImageSource(`/v/new-${i}.png`, "image/png");
		}
		expect(revokePdfViewerSource).toHaveBeenCalledWith("blob:/v/old.png");
	});

	it("does not evict a still-referenced entry", async () => {
		const { acquireImageSource } = await loadSource();
		await acquireImageSource("/v/held.png", "image/png");
		for (let i = 0; i < 60; i++) {
			await acquireImageSource(`/v/fill-${i}.png`, "image/png");
		}
		expect(revokePdfViewerSource).not.toHaveBeenCalledWith("blob:/v/held.png");
	});
});
