// apps/web/scripts/generateStreamlinedProjectContext.ts
/**
 * Streamlined SvelteKit Context Generator
 * Focuses on component relationships and dependencies
 */

import fg from 'fast-glob';
import { promises as fs } from 'fs';
import * as path from 'path';
import { parse as parseSvelte } from 'svelte/compiler';
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

const traverse = traverseModule.default || traverseModule;

/*─────────────────────────────────────────────────────────── TYPES */
interface ComponentInfo {
	file: string;
	type: 'page' | 'component' | 'service' | 'store';
	components: string[]; // Combined static and dynamic component usage
	exports?: string[];
}

interface ProjectContext {
	components: ComponentInfo[];
	dependencies: Record<string, string[]>;
	unusedComponents: string[];
}

/*────────────────────────────────────────────────────── UTIL HELPERS */
const SKIP_FILES = [
	'**/*.d.ts',
	'**/node_modules/**',
	'**/.svelte-kit/**',
	'**/.git/**',
	'**/dist/**',
	'**/build/**',
	'**/*.config.*',
	'**/*.spec.*',
	'**/*.test.*'
];

function relative(root: string, file: string) {
	return path.relative(root, file).replace(/\\/g, '/');
}

function getComponentType(filePath: string): ComponentInfo['type'] {
	if (filePath.includes('+page.svelte') || filePath.includes('+layout.svelte')) return 'page';
	if (filePath.includes('/services/')) return 'service';
	if (filePath.includes('/stores/')) return 'store';
	return 'component';
}

function isRelevantComponent(name: string): boolean {
	// Skip common icons and framework components
	const skipPatterns =
		/^(Loader2?|Check|X|Plus|Edit[0-9]*|Save|Delete|Search|Filter|Calendar|Clock|User|Mail|Settings|Eye|Download|Upload|Arrow|Chevron|Alert|Bar|Chart|Pie|Trending|Award|Zap|Mic|Send|Refresh|Trash|Copy|Sun|Moon|Menu|LogOut|Star|Heart|Home|Info|Lock|Play|Pause|Stop|Volume|Wifi|Battery|Power)$/;
	return !skipPatterns.test(name);
}

function parseBabel(code: string) {
	try {
		return babelParser.parse(code, {
			sourceType: 'module',
			plugins: ['typescript', 'jsx']
		});
	} catch {
		return null;
	}
}

function extractComponentUsage(code: string): string[] {
	const components: string[] = [];

	// Extract dynamic imports of Svelte components
	const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+\.svelte)['"`]\s*\)/g;
	let match;
	while ((match = dynamicImportRegex.exec(code)) !== null) {
		const importPath = match[1];
		const componentName = path.basename(importPath, '.svelte');
		if (isRelevantComponent(componentName)) {
			components.push(componentName);
		}
	}

	// Also check AST for more complex cases
	const ast = parseBabel(code);
	if (ast) {
		traverse(ast, {
			CallExpression(path) {
				if (t.isImport(path.node.callee)) {
					const arg = path.node.arguments[0];
					if (t.isStringLiteral(arg) && arg.value.endsWith('.svelte')) {
						const componentName = arg.value.split('/').pop()?.replace('.svelte', '');
						if (componentName && isRelevantComponent(componentName)) {
							components.push(componentName);
						}
					}
				}
			}
		});
	}

	return [...new Set(components)];
}

function extractExports(code: string): string[] {
	const exports: string[] = [];
	const ast = parseBabel(code);

	if (ast) {
		traverse(ast, {
			ExportNamedDeclaration(path) {
				if (path.node.declaration) {
					if (
						t.isFunctionDeclaration(path.node.declaration) &&
						path.node.declaration.id
					) {
						exports.push(path.node.declaration.id.name);
					} else if (t.isVariableDeclaration(path.node.declaration)) {
						path.node.declaration.declarations.forEach((decl) => {
							if (t.isIdentifier(decl.id)) {
								exports.push(decl.id.name);
							}
						});
					} else if (
						t.isClassDeclaration(path.node.declaration) &&
						path.node.declaration.id
					) {
						exports.push(path.node.declaration.id.name);
					}
				}
			},
			ExportDefaultDeclaration() {
				exports.push('default');
			}
		});
	}

	return exports;
}

