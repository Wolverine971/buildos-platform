// apps/web/scripts/lib/codebase-inventory.ts
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const DEFAULT_SOURCE_ROOTS = ['src/lib', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.svelte-kit',
	'.turbo',
	'.vercel',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'test-results'
]);
const NAME_STOP_WORDS = new Set([
	'and',
	'as',
	'async',
	'by',
	'for',
	'from',
	'get',
	'handle',
	'is',
	'of',
	'on',
	'or',
	'set',
	'the',
	'to',
	'with'
]);
const CALL_STOP_WORDS = new Set([
	'add',
	'catch',
	'entries',
	'filter',
	'finally',
	'find',
	'flatMap',
	'forEach',
	'get',
	'has',
	'includes',
	'join',
	'keys',
	'log',
	'map',
	'parse',
	'push',
	'reduce',
	'replace',
	'set',
	'slice',
	'some',
	'sort',
	'split',
	'stringify',
	'then',
	'trim',
	'values'
]);

export type FileKind = 'source' | 'script' | 'test' | 'generated';
export type FunctionKind =
	| 'function'
	| 'arrow'
	| 'function-expression'
	| 'method'
	| 'getter'
	| 'setter'
	| 'constructor';

export interface CodebaseAnalysisOptions {
	projectRoot: string;
	sourceRoots?: string[];
	includeSvelteModules?: boolean;
	includeTestsInCandidates?: boolean;
	includeGeneratedInCandidates?: boolean;
	minSimilarityScore?: number;
	maxCandidates?: number;
}

export interface ParameterRecord {
	name: string;
	type: string | null;
	optional: boolean;
	rest: boolean;
}

export interface FunctionRecord {
	id: string;
	name: string;
	qualifiedName: string;
	kind: FunctionKind;
	exported: boolean;
	async: boolean;
	hasBody: boolean;
	parameters: ParameterRecord[];
	returnType: string | null;
	signature: string;
	description: string | null;
	lineStart: number;
	lineEnd: number;
	lineCount: number;
	nestingDepth: number;
	complexity: number;
	calls: string[];
	bodyTokenCount: number;
	bodyHash: string | null;
	structuralHash: string | null;
	structuralSketch: string[];
}

export interface ImportRecord {
	source: string;
	names: string[];
	typeOnly: boolean;
	resolvedPath: string | null;
}

export interface FileRecord {
	path: string;
	directory: string;
	name: string;
	extension: string;
	kind: FileKind;
	lineCount: number;
	byteCount: number;
	sourceHash: string;
	parseDiagnostics: string[];
	imports: ImportRecord[];
	exports: string[];
	importedBy: string[];
	functions: FunctionRecord[];
}

export interface FunctionReference {
	id: string;
	name: string;
	qualifiedName: string;
	file: string;
	line: number;
	signature: string;
}

export interface SimilaritySignals {
	structure: number;
	name: number;
	calls: number;
	signature: number;
}

export interface DuplicateCandidate {
	score: number;
	confidence: 'high' | 'medium' | 'review';
	left: FunctionReference;
	right: FunctionReference;
	signals: SimilaritySignals;
	reasons: string[];
}

export interface CloneGroup {
	kind: 'exact-body' | 'normalized-structure';
	structuralHash: string;
	bodyTokenCount: number;
	functions: FunctionReference[];
}

export interface RepeatedNameCluster {
	name: string;
	normalizedName: string;
	functions: FunctionReference[];
}

export interface HierarchyNode {
	name: string;
	path: string;
	fileCount: number;
	functionCount: number;
	files: string[];
	children: HierarchyNode[];
}

export interface CodebaseInventory {
	schemaVersion: 1;
	generatedAt: string;
	projectRoot: string;
	config: {
		sourceRoots: string[];
		includeSvelteModules: boolean;
		includeTestsInCandidates: boolean;
		includeGeneratedInCandidates: boolean;
		minSimilarityScore: number;
		maxCandidates: number;
	};
	summary: {
		files: number;
		functions: number;
		exportedFunctions: number;
		anonymousFunctions: number;
		filesByKind: Record<FileKind, number>;
		functionsByKind: Record<FunctionKind, number>;
		cloneGroups: number;
		duplicateCandidates: number;
		repeatedNameClusters: number;
	};
	hierarchy: HierarchyNode;
	files: FileRecord[];
	cloneGroups: CloneGroup[];
	duplicateCandidates: DuplicateCandidate[];
	repeatedNameClusters: RepeatedNameCluster[];
}

interface InternalFunction extends FunctionRecord {
	file: string;
	fileKind: FileKind;
	normalizedTokens: string[];
	structuralShingles: Set<string>;
}

interface ParsedFile {
	record: FileRecord;
	functions: InternalFunction[];
}

interface NormalizedBody {
	bodyHash: string;
	structuralHash: string;
	tokens: string[];
	shingles: Set<string>;
	sketch: string[];
}

export async function analyzeCodebase(
	options: CodebaseAnalysisOptions
): Promise<CodebaseInventory> {
	const projectRoot = resolve(options.projectRoot);
	const sourceRoots = options.sourceRoots?.length
		? options.sourceRoots.map(toPosixPath)
		: DEFAULT_SOURCE_ROOTS;
	const includeSvelteModules = options.includeSvelteModules ?? false;
	const includeTestsInCandidates = options.includeTestsInCandidates ?? false;
	const includeGeneratedInCandidates = options.includeGeneratedInCandidates ?? false;
	const minSimilarityScore = clamp(options.minSimilarityScore ?? 0.62, 0, 1);
	const maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? 100));

	const filePaths = await discoverTypeScriptFiles(projectRoot, sourceRoots, {
		includeSvelteModules
	});
	const parsedFiles = await Promise.all(
		filePaths.map((filePath) => parseTypeScriptFile(projectRoot, filePath))
	);
	const files = parsedFiles.map(({ record }) => record).sort(compareFiles);
	const allFunctions = parsedFiles.flatMap(({ functions }) => functions);

	linkLocalImports(files);

	const similarityScope = {
		includeTests: includeTestsInCandidates,
		includeGenerated: includeGeneratedInCandidates
	};
	const cloneGroups = findCloneGroups(allFunctions, similarityScope);
	const duplicateCandidates = findDuplicateCandidates(allFunctions, {
		...similarityScope,
		minScore: minSimilarityScore,
		maxCandidates
	});
	const repeatedNameClusters = findRepeatedNameClusters(allFunctions, similarityScope);

	return {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		projectRoot: '.',
		config: {
			sourceRoots,
			includeSvelteModules,
			includeTestsInCandidates,
			includeGeneratedInCandidates,
			minSimilarityScore,
			maxCandidates
		},
		summary: buildSummary(files, cloneGroups, duplicateCandidates, repeatedNameClusters),
		hierarchy: buildHierarchy(files),
		files,
		cloneGroups,
		duplicateCandidates,
		repeatedNameClusters
	};
}

