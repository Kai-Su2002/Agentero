type Translate = (
	key: "agent.npmCacheWriteFailed",
	options: Record<string, string>,
) => string;

export function lifecycleErrorMessage(message: string, t: Translate): string {
	const normalized = message.toLowerCase();
	const npmCacheWriteFailure =
		(normalized.includes("npm error") || normalized.includes("npm err!")) &&
		(normalized.includes("eperm") ||
			normalized.includes("operation was rejected by your operating system")) &&
		(normalized.includes("cache") ||
			normalized.includes("log files were not written") ||
			normalized.includes("error writing to the directory"));

	if (npmCacheWriteFailure) {
		return t("agent.npmCacheWriteFailed", {
			cacheCommand: 'npm config set cache "%LOCALAPPDATA%\\npm-cache"',
		});
	}
	return message;
}

/**
 * True when the failure is npm not being resolvable on PATH (Windows cmd
 * `'npm' is not recognized...`, Unix `npm: command not found`, or the Host's
 * own uninstall pre-check). Lets the UI attach a "install Node.js" recovery.
 */
export function isNpmMissingError(message: string): boolean {
	const normalized = message.toLowerCase();
	if (normalized.includes("npm is not available on path")) return true;
	if (!normalized.includes("npm")) return false;
	return (
		normalized.includes("not recognized as an internal or external command") ||
		normalized.includes("command not found")
	);
}
