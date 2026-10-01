import { useCallback } from "react";
import type { DecisionOutcome, Json } from "@/lib/core/bindings";
import { commands } from "@/lib/core/bindings";
import { callApiResult } from "@/lib/core/ipc";

/** Decision-specific context; shape is owned by the registered schema. */
export type DecisionState = Record<string, unknown>;

/**
 * Run a semantic decision through the Host decision layer (rules + jEV +
 * fallback) and get back the winning provider's action.
 *
 * Pure-rule decisions should use `decideSync` from `@/lib/decision/registry`
 * instead: they are synchronous and never leave the WebView.
 */
export function useDecision() {
	const decide = useCallback(
		(decisionId: string, state: DecisionState): Promise<DecisionOutcome> =>
			callApiResult(() =>
				commands.decide({ decisionId, state: state as unknown as Json }),
			),
		[],
	);

	return { decide };
}
