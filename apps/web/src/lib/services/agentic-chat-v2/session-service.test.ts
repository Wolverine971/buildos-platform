// apps/web/src/lib/services/agentic-chat-v2/session-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildInterruptedToolHistorySummary,
	buildLoadedSkillHistorySummary,
	buildPendingClarificationHistorySummary,
	createFastChatSessionService,
	extractLoadedSkillIdsFromHistory,
	historyIncludesLoadedSkillsLedger,
	PENDING_CLARIFICATION_LEDGER_PREFIX,
	projectLegacyFallbackHistorySnapshot
} from './session-service';

type TestRow = Record<string, any>;

function createHistorySupabase(tableRows: Record<string, TestRow[]>) {
	class QueryBuilder {
		private filters: Array<(row: TestRow) => boolean> = [];
		private orderSpec: { column: string; ascending: boolean } | null = null;
		private rowLimit: number | null = null;

		constructor(private readonly table: string) {}

		select() {
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push((row) => row[column] === value);
			return this;
		}

		in(column: string, values: unknown[]) {
			this.filters.push((row) => values.includes(row[column]));
			return this;
		}

		order(column: string, options?: { ascending?: boolean }) {
			this.orderSpec = { column, ascending: options?.ascending !== false };
			return this;
		}

		limit(count: number) {
			this.rowLimit = count;
			return this;
		}

		then<TResult1 = { data: TestRow[]; error: null }, TResult2 = never>(
			onfulfilled?:
				| ((value: { data: TestRow[]; error: null }) => TResult1 | PromiseLike<TResult1>)
				| null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			let data = (tableRows[this.table] ?? []).filter((row) =>
				this.filters.every((filter) => filter(row))
			);
			if (this.orderSpec) {
				const { column, ascending } = this.orderSpec;
				data = data.slice().sort((left, right) => {
					const comparison = String(left[column] ?? '').localeCompare(
						String(right[column] ?? '')
					);
					return ascending ? comparison : -comparison;
				});
			}
			if (this.rowLimit !== null) data = data.slice(0, this.rowLimit);
			return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
		}
	}

	return {
		from: (table: string) => new QueryBuilder(table)
	};
}