/*───────────────────────────────────────────────────── SCAN FUNCTIONS */
async function scanFile(file: string, projectRoot: string): Promise<ComponentInfo | null> {
	const rel = relative(projectRoot, file);

	try {
		const src = await fs.readFile(file, 'utf-8');
		const type = getComponentType(rel);
		const components: string[] = [];
		let exports: string[] = [];

		if (file.endsWith('.svelte')) {
			const ast = parseSvelte(src);

			// Extract from script sections
			if (ast.instance) {
				const scriptCode = src.slice(ast.instance.content.start, ast.instance.content.end);
				components.push(...extractComponentUsage(scriptCode));
			}

			if (ast.module) {
				const moduleCode = src.slice(ast.module.content.start, ast.module.content.end);
				components.push(...extractComponentUsage(moduleCode));
			}

			// Extract from template
			if (ast.html) {
				const templateCode = src.slice(ast.html.start, ast.html.end);
				components.push(...extractComponentUsage(templateCode, true));
			}
		} else if (file.endsWith('.ts')) {
			// For TypeScript files, look for exports and dynamic imports
			components.push(...extractComponentUsage(src));
			exports = extractExports(src);
		}

		// Only return if this file has component relationships or exports
		if (components.length > 0 || exports.length > 0) {
			return {
				file: rel,
				type,
				components: [...new Set(components)],
				...(exports.length > 0 && { exports })
			};
		}

		return null;
	} catch (error) {
		console.warn(`⚠️  Failed to scan ${rel}: ${error}`);
		return null;
	}
}

/*─────────────────────────────────────────────────── MAIN BUILD */
async function buildContext(projectRoot: string): Promise<ProjectContext> {
	// Only scan .svelte and .ts files that might have component relationships
	const patterns = [
		'src/**/*.svelte',
		'src/lib/services/*.ts',
		'src/lib/stores/*.ts',
		'src/lib/components/**/*.ts'
	];

	const allFiles = await fg(patterns, {
		cwd: projectRoot,
		ignore: SKIP_FILES,
		absolute: true
	});

	console.log(`📁 Scanning ${allFiles.length} files for component relationships...`);

	const components: ComponentInfo[] = [];

	for (const file of allFiles) {
		const result = await scanFile(file, projectRoot);
		if (result) {
			components.push(result);
		}
	}

	// Build dependencies map
	const dependencies: Record<string, string[]> = {};
	const usedComponents = new Set<string>();

	components.forEach((item) => {
		if (item.components.length === 0) return;

		const deps: string[] = [];

		item.components.forEach((compName) => {
			// Find matching component files
			const matches = components.filter((c) => {
				const fileName = path.basename(c.file, '.svelte');
				return fileName === compName || fileName.toLowerCase() === compName.toLowerCase();
			});

			matches.forEach((match) => {
				deps.push(match.file);
				usedComponents.add(match.file);
			});
		});

		if (deps.length > 0) {
			dependencies[item.file] = [...new Set(deps)];
		}
	});

	// Mark pages as used
	components.filter((c) => c.type === 'page').forEach((page) => usedComponents.add(page.file));

	// Find unused components
	const unusedComponents = components
		.filter((c) => c.type === 'component' && !usedComponents.has(c.file))
		.map((c) => c.file);

	return {
		components,
		dependencies,
		unusedComponents
	};
}

/*─────────────────────────────────────────────────────────── CLI */
async function main() {
	const args = process.argv.slice(2);
	const projectRoot = path.resolve(args[0] ?? '.');
	const outputPath = path.resolve(
		args.find((_, i) => args[i - 1] === '-o') ?? 'sproject-context.json'
	);

	console.log(`🔍 Analyzing: ${projectRoot}`);
	console.log(`📄 Output: ${outputPath}`);

	const context = await buildContext(projectRoot);
	await fs.writeFile(outputPath, JSON.stringify(context, null, 2));

	console.log(`✅ Analysis complete!`);
	console.log(`📊 Found:`);
	console.log(`   • ${context.components.filter((c) => c.type === 'page').length} pages`);
	console.log(
		`   • ${context.components.filter((c) => c.type === 'component').length} components`
	);
	console.log(`   • ${context.components.filter((c) => c.type === 'service').length} services`);
	console.log(`   • ${context.components.filter((c) => c.type === 'store').length} stores`);
	console.log(`   • ${Object.keys(context.dependencies).length} files with dependencies`);

	if (context.unusedComponents.length) {
		console.log(`\n🗑️  ${context.unusedComponents.length} unused components:`);
		context.unusedComponents.forEach((comp) => console.log(`   • ${comp}`));
	}
}

main().catch(console.error);
