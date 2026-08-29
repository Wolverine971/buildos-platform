#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, '../..');
const migrationsDirectory = join(repoRoot, 'supabase/migrations');
const testsDirectory = join(repoRoot, 'supabase/tests');

const destructivePattern =
	/\b(?:drop|truncate)\s+(?:schema|table|view|materialized\s+view|function|type|sequence|policy|trigger|index)\b/i;
const globalDdlPattern =
	/\b(?:create|alter|drop)\s+(?:role|user|database|system|extension|event\s+trigger|publication|subscription|server|foreign\s+data\s+wrapper|tablespace)\b/i;
const allowedStatementPatterns = [
	/^set\b/i,
	/^reset\b/i,
	/^notify\b/i,
	/^create\s+(?:or\s+replace\s+)?(?:schema|table|view|materialized\s+view|function|type|sequence|(?:unique\s+)?index|trigger|policy)\b/i,
	/^alter\s+(?:schema|table|view|materialized\s+view|function|type|sequence|index|trigger|policy|default\s+privileges)\b/i,
	/^drop\s+(?:schema|table|view|materialized\s+view|function|type|sequence|index|trigger|policy)\b/i,
	/^(?:grant|revoke)\b/i,
	/^(?:insert\s+into|update|delete\s+from|truncate|with)\b/i
];

export function validateLibriMigration(filename, sql) {
	const failures = [];
	const header = parseHeader(sql, failures);
	if (!/^\d{14}_libri_[a-z0-9][a-z0-9_]*\.sql$/.test(filename)) {
		failures.push('filename must match <14 digits>_libri_<description>.sql');
	}
	if (!header.isLibriMigration) {
		failures.push('missing required header: -- libri-migration: true');
	}

	const normalizedSql = stripComments(sql);
	if (!/\bset\s+(?:local\s+)?lock_timeout\s*=\s*'[^']+'/i.test(normalizedSql)) {
		failures.push('missing an explicit lock_timeout');
	}
	if (!/\bset\s+(?:local\s+)?statement_timeout\s*=\s*'[^']+'/i.test(normalizedSql)) {
		failures.push('missing an explicit statement_timeout');
	}
	if (destructivePattern.test(normalizedSql) && !header.allowDestructive) {
		failures.push(
			'destructive DDL is forbidden; use an expansion/contract sequence and an explicitly reviewed libri-allow-destructive header'
		);
	}
	if (globalDdlPattern.test(normalizedSql)) {
		failures.push('global/database DDL is forbidden in Libri migrations');
	}
	if (/\bdblink(?:_exec)?\s*\(/i.test(normalizedSql)) {
		failures.push('dblink is forbidden in Libri migrations');
	}
	if (/\bexecute\b(?!\s+(?:function\b|on\s+functions?\b))/i.test(normalizedSql)) {
		failures.push(
			'dynamic SQL is forbidden in Libri migrations because static scope cannot be proven'
		);
	}
	if (/\bsecurity\s+definer\b/i.test(normalizedSql)) {
		failures.push(
			'SECURITY DEFINER is forbidden in Libri migrations; use RLS or an explicitly reviewed API migration'
		);
	}
	for (const body of collectDollarQuotedBodies(normalizedSql)) {
		if (/\b(?:public|storage)\s*\./i.test(body)) {
			failures.push(
				'cross-schema references inside routine bodies are forbidden because their effects cannot be statically proven'
			);
		}
	}
	if (maskSingleQuotedLiterals(normalizedSql).includes('"')) {
		failures.push(
			'quoted identifiers are forbidden in Libri migrations; use lowercase snake_case identifiers'
		);
	}

	for (const statement of splitSqlStatements(normalizedSql)) {
		validateStatementFamily(statement, failures);
		validateGrantStatement(statement, header, failures);
	}
	const mutationTargets = collectMutationTargets(normalizedSql);
	for (const target of mutationTargets) {
		const failure = validateMutationTarget(target, header);
		if (failure) failures.push(failure);
	}
	validateCrossSchemaReferences(normalizedSql, mutationTargets, failures);
	for (const statement of splitSqlStatements(normalizedSql)) {
		if (!/\balter\s+type\s+public\.queue_type\b/i.test(statement)) continue;
		const match = statement.match(
			/\balter\s+type\s+public\.queue_type\s+add\s+value\s+if\s+not\s+exists\s+'([^']+)'\s*$/i
		);
		if (!match || !match[1].startsWith('libri_')) {
			failures.push(
				"public.queue_type may only receive an idempotent ADD VALUE whose label starts with 'libri_'"
			);
		}
	}
	return [...new Set(failures)];
}

