import { dataTransferLooksLikeVaultMove } from "@/lib/core/file-accept";

/**
 * Vault-relative or absolute paths from a file-tree drag (`text/plain`, one path per line).
 * Returns [] when the payload is an external OS file drop.
 */
export function readDraggedVaultPaths(dt: DataTransfer | null): string[] {
	if (!dt) return [];
	const text = dt.getData("text/plain")?.trim();
	if (!text) return [];
	// External OS file drops use the Files type — leave those to import handlers.
	if (dt.types.includes("Files") && !dt.types.includes("text/plain")) {
		return [];
	}
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
}

/**
 * True when the drag payload can open a split (file-tree path drag).
 * Uses the dedicated vault-path MIME + active-session flag, *not* `text/plain`:
 * the Library column-reorder drag also writes `text/plain`, and matching on
 * that made a column-header drag split the workspace open a phantom panel
 * (#646). `getData` is often empty during dragover, so only `types`/flag are
 * consulted here.
 */
export function isSplitDragPayload(dt: DataTransfer | null): boolean {
	return dataTransferLooksLikeVaultMove(dt);
}
