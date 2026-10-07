/**
 * Lets the selection-chat popover (DOM-driven) resolve Plate source line
 * numbers for the active Markdown surface without holding a React ref.
 */

import type { SourceLineSpan } from "@/lib/markdown/selection-source-lines";

export type MarkdownSelectionLinesProvider = {
	resolve: () => SourceLineSpan | null;
};

const providersByPath = new Map<string, MarkdownSelectionLinesProvider>();

export function registerMarkdownSelectionLinesProvider(
	path: string,
	provider: MarkdownSelectionLinesProvider,
): () => void {
	const key = path.trim();
	if (!key) return () => {};
	providersByPath.set(key, provider);
	return () => {
		if (providersByPath.get(key) === provider) {
			providersByPath.delete(key);
		}
	};
}

export function resolveMarkdownSelectionLinesForPath(
	path: string,
): SourceLineSpan | null {
	const key = path.trim();
	if (!key) return null;
	const provider = providersByPath.get(key);
	if (!provider) return null;
	try {
		return provider.resolve();
	} catch {
		return null;
	}
}
