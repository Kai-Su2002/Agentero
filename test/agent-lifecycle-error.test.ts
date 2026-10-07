import { describe, expect, it } from "vitest";
import {
	isNpmMissingError,
	lifecycleErrorMessage,
} from "@/lib/agent/lifecycle-error";

const t = (key: string, options?: Record<string, string>) =>
	`${key}:${options?.cacheCommand ?? ""}`;

describe("lifecycleErrorMessage", () => {
	it("explains an npm cache EPERM failure", () => {
		const raw =
			"npm error EPERM: operation not permitted\nnpm error Log files were not written due to an error writing to the directory: D:\\program\\node_cache\\_logs";
		expect(lifecycleErrorMessage(raw, t)).toContain(
			"agent.npmCacheWriteFailed",
		);
	});
	it("recognizes legacy npm ERR output", () => {
		const raw =
			"npm ERR! code EPERM\nnpm ERR! Log files were not written due to an error writing to the directory: C:\\npm-cache\\_logs";
		expect(lifecycleErrorMessage(raw, t)).toContain(
			"agent.npmCacheWriteFailed",
		);
	});
	it("keeps unrelated installer output", () => {
		expect(lifecycleErrorMessage("npm error network timeout", t)).toBe(
			"npm error network timeout",
		);
	});
});

describe("isNpmMissingError", () => {
	it("matches the Windows cmd not-recognized error", () => {
		expect(
			isNpmMissingError(
				"'npm' is not recognized as an internal or external command,\r\noperable program or batch file.",
			),
		).toBe(true);
	});
	it("matches the Unix command-not-found error", () => {
		expect(isNpmMissingError("bash: line 3: npm: command not found")).toBe(
			true,
		);
	});
	it("matches the Host uninstall pre-check", () => {
		expect(
			isNpmMissingError(
				"npm is not available on PATH; cannot uninstall npm packages",
			),
		).toBe(true);
	});
	it("ignores unrelated npm errors without a resolver hint", () => {
		expect(isNpmMissingError("npm error network timeout")).toBe(false);
		expect(isNpmMissingError("npm error EPERM: operation not permitted")).toBe(
			false,
		);
	});
});