export function isLibriMigration(filename, sql) {
	return filename.includes('_libri_') || /^\s*--\s*libri-migration:\s*true\s*$/im.test(sql);
}

export function referencesLibri(sql) {
	const normalizedSql = stripComments(sql);
	return (
		/\blibri\s*\./i.test(maskSingleQuotedLiterals(normalizedSql)) ||
		/\b(?:create|alter|drop)\s+schema\s+(?:if\s+(?:not\s+)?exists\s+)?libri\b/i.test(
			normalizedSql
		)
	);
}

function parseHeader(sql, failures) {
	return {
		isLibriMigration: /^\s*--\s*libri-migration:\s*true\s*$/im.test(sql),
		allowDestructive: /^\s*--\s*libri-allow-destructive:\s*reviewed\s*$/im.test(sql),
		publicObjects: parseOperationHeader(sql, 'libri-allow-public', failures),
		storageObjects: parseOperationHeader(sql, 'libri-allow-storage', failures)
	};
}

function parseOperationHeader(sql, key, failures) {
	const match = sql.match(new RegExp(`^\\s*--\\s*${key}:\\s*([^\\n]+)$`, 'im'));
	const operationsByObject = new Map();
	if (!match) return operationsByObject;
	for (const rawEntry of match[1].split(',')) {
		const entryMatch = rawEntry
			.trim()
			.toLowerCase()
			.match(
				/^([a-z_][a-z0-9_$]*):(create|alter|drop|insert|update|delete|truncate|policy|trigger|index|grant|revoke)$/
			);
		if (!entryMatch) {
			failures.push(
				`${key} entries must use object:operation (for example queue_type:alter)`
			);
			continue;
		}
		const [, object, operation] = entryMatch;
		const operations = operationsByObject.get(object) ?? new Set();
		operations.add(operation);
		operationsByObject.set(object, operations);
	}
	return operationsByObject;
}

function stripComments(sql) {
	let result = '';
	let index = 0;
	let quote = null;
	while (index < sql.length) {
		if (quote === "'") {
			result += sql[index];
			if (sql[index] === "'" && sql[index + 1] === "'") {
				result += sql[index + 1];
				index += 2;
				continue;
			}
			if (sql[index] === "'") quote = null;
			index += 1;
			continue;
		}
		if (quote?.startsWith('$')) {
			if (sql.startsWith(quote, index)) {
				result += quote;
				index += quote.length;
				quote = null;
			} else {
				result += sql[index];
				index += 1;
			}
			continue;
		}
		if (sql.startsWith('--', index)) {
			const newline = sql.indexOf('\n', index + 2);
			if (newline === -1) break;
			result += '\n';
			index = newline + 1;
			continue;
		}
		if (sql.startsWith('/*', index)) {
			const end = sql.indexOf('*/', index + 2);
			if (end === -1) break;
			result += ' ';
			index = end + 2;
			continue;
		}
		if (sql[index] === "'") {
			quote = "'";
			result += sql[index];
			index += 1;
			continue;
		}
		const dollar = sql.slice(index).match(/^\$[a-zA-Z_0-9]*\$/)?.[0];
		if (dollar) {
			quote = dollar;
			result += dollar;
			index += dollar.length;
			continue;
		}
		result += sql[index];
		index += 1;
	}
	return result.trim();
}

function splitSqlStatements(sql) {
	const statements = [];
	let current = '';
	let index = 0;
	let quote = null;
	while (index < sql.length) {
		if (quote === "'") {
			current += sql[index];
			if (sql[index] === "'" && sql[index + 1] === "'") {
				current += sql[index + 1];
				index += 2;
				continue;
			}
			if (sql[index] === "'") quote = null;
			index += 1;
			continue;
		}
		if (quote?.startsWith('$')) {
			if (sql.startsWith(quote, index)) {
				current += quote;
				index += quote.length;
				quote = null;
			} else {
				current += sql[index];
				index += 1;
			}
			continue;
		}
		if (sql[index] === "'") {
			quote = "'";
			current += sql[index];
			index += 1;
			continue;
		}
		const dollar = sql.slice(index).match(/^\$[a-zA-Z_0-9]*\$/)?.[0];
		if (dollar) {
			quote = dollar;
			current += dollar;
			index += dollar.length;
			continue;
		}
		if (sql[index] === ';') {
			if (current.trim()) statements.push(current.trim());
			current = '';
			index += 1;
			continue;
		}
		current += sql[index];
		index += 1;
	}
	if (current.trim()) statements.push(current.trim());
	return statements;
}

