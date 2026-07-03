#!/usr/bin/env node
/**
 * Guardrail: keep hot-path Supabase selects explicit and schema-backed.
 *
 * This focuses on the shared-agent-ops gateway where broad selects have caused
 * cross-package drift risk. It intentionally allows legacy broad selects in
 * web routes until those endpoints are migrated.
 */
const fs = require('fs');
const path = require('path');

const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..', '..');
const SHARED_SCHEMA_PATH = path.join(
	REPO_ROOT,
	'packages',
	'shared-types',
	'src',
	'database.schema.ts'
);
const GATEWAY_CONFIG_PATH = path.join(
	REPO_ROOT,
	'packages',
	'shared-agent-ops',
	'src',
	'gateway',
	'op-execution-gateway.config.ts'
);

const SOURCE_ROOTS = [path.join(REPO_ROOT, 'packages', 'shared-agent-ops', 'src', 'gateway')];

const GUARDED_TABLES = [
	'agent_call_tool_executions',
	'agent_runs',
	'onto_documents',
	'onto_edges',
	'onto_goals',
	'onto_milestones',
	'onto_plans',
	'onto_projects',
	'onto_risks',
	'onto_tasks'
];

const SELECT_CONSTANT_TABLES = {
	AGENT_CALL_TOOL_EXECUTION_SELECT: 'agent_call_tool_executions',
	AGENT_RUN_CHANGE_SET_SELECT: 'agent_runs',
	ONTO_DOCUMENT_SELECT: 'onto_documents',
	ONTO_EDGE_SELECT: 'onto_edges',
	ONTO_EVENT_SELECT: 'onto_events',
	ONTO_GOAL_SELECT: 'onto_goals',
	ONTO_METRIC_SELECT: 'onto_metrics',
	ONTO_MILESTONE_SELECT: 'onto_milestones',
	ONTO_PLAN_SELECT: 'onto_plans',
	ONTO_PROJECT_SELECT: 'onto_projects',
	ONTO_REQUIREMENT_SELECT: 'onto_requirements',
	ONTO_RISK_SELECT: 'onto_risks',
	ONTO_SOURCE_SELECT: 'onto_sources',
	ONTO_TASK_SELECT: 'onto_tasks'
};

const SCHEMA_TABLES = Array.from(
	new Set([...GUARDED_TABLES, ...Object.values(SELECT_CONSTANT_TABLES)])
);

const EXTRA_ALLOWED_COLUMNS = {
	agent_runs: new Set(['commit_started_at'])
};

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
	return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
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
	if (!value) return null;
	if (value === '*') return '*';
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

function getAllowedColumnsByTable() {
	if (!fs.existsSync(SHARED_SCHEMA_PATH)) {
		throw new Error(`Shared schema not found: ${SHARED_SCHEMA_PATH}`);
	}

	const schemaText = fs.readFileSync(SHARED_SCHEMA_PATH, 'utf8');
	const lines = schemaText.split(/\r?\n/);
	const allowedByTable = new Map();

	for (const table of SCHEMA_TABLES) {
		const startIndex = lines.findIndex((line) => new RegExp(`\\b${table}:\\s*\\{`).test(line));
		if (startIndex === -1) {
			throw new Error(`Could not locate \`${table}\` in shared schema.`);
		}

		const columns = new Set();
		for (let i = startIndex + 1; i < lines.length; i += 1) {
			const line = lines[i];
			if (/^\s*};\s*$/.test(line)) break;
			const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
			if (match) columns.add(match[1]);
		}

		if (columns.size === 0) {
			throw new Error(`Failed to extract ${table} columns from shared schema.`);
		}
		allowedByTable.set(table, columns);
	}

	return allowedByTable;
}

function isAllowedColumn(allowedByTable, table, column) {
	return allowedByTable.get(table)?.has(column) || EXTRA_ALLOWED_COLUMNS[table]?.has(column);
}

function validateSelectBody(selectBody, table, allowedByTable) {
	const unknownColumns = new Set();
	let hasBroadSelect = false;

	for (const token of splitTopLevel(selectBody)) {
		const normalized = normalizeSelectToken(token);
		if (normalized === '*') {
			hasBroadSelect = true;
			continue;
		}
		if (!normalized) continue;
		if (!isAllowedColumn(allowedByTable, table, normalized)) {
			unknownColumns.add(normalized);
		}
	}

	return { hasBroadSelect, unknownColumns };
}

