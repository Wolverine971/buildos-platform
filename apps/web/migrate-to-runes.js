// apps/web/migrate-to-runes.js

/**
 * Svelte 4 to Svelte 5 Runes Migration Script
 *
 * Automatically converts $: reactive statements to Svelte 5 runes syntax:
 * - Simple assignments ($: x = y) → $derived(y)
 * - Side effects ($: if/function calls) → $effect(() => {...})
 * - Complex blocks → Analyzed for proper conversion
 *
 * Usage:
 *   node migrate-to-runes.js [--dry-run] [--file <path>] [--verbose]
 *
 * Options:
 *   --dry-run: Show changes without modifying files
 *   --file <path>: Process a single file
 *   --verbose: Show detailed conversion information
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fg from 'fast-glob';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_SRC_DIR = path.join(__dirname, 'src');
const PATTERN = '**/*.svelte';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const fileIndex = args.indexOf('--file');
const singleFile = fileIndex !== -1 ? args[fileIndex + 1] : null;

// Statistics
const stats = {
	filesProcessed: 0,
	filesModified: 0,
	totalConversions: 0,
	derivedCount: 0,
	effectCount: 0,
	skippedCount: 0,
	errors: []
};

// Color output helpers
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Determines if a reactive statement is a side effect or computed value
 */
