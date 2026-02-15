#!/usr/bin/env node
/**
 * Guardrail: enforce onto_projects select-column parity with shared schema.
 *
 * Scans apps/web/src for Supabase `.select(...)` string literals and validates:
 * 1) direct selects on `from('onto_projects')`
 * 2) relation selects like `project:onto_projects(...)`
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'src');
const SHARED_SCHEMA_PATH = path.resolve(
	PROJECT_ROOT,
	'..',
	'..',
	'packages',
	'shared-types',
	'src',
	'database.schema.ts'
);

const FILE_EXTENSIONS = new Set(['.ts', '.js', '.svelte']);

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

function toRepoRelative(filePath) {
	return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
}

function lineNumberForIndex(text, index) {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
}

function splitTopLevel(input) {
	const parts = [];
	let current = '';
	let depth = 0;
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;

	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];
		const prev = input[i - 1];

		if (ch === "'" && !inDouble && !inBacktick && prev !== '\\') {
			inSingle = !inSingle;
		} else if (ch === '"' && !inSingle && !inBacktick && prev !== '\\') {
			inDouble = !inDouble;
		} else if (ch === '`' && !inSingle && !inDouble && prev !== '\\') {
			inBacktick = !inBacktick;
		}

		if (!inSingle && !inDouble && !inBacktick) {
			if (ch === '(') depth += 1;
			if (ch === ')' && depth > 0) depth -= 1;
			if (ch === ',' && depth === 0) {
				if (current.trim()) parts.push(current.trim());
				current = '';
				continue;
			}
		}

		current += ch;
	}

	if (current.trim()) parts.push(current.trim());
	return parts;
}

function normalizeSelectToken(token) {
	if (!token) return null;
	let value = token.trim();
	if (!value || value === '*') return null;
	if (value.startsWith('...')) return null;
	if (value.includes('(') || value.includes(')')) return null;
	if (value.includes('->') || value.includes('::')) return null;

	const aliasSeparator = value.indexOf(':');
	if (aliasSeparator !== -1) {
		value = value.slice(aliasSeparator + 1).trim();
	}

	const joinSeparator = value.indexOf('!');
	if (joinSeparator !== -1) {
		value = value.slice(0, joinSeparator).trim();
	}

	return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value) ? value : null;
}

function extractLiteralValue(literalToken) {
	const quote = literalToken[0];
	return literalToken
		.slice(1, literalToken.length - 1)
		.replace(new RegExp(`\\\\${quote}`, 'g'), quote);
}

function getAllowedOntoProjectColumns() {
	if (!fs.existsSync(SHARED_SCHEMA_PATH)) {
		throw new Error(`Shared schema not found: ${SHARED_SCHEMA_PATH}`);
	}

	const schemaText = fs.readFileSync(SHARED_SCHEMA_PATH, 'utf8');
	const lines = schemaText.split(/\r?\n/);
	const startIndex = lines.findIndex((line) => /\bonto_projects:\s*\{/.test(line));
	if (startIndex === -1) {
		throw new Error('Could not locate `onto_projects` in shared schema.');
	}

	const columns = new Set();
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (/^\s*};\s*$/.test(line)) break;
		const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
		if (match) columns.add(match[1]);
	}

	if (columns.size === 0) {
		throw new Error('Failed to extract onto_projects columns from shared schema.');
	}

	return columns;
}

function findViolationsInFile(filePath, allowedColumns) {
	const text = fs.readFileSync(filePath, 'utf8');
	const violations = [];

	const selectLiteralRegex = /\.select\(\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/g;
	const fromOntoProjectsRegex = /from\(\s*['"]onto_projects['"]\s*\)/g;
	const inlineSelectRegex = /\.select\(\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/;
	const relationOntoProjectsRegex = /onto_projects(?:![a-zA-Z0-9_]+)?\s*\(([\s\S]*?)\)/g;

	const seen = new Set();

	let fromMatch;
	while ((fromMatch = fromOntoProjectsRegex.exec(text)) !== null) {
		const statementStart = fromMatch.index;
		const statementEnd = text.indexOf(';', statementStart);
		const queryStatement = text.slice(
			statementStart,
			statementEnd === -1 ? undefined : statementEnd
		);
		const selectMatch = inlineSelectRegex.exec(queryStatement);
		if (!selectMatch) continue;

		const literal = selectMatch[1];
		const selectBody = extractLiteralValue(literal);
		const unknownColumns = new Set();

		for (const token of splitTopLevel(selectBody)) {
			const normalized = normalizeSelectToken(token);
			if (!normalized) continue;
			if (!allowedColumns.has(normalized)) unknownColumns.add(normalized);
		}

		if (unknownColumns.size > 0) {
			const line = lineNumberForIndex(text, statementStart);
			const key = `direct:${line}:${Array.from(unknownColumns).sort().join(',')}`;
			if (seen.has(key)) continue;
			seen.add(key);
			violations.push({
				file: toRepoRelative(filePath),
				line,
				kind: 'direct',
				columns: Array.from(unknownColumns).sort()
			});
		}
	}

	let selectMatch;
	while ((selectMatch = selectLiteralRegex.exec(text)) !== null) {
		const literal = selectMatch[1];
		const selectBody = extractLiteralValue(literal);

		let relationMatch;
		while ((relationMatch = relationOntoProjectsRegex.exec(selectBody)) !== null) {
			const relationBody = relationMatch[1];
			const unknownColumns = new Set();

			for (const token of splitTopLevel(relationBody)) {
				const normalized = normalizeSelectToken(token);
				if (!normalized) continue;
				if (!allowedColumns.has(normalized)) unknownColumns.add(normalized);
			}

			if (unknownColumns.size > 0) {
				const line = lineNumberForIndex(text, selectMatch.index);
				const key = `relation:${line}:${Array.from(unknownColumns).sort().join(',')}`;
				if (seen.has(key)) continue;
				seen.add(key);
				violations.push({
					file: toRepoRelative(filePath),
					line,
					kind: 'relation',
					columns: Array.from(unknownColumns).sort()
				});
			}
		}
	}

	return violations;
}

function main() {
	let allowedColumns;
	try {
		allowedColumns = getAllowedOntoProjectColumns();
	} catch (error) {
		console.error('[onto-project-columns-guard] Failed to read allowed columns.');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}

	const files = collectSourceFiles(SOURCE_ROOT).sort();
	const violations = files.flatMap((filePath) => findViolationsInFile(filePath, allowedColumns));

	if (violations.length > 0) {
		console.error(
			'[onto-project-columns-guard] Invalid onto_projects column usage found in .select(...) literals:'
		);
		for (const violation of violations) {
			console.error(
				`  - ${violation.file}:${violation.line} [${violation.kind}] -> ${violation.columns.join(', ')}`
			);
		}
		console.error(
			'[onto-project-columns-guard] Use columns defined on packages/shared-types/src/database.schema.ts (onto_projects).'
		);
		process.exit(1);
	}

	console.log(
		`[onto-project-columns-guard] OK (${files.length} files scanned, onto_projects columns are valid).`
	);
}

main();