async function discoverTypeScriptFiles(
	projectRoot: string,
	sourceRoots: string[],
	options: { includeSvelteModules: boolean }
): Promise<string[]> {
	const files: string[] = [];

	async function walk(currentPath: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(currentPath, { withFileTypes: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Unable to read analysis root ${currentPath}: ${message}`);
		}

		for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
			const entryPath = join(currentPath, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(entryPath);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!isTypeScriptSource(entry.name)) continue;
			if (!options.includeSvelteModules && entry.name.includes('.svelte.')) continue;
			files.push(entryPath);
		}
	}

	for (const sourceRoot of sourceRoots) {
		const absoluteRoot = resolve(projectRoot, sourceRoot);
		await walk(absoluteRoot);
	}

	return [...new Set(files)].sort();
}

function isTypeScriptSource(fileName: string): boolean {
	if (fileName.endsWith('.d.ts') || fileName.endsWith('.d.mts') || fileName.endsWith('.d.cts')) {
		return false;
	}
	return SOURCE_EXTENSIONS.has(extname(fileName));
}

async function parseTypeScriptFile(projectRoot: string, filePath: string): Promise<ParsedFile> {
	const sourceText = await readFile(filePath, 'utf8');
	const projectPath = toPosixPath(relative(projectRoot, filePath));
	const sourceFile = ts.createSourceFile(
		projectPath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
	const fileKind = classifyFile(projectPath, sourceText);
	const exportedNames = collectExportedNames(sourceFile);
	const functions = collectFunctions(
		sourceFile,
		sourceText,
		projectPath,
		fileKind,
		exportedNames
	);
	const publicFunctions = functions.map(stripInternalFunctionFields);
	const lineCount = sourceFile.getLineAndCharacterOfPosition(sourceText.length).line + 1;
	const parseDiagnostics = getParseDiagnostics(sourceFile, sourceText);

	return {
		record: {
			path: projectPath,
			directory: toPosixPath(dirname(projectPath)),
			name: basename(projectPath),
			extension: extname(projectPath),
			kind: fileKind,
			lineCount,
			byteCount: Buffer.byteLength(sourceText, 'utf8'),
			sourceHash: sha256(sourceText),
			parseDiagnostics,
			imports: collectImports(sourceFile),
			exports: [...exportedNames].sort(),
			importedBy: [],
			functions: publicFunctions
		},
		functions
	};
}

function classifyFile(projectPath: string, sourceText: string): FileKind {
	const lowerPath = projectPath.toLowerCase();
	if (
		lowerPath.includes('/__tests__/') ||
		lowerPath.includes('/tests/') ||
		/\.(?:test|spec)\.[cm]?tsx?$/.test(lowerPath)
	) {
		return 'test';
	}
	if (
		lowerPath.includes('/generated/') ||
		lowerPath.includes('.generated.') ||
		/(?:database|schema)\.(?:types|schema)\.ts$/.test(lowerPath) ||
		/@generated|auto-generated|automatically generated/i.test(sourceText.slice(0, 600))
	) {
		return 'generated';
	}
	if (lowerPath.startsWith('scripts/')) return 'script';
	return 'source';
}

function collectExportedNames(sourceFile: ts.SourceFile): Set<string> {
	const names = new Set<string>();

	for (const statement of sourceFile.statements) {
		if (ts.isExportDeclaration(statement) && statement.exportClause) {
			if (ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) names.add(element.name.text);
			}
			continue;
		}

		if (ts.isExportAssignment(statement)) {
			names.add('default');
			if (ts.isIdentifier(statement.expression)) names.add(statement.expression.text);
			continue;
		}

		if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
		if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) names.add('default');

		if (
			ts.isFunctionDeclaration(statement) ||
			ts.isClassDeclaration(statement) ||
			ts.isInterfaceDeclaration(statement) ||
			ts.isTypeAliasDeclaration(statement) ||
			ts.isEnumDeclaration(statement)
		) {
			if (statement.name) names.add(statement.name.text);
		} else if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				collectBindingNames(declaration.name, names);
			}
		}
	}

	return names;
}

function collectBindingNames(name: ts.BindingName, names: Set<string>): void {
	if (ts.isIdentifier(name)) {
		names.add(name.text);
		return;
	}
	for (const element of name.elements) {
		if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, names);
	}
}

function collectImports(sourceFile: ts.SourceFile): ImportRecord[] {
	const imports: ImportRecord[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}
		const names: string[] = [];
		const clause = statement.importClause;
		if (clause?.name) names.push(clause.name.text);
		if (clause?.namedBindings) {
			if (ts.isNamespaceImport(clause.namedBindings)) {
				names.push(`* as ${clause.namedBindings.name.text}`);
			} else {
				for (const element of clause.namedBindings.elements) names.push(element.name.text);
			}
		}
		imports.push({
			source: statement.moduleSpecifier.text,
			names: names.sort(),
			typeOnly: clause?.isTypeOnly ?? false,
			resolvedPath: null
		});
	}

	return imports;
}

function collectFunctions(
	sourceFile: ts.SourceFile,
	sourceText: string,
	file: string,
	fileKind: FileKind,
	exportedNames: Set<string>
): InternalFunction[] {
	const functions: InternalFunction[] = [];

	function visit(node: ts.Node): void {
		if (isRuntimeFunction(node)) {
			functions.push(
				analyzeFunctionNode(node, sourceFile, sourceText, file, fileKind, exportedNames)
			);
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return functions;
}

function isRuntimeFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isArrowFunction(node) ||
		ts.isFunctionExpression(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isConstructorDeclaration(node)
	);
}

function analyzeFunctionNode(
	node: ts.FunctionLikeDeclaration,
	sourceFile: ts.SourceFile,
	sourceText: string,
	file: string,
	fileKind: FileKind,
	exportedNames: Set<string>
): InternalFunction {
	const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
	const name = getFunctionName(node, sourceFile, start.line + 1);
	const ownerParts = getOwnerParts(node, sourceFile);
	const qualifiedName = [...ownerParts, name].join('.');
	const parameters = node.parameters.map((parameter) => ({
		name: parameter.name.getText(sourceFile),
		type: parameter.type?.getText(sourceFile) ?? null,
		optional: Boolean(parameter.questionToken || parameter.initializer),
		rest: Boolean(parameter.dotDotDotToken)
	}));
	const returnType = node.type?.getText(sourceFile) ?? null;
	const body = node.body;
	const normalizedBody = body
		? normalizeBody(body.getText(sourceFile), file.endsWith('.tsx'))
		: null;
	const exported = isFunctionExported(node, name, exportedNames);
	const kind = getFunctionKind(node);
	const typeParameters = node.typeParameters?.length
		? `<${node.typeParameters.map((parameter) => parameter.getText(sourceFile)).join(', ')}>`
		: '';
	const parameterText = node.parameters
		.map((parameter) => parameter.getText(sourceFile))
		.join(', ');
	const signature = `${node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''}${name}${typeParameters}(${parameterText})${returnType ? `: ${returnType}` : ''}`;

	return {
		id: `${file}#${qualifiedName}:${start.line + 1}`,
		name,
		qualifiedName,
		kind,
		exported,
		async: Boolean(
			node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
		),
		hasBody: Boolean(body),
		parameters,
		returnType,
		signature,
		description: extractJSDoc(sourceText, node),
		lineStart: start.line + 1,
		lineEnd: end.line + 1,
		lineCount: end.line - start.line + 1,
		nestingDepth: countFunctionAncestors(node),
		complexity: body ? calculateComplexity(body) : 0,
		calls: body ? collectCalls(body, sourceFile) : [],
		bodyTokenCount: normalizedBody?.tokens.length ?? 0,
		bodyHash: normalizedBody?.bodyHash ?? null,
		structuralHash: normalizedBody?.structuralHash ?? null,
		structuralSketch: normalizedBody?.sketch ?? [],
		file,
		fileKind,
		normalizedTokens: normalizedBody?.tokens ?? [],
		structuralShingles: normalizedBody?.shingles ?? new Set<string>()
	};
}

function getFunctionName(
	node: ts.FunctionLikeDeclaration,
	sourceFile: ts.SourceFile,
	line: number
): string {
	if (ts.isConstructorDeclaration(node)) return 'constructor';
	if ('name' in node && node.name) return propertyNameToText(node.name, sourceFile);
	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
		const parent = node.parent;
		if (ts.isVariableDeclaration(parent)) return parent.name.getText(sourceFile);
		if (ts.isPropertyAssignment(parent)) return propertyNameToText(parent.name, sourceFile);
		if (ts.isBinaryExpression(parent) && parent.right === node)
			return parent.left.getText(sourceFile);
	}
	return `<anonymous@${line}>`;
}

function propertyNameToText(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
	if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name)) {
		return name.text;
	}
	return name.getText(sourceFile);
}

