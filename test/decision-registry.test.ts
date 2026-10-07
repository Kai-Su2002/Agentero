import { describe, expect, it } from "vitest";
import { decideSync, registerDecision } from "@/lib/decision/registry";

describe("local decision registry", () => {
	it("returns the first matching rule, then the default", () => {
		registerDecision<{ kind: string }>({
			id: "test.local",
			description: "test decision",
			defaultAction: "default",
			rules: [
				({ kind }) => (kind === "a" ? "first" : null),
				({ kind }) => (kind === "b" ? "second" : null),
			],
		});

		expect(decideSync("test.local", { kind: "a" })).toBe("first");
		expect(decideSync("test.local", { kind: "b" })).toBe("second");
		expect(decideSync("test.local", { kind: "c" })).toBe("default");
	});

	it("resolves unknown decision ids to noop", () => {
		expect(decideSync("test.missing", {})).toBe("noop");
	});
});
