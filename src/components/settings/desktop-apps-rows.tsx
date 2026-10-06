import { ArrowUpRight, Loader2 } from "lucide-react";
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { SiQwen } from "react-icons/si";
import { ChatGPTIcon } from "@/components/ai-elements/open-in-chat";
import {
	SettingsGroup,
	SettingsSectionLabel,
	settingsRowClassName,
} from "@/components/settings/settings-layout";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { cn } from "@/lib/core/utils";
import {
	DESKTOP_APP_IDS,
	type DesktopAppId,
	type DesktopAppStatus,
	openDesktopApp,
	probeDesktopApps,
} from "@/lib/system/desktop-apps";

/**
 * Read-only list of popular desktop AI apps that do NOT speak ACP, so they can
 * never appear in the ACP catalog. Installed rows are highlighted + labelled
 * "not supported yet" and open the app on click; missing rows are dimmed.
 * Detection is local-only (see `features/system/desktop_apps`).
 */
export function DesktopAppsSection() {
	const { t } = useTranslation("settings");
	return (
		<>
			<SettingsSectionLabel className="mt-4">
				{t("agent.desktopApps.section")}
			</SettingsSectionLabel>
			<SettingsGroup>
				<DesktopAppsRows />
			</SettingsGroup>
			<p className="mt-2 mb-3 px-0.5 text-muted-foreground text-xs leading-relaxed">
				{t("agent.desktopApps.hint")}
			</p>
		</>
	);
}

