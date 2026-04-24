/** Paths that are always excluded, regardless of user settings. */
function normalizePrefix(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\.\//, "")
		.replace(/^\/+/, "");
}

function alwaysExcludedPrefixes(configDir: string): string[] {
	const normalizedConfigDir = normalizePrefix(configDir).replace(/\/$/, "");
	return [
		`${normalizedConfigDir}/`,
		".trash/",
	];
}

/**
 * Check if a vault-relative path should be excluded from sync.
 * Always excludes the current config directory and .trash/, plus any
 * user-configured prefixes.
 *
 * @param path - Vault-relative path (e.g. "templates/daily.md")
 * @param patterns - Parsed exclude prefixes (e.g. ["templates/", ".trash/"])
 * @param configDir - Obsidian config directory name
 * @returns true if the path matches any exclude pattern
 */
export function isExcluded(path: string, patterns: string[], configDir: string): boolean {
	const normalizedPath = normalizePrefix(path);
	for (const prefix of alwaysExcludedPrefixes(configDir)) {
		if (matchesPrefix(normalizedPath, prefix)) return true;
	}
	for (const prefix of patterns) {
		if (matchesPrefix(normalizedPath, normalizePrefix(prefix))) return true;
	}
	return false;
}

/**
 * Returns true if `path` matches `prefix` as a complete path segment boundary.
 * A prefix of "template" matches "template/note.md" and "template" itself,
 * but NOT "templatesX/note.md".
 * A prefix already ending with "/" matches any path under that directory.
 */
function matchesPrefix(path: string, prefix: string): boolean {
	if (!path.startsWith(prefix)) return false;
	if (prefix.endsWith("/")) return true;
	const next = path[prefix.length];
	return next === undefined || next === "/";
}

/**
 * Parse the comma-separated excludePatterns setting into a list of
 * trimmed, non-empty prefixes.
 */
export function parseExcludePatterns(raw: string): string[] {
	return raw
		.split(",")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}
