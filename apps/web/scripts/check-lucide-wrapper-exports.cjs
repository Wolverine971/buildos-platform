#!/usr/bin/env node
/**
 * Guardrail: root `lucide-svelte` imports are Vite-aliased to src/lib/icons/lucide.ts.
 *
 * Every named root import used in app source must be re-exported by the wrapper,
 * and every wrapper subpath must exist in the installed lucide-svelte package.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'src');
const WRAPPER_PATH = path.join(SOURCE_ROOT, 'lib', 'icons', 'lucide.ts');
const LUCIDE_DIST_ICONS = path.join(PROJECT_ROOT, 'node_modules', 'lucide-svelte', 'dist', 'icons');
const FILE_EXTENSIONS = new Set(['.svelte', '.ts', '.js']);

function collectSourceFiles(dir, files = []) {
	if (!fs.existsSync(dir)) return files;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectSourceFiles(fullPath, files);
			continue;
		}
		if (entry.isFile() && FILE_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(fullPath);
		}
	}
	return files;
}

function toProjectRelative(filePath) {
	return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
}

function lineNumberForIndex(text, index) {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
}

function parseImportSpecifiers(importBody) {
	return importBody
		.split(',')
		.map((specifier) => specifier.trim())
		.filter(Boolean)
		.map((specifier) =>
			specifier
				.replace(/^type\s+/, '')
				.split(/\s+as\s+/)[0]
				.trim()
		)
		.filter(Boolean);
}

function getRootLucideImports() {
	const imports = new Map();
	const importRegex = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-svelte['"]/g;

	for (const filePath of collectSourceFiles(SOURCE_ROOT)) {
		const source = fs.readFileSync(filePath, 'utf8');
		let match;
		while ((match = importRegex.exec(source)) !== null) {
			for (const importedName of parseImportSpecifiers(match[1])) {
				if (!imports.has(importedName)) imports.set(importedName, []);
				imports.get(importedName).push({
					file: toProjectRelative(filePath),
					line: lineNumberForIndex(source, match.index)
				});
			}
		}
	}

	return imports;
}

function getWrapperExports() {
	if (!fs.existsSync(WRAPPER_PATH)) {
		console.error(`[lucide-wrapper-guard] Missing wrapper: ${toProjectRelative(WRAPPER_PATH)}`);
		process.exit(1);
	}

	const source = fs.readFileSync(WRAPPER_PATH, 'utf8');
	const exportedNames = new Set();
	const iconSubpaths = [];
	const exportRegex =
		/export\s*\{\s*default\s+as\s+(\w+)\s*\}\s*from\s*['"]lucide-svelte\/icons\/([^'"]+)['"]/g;

	let match;
	while ((match = exportRegex.exec(source)) !== null) {
		exportedNames.add(match[1]);
		iconSubpaths.push({
			name: match[1],
			subpath: match[2],
			line: lineNumberForIndex(source, match.index)
		});
	}

	if (/\bexport\s+type\s+Icon\b/.test(source)) {
		exportedNames.add('Icon');
	}

	return { exportedNames, iconSubpaths };
}

const rootImports = getRootLucideImports();
const { exportedNames, iconSubpaths } = getWrapperExports();

const missingExports = Array.from(rootImports.keys())
	.filter((importedName) => !exportedNames.has(importedName))
	.sort();

const missingSubpaths = iconSubpaths.filter(({ subpath }) => {
	const jsPath = path.join(LUCIDE_DIST_ICONS, `${subpath}.js`);
	const sveltePath = path.join(LUCIDE_DIST_ICONS, `${subpath}.svelte`);
	return !fs.existsSync(jsPath) && !fs.existsSync(sveltePath);
});

if (missingExports.length > 0) {
	console.error('[lucide-wrapper-guard] Missing re-exports in src/lib/icons/lucide.ts:');
	for (const importedName of missingExports) {
		console.error(`  - ${importedName}`);
		for (const usage of rootImports.get(importedName)) {
			console.error(`    used at ${usage.file}:${usage.line}`);
		}
	}
}

if (missingSubpaths.length > 0) {
	console.error('[lucide-wrapper-guard] Wrapper exports point at missing lucide icon subpaths:');
	for (const { name, subpath, line } of missingSubpaths) {
		console.error(
			`  - ${name} -> lucide-svelte/icons/${subpath} at src/lib/icons/lucide.ts:${line}`
		);
	}
}

if (missingExports.length > 0 || missingSubpaths.length > 0) {
	console.error(
		'[lucide-wrapper-guard] Add the missing wrapper export with the exact installed icon subpath.'
	);
	process.exit(1);
}

console.log(
	`[lucide-wrapper-guard] OK (${rootImports.size} root imports covered, ${iconSubpaths.length} wrapper subpaths valid).`
);
