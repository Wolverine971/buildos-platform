// apps/worker/tests/packageWorkerSafety.endstate.test.ts
//
// END-STATE INVARIANT for the @buildos/shared-agent-ops package: it must stay
// worker-safe. The worker (a plain Node process) imports this package, so its
// `src/` may NEVER reach for SvelteKit-only modules — `$lib`, `$env`, `$app`, or
// `@sveltejs/kit` — nor the web tool-registry/skill-load surface that the Wave 7
// dependency-inversion deliberately kept out.
//
// This is GREEN today and is the guardrail for the calendar carve (Waves 5–6):
// pulling CalendarService / GoogleOAuthService / ProjectCalendarService into the
// package without first stripping their `$env`/`$app`/`$lib` imports (R4/R5/etc.)
// would turn it RED. A failure here fails the build, not just this test.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_SRC = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
	'packages',
	'shared-agent-ops',
	'src'
);

// Forbidden module-specifier prefixes/exact names in `import`/`export … from`/
// dynamic `import()`/`require()`. Matches the Wave 7 grep invariant.
const FORBIDDEN: Array<{ label: string; test: (spec: string) => boolean }> = [
	{ label: '$lib', test: (s) => s === '$lib' || s.startsWith('$lib/') },
	{ label: '$env', test: (s) => s === '$env' || s.startsWith('$env/') },
	{ label: '$app', test: (s) => s === '$app' || s.startsWith('$app/') },
	{ label: '@sveltejs/kit', test: (s) => s === '@sveltejs/kit' || s.startsWith('@sveltejs/') },
	{ label: 'tool-registry', test: (s) => s.includes('tool-registry') },
	{ label: 'skill-load', test: (s) => s.includes('skill-load') }
];

function listTsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...listTsFiles(full));
		} else if (/\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

// Capture the module specifier from import/export-from/dynamic-import/require.
const SPECIFIER_RE =
	/(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

describe('END STATE — @buildos/shared-agent-ops stays worker-safe', () => {
	it('has a src/ directory to scan', () => {
		expect(existsSync(PKG_SRC), `expected package src at ${PKG_SRC}`).toBe(true);
	});

	it('contains no SvelteKit ($lib/$env/$app/@sveltejs) or web-registry imports in src/', () => {
		const violations: string[] = [];
		for (const file of listTsFiles(PKG_SRC)) {
			const content = readFileSync(file, 'utf8');
			let match: RegExpExecArray | null;
			SPECIFIER_RE.lastIndex = 0;
			while ((match = SPECIFIER_RE.exec(content)) !== null) {
				const spec = match[1];
				for (const rule of FORBIDDEN) {
					if (rule.test(spec)) {
						violations.push(
							`${relative(PKG_SRC, file)} imports "${spec}" (${rule.label})`
						);
					}
				}
			}
		}
		expect(violations, `worker-unsafe imports found:\n${violations.join('\n')}`).toEqual([]);
	});
});
