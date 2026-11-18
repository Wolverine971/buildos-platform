// apps/worker/tests/agenticChatProviderBoundary.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PROVIDER_ROOT = fileURLToPath(
	new URL('../src/workers/agentic-chat/provider/', import.meta.url)
);
const COORDINATOR = join(PROVIDER_ROOT, 'turn-provider.ts');
const WORKER_CONFIG = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const config = ts.readConfigFile(WORKER_CONFIG, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(WORKER_CONFIG));
const resolutionCache = ts.createModuleResolutionCache(
	dirname(WORKER_CONFIG),
	(path) => path,
	options
);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? sourceFiles(path)
			: entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
				? [path]
				: [];
	});
}

function moduleSpecifier(node: ts.Node): ts.Node | undefined {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
	if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
		return node.argument.literal;
	if (
		ts.isCallExpression(node) &&
		(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
			(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
	)
		return node.arguments[0];
	return undefined;
}

describe('Agentic Chat provider dependency direction', () => {
	it('keeps provider helpers independent of the turn coordinator', () => {
		const violations: string[] = [];
		for (const path of sourceFiles(PROVIDER_ROOT)) {
			if (path === COORDINATOR) continue;
			const source = ts.createSourceFile(
				path,
				readFileSync(path, 'utf8'),
				ts.ScriptTarget.Latest,
				true
			);
			function visit(node: ts.Node): void {
				const specifier = moduleSpecifier(node);
				if (specifier && ts.isStringLiteral(specifier)) {
					// Use the worker's resolver so configured aliases cannot bypass
					// the same dependency rule that applies to relative imports.
					const resolved = ts.resolveModuleName(
						specifier.text,
						path,
						options,
						ts.sys,
						resolutionCache
					);
					if (resolved.resolvedModule?.resolvedFileName === COORDINATOR) {
						violations.push(
							`${relative(PROVIDER_ROOT, path)} imports ${specifier.text}`
						);
					}
				}
				ts.forEachChild(node, visit);
			}
			visit(source);
		}
		expect(violations).toEqual([]);
	});
});
