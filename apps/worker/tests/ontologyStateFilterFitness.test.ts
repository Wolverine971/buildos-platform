// apps/worker/tests/ontologyStateFilterFitness.test.ts
//
// Repo fitness guard (tasker 108): a Supabase `state_key` filter on an
// ontology table may only name values its Postgres enum has. From 2026-07-06
// to 2026-09-25 the daily brief filtered onto_tasks on 'cancelled'/'archived',
// Postgres rejected the whole query (22P02), and every brief told every user
// they had no tasks. The check walks the TypeScript AST (a structured format):
// for each `.eq/.neq/.in/.not('state_key', …)` whose chain starts at
// `.from('onto_*')`, every string literal must be a member of that enum.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Constants } from '@buildos/shared-types';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SCANNED_ROOTS = ['apps/worker/src', 'apps/web/src', 'packages'];

const enums = Constants.public.Enums;
const STATE_ENUM_BY_TABLE: Record<string, readonly string[]> = {
	onto_tasks: enums.task_state,
	onto_documents: enums.document_state,
	onto_goals: enums.goal_state,
	onto_plans: enums.plan_state,
	onto_projects: enums.project_state,
	onto_risks: enums.risk_state,
	onto_milestones: enums.milestone_state
};
const FILTER_METHODS = new Set(['eq', 'neq', 'in', 'not']);

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
			return [];
		}
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) return listSourceFiles(entryPath);
		const isSource =
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.endsWith('.d.ts') &&
			!/\.(test|spec)\.ts$/.test(entry.name);
		return isSource ? [entryPath] : [];
	});
}

/** The table named by the `.from('<table>')` call this chain starts from. */
function chainTable(node: ts.Expression): string | null {
	let current: ts.Expression = node;
	while (true) {
		if (ts.isCallExpression(current)) {
			const callee = current.expression;
			if (
				ts.isPropertyAccessExpression(callee) &&
				callee.name.text === 'from' &&
				current.arguments[0] &&
				ts.isStringLiteralLike(current.arguments[0])
			) {
				return current.arguments[0].text;
			}
			current = callee;
		} else if (ts.isPropertyAccessExpression(current)) {
			current = current.expression;
		} else {
			return null;
		}
	}
}

/** Literal state values a filter names; variables are left to the type checker. */
function filterValues(method: string, args: readonly ts.Expression[]): string[] {
	if (method === 'eq' || method === 'neq') {
		return args[1] && ts.isStringLiteralLike(args[1]) ? [args[1].text] : [];
	}
	if (method === 'in') {
		return args[1] && ts.isArrayLiteralExpression(args[1])
			? args[1].elements.filter(ts.isStringLiteralLike).map((element) => element.text)
			: [];
	}
	// .not('state_key', 'in' | 'eq', '(a,b)' | 'a')
	const value = args[2];
	if (!value || !ts.isStringLiteralLike(value)) return [];
	return value.text
		.replace(/^\(|\)$/g, '')
		.split(',')
		.map((part) => part.trim().replace(/^"|"$/g, ''))
		.filter(Boolean);
}

function invalidStateFilters(filePath: string): string[] {
	const text = readFileSync(filePath, 'utf8');
	if (!text.includes('state_key') || !text.includes("'onto_")) return [];
	const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
	const findings: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			FILTER_METHODS.has(node.expression.name.text) &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0]) &&
			node.arguments[0].text === 'state_key'
		) {
			const table = chainTable(node.expression.expression);
			const allowed = table ? STATE_ENUM_BY_TABLE[table] : undefined;
			if (allowed) {
				for (const value of filterValues(node.expression.name.text, node.arguments)) {
					if (!allowed.includes(value)) {
						const { line } = source.getLineAndCharacterOfPosition(
							node.getStart(source)
						);
						findings.push(
							`${path.relative(repoRoot, filePath)}:${line + 1} ${table}.state_key '${value}'`
						);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return findings;
}

describe('ontology state filter fitness', () => {
	it('only filters ontology state_key on values the enum has', () => {
		const findings = SCANNED_ROOTS.flatMap((root) =>
			listSourceFiles(path.join(repoRoot, root))
		).flatMap(invalidStateFilters);

		expect(findings).toEqual([]);
	});

	it('catches the 2026-07-06 brief filter', () => {
		expect(enums.task_state).not.toContain('cancelled');
		expect(
			filterValues('not', [
				ts.factory.createStringLiteral('state_key'),
				ts.factory.createStringLiteral('in'),
				ts.factory.createStringLiteral('(cancelled,archived)')
			])
		).toEqual(['cancelled', 'archived']);
	});
});
