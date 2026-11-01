// scripts/labelFilePaths.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getChangedFiles } from './lib/changed-files';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const EXCLUDED_DIRS = [
	'node_modules',
	'.git',
	'.svelte-kit',
	'dist',
	'build',
	'.vercel',
	'.netlify',
	'coverage',
	'.nyc_output',
	'tmp',
	'temp',
	'static',
	'public'
];

const EXCLUDED_FILES = [
	'.gitignore',
	'.env',
	'.env.local',
	'.env.example',
	'package-lock.json',
	'pnpm-lock.yaml',
	'yarn.lock',
	'database.types.ts'
];

// Comment patterns for different file types
const COMMENT_PATTERNS = {
	// HTML-style comments
	svelte: (filePath: string) => `<!-- ${filePath} -->`,
	html: (filePath: string) => `<!-- ${filePath} -->`,
	xml: (filePath: string) => `<!-- ${filePath} -->`,
	md: (filePath: string) => `<!-- ${filePath} -->`,

	// Single-line comments
	ts: (filePath: string) => `// ${filePath}`,
	js: (filePath: string) => `// ${filePath}`,
	mjs: (filePath: string) => `// ${filePath}`,
	jsx: (filePath: string) => `// ${filePath}`,
	tsx: (filePath: string) => `// ${filePath}`,
	// json: (filePath: string) => `// ${filePath}`,
	jsonc: (filePath: string) => `// ${filePath}`,

	// CSS-style comments
	css: (filePath: string) => `/* ${filePath} */`,
	scss: (filePath: string) => `/* ${filePath} */`,
	sass: (filePath: string) => `/* ${filePath} */`,
	less: (filePath: string) => `/* ${filePath} */`,

	// Python
	py: (filePath: string) => `# ${filePath}`,

	// Shell scripts
	sh: (filePath: string) => `# ${filePath}`,
	bash: (filePath: string) => `# ${filePath}`,

	// SQL
	sql: (filePath: string) => `-- ${filePath}`,

	// YAML
	yml: (filePath: string) => `# ${filePath}`,
	yaml: (filePath: string) => `# ${filePath}`
};

// Regex patterns to detect an older path label (e.g. left behind after a file moved).
// Kept specific so ordinary comments, markdown headers, and frontmatter don't match.
// Path characters: word chars, dash, dot, slash, plus, space, brackets ([slug]), parentheses
// ((app) route groups), $ ($types.ts), comma (Expo groups like (today,workspace)),
// = (SvelteKit matchers like [handle=at_handle]), @ and ~.
// The file's own current label is always recognized by exact match, whatever its characters.
const PATH_CHARS = String.raw`[\w\-./+ \[\]()$,=@~]+`;
const EXISTING_PATH_COMMENT_PATTERNS = [
	new RegExp(String.raw`^<!--\s*${PATH_CHARS}\.(md|svelte|html|xml)\s*-->`), // HTML-style
	new RegExp(String.raw`^\/\/\s*${PATH_CHARS}\.(ts|js|mjs|jsx|tsx|jsonc)`), // Single-line
	new RegExp(String.raw`^\/\*\s*${PATH_CHARS}\.(css|scss|sass|less)\s*\*\/`), // CSS-style
	new RegExp(String.raw`^#\s*${PATH_CHARS}\.(py|sh|bash|yml|yaml)`), // Hash (not markdown headers!)
	new RegExp(String.raw`^--\s*${PATH_CHARS}\.sql`) // SQL
];

function getFileExtension(filePath: string): string {
	return path.extname(filePath).slice(1).toLowerCase();
}

function getRelativePath(fullPath: string, rootDir: string): string {
	const relativePath = path.relative(rootDir, fullPath);
	// Convert to forward slashes for consistency
	return relativePath.replace(/\\/g, '/');
}