function findSelectConstantViolations(allowedByTable) {
	const text = fs.readFileSync(GATEWAY_CONFIG_PATH, 'utf8');
	const violations = [];

	for (const [constantName, table] of Object.entries(SELECT_CONSTANT_TABLES)) {
		const constantRegex = new RegExp(
			`export\\s+const\\s+${constantName}\\s*=\\s*(` +
				'`[\\s\\S]*?`|\'[\\s\\S]*?\'|"[\\s\\S]*?")',
			'm'
		);
		const match = constantRegex.exec(text);
		if (!match) {
			violations.push({
				file: toRepoRelative(GATEWAY_CONFIG_PATH),
				line: 1,
				table,
				kind: 'missing-select-constant',
				columns: [constantName]
			});
			continue;
		}

		const { hasBroadSelect, unknownColumns } = validateSelectBody(
			extractLiteralValue(match[1]),
			table,
			allowedByTable
		);
		if (hasBroadSelect || unknownColumns.size > 0) {
			violations.push({
				file: toRepoRelative(GATEWAY_CONFIG_PATH),
				line: lineNumberForIndex(text, match.index),
				table,
				kind: hasBroadSelect ? 'broad-select-constant' : 'unknown-columns',
				columns: Array.from(unknownColumns).sort()
			});
		}
	}

	return violations;
}

function findDirectSelectViolations(filePath, allowedByTable) {
	const text = fs.readFileSync(filePath, 'utf8');
	const violations = [];
	const seen = new Set();
	const inlineSelectRegex = /\.select\(\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/;

	for (const table of GUARDED_TABLES) {
		const fromTableRegex = new RegExp(`from\\(\\s*['"]${table}['"]\\s*\\)`, 'g');
		let fromMatch;
		while ((fromMatch = fromTableRegex.exec(text)) !== null) {
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
			const { hasBroadSelect, unknownColumns } = validateSelectBody(
				selectBody,
				table,
				allowedByTable
			);

			if (hasBroadSelect || unknownColumns.size > 0) {
				const line = lineNumberForIndex(text, statementStart);
				const key = `${table}:${line}:${hasBroadSelect}:${Array.from(unknownColumns)
					.sort()
					.join(',')}`;
				if (seen.has(key)) continue;
				seen.add(key);
				violations.push({
					file: toRepoRelative(filePath),
					line,
					table,
					kind: hasBroadSelect ? 'broad-select' : 'unknown-columns',
					columns: Array.from(unknownColumns).sort()
				});
			}
		}
	}

	return violations;
}

function main() {
	let allowedByTable;
	try {
		allowedByTable = getAllowedColumnsByTable();
	} catch (error) {
		console.error('[supabase-select-guard] Failed to read allowed columns.');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}

	const files = SOURCE_ROOTS.flatMap((root) => collectSourceFiles(root)).sort();
	const violations = [
		...findSelectConstantViolations(allowedByTable),
		...files.flatMap((filePath) => findDirectSelectViolations(filePath, allowedByTable))
	];

	if (violations.length > 0) {
		console.error('[supabase-select-guard] Invalid guarded Supabase select usage found:');
		for (const violation of violations) {
			const suffix =
				violation.kind === 'broad-select'
					? 'uses select(*)'
					: violation.kind === 'broad-select-constant'
						? 'uses select(*)'
						: violation.kind === 'missing-select-constant'
							? `missing select constant: ${violation.columns.join(', ')}`
							: `unknown columns: ${violation.columns.join(', ')}`;
			console.error(`  - ${violation.file}:${violation.line} [${violation.table}] ${suffix}`);
		}
		console.error(
			'[supabase-select-guard] Use explicit columns from packages/shared-types/src/database.schema.ts.'
		);
		process.exit(1);
	}

	console.log(
		`[supabase-select-guard] OK (${files.length} files scanned, ` +
			`${GUARDED_TABLES.length} direct tables guarded, ` +
			`${Object.keys(SELECT_CONSTANT_TABLES).length} select constants validated).`
	);
}

main();
