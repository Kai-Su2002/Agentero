import { describe, expect, it } from "vitest";
import { cleanCitationHref } from "@/lib/agent/citation-href";
import {
	prefixVaultMarkdownHrefs,
	prepareAgentMessageMarkdown,
} from "@/lib/agent/message-markdown";

describe("prefixVaultMarkdownHrefs", () => {
	it("prefixes bare vault citation hrefs so rehype-harden keeps them", () => {
		expect(
			prefixVaultMarkdownHrefs(
				"问？[摘要](papers/vla/2504.16054/2504.16054.pdf#page=1)",
			),
		).toBe("问？[摘要](./papers/vla/2504.16054/2504.16054.pdf#page=1)");
	});

	it("does not double-prefix", () => {
		expect(
			prefixVaultMarkdownHrefs(
				"[图7](./papers/vla/2504.16054/2504.16054.pdf#figure=7)",
			),
		).toBe("[图7](./papers/vla/2504.16054/2504.16054.pdf#figure=7)");
	});

	it("leaves http links alone", () => {
		expect(prefixVaultMarkdownHrefs("[arXiv](https://arxiv.org/abs/1)")).toBe(
			"[arXiv](https://arxiv.org/abs/1)",
		);
	});

	it("prefixes percent-encoded vault hrefs without double-encoding", () => {
		const href =
			"papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#page=4";
		expect(prefixVaultMarkdownHrefs(`[p.4](./${href})`)).toBe(
			`[p.4](./${href})`,
		);
		expect(prefixVaultMarkdownHrefs(`[p.4](${href})`)).toBe(`[p.4](./${href})`);
	});

	it("rewrites CommonMark angle-bracket destinations so harden keeps them", () => {
		expect(
			prefixVaultMarkdownHrefs(
				"[p.4](<papers/Quantum Error Correcting/parallel window/2209.08552/2209.08552.pdf#page=4>)",
			),
		).toBe(
			"[p.4](./papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#page=4)",
		);
		expect(
			prefixVaultMarkdownHrefs(
				"[Figure 4](<papers/Quantum Error Correcting/parallel window/2209.08552/2209.08552.pdf#figure=4>)",
			),
		).toBe(
			"[Figure 4](./papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#figure=4)",
		);
		expect(
			prefixVaultMarkdownHrefs(
				"[p.4](<papers/Foo (2024)/2209.08552/2209.08552.pdf#page=4>)",
			),
		).toBe("[p.4](./papers/Foo%20%282024%29/2209.08552/2209.08552.pdf#page=4)");
	});
});

describe("prepareAgentMessageMarkdown", () => {
	it("keeps citation links and prefixes vault hrefs", () => {
		const input =
			"核心问题？[摘要](papers/vla/2504.16054/2504.16054.pdf#page=1)\n\n详见[图7](papers/vla/2504.16054/2504.16054.pdf#figure=7)和第4.1节。";
		const out = prepareAgentMessageMarkdown(input);
		expect(out).toContain(
			"[摘要](./papers/vla/2504.16054/2504.16054.pdf#page=1)",
		);
		expect(out).toContain(
			"[图7](./papers/vla/2504.16054/2504.16054.pdf#figure=7)",
		);
		expect(out).not.toMatch(/\[.*\[摘要\]/);
	});

	it("keeps spaced PDF citations clickable through the full prepare pipeline", () => {
		const spaced =
			"[p.4](<papers/Quantum Error Correcting/parallel window/2209.08552/2209.08552.pdf#page=4>)";
		const encoded =
			"[p.4](./papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#page=4)";
		expect(prepareAgentMessageMarkdown(spaced)).toBe(encoded);
		expect(prepareAgentMessageMarkdown(encoded)).toBe(encoded);
		expect(
			cleanCitationHref(
				"./papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#page=4",
			),
		).toBe(
			"papers/Quantum Error Correcting/parallel window/2209.08552/2209.08552.pdf#page=4",
		);
	});
});

describe("cleanCitationHref", () => {
	it("strips the ./ prefix added for Streamdown harden", () => {
		expect(
			cleanCitationHref("./papers/vla/2504.16054/2504.16054.pdf#page=1"),
		).toBe("papers/vla/2504.16054/2504.16054.pdf#page=1");
	});

	it("decodes percent-encoded vault paths before lookup", () => {
		expect(
			cleanCitationHref(
				"/papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#page=4",
			),
		).toBe(
			"/papers/Quantum Error Correcting/parallel window/2209.08552/2209.08552.pdf#page=4",
		);
		expect(
			cleanCitationHref(
				"./papers/Quantum%20Error%20Correcting/parallel%20window/2209.08552/2209.08552.pdf#figure=4",
			),
		).toBe(
			"papers/Quantum Error Correcting/parallel window/2209.08552/2209.08552.pdf#figure=4",
		);
		expect(
			cleanCitationHref(
				"./papers/Foo%20%282024%29/2209.08552/2209.08552.pdf#page=4",
			),
		).toBe("papers/Foo (2024)/2209.08552/2209.08552.pdf#page=4");
	});

	it("leaves scheme URLs and invalid percent sequences encoded", () => {
		expect(cleanCitationHref("https://example.com/a%20b")).toBe(
			"https://example.com/a%20b",
		);
		expect(cleanCitationHref("papers/foo%2/a.pdf#page=1")).toBe(
			"papers/foo%2/a.pdf#page=1",
		);
	});
});
