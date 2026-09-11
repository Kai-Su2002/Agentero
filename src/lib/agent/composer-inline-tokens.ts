/**
 * Inline @mention / $skill / /command tokens embedded in composer draft text.
 * Contenteditable renders markers as chips; send path strips mention/skill
 * markers and expands command markers to `/name` for ACP.
 */

const MENTION_RE = /\{\{m:([^}]+)\}\}/g;
const SKILL_RE = /\{\{s:([^}]+)\}\}/g;
const COMMAND_RE = /\{\{c:([^}]+)\}\}/g;
const ANY_TOKEN_RE = /\{\{(?:m|s|c):[^}]+\}\}/g;

export function encodeMentionToken(path: string): string {
	return `{{m:${encodeURIComponent(path)}}}`;
}

export function encodeSkillToken(skillId: string): string {
	return `{{s:${encodeURIComponent(skillId)}}}`;
}

export function encodeCommandToken(commandName: string): string {
	return `{{c:${encodeURIComponent(commandName)}}}`;
}

function decodePayload(payload: string): string {
	try {
		return decodeURIComponent(payload);
	} catch {
		return payload;
	}
}

export function decodeMentionTokenPayload(payload: string): string {
	return decodePayload(payload);
}

export function decodeSkillTokenPayload(payload: string): string {
	return decodePayload(payload);
}

export function decodeCommandTokenPayload(payload: string): string {
	return decodePayload(payload);
}

/** Paths in document order (duplicates kept once, first wins). */
export function extractMentionPaths(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const match of text.matchAll(MENTION_RE)) {
		const path = decodeMentionTokenPayload(match[1] ?? "").trim();
		if (!path || seen.has(path)) continue;
		seen.add(path);
		out.push(path);
	}
	return out;
}

/** Skill ids in document order (duplicates kept once, first wins). */
export function extractSkillIds(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const match of text.matchAll(SKILL_RE)) {
		const id = decodeSkillTokenPayload(match[1] ?? "").trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}

/**
 * Draft → send/display body:
 * - mention / skill markers removed (paths & skillIds travel separately)
 * - command markers become `/name` (ACP slash text)
 */
export function stripInlineTokens(text: string): string {
	return text
		.replace(COMMAND_RE, (_m, payload: string) => {
			const name = decodeCommandTokenPayload(payload).trim();
			return name ? `/${name}` : "";
		})
		.replace(/\{\{(?:m|s):[^}]+\}\}/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

/**
 * Text used for @ / $ / / trigger detection at the caret end.
 * Markers count as a single "atom" so `$` inside `{{s:…}}` does not open the menu.
 */
export function plainTriggerSuffix(text: string): string {
	return text.replace(ANY_TOKEN_RE, "\uFFFC");
}

/** Replace a trailing `@` / `$` / `/` trigger with an inline token + space. */
export function replaceTrailingTriggerWithToken(
	text: string,
	kind: "mention" | "skill" | "command",
	token: string,
): string {
	const pattern =
		kind === "mention"
			? /(^|\s)@[^\s]*$/
			: kind === "skill"
				? /(^|\s)\$[^\s]*$/
				: /(^|\s)\/[^\s]*$/;
	if (!pattern.test(text)) {
		const needsSpace = text.length > 0 && !/\s$/.test(text);
		return `${text}${needsSpace ? " " : ""}${token} `;
	}
	return text.replace(pattern, (_m, prefix: string) => `${prefix}${token} `);
}

/** Append tokens for paths/skills that are in state but missing from text (legacy drafts). */
export function appendMissingInlineTokens(
	text: string,
	mentionedPaths: string[],
	selectedSkillIds: string[],
): string {
	const havePaths = new Set(extractMentionPaths(text));
	const haveSkills = new Set(extractSkillIds(text));
	let next = text;
	for (const path of mentionedPaths) {
		if (!path || havePaths.has(path)) continue;
		const needsSpace = next.length > 0 && !/\s$/.test(next);
		next = `${next}${needsSpace ? " " : ""}${encodeMentionToken(path)}`;
		havePaths.add(path);
	}
	for (const id of selectedSkillIds) {
		if (!id || haveSkills.has(id)) continue;
		const needsSpace = next.length > 0 && !/\s$/.test(next);
		next = `${next}${needsSpace ? " " : ""}${encodeSkillToken(id)}`;
		haveSkills.add(id);
	}
	if (next !== text && !/\s$/.test(next)) next = `${next} `;
	return next;
}

export type InlineTokenPart =
	| { type: "text"; value: string }
	| { type: "mention"; path: string }
	| { type: "skill"; skillId: string }
	| { type: "command"; name: string };

/** Split draft text into renderable parts (text + chips). */
export function parseInlineTokenParts(text: string): InlineTokenPart[] {
	const parts: InlineTokenPart[] = [];
	const re = /\{\{(m|s|c):([^}]+)\}\}/g;
	let last = 0;
	for (const match of text.matchAll(re)) {
		const index = match.index ?? 0;
		if (index > last) {
			parts.push({ type: "text", value: text.slice(last, index) });
		}
		const kind = match[1];
		const payload = match[2] ?? "";
		if (kind === "m") {
			parts.push({
				type: "mention",
				path: decodeMentionTokenPayload(payload),
			});
		} else if (kind === "s") {
			parts.push({
				type: "skill",
				skillId: decodeSkillTokenPayload(payload),
			});
		} else if (kind === "c") {
			parts.push({
				type: "command",
				name: decodeCommandTokenPayload(payload),
			});
		}
		last = index + match[0].length;
	}
	if (last < text.length) {
		parts.push({ type: "text", value: text.slice(last) });
	}
	return parts;
}