describe('fast chat session service helpers', () => {
	it('reports the canonical lookup error after a 23505 winner cannot be resolved', async () => {
		const insertError = { code: '23505', message: 'duplicate idempotency key' };
		const winnerError = { code: '57014', message: 'canonical lookup timed out' };
		const logError = vi.fn(async () => undefined);
		let queryNumber = 0;

		class MessageQuery {
			private readonly number = ++queryNumber;

			select() {
				return this;
			}
			eq() {
				return this;
			}
			contains() {
				return this;
			}
			order() {
				return this;
			}
			limit() {
				return this;
			}
			insert() {
				return this;
			}
			async maybeSingle() {
				return this.number === 1
					? { data: null, error: null }
					: { data: null, error: winnerError };
			}
			async single() {
				return { data: null, error: insertError };
			}
		}

		const service = createFastChatSessionService({ from: () => new MessageQuery() } as any, {
			errorLogger: { logError } as any
		});
		const result = await service.persistMessage({
			sessionId: 'session-1',
			userId: 'user-1',
			role: 'assistant',
			content: 'response',
			idempotencyKey: 'turn:client-1:assistant'
		});

		expect(result).toBeNull();
		expect(logError).toHaveBeenLastCalledWith(
			winnerError,
			expect.objectContaining({
				operationType: 'fastchat_message_persist',
				metadata: expect.objectContaining({ insertErrorCode: '23505' })
			})
		);
	});

	it('adopts the canonical daily-brief session after a concurrent unique-key winner', async () => {
		const canonicalSession = {
			id: 'brief-session-winner',
			user_id: 'user-1',
			context_type: 'daily_brief',
			entity_id: 'brief-1',
			status: 'active',
			updated_at: '2026-08-02T12:00:00.000Z'
		};
		let lookupCount = 0;

		class SessionQuery {
			private inserting = false;

			select() {
				return this;
			}
			eq() {
				return this;
			}
			order() {
				return this;
			}
			limit() {
				return this;
			}
			insert() {
				this.inserting = true;
				return this;
			}
			async maybeSingle() {
				lookupCount += 1;
				return lookupCount === 1
					? { data: null, error: null }
					: { data: canonicalSession, error: null };
			}
			async single() {
				if (!this.inserting) throw new Error('Expected insert before single');
				return {
					data: null,
					error: { code: '23505', message: 'duplicate canonical daily brief session' }
				};
			}
		}

		const service = createFastChatSessionService({ from: () => new SessionQuery() } as any, {
			errorLogger: { logError: async () => undefined } as any
		});
		const result = await service.resolveSession({
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-1'
		});

		expect(result).toEqual({ session: canonicalSession, created: false });
		expect(lookupCount).toBe(2);
	});

	it('reports the canonical daily-brief lookup failure after a 23505 race', async () => {
		const insertError = { code: '23505', message: 'duplicate canonical daily brief session' };
		const canonicalError = { code: '57014', message: 'canonical daily brief lookup timed out' };
		const logError = vi.fn(async () => undefined);
		let lookupCount = 0;

		class SessionQuery {
			private inserting = false;

			select() {
				return this;
			}
			eq() {
				return this;
			}
			order() {
				return this;
			}
			limit() {
				return this;
			}
			insert() {
				this.inserting = true;
				return this;
			}
			async maybeSingle() {
				lookupCount += 1;
				return lookupCount === 1
					? { data: null, error: null }
					: { data: null, error: canonicalError };
			}
			async single() {
				if (!this.inserting) throw new Error('Expected insert before single');
				return { data: null, error: insertError };
			}
		}

		const service = createFastChatSessionService({ from: () => new SessionQuery() } as any, {
			errorLogger: { logError } as any
		});

		await expect(
			service.resolveSession({
				userId: 'user-1',
				contextType: 'daily_brief',
				entityId: 'brief-1'
			})
		).rejects.toThrow('canonical daily brief lookup timed out');
		expect(logError).toHaveBeenLastCalledWith(
			canonicalError,
			expect.objectContaining({
				operationType: 'fastchat_session_create',
				metadata: expect.objectContaining({ insertErrorCode: '23505' })
			})
		);
	});

	it('keeps the legacy query path identical to the atomic snapshot projector', async () => {
		const messages = [
			{
				id: 'message-user',
				session_id: 'session-1',
				role: 'user',
				content: 'Review the diagram.',
				metadata: null,
				created_at: '2026-07-31T10:00:00.000Z'
			},
			{
				id: 'message-assistant',
				session_id: 'session-1',
				role: 'assistant',
				content: 'I started the review.',
				metadata: { interrupted: true },
				created_at: '2026-07-31T10:01:00.000Z'
			}
		];
		const attachments = [
			{
				id: 'attachment-1',
				message_id: 'message-user',
				session_id: 'session-1',
				asset_id: null,
				project_id: null,
				attachment_kind: 'temporary_file',
				media_type: 'image',
				role: 'attachment',
				display_order: 0,
				metadata: {
					temporary_attachment_id: 'temporary-image-1',
					file_name: 'diagram.png',
					content_type: 'image/png'
				},
				asset: null
			}
		];
		const executions = [
			{
				id: 'execution-1',
				message_id: 'message-assistant',
				tool_name: 'web_search',
				gateway_op: 'util.web.search',
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: { query: 'launch diagram' },
				result: { query: 'launch diagram', results: [{ title: 'Diagram review' }] }
			},
			{
				id: 'execution-2',
				message_id: 'message-assistant',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 2,
				success: true,
				error_message: null,
				arguments: { skill: 'launch_planning', format: 'short' },
				result: {
					type: 'skill',
					id: 'launch_planning',
					name: 'Launch Planning',
					format: 'short',
					summary: 'Plan a reliable product launch.'
				}
			}
		];
		const service = createFastChatSessionService(
			createHistorySupabase({
				chat_messages: messages,
				chat_message_attachments: attachments,
				chat_tool_executions: executions
			}) as any,
			{ errorLogger: { logError: async () => undefined } as any }
		);

		const fromLegacyQuery = await service.loadRecentMessages('session-1', 10);
		const fromAtomicSnapshot = projectLegacyFallbackHistorySnapshot({
			messages: messages.map(({ session_id: _sessionId, ...message }) => message),
			attachments,
			interrupted_tool_executions: executions,
			loaded_skill_executions: [executions[1]]
		} as any);

		expect(fromLegacyQuery).toEqual(fromAtomicSnapshot);
	});

	it('projects an empty fallback snapshot as empty history', () => {
		expect(
			projectLegacyFallbackHistorySnapshot({
				messages: [],
				attachments: [],
				interrupted_tool_executions: [],
				loaded_skill_executions: []
			})
		).toEqual([]);
	});

	it('rehydrates only the still-pending durable clarification candidate set', () => {
		const execution = {
			message_id: 'message-assistant',
			tool_name: 'request_turn_clarification',
			gateway_op: null,
			sequence_index: 3,
			success: true,
			error_message: null,
			arguments: {},
			result: {
				status: 'clarification_required',
				reason: 'Two email tasks match.',
				question: 'Did you mean Beta list email or Renewal email?',
				candidates: [
					{ id: 'task-beta-list', label: 'Beta list email', kind: 'task' },
					{ id: 'task-renewal', label: 'Renewal email', kind: 'task' }
				]
			}
		};

		const summary = buildPendingClarificationHistorySummary({
			executions: [execution],
			pendingAssistantMessageId: 'message-assistant'
		});
		expect(summary).toContain(PENDING_CLARIFICATION_LEDGER_PREFIX);
		expect(summary).toContain('task-beta-list');
		expect(summary).toContain('Beta list email');
		expect(summary).toContain('task-renewal');
		expect(summary).toContain('without searching solely to rediscover');
		expect(
			buildPendingClarificationHistorySummary({
				executions: [execution],
				pendingAssistantMessageId: null
			})
		).toBeNull();
	});

	it('does not replay a clarification after a later user message has answered it', () => {
		const projected = projectLegacyFallbackHistorySnapshot({
			messages: [
				{
					id: 'message-assistant',
					role: 'assistant',
					content: 'Did you mean Beta list email or Renewal email?',
					metadata: null,
					created_at: '2026-08-28T10:00:00.000Z'
				},
				{
					id: 'message-user',
					role: 'user',
					content: 'Beta list email.',
					metadata: null,
					created_at: '2026-08-28T10:01:00.000Z'
				}
			],
			attachments: [],
			interrupted_tool_executions: [],
			loaded_skill_executions: [
				{
					message_id: 'message-assistant',
					tool_name: 'request_turn_clarification',
					gateway_op: null,
					sequence_index: 1,
					success: true,
					error_message: null,
					arguments: {},
					result: {
						status: 'clarification_required',
						question: 'Did you mean Beta list email or Renewal email?',
						candidates: [
							{ id: 'task-beta-list', label: 'Beta list email', kind: 'task' },
							{ id: 'task-renewal', label: 'Renewal email', kind: 'task' }
						]
					}
				}
			]
		});

		expect(projected).toHaveLength(2);
		expect(projected.some((message) => message.content.includes('durable control state'))).toBe(
			false
		);
	});

	it('projects an admission snapshot with attachments, interrupted tools, and loaded skills', () => {
		const projected = projectLegacyFallbackHistorySnapshot({
			messages: [
				{
					id: 'message-user',
					role: 'user',
					content: 'Review this launch diagram.',
					metadata: null,
					created_at: '2026-07-31T10:00:00.000Z'
				},
				{
					id: 'message-assistant',
					role: 'assistant',
					content: 'I started the review.',
					metadata: { interrupted: true },
					created_at: '2026-07-31T10:01:00.000Z'
				}
			],
			attachments: [
				{
					message_id: 'message-user',
					asset_id: 'asset-1',
					project_id: 'project-1',
					attachment_kind: 'onto_asset',
					media_type: 'image',
					role: 'analysis_target',
					display_order: 0,
					metadata: {},
					asset: {
						id: 'asset-1',
						project_id: 'project-1',
						original_filename: 'launch.png',
						content_type: 'image/png',
						file_size_bytes: 2048,
						width: 1200,
						height: 800,
						checksum_sha256: 'a'.repeat(64),
						ocr_status: 'completed',
						extraction_summary: 'A launch timeline and risk matrix.',
						extracted_text: 'Launch timeline'
					}
				}
			],
			interrupted_tool_executions: [
				{
					message_id: 'message-assistant',
					tool_name: 'web_search',
					gateway_op: 'util.web.search',
					sequence_index: 1,
					success: true,
					error_message: null,
					arguments: { query: 'launch risk matrix' },
					result: { query: 'launch risk matrix', results: [{ title: 'Launch risks' }] }
				}
			],
			loaded_skill_executions: [
				{
					message_id: 'message-assistant',
					tool_name: 'skill_load',
					gateway_op: null,
					sequence_index: 2,
					success: true,
					error_message: null,
					arguments: { skill: 'launch_planning', format: 'short' },
					result: {
						type: 'skill',
						id: 'launch_planning',
						name: 'Launch Planning',
						format: 'short',
						summary: 'Plan a reliable product launch.'
					}
				}
			]
		});

		expect(projected.map((message) => message.role)).toEqual([
			'user',
			'assistant',
			'system',
			'system'
		]);
		expect(projected[0]?.content).toContain('Review this launch diagram.');
		expect(projected[0]?.content).toContain('launch.png');
		expect(projected[0]?.attachments).toHaveLength(1);
		expect(projected[2]?.content).toContain('Previous interrupted assistant turn tool results');
		expect(projected[2]?.content).toContain('Launch risks');
		expect(projected[3]?.content).toContain('Previously loaded skills in this session');
		expect(projected[3]?.content).toContain('launch_planning');
	});

	it('summarizes completed web visit results from interrupted turns', () => {
		const summary = buildInterruptedToolHistorySummary([
			{
				message_id: 'assistant-message-1',
				tool_name: 'web_visit',
				gateway_op: 'util.web.visit',
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: { url: 'https://thecadretraining.com/classes' },
				result: {
					url: 'https://thecadretraining.com/classes',
					final_url: 'https://thecadretraining.com/classes',
					status_code: 200,
					title: 'Classes - The Cadre Training',
					content:
						'Foundation Precision | Cody, WY May 11 Advanced Precision | Cody, WY May 13',
					structured_data: [
						{
							type: 'Event',
							name: 'Foundation Precision | Cody, WY',
							startDate: '2026-05-11T15:00:00+00:00'
						}
					]
				}
			},
			{
				message_id: 'assistant-message-1',
				tool_name: 'web_visit',
				gateway_op: 'util.web.visit',
				sequence_index: 2,
				success: false,
				error_message: 'Operation cancelled',
				arguments: { url: 'https://thecadretraining.com/classes' },
				result: null
			}
		]);

		expect(summary).toContain('Previous interrupted assistant turn tool results');
		expect(summary).toContain('Foundation Precision | Cody, WY');
		expect(summary).toContain('Operation cancelled');
	});

	it('summarizes loaded skills as a cross-turn continuity ledger', () => {
		const summary = buildLoadedSkillHistorySummary([
			{
				message_id: 'assistant-message-1',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_engagement_first_outreach',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_engagement_first_outreach',
					name: 'Cold Email Engagement-First Outreach',
					format: 'short',
					summary:
						'Compose cold outreach that earns a reply by leading with relevance and a low-friction ask.',
					child_skills: [
						{
							id: 'cold_email_research_anchors',
							summary: 'Find precise relevance anchors.',
							when_to_load: []
						}
					],
					markdown: '# Full playbook should not be carried forward'
				}
			},
			{
				message_id: 'assistant-message-2',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_research_anchors',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_research_anchors',
					name: 'Cold Email Research Anchors',
					parent_id: 'cold_email_engagement_first_outreach',
					depth: 1,
					format: 'short',
					summary: 'Find specific prospect signals before drafting.',
					materialized_tools: ['web_search', 'web_visit']
				}
			},
			{
				message_id: 'assistant-message-3',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_engagement_first_outreach',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_engagement_first_outreach',
					name: 'Cold Email Engagement-First Outreach',
					format: 'short',
					summary: 'Latest short summary wins when a skill was loaded twice.'
				}
			}
		]);

		expect(summary).toContain('Previously loaded skills in this session');
		expect(summary).toContain('Latest short summary wins');
		expect(summary).toContain('child of `cold_email_engagement_first_outreach`');
		expect(summary).toContain('Tools exposed: `web_search`, `web_visit`');
		expect(summary).toContain('Do not call skill_load again just to rediscover');
		expect(summary).not.toContain('# Full playbook should not be carried forward');
		expect(summary?.match(/`cold_email_engagement_first_outreach`/g)).toHaveLength(2);
	});

	it('extracts only loaded skill ids from the cross-turn ledger', () => {
		const summary = buildLoadedSkillHistorySummary([
			{
				message_id: 'assistant-message-1',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_research_anchors',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_research_anchors',
					name: 'Cold Email Research Anchors',
					parent_id: 'cold_email_engagement_first_outreach',
					depth: 1,
					format: 'short',
					summary: 'Find specific prospect signals before drafting.',
					materialized_tools: ['web_search', 'web_visit']
				}
			},
			{
				message_id: 'assistant-message-2',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'ui_ux_quality_review',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'ui_ux_quality_review',
					name: 'UI/UX Quality Review',
					parent_id: 'build_quality_ui_ux',
					depth: 1,
					format: 'short',
					summary: 'Review product UI quality.'
				}
			}
		]);

		const history = [{ role: 'system' as const, content: summary ?? '' }];

		expect(extractLoadedSkillIdsFromHistory(history)).toEqual([
			'cold_email_research_anchors',
			'ui_ux_quality_review'
		]);
		expect(extractLoadedSkillIdsFromHistory(history)).not.toContain(
			'cold_email_engagement_first_outreach'
		);
		expect(extractLoadedSkillIdsFromHistory(history)).not.toContain('web_search');
		expect(historyIncludesLoadedSkillsLedger(history)).toBe(true);
	});
});
