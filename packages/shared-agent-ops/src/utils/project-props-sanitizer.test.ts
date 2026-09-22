// packages/shared-agent-ops/src/utils/project-props-sanitizer.test.ts
import { describe, expect, it } from 'vitest';
import {
	sanitizeProjectPropsForClient,
	sanitizeProjectPropsPatchInput
} from './project-props-sanitizer';

describe('sanitizeProjectPropsPatchInput', () => {
	it('drops hidden preference keys', () => {
		expect(sanitizeProjectPropsPatchInput({ preferences: { a: 1 }, color: 'blue' })).toEqual({
			color: 'blue'
		});
	});

	it('rejects non-object payloads', () => {
		expect(sanitizeProjectPropsPatchInput(['color'])).toBeNull();
	});
});

describe('sanitizeProjectPropsForClient', () => {
	it('hides preferences and keeps other props', () => {
		expect(sanitizeProjectPropsForClient({ color: 'blue', preferences: { a: 1 } })).toEqual({
			color: 'blue'
		});
	});
});
