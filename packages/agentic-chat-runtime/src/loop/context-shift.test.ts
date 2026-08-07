// packages/agentic-chat-runtime/src/loop/context-shift.test.ts
import type { ChatToolResult } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import { extractContextShiftPayload } from './context-shift';

describe('extractContextShiftPayload', () => {
	it('extracts a nested context shift', () => {
		const result = {
			success: true,
			result: {
				payload: {
					context_shift: {
						new_context: 'project',
						entity_id: 'project-1',
						entity_name: 'Launch Plan',
						entity_type: 'project',
						message: 'Context updated.'
					}
				}
			}
		} as ChatToolResult;

		expect(extractContextShiftPayload(result)).toEqual({
			new_context: 'project',
			entity_id: 'project-1',
			entity_name: 'Launch Plan',
			entity_type: 'project',
			message: 'Context updated.'
		});
	});

	it('defaults a global shift and rejects a project shift without identity', () => {
		expect(
			extractContextShiftPayload({
				success: true,
				result: { context_shift: { new_context: 'global' } }
			} as ChatToolResult)
		).toEqual({
			new_context: 'global',
			entity_id: null,
			entity_name: 'Workspace',
			entity_type: 'workspace',
			message: 'Zoomed out to workspace context.'
		});

		expect(
			extractContextShiftPayload({
				success: true,
				result: { context_shift: { new_context: 'project' } }
			} as ChatToolResult)
		).toBeNull();
	});

	it('bounds traversal depth and ignores malformed envelopes', () => {
		expect(
			extractContextShiftPayload({
				success: true,
				result: {
					payload: { data: { result: { payload: { data: { context_shift: {} } } } } }
				}
			} as ChatToolResult)
		).toBeNull();
		expect(
			extractContextShiftPayload({ success: true, result: null } as ChatToolResult)
		).toBeNull();
	});
});
