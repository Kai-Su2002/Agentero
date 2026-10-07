import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { selectionLineLabel } from "@/lib/agent/selection-line-label";

const tEn = ((key: string, opts?: Record<string, unknown>) => {
	const title = String(opts?.title ?? "");
	const from = opts?.from;
	const to = opts?.to;
	if (key === "composer.selectionChipWithLines") {
		return `${title} lines ${from}-${to}`;
	}
	if (key === "composer.selectionChipWithLine") {
		return `${title} line ${from}`;
	}
	return key;
}) as TFunction<"agent", undefined>;

const tZh = ((key: string, opts?: Record<string, unknown>) => {
	const title = String(opts?.title ?? "");
	const from = opts?.from;
	const to = opts?.to;
	if (key === "composer.selectionChipWithLines") {
		return `${title} ${from}-${to}行`;
	}
	if (key === "composer.selectionChipWithLine") {
		return `${title} ${from}行`;
	}
	return key;
}) as TFunction<"agent", undefined>;

describe("selectionLineLabel", () => {
	it("returns null without lineFrom", () => {
		expect(selectionLineLabel(tEn, {}, "notes/a.md")).toBeNull();
	});

	it("formats a single line (en / zh)", () => {
		expect(
			selectionLineLabel(tEn, { lineFrom: 7, lineTo: 7 }, "notes/a.md"),
		).toBe("notes/a.md line 7");
		expect(
			selectionLineLabel(tZh, { lineFrom: 7, lineTo: 7 }, "notes/a.md"),
		).toBe("notes/a.md 7行");
	});

	it("formats a multi-line span (en / zh)", () => {
		expect(
			selectionLineLabel(tEn, { lineFrom: 12, lineTo: 14 }, "main.tex"),
		).toBe("main.tex lines 12-14");
		expect(
			selectionLineLabel(tZh, { lineFrom: 12, lineTo: 14 }, "main.tex"),
		).toBe("main.tex 12-14行");
	});
});
