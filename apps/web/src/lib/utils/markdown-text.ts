// apps/web/src/lib/utils/markdown-text.ts

function splitMarkdownLines(text: string): string[] {
	return text.split(/\r\n|\n|\r/);
}

function splitTableCells(line: string): string[] {
	let trimmed = line.trim();
	if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
	if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
	return trimmed.split('|').map((cell) => cell.trim());
}

function isPotentialTableRow(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed || !trimmed.includes('|')) return false;
	return splitTableCells(trimmed).length >= 2;
}

function isTableDelimiterRow(line: string): boolean {
	const cells = splitTableCells(line);
	return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function isValidMarkdownTable(rows: string[]): boolean {
	const headerRow = rows[0];
	const delimiterRow = rows[1];
	if (!headerRow || !delimiterRow || !isTableDelimiterRow(delimiterRow)) return false;
	const headerCellCount = splitTableCells(headerRow).length;
	const delimiterCellCount = splitTableCells(delimiterRow).length;
	return headerCellCount >= 2 && headerCellCount === delimiterCellCount;
}

function getFenceMatch(line: string): { marker: string; length: number } | null {
	const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
	if (!match?.[1]) return null;
	const marker = match[1].charAt(0);
	if (!marker) return null;
	return {
		marker,
		length: match[1].length
	};
}

function findNextNonBlankLine(lines: string[], startIndex: number): number {
	for (let index = startIndex; index < lines.length; index += 1) {
		if (lines[index]?.trim()) return index;
	}
	return -1;
}

/**
 * LLMs commonly emit valid-looking GFM tables with blank lines between each row.
 * GFM requires the header, delimiter, and body rows to be contiguous, so collapse
 * only blank lines that sit inside a confirmed pipe-table block.
 */
export function normalizeMarkdownTables(text: string): string {
	const lines = splitMarkdownLines(text);
	const normalized: string[] = [];
	let fence: { marker: string; length: number } | null = null;

	for (let index = 0; index < lines.length; ) {
		const line = lines[index] ?? '';
		const fenceMatch = getFenceMatch(line);

		if (fence) {
			normalized.push(line);
			if (
				fenceMatch &&
				fenceMatch.marker === fence.marker &&
				fenceMatch.length >= fence.length
			) {
				fence = null;
			}
			index += 1;
			continue;
		}

		if (fenceMatch) {
			fence = fenceMatch;
			normalized.push(line);
			index += 1;
			continue;
		}

		if (!isPotentialTableRow(line)) {
			normalized.push(line);
			index += 1;
			continue;
		}

		const tableRows: string[] = [];
		let scanIndex = index;

		while (scanIndex < lines.length) {
			const candidate = lines[scanIndex] ?? '';

			if (isPotentialTableRow(candidate)) {
				tableRows.push(candidate);
				scanIndex += 1;
				continue;
			}

			if (!candidate.trim()) {
				const nextNonBlankIndex = findNextNonBlankLine(lines, scanIndex + 1);
				if (
					nextNonBlankIndex !== -1 &&
					isPotentialTableRow(lines[nextNonBlankIndex] ?? '')
				) {
					scanIndex += 1;
					continue;
				}
			}

			break;
		}

		if (isValidMarkdownTable(tableRows)) {
			normalized.push(...tableRows);
			index = scanIndex;
			continue;
		}

		normalized.push(line);
		index += 1;
	}

	return normalized.join('\n');
}

// INKPRINT Design System: Uses semantic color tokens for proper theming.
export function getProseClasses(
	size: 'sm' | 'base' | 'lg' = 'base',
	removeMaxWidth = true
): string {
	const sizeClass = size === 'base' ? 'prose' : `prose-${size}`;
	const maxWidth = removeMaxWidth ? 'max-w-none' : '';

	return `${sizeClass} dark:prose-invert ${maxWidth}
		prose-headings:text-foreground prose-headings:font-semibold
		prose-h1:text-lg prose-h1:font-bold prose-h1:mb-3 prose-h1:mt-4
		prose-h2:text-base prose-h2:font-bold prose-h2:mb-2 prose-h2:mt-3
		prose-h3:text-sm prose-h3:font-bold prose-h3:mb-2 prose-h3:mt-3
		prose-h4:text-sm prose-h4:font-semibold prose-h4:mb-1.5 prose-h4:mt-2
		prose-h5:text-xs prose-h5:font-semibold prose-h5:mb-1 prose-h5:mt-2 prose-h5:uppercase prose-h5:tracking-wide
		prose-h6:text-xs prose-h6:font-medium prose-h6:mb-1 prose-h6:mt-2 prose-h6:text-muted-foreground
		prose-p:text-foreground prose-p:leading-relaxed
		prose-li:text-foreground
		prose-strong:text-foreground prose-strong:font-semibold
		prose-a:text-accent prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-accent/80
		prose-blockquote:text-muted-foreground prose-blockquote:border-l-accent prose-blockquote:not-italic
		prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none
		prose-pre:bg-muted prose-pre:text-foreground prose-pre:overflow-x-auto
		prose-table:overflow-x-auto prose-table:block
		prose-hr:border-border`.trim();
}

/**
 * Strip markdown formatting and return plain text.
 */
export function stripMarkdown(text: string | null | undefined): string {
	if (!text || typeof text !== 'string') return '';

	try {
		return text
			.replace(/\*\*(.*?)\*\*/g, '$1')
			.replace(/\*(.*?)\*/g, '$1')
			.replace(/`(.*?)`/g, '$1')
			.replace(/#+\s/g, '')
			.replace(/>\s/g, '')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
			.trim();
	} catch (error) {
		console.error('Error stripping markdown:', error);
		return text;
	}
}

/**
 * Get a preview of markdown content.
 */
export function getMarkdownPreview(
	text: string | null | undefined,
	maxLength: number = 150
): string {
	if (!text) return '';

	const stripped = stripMarkdown(text);
	if (stripped.length <= maxLength) return stripped;

	return stripped.substring(0, maxLength).trim() + '...';
}

/**
 * Check if text contains markdown formatting.
 */
export function hasMarkdownFormatting(text: string | null | undefined): boolean {
	if (!text || typeof text !== 'string') return false;

	const markdownPatterns = [
		/\*\*.*?\*\*/,
		/\*.*?\*/,
		/`.*?`/,
		/^\s{0,3}#{1,6}\s+\S/m,
		/^\s{0,3}>+\s/m,
		/^\s{0,3}(```|~~~)/m,
		/^\s{0,3}[-*_]{3,}\s*$/m,
		/\[.*?\]\(.*?\)/,
		/!\[.*?\]\(.*?\)/,
		/^\s*[-*+]\s/m,
		/^\s*\d+\.\s/m,
		/^\s*[-*+]\s+\[[ xX]\]\s/m
	];

	if (markdownPatterns.some((pattern) => pattern.test(text))) return true;

	const normalized = normalizeMarkdownTables(text);
	const lines = splitMarkdownLines(normalized);
	return lines.some(
		(line, index) => isPotentialTableRow(line) && isTableDelimiterRow(lines[index + 1] ?? '')
	);
}
