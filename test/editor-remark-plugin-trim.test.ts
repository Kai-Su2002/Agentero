import { remarkMdx } from "@platejs/markdown";
import remarkMath from "remark-math";
import { describe, expect, it } from "vitest";
import { remarkObsidianCallout } from "@/lib/markdown/callout";
import { remarkColumns } from "@/lib/markdown/columns";
import { remarkPreserveHtml } from "@/lib/markdown/html";
import { remarkImageGroup } from "@/lib/markdown/image-group";
import {
	MARKDOWN_REMARK_PLUGINS,
	selectMarkdownRemarkPluginsForDeserialize,
} from "@/lib/markdown/remark-plugins";

const list = (source: string) =>
	selectMarkdownRemarkPluginsForDeserialize(source);

describe("selectMarkdownRemarkPluginsForDeserialize", () => {
	it("trims heavy plugins on a plain note", () => {
		const selected = list("hello\n\nworld");
		expect(selected).not.toContain(remarkMath);
		expect(selected).not.toContain(remarkMdx);
		expect(selected).not.toContain(remarkObsidianCallout);
		expect(selected).not.toContain(remarkImageGroup);
		expect(selected).not.toContain(remarkColumns);
		// GFM + HTML preservation are always on.
		expect(selected).toContain(remarkPreserveHtml);
		expect(selected.length).toBeLessThan(MARKDOWN_REMARK_PLUGINS.length);
	});

	it("keeps each plugin only when its syntax is present", () => {
		expect(list("a $x$ b")).toContain(remarkMath);
		expect(list("<div>hi</div>")).toContain(remarkMdx);
		expect(list("> [!note] hi")).toContain(remarkObsidianCallout);
		expect(list("![a](./a.png)")).toContain(remarkImageGroup);
		expect(list(":::columns\n")).toContain(remarkColumns);
		expect(list("plain").some((plugin) => Array.isArray(plugin))).toBe(false);
		expect(list("see [[Note]]").some((plugin) => Array.isArray(plugin))).toBe(
			true,
		);
	});

	it("drops md/math/emoji on a plain note but keeps them together otherwise", () => {
		const plain = list("just text with commas, no syntax");
		expect(plain).not.toContain(remarkMdx);
		expect(plain).not.toContain(remarkMath);

		const rich = list("a $x$ b :smile: <div>c</div>");
		expect(rich).toContain(remarkMdx);
		expect(rich).toContain(remarkMath);
	});
});
