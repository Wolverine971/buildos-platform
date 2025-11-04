// apps/web/src/lib/server/fsm/actions/__tests__/utils.test.ts
import { describe, expect, it } from 'vitest';
import {
	inferEntityKindFromType,
	mergeDeep,
	renderTemplate,
	stripHtml
} from '$lib/server/fsm/actions/utils';

describe('FSM action utils', () => {
	it('renders template tokens with flat context', () => {
		const result = renderTemplate('Hello {{user_name}}', { user_name: 'Ada' });
		expect(result).toBe('Hello Ada');
	});

	it('renders template tokens with dotted paths', () => {
		const result = renderTemplate('State: {{entity.state}}', {
			entity: { state: 'in_progress' }
		});
		expect(result).toBe('State: in_progress');
	});

	it('keeps unknown tokens untouched', () => {
		const template = 'Hello {{user_name}} from {{unknown}}';
		const result = renderTemplate(template, { user_name: 'Ada' });
		expect(result).toBe('Hello Ada from {{unknown}}');
	});

	it('merges deeply nested objects', () => {
		const base = {
			alpha: 1,
			nested: {
				foo: 'bar',
				list: [1, 2, 3]
			}
		};

		const override = {
			nested: {
				foo: 'updated',
				extra: true
			},
			beta: 2
		};

		const result = mergeDeep(base, override);

		expect(result).toEqual({
			alpha: 1,
			beta: 2,
			nested: {
				foo: 'updated',
				extra: true,
				list: [1, 2, 3]
			}
		});
	});

	it('infers entity kind from type key', () => {
		expect(inferEntityKindFromType('plan.general')).toBe('plan');
		expect(inferEntityKindFromType('task.research')).toBe('task');
		expect(inferEntityKindFromType('output.draft')).toBe('output');
		expect(inferEntityKindFromType('doc.brief')).toBe('document');
		expect(inferEntityKindFromType('project.mega')).toBe('project');
	});

	it('strips HTML tags while preserving text', () => {
		const result = stripHtml('<p>Hello <strong>World</strong></p>');
		expect(result).toBe('Hello World');
	});
});