function getOwnerParts(node: ts.Node, sourceFile: ts.SourceFile): string[] {
	const parts: string[] = [];
	let current = node.parent;

	while (current && !ts.isSourceFile(current)) {
		if (isRuntimeFunction(current)) {
			const position = sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile));
			parts.push(getFunctionName(current, sourceFile, position.line + 1));
		} else if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
			if (current.name) parts.push(current.name.text);
			else if (ts.isVariableDeclaration(current.parent)) {
				parts.push(current.parent.name.getText(sourceFile));
			}
		} else if (
			ts.isObjectLiteralExpression(current) &&
			ts.isVariableDeclaration(current.parent)
		) {
			parts.push(current.parent.name.getText(sourceFile));
		} else if (ts.isModuleDeclaration(current)) {
			parts.push(current.name.getText(sourceFile));
		}
		current = current.parent;
	}

	return parts.reverse();
}

function getFunctionKind(node: ts.FunctionLikeDeclaration): FunctionKind {
	if (ts.isFunctionDeclaration(node)) return 'function';
	if (ts.isArrowFunction(node)) return 'arrow';
	if (ts.isFunctionExpression(node)) return 'function-expression';
	if (ts.isGetAccessorDeclaration(node)) return 'getter';
	if (ts.isSetAccessorDeclaration(node)) return 'setter';
	if (ts.isConstructorDeclaration(node)) return 'constructor';
	return 'method';
}

function isFunctionExported(
	node: ts.FunctionLikeDeclaration,
	name: string,
	exportedNames: Set<string>
): boolean {
	let current: ts.Node | undefined = node;
	while (current && !ts.isSourceFile(current)) {
		if (current !== node && isRuntimeFunction(current)) return false;
		if (hasModifier(current, ts.SyntaxKind.PrivateKeyword)) return false;
		if (hasModifier(current, ts.SyntaxKind.ExportKeyword)) return true;
		if (ts.isVariableStatement(current) && hasModifier(current, ts.SyntaxKind.ExportKeyword)) {
			return true;
		}
		current = current.parent;
	}
	return exportedNames.has(name);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return Boolean(
		ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((item) => item.kind === kind)
	);
}

