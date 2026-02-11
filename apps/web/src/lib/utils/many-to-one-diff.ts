// apps/web/src/lib/utils/many-to-one-diff.ts

export interface ManyToOneItem {
	id: string;
	label?: string;
	data: any;
}

export interface FieldComparison {
	field: string;
	label: string;
	leftValues: Array<{
		itemId: string;
		itemLabel: string;
		value: any;
		displayValue: string;
		isDifferent: boolean;
	}>;
	rightValue: {
		value: any;
		displayValue: string;
	};
	hasAnyDifferences: boolean;
}

export interface ManyToOneComparison {
	leftItems: ManyToOneItem[];
	rightItem: ManyToOneItem;
	fieldComparisons: FieldComparison[];
	hasAnyDifferences: boolean;
}

// Field configuration for different data types
export interface FieldConfig {
	label: string;
	priority?: number;
	formatter?: (value: any) => string;
}

// Helper function to format values for display
function formatValue(value: any, formatter?: (value: any) => string): string {
	if (formatter) {
		return formatter(value);
	}

	if (value === null || value === undefined) {
		return '';
	}

	if (Array.isArray(value)) {
		return value.join(', ');
	}

	if (typeof value === 'boolean') {
		return value ? 'Yes' : 'No';
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return String(value);
}

// Helper function to check if two values are different
function areValuesDifferent(value1: any, value2: any): boolean {
	// Handle null/undefined cases
	if ((value1 === null || value1 === undefined) && (value2 === null || value2 === undefined)) {
		return false;
	}
	if (value1 === null || value1 === undefined || value2 === null || value2 === undefined) {
		return true;
	}

	// Handle arrays
	if (Array.isArray(value1) && Array.isArray(value2)) {
		if (value1.length !== value2.length) return true;
		return value1.some((item, index) => areValuesDifferent(item, value2[index]));
	}

	// Handle objects
	if (typeof value1 === 'object' && typeof value2 === 'object') {
		return JSON.stringify(value1) !== JSON.stringify(value2);
	}

	// Handle primitives
	return value1 !== value2;
}

// Main function to create many-to-one comparison
export function createManyToOneComparison(
	leftItems: ManyToOneItem[],
	rightItem: ManyToOneItem,
	fieldConfigs: Record<string, FieldConfig>
): ManyToOneComparison {
	const fieldComparisons: FieldComparison[] = [];
	let hasAnyDifferences = false;

	// Get all unique fields from field configs
	const fields = Object.keys(fieldConfigs);

	for (const field of fields) {
		const config = fieldConfigs[field];
		const rightValue = rightItem.data[field];
		const rightDisplayValue = formatValue(rightValue, config?.formatter);

		const leftValues = leftItems.map((leftItem) => {
			const leftValue = leftItem.data[field];
			const leftDisplayValue = formatValue(leftValue, config?.formatter);
			const isDifferent = areValuesDifferent(leftValue, rightValue);

			return {
				itemId: leftItem.id,
				itemLabel: leftItem.label || leftItem.id,
				value: leftValue,
				displayValue: leftDisplayValue,
				isDifferent
			};
		});

		const hasFieldDifferences = leftValues.some((lv) => lv.isDifferent);

		if (hasFieldDifferences) {
			hasAnyDifferences = true;
		}

		fieldComparisons.push({
			field,
			label: config?.label ?? field,
			leftValues,
			rightValue: {
				value: rightValue,
				displayValue: rightDisplayValue
			},
			hasAnyDifferences: hasFieldDifferences
		});
	}

	// Sort by priority
	fieldComparisons.sort((a, b) => {
		const aPriority = fieldConfigs[a.field]?.priority ?? 999;
		const bPriority = fieldConfigs[b.field]?.priority ?? 999;
		return aPriority - bPriority;
	});

	return {
		leftItems,
		rightItem,
		fieldComparisons,
		hasAnyDifferences
	};
}
