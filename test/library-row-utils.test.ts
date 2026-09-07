import { describe, expect, it } from "vitest";
import { isMissingLocalPdf } from "@/components/library/library-row-utils";
import type { PaperLibraryRow } from "@/lib/paper";

function row(has_pdf: boolean | undefined): PaperLibraryRow {
	return {
		path: "papers/x",
		id: "x",
		type: "arxiv",
		title: "X",
		authors: [],
		tags: [],
		status: "completed",
		is_read: false,
		added_at: "",
		updated_at: "",
		has_pdf,
	};
}

describe("isMissingLocalPdf", () => {
	it("reports a probed-absent PDF as missing", () => {
		expect(isMissingLocalPdf(row(false))).toBe(true);
	});

	it("reports a probed-present PDF as there", () => {
		expect(isMissingLocalPdf(row(true))).toBe(false);
	});

	// remote_paper_list returns bare records, so nothing ever probed the vault
	// for a local PDF; treating that as "missing" would badge every remote paper.
	it("does not report an unprobed row as missing", () => {
		expect(isMissingLocalPdf(row(undefined))).toBe(false);
	});
});
