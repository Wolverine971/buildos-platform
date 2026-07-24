// apps/web/scripts/analyze-codebase.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	analyzeCodebase,
	renderDuplicateReportMarkdown,
	renderInventoryMarkdown
} from './lib/codebase-inventory';

interface CliOptions {
	projectRoot: string;
	sourceRoots: string[];
	outputDirectory: string;
	includeSvelteModules: boolean;
	includeTestsInCandidates: boolean;
	includeGeneratedInCandidates: boolean;
	minSimilarityScore: number;
	maxCandidates: number;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(scriptDirectory, '..');

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	const inventory = await analyzeCodebase({
		projectRoot: options.projectRoot,
		sourceRoots: options.sourceRoots,
		includeSvelteModules: options.includeSvelteModules,
		includeTestsInCandidates: options.includeTestsInCandidates,
		includeGeneratedInCandidates: options.includeGeneratedInCandidates,
		minSimilarityScore: options.minSimilarityScore,
		maxCandidates: options.maxCandidates
	});
	const outputDirectory = resolve(options.projectRoot, options.outputDirectory);
	await mkdir(outputDirectory, { recursive: true });

	const jsonPath = resolve(outputDirectory, 'inventory.json');
	const inventoryMarkdownPath = resolve(outputDirectory, 'inventory.md');
	const duplicateReportPath = resolve(outputDirectory, 'duplicate-candidates.md');
	await Promise.all([
		writeFile(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8'),
		writeFile(inventoryMarkdownPath, renderInventoryMarkdown(inventory), 'utf8'),
		writeFile(duplicateReportPath, renderDuplicateReportMarkdown(inventory), 'utf8')
	]);

	console.log('TypeScript codebase inventory complete.');
	console.log(
		`Indexed ${inventory.summary.files.toLocaleString()} files and ${inventory.summary.functions.toLocaleString()} runtime functions.`
	);
	console.log(
		`Found ${inventory.summary.cloneGroups.toLocaleString()} clone families, ranked ${inventory.summary.duplicateCandidates.toLocaleString()} near-duplicate candidates, and retained ${inventory.summary.repeatedNameClusters.toLocaleString()} repeated-name clusters.`
	);
	console.log(`JSON: ${jsonPath}`);
	console.log(`Inventory: ${inventoryMarkdownPath}`);
	console.log(`Review report: ${duplicateReportPath}`);
}

function parseArguments(args: string[]): CliOptions {
	const sourceRoots: string[] = [];
	let projectRoot = defaultProjectRoot;
	let outputDirectory = '.codebase-inventory';
	let includeSvelteModules = false;
	let includeRoutes = false;
	let includeTestsInCandidates = false;
	let includeGeneratedInCandidates = false;
	let minSimilarityScore = 0.62;
	let maxCandidates = 100;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const next = args[index + 1];
		switch (argument) {
			case '--':
				break;
			case '--help':
			case '-h':
				printHelp();
				process.exit(0);
				break;
			case '--project':
				projectRoot = requireValue(argument, next);
				index += 1;
				break;
			case '--root':
				sourceRoots.push(requireValue(argument, next));
				index += 1;
				break;
			case '--out':
				outputDirectory = requireValue(argument, next);
				index += 1;
				break;
			case '--min-score':
				minSimilarityScore = parseNumber(argument, requireValue(argument, next));
				index += 1;
				break;
			case '--max-candidates':
				maxCandidates = parseNumber(argument, requireValue(argument, next));
				index += 1;
				break;
			case '--include-routes':
				includeRoutes = true;
				break;
			case '--include-svelte-modules':
				includeSvelteModules = true;
				break;
			case '--include-tests-in-candidates':
				includeTestsInCandidates = true;
				break;
			case '--include-generated-in-candidates':
				includeGeneratedInCandidates = true;
				break;
			default:
				throw new Error(`Unknown argument: ${argument}. Run with --help for usage.`);
		}
	}

	const roots = sourceRoots.length ? sourceRoots : ['src/lib', 'scripts'];
	if (includeRoutes && !roots.includes('src/routes')) roots.push('src/routes');

	return {
		projectRoot: resolve(projectRoot),
		sourceRoots: roots,
		outputDirectory,
		includeSvelteModules,
		includeTestsInCandidates,
		includeGeneratedInCandidates,
		minSimilarityScore,
		maxCandidates
	};
}

function requireValue(argument: string, value: string | undefined): string {
	if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
	return value;
}

function parseNumber(argument: string, value: string): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${argument} requires a number.`);
	return parsed;
}

function printHelp(): void {
	console.log(`Usage: pnpm analyze:codebase [options]

Indexes authored TypeScript, maps files/functions/imports, and ranks likely duplicate logic.

Options:
  --project <path>                     Web-project root (normally auto-detected)
  --root <path>                        Analysis root; repeat to supply several roots
  --out <path>                         Output directory (default: .codebase-inventory)
  --min-score <0..1>                   Candidate threshold (default: 0.62)
  --max-candidates <number>            Maximum ranked pairs (default: 100)
  --include-routes                     Include authored SvelteKit route TypeScript
  --include-svelte-modules             Include .svelte.ts/.svelte.js modules
  --include-tests-in-candidates        Score test functions as duplication candidates
  --include-generated-in-candidates    Score generated functions as candidates
  -h, --help                           Show this help

Default scope: src/lib and scripts. Tests are indexed but not scored. Svelte components,
Svelte modules, SvelteKit routes, dependencies, generated framework output, build output,
coverage, and declaration files are excluded by default.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