function countFunctionAncestors(node: ts.Node): number {
	let depth = 0;
	let current = node.parent;
	while (current) {
		if (isRuntimeFunction(current)) depth += 1;
		current = current.parent;
	}
	return depth;
}

function extractJSDoc(sourceText: string, node: ts.Node): string | null {
	const leadingText = sourceText.slice(node.getFullStart(), node.getStart());
	const match = leadingText.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
	if (!match?.[1]) return null;
	const description = match[1]
		.split('\n')
		.map((line) => line.replace(/^\s*\*\s?/, '').trim())
		.filter((line) => line && !line.startsWith('@'))
		.join(' ')
		.trim();
	return description ? description.slice(0, 500) : null;
}

function normalizeBody(bodyText: string, isTsx: boolean): NormalizedBody {
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		true,
		isTsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
		bodyText
	);
	const normalizedTokens: string[] = [];
	const lexicalTokens: string[] = [];

	for (
		let token = scanner.scan();
		token !== ts.SyntaxKind.EndOfFileToken;
		token = scanner.scan()
	) {
		const tokenText = scanner.getTokenText();
		lexicalTokens.push(tokenText);
		normalizedTokens.push(normalizeToken(token, tokenText));
	}

	const shingles = makeShingles(normalizedTokens, 7);
	const sketch = [...shingles]
		.map(fnv1a)
		.sort((left, right) => left.localeCompare(right))
		.slice(0, 10);

	return {
		bodyHash: sha256(lexicalTokens.join('\u001f')),
		structuralHash: sha256(normalizedTokens.join('\u001f')),
		tokens: normalizedTokens,
		shingles,
		sketch
	};
}

function normalizeToken(kind: ts.SyntaxKind, tokenText: string): string {
	if (kind === ts.SyntaxKind.Identifier || kind === ts.SyntaxKind.PrivateIdentifier) return 'id';
	if (
		kind === ts.SyntaxKind.StringLiteral ||
		kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
		kind === ts.SyntaxKind.TemplateHead ||
		kind === ts.SyntaxKind.TemplateMiddle ||
		kind === ts.SyntaxKind.TemplateTail
	) {
		return 'str';
	}
	if (kind === ts.SyntaxKind.NumericLiteral || kind === ts.SyntaxKind.BigIntLiteral) return 'num';
	if (kind === ts.SyntaxKind.RegularExpressionLiteral) return 'regex';
	return ts.tokenToString(kind) ?? tokenText;
}

function makeShingles(tokens: string[], size: number): Set<string> {
	if (!tokens.length) return new Set<string>();
	if (tokens.length <= size) return new Set([tokens.join('\u001f')]);
	const shingles = new Set<string>();
	for (let index = 0; index <= tokens.length - size; index += 1) {
		shingles.add(tokens.slice(index, index + size).join('\u001f'));
	}
	return shingles;
}

function collectCalls(body: ts.ConciseBody, sourceFile: ts.SourceFile): string[] {
	const calls = new Set<string>();

	function visit(node: ts.Node): void {
		if (node !== body && isRuntimeFunction(node)) return;
		if (ts.isCallExpression(node)) {
			calls.add(normalizeCallName(node.expression.getText(sourceFile)));
		} else if (ts.isNewExpression(node)) {
			calls.add(`new ${normalizeCallName(node.expression.getText(sourceFile))}`);
		}
		ts.forEachChild(node, visit);
	}

	visit(body);
	return [...calls].filter(Boolean).sort();
}

function normalizeCallName(callText: string): string {
	return callText.replace(/\s+/g, '').replace(/\?\./g, '.').slice(-100);
}

function calculateComplexity(body: ts.ConciseBody): number {
	let complexity = 1;

	function visit(node: ts.Node): void {
		if (node !== body && isRuntimeFunction(node)) return;
		if (
			ts.isIfStatement(node) ||
			ts.isForStatement(node) ||
			ts.isForInStatement(node) ||
			ts.isForOfStatement(node) ||
			ts.isWhileStatement(node) ||
			ts.isDoStatement(node) ||
			ts.isCaseClause(node) ||
			ts.isCatchClause(node) ||
			ts.isConditionalExpression(node)
		) {
			complexity += 1;
		} else if (
			ts.isBinaryExpression(node) &&
			[
				ts.SyntaxKind.AmpersandAmpersandToken,
				ts.SyntaxKind.BarBarToken,
				ts.SyntaxKind.QuestionQuestionToken
			].includes(node.operatorToken.kind)
		) {
			complexity += 1;
		}
		ts.forEachChild(node, visit);
	}

	visit(body);
	return complexity;
}

function getParseDiagnostics(sourceFile: ts.SourceFile, sourceText: string): string[] {
	const diagnostics = (
		sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }
	).parseDiagnostics;
	return (diagnostics ?? []).map((diagnostic) => {
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
		if (diagnostic.start === undefined) return message;
		const position = sourceFile.getLineAndCharacterOfPosition(
			Math.min(diagnostic.start, sourceText.length)
		);
		return `L${position.line + 1}:${position.character + 1} ${message}`;
	});
}

function stripInternalFunctionFields(fn: InternalFunction): FunctionRecord {
	const {
		file: _file,
		fileKind: _fileKind,
		normalizedTokens: _tokens,
		structuralShingles: _shingles,
		...record
	} = fn;
	return record;
}

function linkLocalImports(files: FileRecord[]): void {
	const fileByPath = new Map(files.map((file) => [file.path, file]));
	const candidates = new Set(fileByPath.keys());

	for (const file of files) {
		for (const importRecord of file.imports) {
			const resolvedPath = resolveImportPath(file.path, importRecord.source, candidates);
			importRecord.resolvedPath = resolvedPath;
			if (resolvedPath) fileByPath.get(resolvedPath)?.importedBy.push(file.path);
		}
	}

	for (const file of files) file.importedBy = [...new Set(file.importedBy)].sort();
}

