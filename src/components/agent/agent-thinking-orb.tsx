"use client";

import { useTranslation } from "react-i18next";
import { ThinkingOrb } from "thinking-orbs";
import type { AgentPart } from "@/lib/agent/chat-state";

type AgentActivity = "thinking" | "working" | "solving";

const activityToOrbState: Record<
	AgentActivity,
	{
		state: "working" | "connecting" | "solving";
		i18nKey: "thinking" | "working" | "solving";
	}
> = {
	thinking: { state: "working", i18nKey: "thinking" },
	working: { state: "connecting", i18nKey: "working" },
	solving: { state: "solving", i18nKey: "solving" },
};

function resolveActivity(parts: AgentPart[]): AgentActivity {
	for (let index = parts.length - 1; index >= 0; index -= 1) {
		const part = parts[index];
		if (part.type === "tool") {
			if (
				part.tool.status === "in_progress" ||
				part.tool.status === "pending"
			) {
				return "working";
			}
			continue;
		}
		if (part.type === "reasoning" && part.text.trim().length > 0) {
			return "thinking";
		}
		if (part.type === "plan") {
			const hasIncomplete = part.entries.some(
				(entry) => entry.status !== "completed",
			);
			if (hasIncomplete) return "solving";
			continue;
		}
		if (part.type === "text" && part.text.trim().length > 0) {
			return "thinking";
		}
	}
	return "thinking";
}

export function AgentThinkingOrb({
	parts,
	streaming,
	showLabel = true,
}: {
	parts: AgentPart[];
	streaming: boolean;
	showLabel?: boolean;
}) {
	const { t } = useTranslation("agent");
	if (!streaming) return null;

	const activity = resolveActivity(parts);
	const config = activityToOrbState[activity];
	const label = t(config.i18nKey);

	const orb = (
		<ThinkingOrb
			state={config.state}
			size={20}
			theme="auto"
			aria-label={label}
		/>
	);

	if (!showLabel) {
		return orb;
	}

	return (
		<div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
			{orb}
			<span>{label}</span>
		</div>
	);
}
