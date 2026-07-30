// packages/shared-agent-ops/src/utils/project-props-sanitizer.test.ts
import { describe, expect, it } from 'vitest';
import {
	sanitizeProjectPropsForClient,
	sanitizeProjectPropsPatchInput
} from './project-props-sanitizer';

describe('sanitizeProjectPropsPatchInput', () => {
	it('drops server-owned agent_workspace from patch payloads', () => {
		const result = sanitizeProjectPropsPatchInput({
			agent_workspace: { mode: 'living_reference', domain_profile: 'fiction_story' },
			color: 'blue'
		});

		expect(result).toEqual({ color: 'blue' });
	});

	it('still drops hidden preference keys', () => {
		expect(sanitizeProjectPropsPatchInput({ preferences: { a: 1 }, color: 'blue' })).toEqual({
			color: 'blue'
		});
	});
});

describe('sanitizeProjectPropsForClient', () => {
	it('keeps agent_workspace visible on reads for the agent runtime', () => {
		const props = {
			agent_workspace: { mode: 'living_reference' },
			preferences: { a: 1 }
		};

		expect(sanitizeProjectPropsForClient(props)).toEqual({
			agent_workspace: { mode: 'living_reference' }
		});
	});
});
