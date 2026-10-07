import { MarkdownPlugin } from "@platejs/markdown";
import type { SlateEditor } from "platejs";
import { prepareMarkdownForDeserialize } from "@/lib/markdown/deserialize";
import {
	markdownNeedsMdx,
	selectMarkdownRemarkPluginsForDeserialize,
} from "@/lib/markdown/remark-plugins";

/**
 * Deserialize a Markdown body with only the remark plugins that body needs.
 *
 * Centralizes the `prepareMarkdownForDeserialize` + plugin-selection pair so
 * every editor surface (live editor, embeds, export, paste, external reload)
 * parses through the same trimmed pipeline. When the document has no `<` tag,
 * `withoutMdx` also skips Plate's `htmlToJsx` scan of the whole source.
 */
export function deserializeMarkdownBody(editor: SlateEditor, body: string) {
	const prepared = prepareMarkdownForDeserialize(body || " ");
	return editor.getApi(MarkdownPlugin).markdown.deserialize(prepared, {
		remarkPlugins: selectMarkdownRemarkPluginsForDeserialize(prepared),
		withoutMdx: !markdownNeedsMdx(prepared),
	});
}
