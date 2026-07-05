#!/usr/bin/env node
/**
 * Guardrail: prevent the worker HTTP surface from growing into large modules.
 *
 * This intentionally scopes to HTTP entrypoint, route, middleware, and app
 * modules. Worker processors have separate complexity debt and are not part of
 * the HTTP entrypoint refactor guardrail.
 */
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');
const ALLOWLIST_PATH = path.join(__dirname, 'worker-http-size-allowlist.json');
const MAX_LINES = Number.parseInt(process.env.WORKER_HTTP_MODULE_MAX_LINES ?? '300', 10);

const TARGETS = [
	path.join(SRC_ROOT, 'index.ts'),
	path.join(SRC_ROOT, 'app.ts'),
	path.join(SRC_ROOT, 'routes'),
	path.join(SRC_ROOT, 'middleware'),
	path.join(SRC_ROOT, 'http')
];

if (!Number.isFinite(MAX_LINES) || MAX_LINES <= 0) {
	console.error('[worker-http-size-guard] WORKER_HTTP_MODULE_MAX_LINES must be positive.');
	process.exit(1);
}

function collectTypeScriptFiles(fileOrDirectory, accumulator = []) {
	if (!fs.existsSync(fileOrDirectory)) return accumulator;

	const stat = fs.statSync(fileOrDirectory);
	if (stat.isFile()) {
		if (fileOrDirectory.endsWith('.ts')) {
			accumulator.push(fileOrDirectory);
		}
		return accumulator;
	}

	for (const entry of fs.readdirSync(fileOrDirectory, { withFileTypes: true })) {
		const fullPath = path.join(fileOrDirectory, entry.name);
		if (entry.isDirectory()) {
			collectTypeScriptFiles(fullPath, accumulator);
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			accumulator.push(fullPath);
		}
	}

	return accumulator;
}

function toProjectRelative(filePath) {
	return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
}

function countLines(filePath) {
	const source = fs.readFileSync(filePath, 'utf8');
	return source ? source.split(/\r?\n/).length : 0;
}

function readAllowlist() {
	if (!fs.existsSync(ALLOWLIST_PATH)) {
		console.error(`[worker-http-size-guard] Missing allowlist: ${ALLOWLIST_PATH}`);
		process.exit(1);
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
		if (!Array.isArray(parsed?.grandfathered)) {
			throw new Error('`grandfathered` must be an array');
		}
		return new Set(parsed.grandfathered);
	} catch (error) {
		console.error('[worker-http-size-guard] Failed to parse allowlist.');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

const allowlist = readAllowlist();
const files = Array.from(
	new Set(TARGETS.flatMap((target) => collectTypeScriptFiles(target)))
).sort();

const oversized = files
	.map((filePath) => ({ path: toProjectRelative(filePath), lines: countLines(filePath) }))
	.filter((file) => file.lines > MAX_LINES);

const violations = oversized.filter((file) => !allowlist.has(file.path));
const staleAllowlistEntries = Array.from(allowlist)
	.filter((allowlistedPath) => !oversized.some((file) => file.path === allowlistedPath))
	.sort();

if (violations.length > 0) {
	console.error(
		`[worker-http-size-guard] Found oversized worker HTTP modules (max ${MAX_LINES} lines):`
	);
	for (const violation of violations) {
		console.error(`  - ${violation.path} (${violation.lines} lines)`);
	}
	console.error('[worker-http-size-guard] Split these modules before adding more HTTP code.');
	process.exit(1);
}

if (staleAllowlistEntries.length > 0) {
	console.warn('[worker-http-size-guard] Stale allowlist entries detected:');
	for (const entry of staleAllowlistEntries) {
		console.warn(`  - ${entry}`);
	}
}

console.log(
	`[worker-http-size-guard] OK (${oversized.length} grandfathered oversized HTTP modules, no new violations).`
);
