import { CheckCircle2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/core/utils";
import type { HostDoctorReport, HostToolDiagnostic } from "@/lib/doctor/api";
import { DoctorSection } from "./doctor-sections";

function StatusIcon({ ok }: { ok: boolean }) {
	return ok ? (
		<CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
	) : (
		<TriangleAlert className="size-3.5 text-amber-600" aria-hidden />
	);
}

function ToolRow({ label, tool }: { label: string; tool: HostToolDiagnostic }) {
	const { t } = useTranslation("settings");
	const available = tool.status === "available";
	return (
		<div className="flex items-start gap-2.5 border-b px-3.5 py-2.5 last:border-b-0">
			<StatusIcon ok={available} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-3">
					<p className="font-medium text-sm">{label}</p>
					<p
						className={cn(
							"shrink-0 text-xs",
							available ? "text-emerald-700" : "text-amber-700",
						)}
					>
						{t(`doctor.host.toolStatus.${tool.status}`)}
					</p>
				</div>
				{tool.version ? <p className="text-xs">{tool.version}</p> : null}
				{tool.resolvedPath ? (
					<p
						className="truncate text-muted-foreground text-xs"
						title={tool.resolvedPath}
					>
						{tool.resolvedPath}
					</p>
				) : null}
				{tool.detail ? (
					<p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
						{tool.detail}
					</p>
				) : null}
			</div>
		</div>
	);
}

export function DoctorHostRuntimeSection({
	report,
	error,
}: {
	report: HostDoctorReport | null;
	error?: string | null;
}) {
	const { t } = useTranslation("settings");
	const issues = error
		? 1
		: report
			? Number(report.node.status !== "available") +
				Number(report.npm.status !== "available")
			: 0;
	return (
		<DoctorSection
			title={t("doctor.sections.host")}
			description={t("doctor.sectionHints.host")}
			ok={issues === 0}
			issueCount={issues}
		>
			{error ? (
				<div className="flex items-start gap-2.5 px-3.5 py-2.5">
					<TriangleAlert
						className="mt-0.5 size-3.5 shrink-0 text-amber-600"
						aria-hidden
					/>
					<p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs">
						{error}
					</p>
				</div>
			) : report ? (
				<>
					<ToolRow label="Node.js" tool={report.node} />
					<ToolRow label="npm" tool={report.npm} />
				</>
			) : null}
		</DoctorSection>
	);
}
