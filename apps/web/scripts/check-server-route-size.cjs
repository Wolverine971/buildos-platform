#!/usr/bin/env node
/**
 * Guardrail: prevent introducing new oversized `+server.ts` route handlers.
 *
 * Existing oversized routes are grandfathered in `route-size-allowlist.json`.
 * New oversized route files fail this check.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROUTES_ROOT = path.join(PROJECT_ROOT, 'src', 'routes');
const ALLOWLIST_PATH = path.join(__dirname, 'route-size-allowlist.json');
const MAX_LINES = Number.parseInt(process.env.SERVER_ROUTE_MAX_LINES ?? '400', 10);

if (!Number.isFinite(MAX_LINES) || MAX_LINES <= 0) {
	console.error('[route-size-guard] SERVER_ROUTE_MAX_LINES must be a positive integer.');
	process.exit(1);
}

function collectServerRouteFiles(dir, accumulator = []) {
	if (!fs.existsSync(dir)) {
		return accumulator;
	}

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectServerRouteFiles(fullPath, accumulator);
			continue;
		}
		if (entry.isFile() && entry.name === '+server.ts') {
			accumulator.push(fullPath);
		}
	}
	return accumulator;
}

function toRepoRelative(filePath) {
	return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
}

function countLines(filePath) {
	const source = fs.readFileSync(filePath, 'utf8');
	if (!source) return 0;
	return source.split(/\r?\n/).length;
}

function readAllowlist() {
	if (!fs.existsSync(ALLOWLIST_PATH)) {
		console.error(`[route-size-guard] Missing allowlist file: ${ALLOWLIST_PATH}`);
		process.exit(1);
	}

	try {
		const raw = fs.readFileSync(ALLOWLIST_PATH, 'utf8');
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed?.grandfathered)) {
			throw new Error('`grandfathered` must be an array');
		}
		return new Set(parsed.grandfathered);
	} catch (error) {
		console.error('[route-size-guard] Failed to parse allowlist file.');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

const allowlist = readAllowlist();
const files = collectServerRouteFiles(ROUTES_ROOT).sort();

const oversized = files
	.map((filePath) => ({
		path: toRepoRelative(filePath),
		lines: countLines(filePath)
	}))
	.filter((file) => file.lines > MAX_LINES);

const violations = oversized.filter((file) => !allowlist.has(file.path));
const staleAllowlistEntries = Array.from(allowlist)
	.filter((allowlistedPath) => !oversized.some((file) => file.path === allowlistedPath))
	.sort();

if (violations.length > 0) {
	console.error(
		`[route-size-guard] Found new oversized +server.ts files (max ${MAX_LINES} lines):`
	);
	for (const violation of violations) {
		console.error(`  - ${violation.path} (${violation.lines} lines)`);
	}
	console.error(
		'[route-size-guard] Split these files below the limit. Do not add new oversized routes.'
	);
	process.exit(1);
}

if (staleAllowlistEntries.length > 0) {
	console.warn('[route-size-guard] Stale allowlist entries detected (safe to remove):');
	for (const entry of staleAllowlistEntries) {
		console.warn(`  - ${entry}`);
	}
}

console.log(
	`[route-size-guard] OK (${oversized.length} grandfathered oversized routes, no new violations).`
);
