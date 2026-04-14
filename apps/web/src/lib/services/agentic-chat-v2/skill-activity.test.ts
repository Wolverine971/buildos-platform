// apps/web/src/lib/services/agentic-chat-v2/skill-activity.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { getLoadedSkillActivity, getRequestedSkillActivity } from './skill-activity';

function buildSkillLoadCall(skill: string): ChatToolCall {
	return {
		id: 'skill_load:1',
		type: 'function',
		function: {
			name: 'skill_load',
			arguments: JSON.stringify({ skill })
		}
	} as ChatToolCall;
}

describe('skill activity helpers', () => {
	it('detects requested skill_load calls using registered skill ids', () => {
		const event = getRequestedSkillActivity(buildSkillLoadCall('calendar_management'));
		expect(event).toEqual({
			type: 'skill_activity',
			action: 'requested',
			path: 'calendar_management',
			via: 'skill_load'
		});
	});

	it('ignores non-skill references', () => {
		expect(getRequestedSkillActivity(buildSkillLoadCall('onto.task.update'))).toBeNull();
	});

	it('detects loaded skill responses from skill_load results', () => {
		const result = {
			tool_call_id: 'skill_load:1',
			success: true,
			result: {
				type: 'skill',
				id: 'document_workspace',
				name: 'Document Workspace'
			}
		} as ChatToolResult;
		expect(getLoadedSkillActivity(buildSkillLoadCall('document_workspace'), result)).toEqual({
			type: 'skill_activity',
			action: 'loaded',
			path: 'document_workspace',
			via: 'skill_load'
		});
	});

	it('ignores non-skill results', () => {
		const result = {
			tool_call_id: 'skill_load:1',
			success: true,
			result: {
				type: 'directory',
				path: 'onto.document'
			}
		} as ChatToolResult;
		expect(getLoadedSkillActivity(buildSkillLoadCall('document_workspace'), result)).toBeNull();
	});
});
