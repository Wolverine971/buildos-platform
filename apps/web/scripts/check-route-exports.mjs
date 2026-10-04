// apps/web/scripts/check-route-exports.mjs
//
// Guardrail: SvelteKit rejects any export from a route module that is not one of its known names
// or `_`-prefixed ("Invalid export 'X' in src/routes/.../+page.server.ts"). svelte-check and vitest
// do not catch it; only `vite build` does, so it first shows up as a failed Vercel deploy
// (2026-10-04: an exported cookie-name constant in today/+page.server.ts). Runs in the web lint
// chain (guardrails:route-exports).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const routesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/routes');

const PAGE = ['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config', 'actions', 'entries'];
const LAYOUT = ['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config'];
const SERVER = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'OPTIONS',
	'HEAD',
	'fallback',
	'prerender',
	'trailingSlash',
	'config',
	'entries'
];
const ALLOWED_BY_FILE = {
	'+page.server.ts': PAGE,
	'+page.ts': PAGE,
	'+layout.server.ts': LAYOUT,
	'+layout.ts': LAYOUT,
	'+server.ts': SERVER
};

// Structured-format parsing of TypeScript export declarations, not language classification.
const DECLARED_EXPORT =
	/^export\s+(?:declare\s+)?(?:const|let|var|async\s+function\*?|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}/gm;

function exportedNames(source) {
	const names = [...source.matchAll(DECLARED_EXPORT)].map((match) => match[1]);
	for (const [, list] of source.matchAll(EXPORT_LIST)) {
		for (const part of list.split(',')) {
			const name = part
				.trim()
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (name && !name.startsWith('type ')) names.push(name);
		}
	}
	return names;
}

const errors = [];
let checked = 0;

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full);
			continue;
		}
		const allowed = ALLOWED_BY_FILE[entry.name];
		if (!allowed) continue;
		checked++;
		for (const name of exportedNames(fs.readFileSync(full, 'utf8'))) {
			if (name.startsWith('_') || allowed.includes(name)) continue;
			errors.push(
				`${path.relative(path.dirname(routesDir), full)}: invalid export "${name}" (prefix it with "_" or move it to a $lib module)`
			);
		}
	}
}

walk(routesDir);

console.log(`ROUTE EXPORT CHECK\n\nRoute modules checked: ${checked}\nErrors: ${errors.length}`);
if (errors.length > 0) {
	for (const error of errors) console.error(`  ✗ ${error}`);
	console.error('\nResult: failed.');
	process.exit(1);
}
console.log('\nResult: passed.');
