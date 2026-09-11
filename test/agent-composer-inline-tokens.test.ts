import { describe, expect, it } from "vitest";
import {
	appendMissingInlineTokens,
	encodeCommandToken,
	encodeMentionToken,
	encodeSkillToken,
	extractMentionPaths,
	extractSkillIds,
	parseInlineTokenParts,
	plainTriggerSuffix,
	replaceTrailingTriggerWithToken,
	stripInlineTokens,
} from "@/lib/agent/composer-inline-tokens";

describe("composer inline tokens", () => {
	it("round-trips mention and skill markers", () => {
		const path = "papers/foo/NOTES.md";
		const skill = "paper-reader";
		const text = `see ${encodeMentionToken(path)} and ${encodeSkillToken(skill)} please`;
		expect(extractMentionPaths(text)).toEqual([path]);
		expect(extractSkillIds(text)).toEqual([skill]);
		expect(stripInlineTokens(text)).toBe("see and please");
	});

	it("expands command markers to /name on send", () => {
		const text = `run ${encodeCommandToken("summarize")} now`;
		expect(stripInlineTokens(text)).toBe("run /summarize now");
	});

	it("encodes odd path characters", () => {
		const path = "notes/a b/文件.md";
		const token = encodeMentionToken(path);
		expect(extractMentionPaths(`x ${token} y`)).toEqual([path]);
	});

	it("replaces a trailing @ trigger with a mention token", () => {
		const next = replaceTrailingTriggerWithToken(
			"hello @no",
			"mention",
			encodeMentionToken("a.md"),
		);
		expect(next).toBe(`hello ${encodeMentionToken("a.md")} `);
		expect(extractMentionPaths(next)).toEqual(["a.md"]);
	});

	it("replaces a trailing $ trigger with a skill token", () => {
		const next = replaceTrailingTriggerWithToken(
			"run $pap",
			"skill",
			encodeSkillToken("paper-reader"),
		);
		expect(next).toBe(`run ${encodeSkillToken("paper-reader")} `);
	});

	it("replaces a trailing / trigger with a command token", () => {
		const next = replaceTrailingTriggerWithToken(
			"do /sum",
			"command",
			encodeCommandToken("summarize"),
		);
		expect(next).toBe(`do ${encodeCommandToken("summarize")} `);
		expect(stripInlineTokens(next)).toBe("do /summarize");
	});

	it("appends missing tokens for legacy drafts", () => {
		const next = appendMissingInlineTokens(
			"hello",
			["a.md", "b.md"],
			["skill-a"],
		);
		expect(extractMentionPaths(next)).toEqual(["a.md", "b.md"]);
		expect(extractSkillIds(next)).toEqual(["skill-a"]);
		expect(next.startsWith("hello")).toBe(true);
	});

	it("does not duplicate tokens already present", () => {
		const token = encodeMentionToken("a.md");
		const next = appendMissingInlineTokens(`x ${token} `, ["a.md"], []);
		expect(next).toBe(`x ${token} `);
	});

	it("masks markers in the trigger suffix so $ inside tokens is inert", () => {
		const text = `x ${encodeSkillToken("ab")} $c`;
		expect(plainTriggerSuffix(text).endsWith(" $c")).toBe(true);
		expect(plainTriggerSuffix(text)).not.toContain("{{");
	});

	it("parses parts for rendering", () => {
		const parts = parseInlineTokenParts(
			`A ${encodeMentionToken("p.md")} B ${encodeSkillToken("s1")} C ${encodeCommandToken("cmd")}`,
		);
		expect(parts).toEqual([
			{ type: "text", value: "A " },
			{ type: "mention", path: "p.md" },
			{ type: "text", value: " B " },
			{ type: "skill", skillId: "s1" },
			{ type: "text", value: " C " },
			{ type: "command", name: "cmd" },
		]);
	});
});
