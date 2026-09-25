// packages/smart-llm/src/llm-operation-type-fitness.test.ts
//
// Repo fitness guard for tasker 108: every SmartLLM call names its
// `operationType`. Untagged calls log as `other`, and on 2026-09-25 that hid
// the daily brief (20% of prod spend) and seven chat/braindump/ontology JSON
// calls from the spend breakdown. The check walks the TypeScript AST (a
// structured format): a call to one of the SmartLLM methods below whose
// options argument is an object literal must include `operationType`.
// Arguments that are variables or contain a spread can't be read statically
// and are left to the caller.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const SCANNED_ROOTS = ['apps/worker/src', 'apps/web/src', 'packages'];
const SMART_LLM_METHODS = new Set(['getJSONResponse', 'generateText', 'generateTextDetailed']);

/** Files whose same-named methods belong to another interface. */
const EXEMPT_FILES: Record<string, string> = {
	'packages/agent-orchestrator/src/agents/researcher/researcher.ts':
		'ResearchModelPort.generateText, metered by the port adapter',
	'packages/agent-orchestrator/src/application/workflow-engine/workflow-engine.ts':
		'SynthesisModelPort.generateText, metered by the port adapter'
};

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

function untaggedCalls(filePath: string): string[] {
	const text = readFileSync(filePath, 'utf8');
	if (![...SMART_LLM_METHODS].some((method) => text.includes(method))) return [];
	const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
	const findings: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			SMART_LLM_METHODS.has(node.expression.name.text)
		) {
			const options = node.arguments[0];
			if (options && ts.isObjectLiteralExpression(options)) {
				const hasSpread = options.properties.some(ts.isSpreadAssignment);
				const hasOperationType = options.properties.some(
					(property) =>
						(ts.isPropertyAssignment(property) ||
							ts.isShorthandPropertyAssignment(property)) &&
						property.name.getText(source) === 'operationType'
				);
				if (!hasSpread && !hasOperationType) {
					const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
					findings.push(
						`${path.relative(repoRoot, filePath)}:${line + 1} ${node.expression.name.text}`
					);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return findings;
}

describe('SmartLLM operationType fitness', () => {
	it('tags every SmartLLM call with an operationType', () => {
		const findings = SCANNED_ROOTS.flatMap((root) => listSourceFiles(path.join(repoRoot, root)))
			.filter((filePath) => !(path.relative(repoRoot, filePath) in EXEMPT_FILES))
			.flatMap(untaggedCalls);

		expect(findings).toEqual([]);
	});
});