function resolveImportPath(
	importerPath: string,
	specifier: string,
	files: Set<string>
): string | null {
	let basePath: string;
	if (specifier === '$lib') basePath = 'src/lib/index';
	else if (specifier.startsWith('$lib/')) basePath = `src/lib/${specifier.slice('$lib/'.length)}`;
	else if (specifier.startsWith('.')) {
		basePath = toPosixPath(join(dirname(importerPath), specifier));
	} else {
		return null;
	}

	const possiblePaths = [
		basePath,
		...['.ts', '.tsx', '.mts', '.cts'].map((extension) => `${basePath}${extension}`),
		...['.ts', '.tsx', '.mts', '.cts'].map((extension) => `${basePath}/index${extension}`)
	];
	return possiblePaths.find((candidate) => files.has(candidate)) ?? null;
}

function findDuplicateCandidates(
	functions: InternalFunction[],
	options: {
		includeTests: boolean;
		includeGenerated: boolean;
		minScore: number;
		maxCandidates: number;
	}
): DuplicateCandidate[] {
	const eligible = functions.filter((fn) => isSimilarityEligible(fn, options));
	const candidateBuckets = new Map<string, number[]>();

	function addToBucket(key: string, index: number): void {
		const bucket = candidateBuckets.get(key);
		if (bucket) bucket.push(index);
		else candidateBuckets.set(key, [index]);
	}

	eligible.forEach((fn, index) => {
		if (fn.structuralHash) addToBucket(`structure:${fn.structuralHash}`, index);
		for (const sketch of fn.structuralSketch) addToBucket(`sketch:${sketch}`, index);
		for (const token of tokenizeName(fn.name)) {
			if (token.length >= 3 && !NAME_STOP_WORDS.has(token))
				addToBucket(`name:${token}`, index);
		}
		for (const call of fn.calls) {
			const callName = lastCallSegment(call);
			if (callName.length >= 4 && !CALL_STOP_WORDS.has(callName)) {
				addToBucket(`call:${callName}`, index);
			}
		}
	});

	const pairKeys = new Set<string>();
	for (const [bucketKey, indexes] of candidateBuckets) {
		if (indexes.length < 2) continue;
		const bucketLimit = bucketKey.startsWith('structure:') ? 120 : 60;
		if (indexes.length > bucketLimit) continue;
		for (let left = 0; left < indexes.length - 1; left += 1) {
			for (let right = left + 1; right < indexes.length; right += 1) {
				const leftIndex = indexes[left];
				const rightIndex = indexes[right];
				if (leftIndex !== undefined && rightIndex !== undefined) {
					pairKeys.add(
						`${Math.min(leftIndex, rightIndex)}:${Math.max(leftIndex, rightIndex)}`
					);
				}
			}
		}
	}

	const candidates: DuplicateCandidate[] = [];
	for (const pairKey of pairKeys) {
		const [leftIndex, rightIndex] = pairKey.split(':').map(Number);
		const left = eligible[leftIndex ?? -1];
		const right = eligible[rightIndex ?? -1];
		if (!left || !right) continue;
		const candidate = compareFunctions(left, right);
		if (candidate.score >= options.minScore) candidates.push(candidate);
	}

	return diversifyCandidates(
		candidates.sort(
			(left, right) => right.score - left.score || compareReferences(left.left, right.left)
		),
		eligible,
		options.maxCandidates
	);
}

function diversifyCandidates(
	candidates: DuplicateCandidate[],
	functions: InternalFunction[],
	maximum: number
): DuplicateCandidate[] {
	const functionById = new Map(functions.map((fn) => [fn.id, fn]));
	const seenStructuralFamilies = new Set<string>();
	const nameFamilyCounts = new Map<string, number>();
	const functionCounts = new Map<string, number>();
	const selected: DuplicateCandidate[] = [];

	for (const candidate of candidates) {
		// Exact normalized structures already appear in cloneGroups with every occurrence.
		// Keep this queue for less obvious, genuinely near-duplicate pairs.
		if (candidate.signals.structure === 1) continue;
		const left = functionById.get(candidate.left.id);
		const right = functionById.get(candidate.right.id);
		if (!left || !right) continue;
		if (left.structuralHash && left.structuralHash === right.structuralHash) {
			if (seenStructuralFamilies.has(left.structuralHash)) continue;
			seenStructuralFamilies.add(left.structuralHash);
		}

		const nameFamily = [normalizeName(left.name), normalizeName(right.name)].sort().join(':');
		if ((nameFamilyCounts.get(nameFamily) ?? 0) >= 3) continue;
		if ((functionCounts.get(left.id) ?? 0) >= 3 || (functionCounts.get(right.id) ?? 0) >= 3) {
			continue;
		}

		selected.push(candidate);
		nameFamilyCounts.set(nameFamily, (nameFamilyCounts.get(nameFamily) ?? 0) + 1);
		functionCounts.set(left.id, (functionCounts.get(left.id) ?? 0) + 1);
		functionCounts.set(right.id, (functionCounts.get(right.id) ?? 0) + 1);
		if (selected.length >= maximum) break;
	}

	return selected;
}

function findCloneGroups(
	functions: InternalFunction[],
	options: { includeTests: boolean; includeGenerated: boolean }
): CloneGroup[] {
	const grouped = new Map<string, InternalFunction[]>();
	for (const fn of functions) {
		if (!isSimilarityEligible(fn, options) || !fn.structuralHash) continue;
		const group = grouped.get(fn.structuralHash);
		if (group) group.push(fn);
		else grouped.set(fn.structuralHash, [fn]);
	}

	return [...grouped.entries()]
		.filter(([, group]) => group.length > 1 && new Set(group.map((fn) => fn.file)).size > 1)
		.map(([structuralHash, group]) => ({
			kind:
				new Set(group.map((fn) => fn.bodyHash)).size === 1
					? ('exact-body' as const)
					: ('normalized-structure' as const),
			structuralHash,
			bodyTokenCount: Math.max(...group.map((fn) => fn.bodyTokenCount)),
			functions: group.map(toFunctionReference).sort(compareReferences)
		}))
		.sort(
			(left, right) =>
				right.functions.length - left.functions.length ||
				right.bodyTokenCount - left.bodyTokenCount ||
				left.structuralHash.localeCompare(right.structuralHash)
		)
		.slice(0, 200);
}

