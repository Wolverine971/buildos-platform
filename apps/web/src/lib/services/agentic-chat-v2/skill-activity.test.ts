// apps/web/src/lib/services/agentic-chat-v2/skill-activity.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { getLoadedSkillActivity, getRequestedSkillActivity } from './skill-activity';

function buildToolCall(path: string): ChatToolCall {
	return {
		id: 'tool_help:1',
		type: 'function',
		function: {
			name: 'tool_help',
			arguments: JSON.stringify({ path })
		}
	} as ChatToolCall;
}

describe('skill activity helpers', () => {
	it('detects requested skill tool_help calls using normalized aliases', () => {
		const event = getRequestedSkillActivity(buildToolCall('calendar.skill'));
		expect(event).toEqual({
			type: 'skill_activity',
			action: 'requested',
			path: 'cal.skill',
			via: 'tool_help'
		});
	});

	it('ignores non-skill tool_help paths', () => {
		expect(getRequestedSkillActivity(buildToolCall('onto.task.update'))).toBeNull();
	});

	it('detects loaded skill responses from tool_help results', () => {
		const result = {
			tool_call_id: 'tool_help:1',
			success: true,
			result: {
				type: 'skill',
				path: 'onto.document.skill',
				name: 'document'
			}
		} as ChatToolResult;
		expect(getLoadedSkillActivity(buildToolCall('onto.document.skill'), result)).toEqual({
			type: 'skill_activity',
			action: 'loaded',
			path: 'onto.document.skill',
			via: 'tool_help'
		});
	});

	it('ignores non-skill tool_help results', () => {
		const result = {
			tool_call_id: 'tool_help:1',
			success: true,
			result: {
				type: 'directory',
				path: 'onto.document'
			}
		} as ChatToolResult;
		expect(getLoadedSkillActivity(buildToolCall('onto.document'), result)).toBeNull();
	});
});
