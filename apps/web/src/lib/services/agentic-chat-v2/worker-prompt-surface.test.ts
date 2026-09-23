// apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts
//
// Admission landmine guard: worker-turn-preparation.server.ts refuses the
// ENTIRE turn with `capability_unavailable` when any mounted tool is not
// worker-executable. This replays the exact admission chain it runs
// (resolveFastChatTurnPreparation -> applyEmailSurfaceMount ->
// resolveWorkerPromptTools) for a project turn that carries an attached image,
// and proves the project image tools are mounted and admitted.
import { describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { applyEmailSurfaceMount } from './email-surface-mount.server';
import { appendAttachmentContextToMessage } from './attachments';
import { resolveFastChatTurnPreparation } from './turn-preparation';
import { resolveWorkerPromptTools } from './worker-prompt-surface';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const IMAGE_TOOLS = ['update_onto_asset', 'search_onto_assets', 'get_onto_asset'];

function names(tools: ChatToolDefinition[]): string[] {
	return tools.map((tool) => tool.function.name);
}

function admitProjectImageTurn(contextType: 'project' | 'ontology', emailConnected: boolean) {
	const latestUserMessage = appendAttachmentContextToMessage(
		'This is our company logo, please save it.',
		[
			{
				attachment_kind: 'onto_asset',
				media_type: 'image',
				asset_id: ASSET_ID,
				project_id: PROJECT_ID,
				file_name: 'IMG_2231.png',
				ocr_status: 'complete',
				extracted_text_preview: 'REDLINE'
			}
		],
		{ rawMediaPassedToModel: false }
	);
	const preparation = resolveFastChatTurnPreparation({
		contextType,
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		latestUserMessage,
		conversationSummary: null,
		agentMetadata: null,
		contextShiftHintTtlMs: 120_000
	});
	return {
		latestUserMessage,
		preparation,
		admitted: resolveWorkerPromptTools(
			applyEmailSurfaceMount(preparation.tools, emailConnected)
		)
	};
}

describe('worker admission of the project image tools', () => {
	it.each([
		['project', false],
		['project', true],
		['ontology', false]
	] as const)(
		'admits a %s turn with an attached image (email connected: %s) without refusing it',
		(contextType, emailConnected) => {
			const { admitted, latestUserMessage, preparation } = admitProjectImageTurn(
				contextType,
				emailConnected
			);

			expect(preparation.selectedSurfaceProfile).toBe('project');
			// The exact condition that makes admission throw capability_unavailable.
			expect(admitted.unavailableToolNames).toEqual([]);
			expect(names(admitted.tools)).toEqual(expect.arrayContaining(IMAGE_TOOLS));
			expect(latestUserMessage).toContain(`asset_id: ${ASSET_ID}`);
			expect(latestUserMessage).toContain('call update_onto_asset with that asset_id');
		}
	);

	it('would refuse a surface carrying a tool the worker cannot execute', () => {
		const { preparation } = admitProjectImageTurn('project', false);
		const withDelete: ChatToolDefinition[] = [
			...preparation.tools,
			{
				type: 'function',
				function: {
					name: 'delete_onto_task',
					description: 'Not worker-executable.',
					parameters: { type: 'object', properties: {} }
				}
			}
		];
		expect(resolveWorkerPromptTools(withDelete).unavailableToolNames).toEqual([
			'delete_onto_task'
		]);
	});
});