function isSimilarityEligible(
	fn: InternalFunction,
	options: { includeTests: boolean; includeGenerated: boolean }
): boolean {
	if (!fn.hasBody || fn.kind === 'constructor') return false;
	if (fn.bodyTokenCount < 18 || fn.lineCount < 3) return false;
	if (!options.includeTests && fn.fileKind === 'test') return false;
	if (!options.includeGenerated && fn.fileKind === 'generated') return false;
	return true;
}

function compareFunctions(left: InternalFunction, right: InternalFunction): DuplicateCandidate {
	const exactBody = Boolean(left.bodyHash && left.bodyHash === right.bodyHash);
	const exactStructure = Boolean(
		left.structuralHash && left.structuralHash === right.structuralHash
	);
	const signals: SimilaritySignals = {
		structure: exactStructure
			? 1
			: diceSimilarity(left.structuralShingles, right.structuralShingles),
		name: functionNameSimilarity(left.name, right.name),
		calls: jaccardSimilarity(new Set(left.calls), new Set(right.calls)),
		signature: signatureSimilarity(left, right)
	};

	let score =
		signals.structure * 0.55 +
		signals.name * 0.25 +
		signals.calls * 0.12 +
		signals.signature * 0.08;
	if (exactStructure) score = Math.max(score, 0.84);
	if (exactBody) score = Math.max(score, 0.98);
	if (left.file === right.file && left.lineStart === right.lineStart) score = 0;
	const roundedScore = roundScore(score);

	const reasons: string[] = [];
	if (exactBody) reasons.push('identical tokenized body');
	else if (exactStructure) reasons.push('same normalized AST-token structure');
	else if (signals.structure >= 0.7) {
		reasons.push(`${formatPercent(signals.structure)} structural overlap`);
	}
	if (signals.name === 1) reasons.push('same function name');
	else if (signals.name >= 0.7) reasons.push('similar function names');
	if (signals.calls >= 0.6 && left.calls.length && right.calls.length) {
		reasons.push(`${formatPercent(signals.calls)} call-set overlap`);
	}
	if (signals.signature >= 0.8) reasons.push('compatible signatures');
	if (!reasons.length) reasons.push('combined weak structural and semantic signals');

	return {
		score: roundedScore,
		confidence: roundedScore >= 0.82 ? 'high' : roundedScore >= 0.7 ? 'medium' : 'review',
		left: toFunctionReference(left),
		right: toFunctionReference(right),
		signals: {
			structure: roundScore(signals.structure),
			name: roundScore(signals.name),
			calls: roundScore(signals.calls),
			signature: roundScore(signals.signature)
		},
		reasons
	};
}

function functionNameSimilarity(left: string, right: string): number {
	if (left.startsWith('<anonymous') || right.startsWith('<anonymous')) return 0;
	const normalizedLeft = normalizeName(left);
	const normalizedRight = normalizeName(right);
	if (!normalizedLeft || !normalizedRight) return 0;
	if (normalizedLeft === normalizedRight) return 1;
	const editSimilarity = normalizedLevenshteinSimilarity(normalizedLeft, normalizedRight);
	const tokenSimilarity = jaccardSimilarity(
		new Set(tokenizeName(left)),
		new Set(tokenizeName(right))
	);
	return Math.max(editSimilarity, tokenSimilarity);
}

function signatureSimilarity(left: InternalFunction, right: InternalFunction): number {
	const largestParameterCount = Math.max(left.parameters.length, right.parameters.length, 1);
	const parameterCountScore =
		1 - Math.abs(left.parameters.length - right.parameters.length) / largestParameterCount;
	const leftTypes = new Set(left.parameters.flatMap((parameter) => tokenizeType(parameter.type)));
	const rightTypes = new Set(
		right.parameters.flatMap((parameter) => tokenizeType(parameter.type))
	);
	const parameterTypeScore =
		leftTypes.size || rightTypes.size ? jaccardSimilarity(leftTypes, rightTypes) : 0.5;
	const leftReturn = new Set(tokenizeType(left.returnType));
	const rightReturn = new Set(tokenizeType(right.returnType));
	const returnTypeScore =
		leftReturn.size || rightReturn.size ? jaccardSimilarity(leftReturn, rightReturn) : 0.5;
	return parameterCountScore * 0.5 + parameterTypeScore * 0.3 + returnTypeScore * 0.2;
}

function tokenizeType(type: string | null): string[] {
	return type?.toLowerCase().match(/[a-z_$][a-z0-9_$]*/g) ?? [];
}

function findRepeatedNameClusters(
	functions: InternalFunction[],
	options: { includeTests: boolean; includeGenerated: boolean }
): RepeatedNameCluster[] {
	const grouped = new Map<string, InternalFunction[]>();
	for (const fn of functions) {
		if (!isSimilarityEligible(fn, options)) continue;
		if (fn.name === 'constructor' || fn.name.startsWith('<anonymous')) continue;
		const normalizedName = normalizeName(fn.name);
		if (!normalizedName) continue;
		const group = grouped.get(normalizedName);
		if (group) group.push(fn);
		else grouped.set(normalizedName, [fn]);
	}

	return [...grouped.entries()]
		.filter(([, group]) => group.length > 1 && new Set(group.map((fn) => fn.file)).size > 1)
		.map(([normalizedName, group]) => ({
			name: mostCommon(group.map((fn) => fn.name)),
			normalizedName,
			functions: group.map(toFunctionReference).sort(compareReferences)
		}))
		.sort(
			(left, right) =>
				right.functions.length - left.functions.length ||
				left.name.localeCompare(right.name)
		)
		.slice(0, 200);
}

function toFunctionReference(fn: InternalFunction): FunctionReference {
	return {
		id: fn.id,
		name: fn.name,
		qualifiedName: fn.qualifiedName,
		file: fn.file,
		line: fn.lineStart,
		signature: fn.signature
	};
}