function maskSingleQuotedLiterals(sql) {
	let result = '';
	let index = 0;
	let inQuote = false;
	while (index < sql.length) {
		if (inQuote) {
			if (sql[index] === "'" && sql[index + 1] === "'") {
				result += '  ';
				index += 2;
				continue;
			}
			if (sql[index] === "'") inQuote = false;
			result += ' ';
			index += 1;
			continue;
		}
		if (sql[index] === "'") {
			inQuote = true;
			result += ' ';
			index += 1;
			continue;
		}
		result += sql[index];
		index += 1;
	}
	return result;
}

function collectDollarQuotedBodies(sql) {
	return [...sql.matchAll(/(\$[a-zA-Z_0-9]*\$)([\s\S]*?)\1/g)].map((match) => match[2]);
}

function validateStatementFamily(statement, failures) {
	const masked = maskSingleQuotedLiterals(statement).replace(/\s+/g, ' ').trim();
	if (!allowedStatementPatterns.some((pattern) => pattern.test(masked))) {
		failures.push(`unsupported or unverifiable SQL statement: ${masked.slice(0, 80)}`);
	}
	if (/^with\b/i.test(masked) && collectMutationTargets(statement).length === 0) {
		failures.push('WITH statements must contain a statically verifiable mutation target');
	}
	if (
		/^create\s+(?:or\s+replace\s+)?function\b/i.test(masked) &&
		!/\$[a-zA-Z_0-9]*\$/.test(masked)
	) {
		failures.push('function bodies must use dollar quoting so their scope can be inspected');
	}
}

function validateGrantStatement(statement, header, failures) {
	if (/^\s*alter\s+default\s+privileges\b/i.test(statement)) {
		const match = statement.match(/\bin\s+schema\s+([a-z_][a-z0-9_$]*)\b/i);
		if (!match || match[1].toLowerCase() !== 'libri') {
			failures.push('ALTER DEFAULT PRIVILEGES must be limited to IN SCHEMA libri');
		}
		return;
	}
	const operationMatch = statement.match(/^\s*(grant|revoke)\b/i);
	if (!operationMatch) return;
	const operation = operationMatch[1].toLowerCase();
	const targetMatch = statement.match(
		/\bon\s+(?:(schema|all\s+tables\s+in\s+schema|all\s+sequences\s+in\s+schema|tables|table|sequences|sequence|functions|function|type)\s+)?([\s\S]+?)\s+(?:to|from)\b/i
	);
	if (!targetMatch) {
		failures.push(`${operation.toUpperCase()} target could not be statically verified`);
		return;
	}
	const targetKind = targetMatch[1]?.toLowerCase() ?? 'table';
	for (const rawTarget of targetMatch[2].split(',').map((value) => value.trim())) {
		const target = rawTarget.replace(/\([^)]*\)\s*$/, '');
		if (targetKind.includes('in schema') || targetKind === 'schema') {
			if (target.toLowerCase() !== 'libri') {
				failures.push(
					`Libri migration cannot ${operation} privileges on schema ${target.toLowerCase()}`
				);
			}
			continue;
		}
		const qualified = target.match(/^([a-z_][a-z0-9_$]*)\.([a-z_][a-z0-9_$]*)$/i);
		if (!qualified) {
			failures.push(
				`${operation.toUpperCase()} target must be schema-qualified (${rawTarget})`
			);
			continue;
		}
		const failure = validateMutationTarget(
			{
				operation,
				schema: qualified[1].toLowerCase(),
				object: qualified[2].toLowerCase()
			},
			header
		);
		if (failure) failures.push(failure);
	}
}