function shouldProcessFile(filePath: string): boolean {
	const fileName = path.basename(filePath);
	const ext = getFileExtension(filePath);

	// Skip excluded files
	if (EXCLUDED_FILES.includes(fileName)) {
		return false;
	}

	// Plugin skills ship to external agents under the Agent Skills spec, which allows only
	// name/description-style frontmatter; a `path:` label breaks the published plugin.
	if (fileName === 'SKILL.md' && filePath.split(path.sep).includes('plugins')) {
		return false;
	}

	// Skip files without extensions or unsupported extensions
	if (!ext || !COMMENT_PATTERNS[ext as keyof typeof COMMENT_PATTERNS]) {
		return false;
	}

	// Skip binary files and images
	const binaryExtensions = [
		'png',
		'jpg',
		'jpeg',
		'gif',
		'ico',
		'svg',
		'pdf',
		'zip',
		'tar',
		'gz',
		'json'
	];
	if (binaryExtensions.includes(ext)) {
		return false;
	}

	return true;
}

function shouldProcessDirectory(dirPath: string): boolean {
	const dirName = path.basename(dirPath);
	return !EXCLUDED_DIRS.includes(dirName) && !dirName.startsWith('.');
}

function isShebangLine(line: string): boolean {
	return line.startsWith('#!');
}

function isExistingPathCommentLine(line: string): boolean {
	const trimmedLine = line.trim();
	return EXISTING_PATH_COMMENT_PATTERNS.some((pattern) => pattern.test(trimmedLine));
}

/**
 * Check if markdown content has YAML frontmatter (starts with ---)
 */
function hasFrontmatter(content: string): boolean {
	return content.trimStart().startsWith('---');
}

/**
 * Check if frontmatter already contains a path field
 */
function frontmatterHasPath(content: string): boolean {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) return false;
	return /^path:\s*/m.test(frontmatterMatch[1]);
}

/**
 * Add or update the path field inside frontmatter
 */
function addPathToFrontmatter(content: string, relativePath: string): string {
	const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
	if (!frontmatterMatch) return content;

	const [, opening, frontmatterContent, closing] = frontmatterMatch;
	const restOfFile = content.slice(frontmatterMatch[0].length);

	// Check if path already exists
	if (/^path:\s*/m.test(frontmatterContent)) {
		// Update existing path
		const updatedFrontmatter = frontmatterContent.replace(
			/^path:\s*.*$/m,
			`path: ${relativePath}`
		);
		return opening + updatedFrontmatter + closing + restOfFile;
	} else {
		// Add path at the end of frontmatter (before closing ---)
		return opening + frontmatterContent + `\npath: ${relativePath}` + closing + restOfFile;
	}
}

function isPathLabel(line: string, pathComment: string): boolean {
	return line.trim() === pathComment || isExistingPathCommentLine(line);
}

/**
 * Put the label at lines[index]: replace an existing label there, or insert one.
 * Also drops exact repeats of the label directly below it (left by earlier runs);
 * only exact copies go, so a real comment that merely looks like a path survives.
 */
function setPathLabelAt(lines: string[], index: number, pathComment: string): string[] {
	const out = [...lines];
	if (index >= out.length || !isPathLabel(out[index], pathComment)) {
		out.splice(index, 0, pathComment);
		return out;
	}

	const repeats = new Set([out[index].trim(), pathComment]);
	out[index] = pathComment;
	while (index + 1 < out.length && repeats.has(out[index + 1].trim())) {
		out.splice(index + 1, 1);
	}
	return out;
}

export function addOrUpdatePathCommentInLines(content: string, pathComment: string): string {
	let lines = content.split('\n');

	// A label written above a shebang breaks the script: drop it so the shebang is first again.
	if (lines.length > 1 && isPathLabel(lines[0], pathComment) && isShebangLine(lines[1])) {
		lines = lines.slice(1);
	}

	const labelIndex = isShebangLine(lines[0]) ? 1 : 0;
	return setPathLabelAt(lines, labelIndex, pathComment).join('\n');
}