function compareReferences(left: FunctionReference, right: FunctionReference): number {
	return left.file.localeCompare(right.file) || left.line - right.line;
}

function tokenizeName(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

function normalizeName(name: string): string {
	return tokenizeName(name).join('');
}

function lastCallSegment(call: string): string {
	return call.replace(/^new /, '').split('.').at(-1) ?? call;
}

function normalizedLevenshteinSimilarity(left: string, right: string): number {
	if (left === right) return 1;
	if (!left.length || !right.length) return 0;
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const insertion = (current[rightIndex - 1] ?? 0) + 1;
			const deletion = (previous[rightIndex] ?? 0) + 1;
			const substitution =
				(previous[rightIndex - 1] ?? 0) +
				(left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
			current[rightIndex] = Math.min(insertion, deletion, substitution);
		}
		for (let index = 0; index < current.length; index += 1)
			previous[index] = current[index] ?? 0;
	}
	const distance = previous[right.length] ?? Math.max(left.length, right.length);
	return 1 - distance / Math.max(left.length, right.length);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
	if (!left.size && !right.size) return 0;
	let intersection = 0;
	for (const item of left) if (right.has(item)) intersection += 1;
	return intersection / (left.size + right.size - intersection);
}

function diceSimilarity(left: Set<string>, right: Set<string>): number {
	if (!left.size && !right.size) return 0;
	let intersection = 0;
	for (const item of left) if (right.has(item)) intersection += 1;
	return (2 * intersection) / (left.size + right.size);
}

function buildSummary(
	files: FileRecord[],
	cloneGroups: CloneGroup[],
	duplicateCandidates: DuplicateCandidate[],
	repeatedNameClusters: RepeatedNameCluster[]
): CodebaseInventory['summary'] {
	const functions = files.flatMap((file) => file.functions);
	const filesByKind: Record<FileKind, number> = {
		source: 0,
		script: 0,
		test: 0,
		generated: 0
	};
	const functionsByKind: Record<FunctionKind, number> = {
		function: 0,
		arrow: 0,
		'function-expression': 0,
		method: 0,
		getter: 0,
		setter: 0,
		constructor: 0
	};
	for (const file of files) filesByKind[file.kind] += 1;
	for (const fn of functions) functionsByKind[fn.kind] += 1;

	return {
		files: files.length,
		functions: functions.length,
		exportedFunctions: functions.filter((fn) => fn.exported).length,
		anonymousFunctions: functions.filter((fn) => fn.name.startsWith('<anonymous')).length,
		filesByKind,
		functionsByKind,
		cloneGroups: cloneGroups.length,
		duplicateCandidates: duplicateCandidates.length,
		repeatedNameClusters: repeatedNameClusters.length
	};
}

function buildHierarchy(files: FileRecord[]): HierarchyNode {
	interface MutableHierarchyNode {
		name: string;
		path: string;
		fileCount: number;
		functionCount: number;
		files: string[];
		children: MutableHierarchyNode[];
		childMap: Map<string, MutableHierarchyNode>;
	}

	const root: MutableHierarchyNode = {
		name: '.',
		path: '.',
		fileCount: 0,
		functionCount: 0,
		files: [],
		children: [],
		childMap: new Map()
	};

	for (const file of files) {
		const directoryParts = file.directory === '.' ? [] : file.directory.split('/');
		let current = root;
		current.fileCount += 1;
		current.functionCount += file.functions.length;
		let currentPath = '';
		for (const part of directoryParts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			let child = current.childMap.get(part);
			if (!child) {
				child = {
					name: part,
					path: currentPath,
					fileCount: 0,
					functionCount: 0,
					files: [],
					children: [],
					childMap: new Map()
				};
				current.childMap.set(part, child);
				current.children.push(child);
			}
			child.fileCount += 1;
			child.functionCount += file.functions.length;
			current = child;
		}
		current.files.push(file.path);
	}

	function finalize(node: MutableHierarchyNode): HierarchyNode {
		return {
			name: node.name,
			path: node.path,
			fileCount: node.fileCount,
			functionCount: node.functionCount,
			files: node.files.sort(),
			children: node.children
				.sort((left, right) => left.name.localeCompare(right.name))
				.map(finalize)
		};
	}

	return finalize(root);
}

