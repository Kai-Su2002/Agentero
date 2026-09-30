import { describe, expect, it } from "vitest";
import { VAULT_FILE_DRAG_TYPE } from "@/lib/core/vault-file-drag";
import { isSplitDragPayload } from "@/lib/workspace/tab-dnd";

function mockDt(types: string[]): DataTransfer {
	return { types, getData: () => "" } as unknown as DataTransfer;
}

/**
 * A Library column-header drag writes `text/plain` (the column key) but is not
 * a vault path drag, so it must not open a dockview split (#646).
 */
describe("isSplitDragPayload", () => {
	it("accepts a file-tree vault path drag", () => {
		expect(
			isSplitDragPayload(mockDt([VAULT_FILE_DRAG_TYPE, "text/plain"])),
		).toBe(true);
	});

	it("rejects a Library column-reorder drag (text/plain only)", () => {
		expect(isSplitDragPayload(mockDt(["text/plain"]))).toBe(false);
	});

	it("rejects OS file drags and null", () => {
		expect(isSplitDragPayload(mockDt(["Files"]))).toBe(false);
		expect(isSplitDragPayload(null)).toBe(false);
	});
});