function isSideEffect(statement) {
	// Remove comments and whitespace
	const cleaned = statement
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/.*/g, '')
		.trim();

	// Check for assignment statements - these are computed values
	const assignmentMatch = cleaned.match(/^(\w+)\s*=\s*(.+)/);
	if (assignmentMatch) {
		const [, varName, expression] = assignmentMatch;

		// Check if the expression contains function calls that might have side effects
		// But simple function calls for computed values are OK (e.g., map, filter, etc)
		const commonComputedMethods =
			/\.(map|filter|reduce|slice|concat|join|split|sort|includes|find|every|some)\(/;
		const hasCommonComputed = commonComputedMethods.test(expression);

		// If it's just an assignment with common computed methods, it's $derived
		if (hasCommonComputed || !hasFunctionCall(expression)) {
			return false; // computed value
		}

		// Check for destructuring or complex assignments
		if (varName.includes('[') || varName.includes('{')) {
			return false; // computed value
		}

		// Function calls that might mutate state
		const mutatingCalls = /\.(push|pop|shift|unshift|splice|sort|reverse|fill)\(/;
		if (mutatingCalls.test(expression)) {
			return true; // side effect
		}

		return false; // default to computed value for assignments
	}

	// If statements, function calls without assignment = side effects
	if (cleaned.startsWith('if') || cleaned.startsWith('for') || cleaned.startsWith('while')) {
		return true;
	}

	// Block statements (wrapped in {}) are typically side effects
	if (cleaned.startsWith('{')) {
		return true;
	}

	// Direct function calls (no assignment)
	if (hasFunctionCall(cleaned) && !assignmentMatch) {
		return true;
	}

	// Arrow function or regular function = side effect
	if (cleaned.includes('=>') || cleaned.match(/^function\s*\(/)) {
		return true;
	}

	return true; // default to side effect for safety
}

/**
 * Check if expression contains function calls
 */
function hasFunctionCall(expression) {
	// Look for function call pattern: identifier followed by (
	const functionCallPattern = /\w+\s*\(/;
	return functionCallPattern.test(expression);
}

/**
 * Convert a single reactive statement to runes syntax
 */
function convertReactiveStatement(fullMatch, indentation, statement) {
	const trimmedStatement = statement.trim();

	// Handle empty reactive statements
	if (!trimmedStatement) {
		stats.skippedCount++;
		return fullMatch; // skip empty statements
	}

	// Check if it's a side effect or computed value
	const isEffect = isSideEffect(trimmedStatement);

	if (isEffect) {
		// Convert to $effect
		stats.effectCount++;

		// Check if statement is already wrapped in block
		let effectBody;
		if (trimmedStatement.startsWith('{')) {
			// Already a block
			effectBody = trimmedStatement;
		} else if (trimmedStatement.startsWith('if')) {
			// If statement - wrap in block
			effectBody = `{ ${trimmedStatement} }`;
		} else {
			// Single statement - wrap in block
			effectBody = `{ ${trimmedStatement}; }`;
		}

		return `${indentation}$effect(() => ${effectBody});`;
	} else {
		// Convert to $derived
		stats.derivedCount++;

		// Extract variable name and expression from first line
		const firstLineMatch = statement
			.split('\n')[0]
			.trim()
			.match(/^(\w+)\s*=\s*(.*)$/);

		if (firstLineMatch) {
			const [, varName, firstPartOfExpression] = firstLineMatch;

			// Get the full expression (might be multi-line)
			let expression = statement.substring(statement.indexOf('=') + 1).trim();

			// Remove trailing semicolon if present
			if (expression.endsWith(';')) {
				expression = expression.slice(0, -1).trim();
			}

			// Check if expression starts with an opening bracket
			const startsWithBracket = expression.match(/^[{[(]/);

			if (startsWithBracket) {
				// Expression already has brackets, don't add parens
				// For multi-line, preserve indentation
				if (statement.includes('\n')) {
					const lines = statement.split('\n');
					const expressionLines = lines.slice(0); // All lines

					// Reconstruct with proper indentation
					const reconstructed = expressionLines
						.map((line, i) => {
							if (i === 0) {
								// First line: let varName = $derived
								return `${indentation}let ${varName} = $derived(${firstPartOfExpression}`;
							} else if (i === expressionLines.length - 1) {
								// Last line: close with );
								return line.replace(/;?\s*$/, '') + ');';
							} else {
								// Middle lines: preserve as is
								return line;
							}
						})
						.join('\n');

					return reconstructed;
				} else {
					return `${indentation}let ${varName} = $derived(${expression});`;
				}
			} else {
				// Simple expression - wrap in parens
				return `${indentation}let ${varName} = $derived(${expression});`;
			}
		} else {
			// Fallback for edge cases
			stats.skippedCount++;
			return fullMatch;
		}
	}
}

/**
 * Extract reactive statements from script content
 */
function extractReactiveStatements(content) {
	const statements = [];
	const lines = content.split('\n');

	let inReactive = false;
	let currentStatement = {
		startLine: -1,
		indentation: '',
		lines: []
	};

	// Track if we're in a multi-line structure (object, array, etc)
	let bracketDepth = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Check if this line starts a reactive statement
		if (trimmed.startsWith('$:')) {
			if (inReactive) {
				// Save previous statement
				statements.push({ ...currentStatement });
			}

			// Start new reactive statement
			inReactive = true;
			bracketDepth = 0;

			const match = line.match(/^(\s*)(\$:\s*)(.*)$/);
			if (match) {
				currentStatement = {
					startLine: i,
					indentation: match[1],
					lines: [line]
				};

				// Count brackets on first line
				const content = match[3];
				bracketDepth += (content.match(/[{[(]/g) || []).length;
				bracketDepth -= (content.match(/[}\])]/g) || []).length;
			}
		} else if (inReactive) {
			// Update bracket depth
			bracketDepth += (line.match(/[{[(]/g) || []).length;
			bracketDepth -= (line.match(/[}\])]/g) || []).length;

			// Check if we should continue the current reactive statement
			const isIndented = line.match(/^\s+\S/); // Has leading whitespace + non-whitespace
			const isClosingBracket = trimmed.match(/^[}\])]/) && bracketDepth >= 0;
			const isArrayChaining = trimmed.match(/^\[/) && bracketDepth > 0;
			const previousLineNeedsContinuation =
				currentStatement.lines.length > 0 &&
				(currentStatement.lines[currentStatement.lines.length - 1]
					.trim()
					.match(/[{[(,:]$/) ||
					bracketDepth > 0);

			const shouldContinue =
				bracketDepth > 0 || // Still inside brackets
				(isIndented && previousLineNeedsContinuation) || // Indented continuation
				isClosingBracket || // Closing bracket
				isArrayChaining; // Array method chaining

			if (shouldContinue && !trimmed.startsWith('$:') && !trimmed.startsWith('//')) {
				currentStatement.lines.push(line);
			} else {
				// End of reactive statement
				statements.push({ ...currentStatement });
				inReactive = false;
				bracketDepth = 0;

				// Check if this line starts a new reactive statement
				if (trimmed.startsWith('$:')) {
					const match = line.match(/^(\s*)(\$:\s*)(.*)$/);
					if (match) {
						inReactive = true;
						currentStatement = {
							startLine: i,
							indentation: match[1],
							lines: [line]
						};

						// Count brackets on first line
						const content = match[3];
						bracketDepth += (content.match(/[{[(]/g) || []).length;
						bracketDepth -= (content.match(/[}\])]/g) || []).length;
					}
				}
			}
		}
	}

	// Don't forget the last statement if we're still in one
	if (inReactive) {
		statements.push(currentStatement);
	}

	return statements;
}

/**
 * Process a single file
 */
function processFile(filePath) {
	try {
		stats.filesProcessed++;

		// Read file content
		const content = fs.readFileSync(filePath, 'utf8');

		// Check if file contains any reactive statements
		if (!content.includes('$:')) {
			return; // Skip files without reactive statements
		}

		let modified = false;
		const replacements = [];

		// Extract reactive statements
		const reactiveStatements = extractReactiveStatements(content);

		for (const stmt of reactiveStatements) {
			const fullMatch = stmt.lines.join('\n');
			const firstLine = stmt.lines[0];
			const match = firstLine.match(/^(\s*)(\$:\s*)(.*)$/);

			if (!match) continue;

			const [, indentation, , firstStatement] = match;

			// Combine all lines to get the full statement
			let statement = firstStatement;
			if (stmt.lines.length > 1) {
				statement = stmt.lines
					.map((line, i) => (i === 0 ? firstStatement : line))
					.join('\n');
			}

			const converted = convertReactiveStatement(fullMatch, indentation, statement);

			if (converted !== fullMatch) {
				replacements.push({
					original: fullMatch,
					converted: converted,
					statement: statement.trim()
				});
				modified = true;
			}
		}

		// Apply replacements
		if (modified) {
			let newContent = content;
			for (const replacement of replacements) {
				newContent = newContent.replace(replacement.original, replacement.converted);
			}

			stats.filesModified++;
			stats.totalConversions += replacements.length;

			if (isVerbose) {
				log(`\n${'='.repeat(80)}`, 'cyan');
				log(`File: ${path.relative(process.cwd(), filePath)}`, 'bright');
				log(`Conversions: ${replacements.length}`, 'green');

				replacements.forEach((r, i) => {
					log(
						`\n  [${i + 1}] ${r.statement.substring(0, 60)}${r.statement.length > 60 ? '...' : ''}`,
						'yellow'
					);
					log(
						`      Original:\n${r.original
							.split('\n')
							.map((l) => '        ' + l)
							.join('\n')}`,
						'red'
					);
					log(
						`      Converted:\n${r.converted
							.split('\n')
							.map((l) => '        ' + l)
							.join('\n')}`,
						'green'
					);
				});
			} else {
				log(
					`✓ ${path.relative(process.cwd(), filePath)} (${replacements.length} conversions)`,
					'green'
				);
			}

			// Write file if not dry run
			if (!isDryRun) {
				fs.writeFileSync(filePath, newContent, 'utf8');
			}
		}
	} catch (error) {
		stats.errors.push({ file: filePath, error: error.message });
		log(`✗ Error processing ${filePath}: ${error.message}`, 'red');
	}
}

/**
 * Check if position is inside a comment
 */
function isInsideComment(textBefore) {
	// Count comment markers
	const blockCommentStarts = (textBefore.match(/\/\*/g) || []).length;
	const blockCommentEnds = (textBefore.match(/\*\//g) || []).length;

	// If more starts than ends, we're inside a block comment
	if (blockCommentStarts > blockCommentEnds) {
		return true;
	}

	// Check for line comment on same line
	const lastNewline = textBefore.lastIndexOf('\n');
	const lastLineStart = lastNewline === -1 ? 0 : lastNewline + 1;
	const currentLine = textBefore.substring(lastLineStart);

	return currentLine.includes('//');
}

/**
 * Check if position is inside a string
 */
function isInsideString(textBefore) {
	// Simple heuristic: count unescaped quotes
	const singleQuotes = textBefore
		.split('')
		.filter((c, i, arr) => c === "'" && (i === 0 || arr[i - 1] !== '\\')).length;

	const doubleQuotes = textBefore
		.split('')
		.filter((c, i, arr) => c === '"' && (i === 0 || arr[i - 1] !== '\\')).length;

	const backticks = textBefore
		.split('')
		.filter((c, i, arr) => c === '`' && (i === 0 || arr[i - 1] !== '\\')).length;

	// If odd number of quotes, we're inside a string
	return singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1;
}

/**
 * Main execution
 */
async function main() {
	log('\n' + '='.repeat(80), 'cyan');
	log('Svelte 4 → Svelte 5 Runes Migration', 'bright');
	log('='.repeat(80) + '\n', 'cyan');

	if (isDryRun) {
		log('⚠️  DRY RUN MODE - No files will be modified\n', 'yellow');
	}

	let files;

	if (singleFile) {
		// Process single file
		files = [singleFile];
		log(`Processing single file: ${singleFile}\n`, 'blue');
	} else {
		// Find all .svelte files
		log(`Searching for .svelte files in: ${DEFAULT_SRC_DIR}\n`, 'blue');
		files = await fg(PATTERN, { cwd: DEFAULT_SRC_DIR, absolute: true });
		log(`Found ${files.length} files to process\n`, 'blue');
	}

	// Process each file
	for (const file of files) {
		processFile(file);
	}

	// Print summary
	log('\n' + '='.repeat(80), 'cyan');
	log('Migration Summary', 'bright');
	log('='.repeat(80), 'cyan');
	log(`Files processed:     ${stats.filesProcessed}`, 'blue');
	log(
		`Files modified:      ${stats.filesModified}`,
		stats.filesModified > 0 ? 'green' : 'yellow'
	);
	log(`Total conversions:   ${stats.totalConversions}`, 'green');
	log(`  → $derived:        ${stats.derivedCount}`, 'green');
	log(`  → $effect:         ${stats.effectCount}`, 'green');
	log(`  → Skipped:         ${stats.skippedCount}`, 'yellow');

	if (stats.errors.length > 0) {
		log(`\nErrors encountered:  ${stats.errors.length}`, 'red');
		stats.errors.forEach(({ file, error }) => {
			log(`  ✗ ${path.relative(process.cwd(), file)}: ${error}`, 'red');
		});
	}

	if (isDryRun) {
		log('\n⚠️  DRY RUN - No files were modified', 'yellow');
		log('Remove --dry-run flag to apply changes', 'yellow');
	} else {
		log('\n✓ Migration complete!', 'green');
	}

	log('='.repeat(80) + '\n', 'cyan');
}

// Run the migration
main().catch((error) => {
	log(`\n✗ Fatal error: ${error.message}`, 'red');
	console.error(error);
	process.exit(1);
});
