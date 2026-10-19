// apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts
//
// Admission landmine guard: worker-turn-preparation.server.ts refuses the
// ENTIRE turn with `capability_unavailable` when any mounted tool is not
// worker-executable. This replays the exact admission chain it runs
// (resolveFastChatTurnPreparation -> applyEmailSurfaceMount ->
// resolveWorkerPromptTools) for a project turn that carries an attached image,
// and proves the project image tools are mounted and admitted.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { getGatewaySurfaceForContextType } from '@buildos/agentic-chat-runtime/catalog';
import {
	buildGlobalTestEnvelope,
	buildProjectCreateTestEnvelope,
	runLiteTurn
} from '$lib/tests/llm/helpers/lite-turn-runner';
import { applyEmailSurfaceMount } from './email-surface-mount.server';
import { appendAttachmentContextToMessage } from './attachments';
import { resolveFastChatTurnPreparation } from './turn-preparation';
import { resolveWorkerPromptTools } from './worker-prompt-surface';

const { streamText } = vi.hoisted(() => ({ streamText: vi.fn() }));
// The runner normally makes a paid call. This parity suite cannot construct a
// real client: every request stops at this fully mocked streaming boundary.
vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		streamText = streamText;
	}
}));

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

function productionFixtureTools(contextType: 'global' | 'project_create') {
	const preparation = resolveFastChatTurnPreparation({
		contextType,
		entityId: null,
		projectId: null,
		latestUserMessage: 'Fixture.',
		conversationSummary: null,
		agentMetadata: null,
		contextShiftHintTtlMs: 120_000
	});
	// The same preparation → email mount → worker admission path used in production.
	// These evaluation fixtures have no connected email account.
	const admitted = resolveWorkerPromptTools(applyEmailSurfaceMount(preparation.tools, false));
	expect(admitted.unavailableToolNames).toEqual([]);
	return admitted.tools;
}

describe('live evaluation worker prompt parity (offline)', () => {
	beforeEach(() => {
		streamText.mockReset();
		streamText.mockImplementation(async function* () {
			yield { type: 'text', content: 'Fixture answer.' };
			yield { type: 'done', finished_reason: 'stop', model: 'fixture-model' };
		});
	});

	it('builds the global fixture with worker instructions and the admitted tool summary', () => {
		const envelope = buildGlobalTestEnvelope();
		expect(envelope.sections.map((section) => section.id)).not.toContain(
			'capabilities_skills_tools'
		);
		expect(envelope.systemPrompt).not.toContain('skill_search');
		expect(envelope.toolsSummary.totalTools).toBe(productionFixtureTools('global').length);
	});

	it('builds the project-create fixture with the worker shell creation contract', () => {
		const envelope = buildProjectCreateTestEnvelope();
		expect(envelope.systemPrompt).toContain('entities: [] and relationships: []');
		expect(envelope.systemPrompt).toContain(
			'After create_onto_project succeeds, use its project_id'
		);
		expect(envelope.toolsSummary.totalTools).toBe(
			productionFixtureTools('project_create').length
		);
	});

	it.each(['global', 'project_create'] as const)(
		'sends the worker %s tool surface to the model',
		async (contextType) => {
			const envelope =
				contextType === 'global'
					? buildGlobalTestEnvelope()
					: buildProjectCreateTestEnvelope();
			const result = await runLiteTurn({
				systemPrompt: envelope.systemPrompt,
				userMessage: 'Fixture.',
				contextType
			});
			expect(result.assistantText).toBe('Fixture answer.');
			expect(streamText).toHaveBeenCalledWith(
				expect.objectContaining({
					tools: productionFixtureTools(contextType),
					messages: [
						{ role: 'system', content: envelope.systemPrompt },
						{ role: 'user', content: 'Fixture.' }
					]
				})
			);
		}
	);

	it('filters retired tools even when an evaluation supplies its own tool list', async () => {
		const tools = getGatewaySurfaceForContextType('global');
		await runLiteTurn({
			systemPrompt: 'Fixture.',
			userMessage: 'Fixture.',
			contextType: 'global',
			tools
		});
		expect(streamText).toHaveBeenCalledWith(
			expect.objectContaining({ tools: resolveWorkerPromptTools(tools).tools })
		);
	});

	it('rejects a custom tool the worker cannot execute before calling the model', async () => {
		await expect(
			runLiteTurn({
				systemPrompt: 'Fixture.',
				userMessage: 'Fixture.',
				contextType: 'global',
				tools: [
					{
						type: 'function',
						function: {
							name: 'delete_onto_task',
							description: 'Unavailable.',
							parameters: { type: 'object', properties: {} }
						}
					}
				]
			})
		).rejects.toThrow('delete_onto_task');
		expect(streamText).not.toHaveBeenCalled();
	});

	it('preserves an explicitly empty tool surface for text-only fixtures', async () => {
		await runLiteTurn({
			systemPrompt: 'Fixture.',
			userMessage: 'Fixture.',
			contextType: 'global',
			tools: []
		});
		expect(streamText).toHaveBeenCalledWith(
			expect.objectContaining({ tools: undefined, tool_choice: undefined })
		);
	});
});
