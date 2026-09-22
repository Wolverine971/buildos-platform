// packages/shared-agent-ops/src/utils/project-props-sanitizer.test.ts
import { describe, expect, it } from 'vitest';
import {
	demoteAgentWorkspaceForProjectType,
	isFictionProjectTypeKey,
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

describe('fiction project types and retype demotion', () => {
	it('treats the nonfiction book variant as non-fiction', () => {
		expect(isFictionProjectTypeKey('project.creative.novel')).toBe(true);
		expect(isFictionProjectTypeKey('project.creative.book')).toBe(true);
		expect(isFictionProjectTypeKey('project.creative.book.nonfiction')).toBe(false);
		expect(isFictionProjectTypeKey('project.business.launch')).toBe(false);
	});

	it('drops only the fiction profile, keeping living-reference mode', () => {
		expect(
			demoteAgentWorkspaceForProjectType(
				{
					facets: { scale: 'medium' },
					agent_workspace: {
						mode: 'living_reference',
						domain_profile: 'fiction_story',
						domain_affinity: 'writing.fiction'
					}
				},
				'project.creative.book.nonfiction'
			)
		).toEqual({ facets: { scale: 'medium' }, agent_workspace: { mode: 'living_reference' } });
	});

	it('never adds a profile and ignores fiction-to-fiction retypes', () => {
		expect(demoteAgentWorkspaceForProjectType({ a: 1 }, 'project.creative.novel')).toBeNull();
		expect(
			demoteAgentWorkspaceForProjectType(
				{ agent_workspace: { domain_profile: 'fiction_story' } },
				'project.creative.screenplay'
			)
		).toBeNull();
	});
});