function DesktopAppsRows() {
	const { t } = useTranslation("settings");
	const [statuses, setStatuses] = useState<Record<
		string,
		DesktopAppStatus
	> | null>(null);
	const [opening, setOpening] = useState<DesktopAppId | null>(null);

	useEffect(() => {
		if (!isTauri()) {
			setStatuses({});
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const list = await probeDesktopApps();
				if (!cancelled) {
					setStatuses(Object.fromEntries(list.map((s) => [s.id, s])));
				}
			} catch (e) {
				if (!cancelled) {
					setStatuses({});
					notifyError(errorText(e));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const onOpen = useCallback(async (id: DesktopAppId) => {
		setOpening(id);
		try {
			await openDesktopApp(id);
		} catch (e) {
			notifyError(errorText(e));
		} finally {
			setOpening(null);
		}
	}, []);

	if (statuses === null) {
		return (
			<div className="flex items-center gap-2 px-3.5 py-4 text-muted-foreground text-xs">
				<Loader2 className="size-3.5 animate-spin" aria-hidden />
				{t("agent.desktopApps.scanning")}
			</div>
		);
	}

	return (
		<>
			{DESKTOP_APP_IDS.map((id) => {
				const installed = statuses[id]?.installed ?? false;
				const label = t(`agent.desktopApps.${id}`);
				const icon = (
					<AppLogo
						id={id}
						className={cn("size-5", !installed && "opacity-40")}
					/>
				);
				const text = (
					<span
						className={cn(
							"truncate text-sm",
							installed ? "text-foreground" : "text-muted-foreground/60",
						)}
					>
						{label}
					</span>
				);

				if (!installed) {
					return (
						<div key={id} className={cn(settingsRowClassName, "gap-3")}>
							<div className="flex min-w-0 items-center gap-2.5">
								{icon}
								{text}
							</div>
						</div>
					);
				}

				return (
					<button
						key={id}
						type="button"
						aria-label={t("agent.desktopApps.open", { name: label })}
						title={t("agent.desktopApps.open", { name: label })}
						disabled={opening !== null}
						onClick={() => void onOpen(id)}
						className={cn(
							settingsRowClassName,
							"w-full gap-3 text-left transition-colors hover:bg-muted/50",
						)}
					>
						<div className="flex min-w-0 items-center gap-2.5">
							{icon}
							{text}
						</div>
						<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
							{t("agent.desktopApps.unsupported")}
							{opening === id ? (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							) : (
								<ArrowUpRight className="size-3.5" aria-hidden />
							)}
						</span>
					</button>
				);
			})}
		</>
	);
}

function AppLogo({
	id,
	className,
}: {
	id: DesktopAppId;
	className?: string;
}): ReactNode {
	switch (id) {
		case "chatgpt":
			return <ChatGPTIcon className={className} />;
		case "qwenwork":
			return <SiQwen className={className} />;
		case "workbuddy":
			return <WorkBuddyMark className={className} />;
		default:
			return null;
	}
}

/** Tencent WorkBuddy brand mark (green rounded square + white glyph). */
function WorkBuddyMark(props: ComponentProps<"svg">) {
	const uid = useId().replace(/:/g, "");
	const bg = `workbuddy-bg-${uid}`;
	const clip = `workbuddy-clip-${uid}`;
	return (
		<svg viewBox="0 0 40 40" fill="none" aria-hidden {...props}>
			<title>WorkBuddy</title>
			<defs>
				<linearGradient
					id={bg}
					x1="20"
					y1="0"
					x2="20"
					y2="40"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#0EC8A9" />
					<stop offset="1" stopColor="#01C886" />
				</linearGradient>
				<clipPath id={clip}>
					<rect width="40" height="40" rx="20" fill="white" />
				</clipPath>
			</defs>
			<g clipPath={`url(#${clip})`}>
				<rect width="40" height="40" rx="20" fill={`url(#${bg})`} />
				<path
					d="M28.5931 3.12762C28.9853 2.77585 29.0091 2.76226 29.2968 2.74499C29.7628 2.71096 30.1894 2.93488 30.916 3.59634C32.6132 5.13875 34.9769 8.30904 36.4462 11.0168L37.0138 12.0682L37.8156 12.4668C38.5896 12.8579 39.8593 13.6593 40.3898 14.0895C40.6297 14.2878 40.6638 14.2925 40.9133 14.1954C42.0388 13.7572 43.6506 14.3382 45.0727 15.7024C46.3529 16.9294 47.5794 19.026 48.0491 20.7757C48.1177 21.0574 48.2087 21.6628 48.2419 22.1134C48.349 23.6964 47.8414 24.9608 46.8637 25.5331C46.664 25.6484 46.6505 25.6795 46.6561 26.1774C46.7011 28.5481 46.0621 30.9144 44.7785 33.2221C43.3293 35.8133 40.7489 38.4945 37.2566 41.0199C35.3813 42.3846 30.9445 44.9701 28.9382 45.8778C24.1324 48.0414 20.2794 48.8709 16.9329 48.4609C14.9368 48.219 12.6769 47.44 11.34 46.5355C10.9885 46.2925 10.9325 46.2774 10.6637 46.3543C9.2327 46.7651 7.35867 45.9207 5.76659 44.1535C5.13165 43.4471 4.1065 41.7127 3.77404 40.7843C3.0054 38.6118 3.15852 36.6506 4.18236 35.4799C4.44671 35.1785 4.45511 35.1658 4.39735 34.6589C4.30195 33.8289 4.25837 32.6008 4.30192 31.808L4.33666 31.0674L3.22502 29.101C1.5033 26.0375 0.409325 23.4645 -0.012563 21.4992C-0.235219 20.4218 -0.221193 19.9436 0.0522186 19.5899C0.21871 19.3763 0.764928 19.1545 1.42322 19.0329C3.08041 18.742 6.69466 19.0056 10.7155 19.7155L11.1329 19.788L12.0511 18.976C13.5747 17.6264 14.587 16.8696 16.4531 15.706C18.3981 14.4891 20.5929 13.4877 23.0648 12.695L23.8577 12.4414L24.2939 11.2964C25.8547 7.17615 27.4533 4.13844 28.5931 3.12762ZM15.5182 24.243C13.7542 25.2615 12.8718 25.7706 12.2236 26.3413C9.59893 28.6526 8.61811 32.3134 9.73545 35.6274C10.0114 36.4457 10.5201 37.3283 11.5386 39.0923C12.5571 40.8564 13.0671 41.7383 13.6378 42.3864C15.9491 45.0112 19.6103 45.9929 22.9243 44.8755C23.7426 44.5995 24.6249 44.0899 26.3888 43.0714L36.5375 37.2121C38.3016 36.1936 39.184 35.6845 39.8321 35.1137C42.4568 32.8024 43.4373 29.1409 42.3198 25.8269C42.0438 25.0086 41.5342 24.1264 40.5158 22.3624C39.4973 20.5983 38.9882 19.7159 38.4175 19.0678C36.1062 16.4432 32.4454 15.4622 29.1314 16.5796C28.3131 16.8556 27.431 17.3651 25.6669 18.3836L15.5182 24.243Z"
					fill="#FFFFFF"
				/>
				<rect
					x="16.4961"
					y="31.3344"
					width="4.00904"
					height="8.32646"
					rx="2.00452"
					transform="rotate(-30 16.4961 31.3344)"
					fill="#FFFFFF"
				/>
				<rect
					x="27.3125"
					y="25.0894"
					width="4.00904"
					height="8.32646"
					rx="2.00452"
					transform="rotate(-30 27.3125 25.0894)"
					fill="#FFFFFF"
				/>
			</g>
		</svg>
	);
}
