// apps/web/src/lib/utils/diff.ts
export interface DiffLine {
	type: 'added' | 'removed' | 'unchanged';
	content: string;
	lineNumber?: number;
}

export interface FieldDiff {
	field: string;
	label: string;
	oldValue: any;
	newValue: any;
	oldLines: DiffLine[];
	newLines: DiffLine[];
	hasChanges: boolean;
}

// Simple line-by-line diff algorithm
export function createLineDiff(
	oldText: string = '',
	newText: string = ''
): { oldLines: DiffLine[]; newLines: DiffLine[] } {
	const oldLines = oldText.split('\n');
	const newLines = newText.split('\n');

	const result = {
		oldLines: [] as DiffLine[],
		newLines: [] as DiffLine[]
	};

	// Simple algorithm: mark lines as removed if not in new, added if not in old
	const oldSet = new Set(oldLines);
	const newSet = new Set(newLines);

	// Process old lines
	oldLines.forEach((line, index) => {
		const type = newSet.has(line) ? 'unchanged' : 'removed';
		result.oldLines.push({
			type,
			content: line,
			lineNumber: index + 1
		});
	});

	// Process new lines
	newLines.forEach((line, index) => {
		const type = oldSet.has(line) ? 'unchanged' : 'added';
		result.newLines.push({
			type,
			content: line,
			lineNumber: index + 1
		});
	});

	return result;
}

// Create diff for a specific field
export function createFieldDiff(
	field: string,
	label: string,
	oldValue: any,
	newValue: any
): FieldDiff {
	// Handle different field types
	let oldText = '';
	let newText = '';

	if (Array.isArray(oldValue)) {
		oldText = oldValue.join(', ');
	} else {
		oldText = oldValue ? String(oldValue) : '';
	}

	if (Array.isArray(newValue)) {
		newText = newValue.join(', ');
	} else {
		newText = newValue ? String(newValue) : '';
	}

	const hasChanges = oldText !== newText;
	const lineDiff = hasChanges ? createLineDiff(oldText, newText) : { oldLines: [], newLines: [] };

	return {
		field,
		label,
		oldValue,
		newValue,
		oldLines: lineDiff.oldLines,
		newLines: lineDiff.newLines,
		hasChanges
	};
}