function collectMutationTargets(sql) {
	const scanSql = maskSingleQuotedLiterals(sql);
	const dmlSql = scanSql.replace(/\b(?:on|for|before|after|instead\s+of)\s+update\b/gi, (match) =>
		' '.repeat(match.length)
	);
	const targets = [];
	const rules = [
		{
			operation: (match) =>
				match[1].toLowerCase().startsWith('create') ? 'create' : match[1].toLowerCase(),
			pattern:
				/\b(create(?:\s+or\s+replace)?|alter|drop)\s+(?:table|view|materialized\s+view|function|type|sequence)\s+(?:if\s+(?:not\s+)?exists\s+)?([a-z_][a-z0-9_$]*)(?:\.([a-z_][a-z0-9_$]*))?/gi,
			source: scanSql
		},
		{
			operation: (match) => match[1].toLowerCase(),
			pattern:
				/\b(insert\s+into|update(?!\s+(?:on|to)\b)|delete\s+from|truncate(?:\s+table)?)\s+([a-z_][a-z0-9_$]*)(?:\.([a-z_][a-z0-9_$]*))?/gi,
			source: dmlSql
		},
		{
			operation: () => 'index',
			pattern:
				/\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z_][a-z0-9_$]*\s+on\s+([a-z_][a-z0-9_$]*)(?:\.([a-z_][a-z0-9_$]*))?/gi,
			source: scanSql,
			noOperationCapture: true
		},
		{
			operation: () => 'index',
			pattern:
				/\b(?:alter|drop)\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?([a-z_][a-z0-9_$]*)(?:\.([a-z_][a-z0-9_$]*))?/gi,
			source: scanSql,
			noOperationCapture: true
		},
		{
			operation: () => 'policy',
			pattern:
				/\b(?:create|alter|drop)\s+policy\s+[a-z_][a-z0-9_$]*\s+on\s+([a-z_][a-z0-9_$]*)(?:\.([a-z_][a-z0-9_$]*))?/gi,
			source: scanSql,
			noOperationCapture: true
		},
		{
			operation: () => 'trigger',
			pattern:
				/\b(?:create|alter|drop)\s+trigger\s+[a-z_][a-z0-9_$]*[\s\S]*?\bon\s+([a-z_][a-z0-9_$]*)(?:\.([a-z_][a-z0-9_$]*))?/gi,
			source: scanSql,
			noOperationCapture: true
		}
	];
	for (const rule of rules) {
		for (const match of rule.source.matchAll(rule.pattern)) {
			const offset = rule.noOperationCapture ? 0 : 1;
			targets.push({
				operation: rule.operation(match).replace(/\s+.*/, ''),
				schema: match[1 + offset]?.toLowerCase() ?? null,
				object: match[2 + offset]?.toLowerCase() ?? null
			});
		}
	}
	for (const match of scanSql.matchAll(
		/\b(?:create|alter|drop)\s+schema\s+(?:if\s+(?:not\s+)?exists\s+)?([a-z_][a-z0-9_$]*)/gi
	)) {
		targets.push({ operation: 'schema', schema: match[1].toLowerCase(), object: null });
	}
	return targets;
}

function validateCrossSchemaReferences(sql, mutationTargets, failures) {
	const classifiedTargets = new Set(
		mutationTargets
			.filter(
				(target) =>
					target.object && (target.schema === 'public' || target.schema === 'storage')
			)
			.map((target) => `${target.schema}.${target.object}`)
	);
	const references = new Set(
		[
			...maskSingleQuotedLiterals(sql).matchAll(
				/\b(public|storage)\s*\.\s*([a-z_][a-z0-9_$]*)\b/gi
			)
		].map((match) => `${match[1].toLowerCase()}.${match[2].toLowerCase()}`)
	);
	for (const reference of references) {
		if (!classifiedTargets.has(reference)) {
			failures.push(
				`unclassified cross-schema reference is forbidden in a Libri migration: ${reference}`
			);
		}
	}
}

function validateMutationTarget(target, header) {
	if (target.operation === 'schema') {
		return target.schema === 'libri'
			? null
			: `Libri migration cannot create/alter/drop schema ${target.schema}`;
	}
	if (!target.object) {
		return `Libri migration target must be schema-qualified (${target.operation}: ${target.schema})`;
	}
	if (target.schema === 'libri') return null;
	const allowlist =
		target.schema === 'public'
			? header.publicObjects
			: target.schema === 'storage'
				? header.storageObjects
				: null;
	if (allowlist?.get(target.object)?.has(target.operation)) return null;
	return `Libri migration cannot ${target.operation} ${target.schema}.${target.object} without an operation-specific allowlist`;
}

function main() {
	const failures = [];
	const migrationFiles = readdirSync(migrationsDirectory)
		.filter((filename) => filename.endsWith('.sql'))
		.sort();
	let libriMigrationCount = 0;
	for (const filename of migrationFiles) {
		const sql = readFileSync(join(migrationsDirectory, filename), 'utf8');
		const marked = isLibriMigration(filename, sql);
		if (!marked && referencesLibri(sql)) {
			failures.push(
				`${filename}: references libri without the required _libri_ filename and libri-migration header`
			);
			continue;
		}
		if (!marked) continue;
		libriMigrationCount += 1;
		for (const failure of validateLibriMigration(filename, sql)) {
			failures.push(`${filename}: ${failure}`);
		}
		const contractFilename = filename.replace(/\.sql$/, '.test.sql');
		if (!existsSync(join(testsDirectory, contractFilename))) {
			failures.push(
				`${filename}: missing matching SQL contract supabase/tests/${contractFilename}`
			);
		}
	}
	if (failures.length > 0) {
		console.error('Libri migration scope check failed:');
		for (const failure of failures) console.error(`- ${failure}`);
		process.exit(1);
	}
	console.log(`Libri migration scope valid: ${libriMigrationCount} migration(s).`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