function addOrUpdatePathComment(filePath: string, rootDir: string): boolean {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		const ext = getFileExtension(filePath);
		const commentFunction = COMMENT_PATTERNS[ext as keyof typeof COMMENT_PATTERNS];

		if (!commentFunction) {
			return false;
		}

		const relativePath = getRelativePath(filePath, rootDir);
		let newContent: string;

		// Special handling for markdown files
		if (ext === 'md') {
			if (hasFrontmatter(content)) {
				// Add path inside frontmatter - never touch headers or other content
				newContent = addPathToFrontmatter(content, relativePath);
			} else {
				// No frontmatter - update or prepend the HTML comment, NEVER replace other content
				const pathComment = commentFunction(relativePath);
				newContent = setPathLabelAt(content.split('\n'), 0, pathComment).join('\n');
			}
		} else {
			// Non-markdown files: use original logic
			const pathComment = commentFunction(relativePath);
			newContent = addOrUpdatePathCommentInLines(content, pathComment);
		}

		// Only write if content has changed
		if (newContent !== content) {
			fs.writeFileSync(filePath, newContent, 'utf8');
			return true;
		}

		return false;
	} catch (error) {
		console.error(`Error processing file ${filePath}:`, error);
		return false;
	}
}

function processDirectory(
	dirPath: string,
	rootDir: string
): { processed: number; updated: number } {
	let processed = 0;
	let updated = 0;

	try {
		const items = fs.readdirSync(dirPath);

		for (const item of items) {
			const fullPath = path.join(dirPath, item);
			const stat = fs.statSync(fullPath);

			if (stat.isDirectory()) {
				if (shouldProcessDirectory(fullPath)) {
					const result = processDirectory(fullPath, rootDir);
					processed += result.processed;
					updated += result.updated;
				}
			} else if (stat.isFile()) {
				if (shouldProcessFile(fullPath)) {
					processed++;
					const wasUpdated = addOrUpdatePathComment(fullPath, rootDir);
					if (wasUpdated) {
						updated++;
						console.log(`Updated: ${getRelativePath(fullPath, rootDir)}`);
					}
				}
			}
		}
	} catch (error) {
		console.error(`Error processing directory ${dirPath}:`, error);
	}

	return { processed, updated };
}

function processChangedFiles(
	files: string[],
	rootDir: string
): { processed: number; updated: number } {
	let processed = 0;
	let updated = 0;

	for (const fullPath of files) {
		if (!shouldProcessFile(fullPath)) {
			continue;
		}
		// Honor the same directory exclusions the full scan uses.
		const relative = getRelativePath(fullPath, rootDir);
		const segments = relative.split('/');
		if (segments.some((segment) => EXCLUDED_DIRS.includes(segment))) {
			continue;
		}
		// The full scan skips dot-directories via shouldProcessDirectory; changed-mode must too,
		// or files in .claude/.codex skill dirs get path labels their frontmatter rules forbid.
		if (segments.slice(0, -1).some((segment) => segment.startsWith('.'))) {
			continue;
		}

		processed++;
		const wasUpdated = addOrUpdatePathComment(fullPath, rootDir);
		if (wasUpdated) {
			updated++;
			console.log(`Updated: ${relative}`);
		}
	}

	return { processed, updated };
}

function main() {
	const args = process.argv.slice(2);
	const changedOnly = args.includes('--changed');
	const positional = args.filter((arg) => !arg.startsWith('--'));
	const targetDir = positional[0] || process.cwd();
	const rootDir = path.resolve(targetDir);

	const startTime = Date.now();
	let result: { processed: number; updated: number };

	if (changedOnly) {
		const changedFiles = getChangedFiles({ cwd: rootDir });
		console.log(
			`Labeling path comments on ${changedFiles.length} changed file(s) in: ${rootDir}`
		);
		console.log('');
		result = processChangedFiles(changedFiles, rootDir);
	} else {
		console.log(`Starting file path labeling in: ${rootDir}`);
		console.log('Supported file types:', Object.keys(COMMENT_PATTERNS).join(', '));
		console.log('');
		result = processDirectory(rootDir, rootDir);
	}

	const endTime = Date.now();

	console.log('');
	console.log('='.repeat(50));
	console.log(`Processed ${result.processed} files`);
	console.log(`Updated ${result.updated} files`);
	console.log(`Completed in ${endTime - startTime}ms`);

	if (result.updated === 0) {
		console.log('All files are already up to date!');
	}
}

// Run only when executed directly, so tests can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	main();
}
