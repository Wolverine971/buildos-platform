// apps/web/src/lib/utils/project-props-sanitizer.test.ts
import { describe, expect, it } from 'vitest';
import {
	sanitizeProjectForClient,
	sanitizeProjectPropsForClient,
	sanitizeProjectPropsPatchInput
} from './project-props-sanitizer';

describe('project-props-sanitizer', () => {
	it('removes system-managed preferences from project props', () => {
		const input = {
			facets: { context: 'startup' },
			preferences: { planning_depth: 'rigorous' },
			tags: ['alpha']
		};

		const result = sanitizeProjectPropsForClient(input) as Record<string, unknown>;

		expect(result).toEqual({
			facets: { context: 'startup' },
			tags: ['alpha']
		});
		expect('preferences' in result).toBe(false);
	});

	it('leaves props unchanged when there are no hidden keys', () => {
		const input = { facets: { stage: 'planning' } };
		const result = sanitizeProjectPropsForClient(input);
		expect(result).toBe(input);
	});

	it('sanitizes project payloads returned to clients', () => {
		const project = {
			id: 'proj-1',
			name: 'Test',
			props: {
				preferences: { risk_tolerance: 'balanced' },
				facets: { scale: 'small' }
			}
		};

		const sanitized = sanitizeProjectForClient(project);

		expect(sanitized).toEqual({
			id: 'proj-1',
			name: 'Test',
			props: { facets: { scale: 'small' } }
		});
	});

	it('sanitizes patch input and rejects non-object values', () => {
		expect(sanitizeProjectPropsPatchInput(null)).toBeNull();
		expect(sanitizeProjectPropsPatchInput('not-an-object')).toBeNull();

		const sanitized = sanitizeProjectPropsPatchInput({
			preferences: { update_frequency: 'daily' },
			facets: { stage: 'execution' }
		});

		expect(sanitized).toEqual({
			facets: { stage: 'execution' }
		});
	});
});
