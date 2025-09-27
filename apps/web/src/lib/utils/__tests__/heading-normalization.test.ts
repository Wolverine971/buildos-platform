// src/lib/utils/__tests__/heading-normalization.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeMarkdownHeadings } from '../markdown-nesting';

describe('Heading Normalization for LLM Responses', () => {
	it('should normalize headings starting at ### to start at ##', () => {
		const inflatedContent = `### Project Overview
This is a project about building something cool.

#### Key Features
- Feature 1
- Feature 2

##### Implementation Details
Some details here

#### Timeline
Q1 2025`;

		const expected = `## Project Overview
This is a project about building something cool.

### Key Features
- Feature 1
- Feature 2

#### Implementation Details
Some details here

### Timeline
Q1 2025`;

		const result = normalizeMarkdownHeadings(inflatedContent, 2);
		expect(result).toBe(expected);
	});

	it('should normalize deeply nested headings starting at #### to start at ##', () => {
		const deeplyNestedContent = `#### Current Status
Project is in progress

##### Tasks Completed
- Task 1
- Task 2

###### Sub-tasks
Details about sub-tasks

##### Next Steps
Planning phase`;

		const expected = `## Current Status
Project is in progress

### Tasks Completed
- Task 1
- Task 2

#### Sub-tasks
Details about sub-tasks

### Next Steps
Planning phase`;

		const result = normalizeMarkdownHeadings(deeplyNestedContent, 2);
		expect(result).toBe(expected);
	});

	it('should handle mixed content with text before headings', () => {
		const mixedContent = `Some initial text without heading

### Section One
Content for section one

#### Subsection 1.1
Details here

### Section Two
More content

##### Deep Subsection
Very nested content`;

		const expected = `Some initial text without heading

## Section One
Content for section one

### Subsection 1.1
Details here

## Section Two
More content

#### Deep Subsection
Very nested content`;

		const result = normalizeMarkdownHeadings(mixedContent, 2);
		expect(result).toBe(expected);
	});

	it('should not change content that already starts at the target level', () => {
		const properContent = `## Project Overview
This is properly formatted.

### Features
- Feature 1

#### Details
More details`;

		const result = normalizeMarkdownHeadings(properContent, 2);
		expect(result).toBe(properContent);
	});

	it('should handle content with no headings', () => {
		const noHeadings = `This is just regular text.
No headings here.
Just paragraphs.`;

		const result = normalizeMarkdownHeadings(noHeadings, 2);
		expect(result).toBe(noHeadings);
	});

	it('should handle empty content', () => {
		const result = normalizeMarkdownHeadings('', 2);
		expect(result).toBe('');
	});

	it('should handle null/undefined gracefully', () => {
		// @ts-expect-error - testing null input
		const result1 = normalizeMarkdownHeadings(null, 2);
		expect(result1).toBe('');

		// @ts-expect-error - testing undefined input
		const result2 = normalizeMarkdownHeadings(undefined, 2);
		expect(result2).toBe('');
	});
});
