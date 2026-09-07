import {
	type AliasRepairCandidate_Serialize,
	commands,
	type DoctorIssue_Serialize,
	type DoctorReport_Serialize,
	type DoctorVaultState,
	type DuplicateRepairResult,
	type VisualMarkCandidate,
	type WikiCheckIssue_Serialize,
	type WikilinkRepairPlan_Serialize,
	type WikilinkRepairResidual_Serialize,
	type WikilinkRepairSuggestion_Serialize,
} from "@/lib/core/bindings";
import { callApi, callApiResult } from "@/lib/core/ipc";

/** Read models come straight from the generated wire contract. */
export type DoctorIssue = DoctorIssue_Serialize;
export type AliasRepairCandidate = AliasRepairCandidate_Serialize;
export type WikiCheckIssue = WikiCheckIssue_Serialize;
export type { VisualMarkCandidate };
export type DoctorReport = DoctorReport_Serialize;
export type WikilinkRepairSuggestion = WikilinkRepairSuggestion_Serialize;
export type WikilinkRepairResidual = WikilinkRepairResidual_Serialize;
export type WikilinkRepairPlan = WikilinkRepairPlan_Serialize;
export type { DoctorVaultState, DuplicateRepairResult };

type AliasRepairChange = {
	path: string;
	titleAlias: string;
	shortAlias: string;
	expectedHash: string;
};

type WikilinkRepairChange = {
	source: string;
	rangeStart: number;
	rangeEnd: number;
	expected: string;
	replacement: string;
	expectedHash: string;
};

type VisualMarkRepairChange = {
	path: string;
};

export function doctorCheck(vaultPath: string): Promise<DoctorReport> {
	return callApi(() => commands.doctorCheck({ vaultPath }));
}

export function doctorApplyAliases(
	vaultPath: string,
	changes: AliasRepairChange[],
): Promise<{ updatedPaths: string[] }> {
	return callApiResult(() =>
		commands.doctorApplyAliases({ vaultPath, changes }),
	);
}

/** Persist ignore/restore for paper-alias candidates (vault `.agentero/doctor.json`). */
export function doctorIgnoreAliases(
	vaultPath: string,
	paths: string[],
	ignore: boolean,
): Promise<DoctorVaultState> {
	return callApi(() =>
		commands.doctorIgnoreAliases({ vaultPath, paths, ignore }),
	);
}

export function doctorPlanWikilinks(
	vaultPath: string,
): Promise<WikilinkRepairPlan> {
	return callApi(() => commands.doctorPlanWikilinks({ vaultPath }));
}

export function doctorApplyWikilinks(
	vaultPath: string,
	changes: WikilinkRepairChange[],
): Promise<{ updatedPaths: string[] }> {
	return callApiResult(() =>
		commands.doctorApplyWikilinks({ vaultPath, changes }),
	);
}

export async function doctorSetDirtyPaths(
	vaultPath: string,
	dirtyPaths: string[],
): Promise<void> {
	await callApi(() => commands.doctorSetDirtyPaths({ vaultPath, dirtyPaths }));
}

export function doctorApplyVisualMarks(
	vaultPath: string,
	changes: VisualMarkRepairChange[],
): Promise<{ updatedPaths: string[] }> {
	return callApiResult(() =>
		commands.doctorApplyVisualMarks({ vaultPath, changes }),
	);
}

export function doctorFixCatalogDuplicates(
	vaultPath: string,
): Promise<DuplicateRepairResult> {
	return callApi(() => commands.doctorFixCatalogDuplicates({ vaultPath }));
}
