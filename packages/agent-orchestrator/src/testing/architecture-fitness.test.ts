// packages/agent-orchestrator/src/testing/architecture-fitness.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));

const forbiddenCognitionPatterns = [
	/apps\//i,
	/agentic-chat/i,
	/agentic_chat/i,
	/agent-run/i,
	/agent_run/i,
	/deep-research/i,
	/deep_research/i,
	/deepResearch/,
	/project-loop/i,
	/project_loop/i,
	/tree-agent/i,
	/tree_agent/i
];

const forbiddenProviderPatterns = [
	/^@supabase\//,
	/^openai$/,
	/^@ai-sdk\//,
	/^@anthropic-ai\//,
	/^pg$/
];

const allowedInternalDependencies: Record<string, Set<string>> = {
	contracts: new Set(['contracts']),
	domain: new Set(['contracts', 'domain']),
	ports: new Set(['contracts', 'ports']),
	artifacts: new Set(['artifacts', 'contracts']),
	application: new Set(['application', 'contracts', 'domain', 'ports']),
	agents: new Set(['agents', 'artifacts', 'contracts', 'ports']),
	projections: new Set(['contracts', 'domain', 'projections'])
};

function listTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
		return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
	});
}

function importedSpecifiers(filePath: string): string[] {
	const source = ts.createSourceFile(
		filePath,
		readFileSync(filePath, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);
	const specifiers: string[] = [];

	function visit(node: ts.Node): void {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			specifiers.push(node.moduleSpecifier.text);
		}

		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length === 1 &&
			ts.isStringLiteral(node.arguments[0])
		) {
			specifiers.push(node.arguments[0].text);
		}

		ts.forEachChild(node, visit);
	}

	visit(source);
	return specifiers;
}

function topLevelDirectory(filePath: string): string {
	return path.relative(sourceRoot, filePath).split(path.sep)[0];
}

function resolvedTopLevelDirectory(filePath: string, specifier: string): string | null {
	if (!specifier.startsWith('.')) return null;
	const resolved = path.normalize(path.join(path.dirname(filePath), specifier));
	const relative = path.relative(sourceRoot, resolved);
	if (relative.startsWith('..')) return null;
	return relative.split(path.sep)[0];
}

describe('agent-orchestrator architecture fitness', () => {
	const sourceFiles = listTypeScriptFiles(sourceRoot);
	const runtimeSourceFiles = sourceFiles.filter((filePath) => !filePath.endsWith('.test.ts'));

	it('does not import existing cognition runtimes, apps, or concrete providers', () => {
		const violations: string[] = [];

		for (const filePath of sourceFiles) {
			for (const specifier of importedSpecifiers(filePath)) {
				if (
					forbiddenCognitionPatterns.some((pattern) => pattern.test(specifier)) ||
					forbiddenProviderPatterns.some((pattern) => pattern.test(specifier))
				) {
					violations.push(`${path.relative(sourceRoot, filePath)} -> ${specifier}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it('keeps internal dependencies pointed in the documented direction', () => {
		const violations: string[] = [];

		for (const filePath of runtimeSourceFiles) {
			const sourceDirectory = topLevelDirectory(filePath);
			const allowedTargets = allowedInternalDependencies[sourceDirectory];
			if (!allowedTargets) continue;

			for (const specifier of importedSpecifiers(filePath)) {
				const targetDirectory = resolvedTopLevelDirectory(filePath, specifier);
				if (targetDirectory && !allowedTargets.has(targetDirectory)) {
					violations.push(
						`${path.relative(sourceRoot, filePath)} -> ${specifier} (${targetDirectory})`
					);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it('allows contracts to depend only on zod and other contracts', () => {
		const violations: string[] = [];
		const contractFiles = runtimeSourceFiles.filter(
			(filePath) => topLevelDirectory(filePath) === 'contracts'
		);

		for (const filePath of contractFiles) {
			for (const specifier of importedSpecifiers(filePath)) {
				if (specifier !== 'zod' && !specifier.startsWith('.')) {
					violations.push(`${path.relative(sourceRoot, filePath)} -> ${specifier}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