export function renderInventoryMarkdown(inventory: CodebaseInventory): string {
	const fileByPath = new Map(inventory.files.map((file) => [file.path, file]));
	const lines = [
		'# TypeScript Codebase Inventory',
		'',
		`Generated: ${inventory.generatedAt}`,
		'',
		`Scope: ${inventory.config.sourceRoots.map((root) => `\`${root}\``).join(', ')}`,
		'',
		`Indexed **${inventory.summary.files.toLocaleString()} files** and **${inventory.summary.functions.toLocaleString()} runtime functions**.`,
		'',
		'> This is a structural map, not a declaration that similarly shaped functions should be merged.',
		'',
		'## Hierarchy',
		''
	];

	function renderNode(node: HierarchyNode, depth: number): void {
		if (node.path !== '.') {
			lines.push(
				`${'  '.repeat(Math.max(0, depth - 1))}- **${escapeMarkdown(node.name)}/** — ${node.fileCount} files, ${node.functionCount} functions`
			);
		}
		for (const filePath of node.files) {
			const file = fileByPath.get(filePath);
			if (!file) continue;
			const indentation = '  '.repeat(depth);
			lines.push(
				`${indentation}- \`${file.name}\` — ${file.lineCount} lines, ${file.functions.length} functions, ${file.kind}`
			);
			for (const fn of file.functions) {
				const tags = [fn.exported ? 'exported' : null, fn.async ? 'async' : null, fn.kind]
					.filter(Boolean)
					.join(', ');
				lines.push(
					`${indentation}  - \`${escapeInlineCode(fn.signature)}\` — L${fn.lineStart}–${fn.lineEnd}; ${tags}`
				);
			}
		}
		for (const child of node.children) renderNode(child, depth + 1);
	}

	renderNode(inventory.hierarchy, 0);
	lines.push('');
	return lines.join('\n');
}

export function renderDuplicateReportMarkdown(inventory: CodebaseInventory): string {
	const summary = inventory.summary;
	const sourceFiles = inventory.files.filter((file) => file.kind === 'source');
	const hotspots = [...sourceFiles]
		.sort(
			(left, right) =>
				right.functions.length - left.functions.length || right.lineCount - left.lineCount
		)
		.slice(0, 20);
	const fanIn = [...sourceFiles]
		.filter((file) => file.importedBy.length)
		.sort(
			(left, right) =>
				right.importedBy.length - left.importedBy.length ||
				left.path.localeCompare(right.path)
		)
		.slice(0, 20);
	const lines = [
		'# TypeScript Duplication Review',
		'',
		`Generated: ${inventory.generatedAt}`,
		'',
		'## Summary',
		'',
		'| Metric | Count |',
		'| --- | ---: |',
		`| Indexed files | ${summary.files.toLocaleString()} |`,
		`| Runtime functions | ${summary.functions.toLocaleString()} |`,
		`| Exported functions and public methods | ${summary.exportedFunctions.toLocaleString()} |`,
		`| Anonymous callbacks | ${summary.anonymousFunctions.toLocaleString()} |`,
		`| Clone families | ${summary.cloneGroups.toLocaleString()} |`,
		`| Ranked near-duplicate candidates | ${summary.duplicateCandidates.toLocaleString()} |`,
		`| Repeated-name clusters | ${summary.repeatedNameClusters.toLocaleString()} |`,
		'',
		'Candidate scoring combines normalized body structure (55%), function-name similarity (25%), called-function overlap (12%), and signature compatibility (8%). Exact token bodies and exact normalized structures receive confidence floors. Tests and generated files are indexed but excluded from duplicate scoring unless explicitly enabled.',
		'',
		'## Clone families',
		''
	];

	if (!inventory.cloneGroups.length) {
		lines.push('No clone families cleared the minimum body-size gate.', '');
	} else {
		for (const [index, group] of inventory.cloneGroups.slice(0, 60).entries()) {
			lines.push(
				`### ${index + 1}. ${group.kind === 'exact-body' ? 'Exact body' : 'Normalized structure'} — ${group.functions.length} functions`,
				''
			);
			for (const fn of group.functions) {
				lines.push(`- ${formatReference(fn)} — \`${escapeInlineCode(fn.signature)}\``);
			}
			lines.push('');
		}
	}

	lines.push('## Ranked near-duplicate candidates', '');

	if (!inventory.duplicateCandidates.length) {
		lines.push('No candidates cleared the configured threshold.', '');
	} else {
		lines.push(
			'| # | Score | Confidence | Functions | Evidence |',
			'| ---: | ---: | --- | --- | --- |'
		);
		inventory.duplicateCandidates.forEach((candidate, index) => {
			const left = formatReference(candidate.left);
			const right = formatReference(candidate.right);
			lines.push(
				`| ${index + 1} | ${candidate.score.toFixed(3)} | ${candidate.confidence} | ${left}<br>${right} | ${candidate.reasons.join('; ')} |`
			);
		});
		lines.push('');
	}

	lines.push('## Repeated function names across files', '');
	if (!inventory.repeatedNameClusters.length) {
		lines.push('No repeated-name clusters were found.', '');
	} else {
		for (const cluster of inventory.repeatedNameClusters.slice(0, 60)) {
			lines.push(`### ${escapeMarkdown(cluster.name)} (${cluster.functions.length})`, '');
			for (const fn of cluster.functions)
				lines.push(`- ${formatReference(fn)} — \`${escapeInlineCode(fn.signature)}\``);
			lines.push('');
		}
	}

	lines.push(
		'## Function-density hotspots',
		'',
		'| File | Functions | Lines | Imports from indexed TypeScript |',
		'| --- | ---: | ---: | ---: |'
	);
	for (const file of hotspots) {
		lines.push(
			`| \`${escapeInlineCode(file.path)}\` | ${file.functions.length} | ${file.lineCount} | ${file.importedBy.length} |`
		);
	}

	lines.push(
		'',
		'## High fan-in modules',
		'',
		'| File | Importing TypeScript files | Functions |',
		'| --- | ---: | ---: |'
	);
	for (const file of fanIn) {
		lines.push(
			`| \`${escapeInlineCode(file.path)}\` | ${file.importedBy.length} | ${file.functions.length} |`
		);
	}

	lines.push(
		'',
		'## Interpretation notes',
		'',
		'- A high score means “inspect this pair,” not “merge this pair.” Boundary adapters and domain-specific formatters often resemble each other for good reasons.',
		'- Anonymous callbacks are indexed for completeness but name similarity is disabled for them.',
		'- Import fan-in only covers the indexed TypeScript scope. Imports from excluded `.svelte` files are intentionally invisible, so this report does not label exports as unused.',
		'- Normalized structure removes identifier and literal differences. This catches renamed clones but can over-rank short wrappers; the minimum body-size filter limits that noise.',
		''
	);
	return lines.join('\n');
}

function formatReference(reference: FunctionReference): string {
	return `\`${escapeInlineCode(reference.qualifiedName)}\` (\`${escapeInlineCode(reference.file)}:${reference.line}\`)`;
}

function escapeInlineCode(value: string): string {
	return value.replace(/`/g, '\\`').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function escapeMarkdown(value: string): string {
	return value.replace(/([*_`])/g, '\\$1');
}

function compareFiles(left: FileRecord, right: FileRecord): number {
	return left.path.localeCompare(right.path);
}

function mostCommon(values: string[]): string {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return (
		[...counts.entries()].sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
		)[0]?.[0] ??
		values[0] ??
		''
	);
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function fnv1a(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function toPosixPath(path: string): string {
	return path.split(sep).join('/');
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function roundScore(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}
