// scripts/testing/test-inventory.mjs
// Reports configured runners and files on disk. Counts are not executed tests or coverage.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = execFileSync(
	'rg',
	[
		'--files',
		'--hidden',
		'-g',
		'!node_modules',
		'-g',
		'!.git',
		'-g',
		'!dist',
		'-g',
		'!.svelte-kit',
		'apps',
		'packages',
		'scripts',
		'supabase/tests'
	],
	{ cwd: root, encoding: 'utf8' }
)
	.trim()
	.split('\n');
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const manifests = files
	.filter((file) => /^(apps|packages)\/[^/]+\/package.json$/.test(file))
	.sort();
console.log(
	'# Testing runner inventory\n\nGenerated from current package scripts and files. File counts do not establish execution or coverage.\n'
);
console.log('| Workspace | Test/spec files on disk | Runner scripts |\n| --- | ---: | --- |');
for (const file of manifests) {
	const pkg = readJson(file);
	const dir = dirname(file);
	const scripts = Object.entries(pkg.scripts ?? {}).filter(([key]) => /^test(?::|$)/.test(key));
	if (!scripts.length) continue;
	const count = files.filter(
		(file) => file.startsWith(dir + '/') && /\.(test|spec)\.[cm]?[jt]s$/.test(file)
	).length;
	console.log(`| ${pkg.name} | ${count} | ${scripts.map(([key]) => `\`${key}\``).join(', ')} |`);
}
console.log('\n## Root runners and gates\n');
for (const [name, command] of Object.entries(readJson('package.json').scripts)) {
	if (/^(test(?::|$)|verify(?::|$)|check:sql-contracts$)/.test(name))
		console.log(`- \`${name}\`: \`${command}\``);
}
console.log('\n## Database contracts\n');
console.log(
	`- Current-schema assertion files: ${files.filter((file) => file.startsWith('supabase/tests/') && file.endsWith('.check.sql')).length}. Executed by \`test:sql-current\`.`
);
console.log(
	'- Run `pnpm check:sql-contracts` for the classified historical/self-contained SQL inventory.'
);
console.log(
	'\nSee each workspace Vitest config for discovery/exclusions, and .github/workflows/ci.yml for CI ownership. Live model suites are separately approved and excluded from the free gate.'
);
