// apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.ts
//
// Database ports for chat checkpoint capture (tasker/95). Writes go through the
// op gateway, so project access, document versions and START HERE managed
// regions are enforced exactly as for any other agent write. Each save re-checks
// the document's updated_at first: a document edited since capture read it is a
// conflict, and the queue job retries against the fresh copy.
import {
	attributeGlobalTurns,
	globalCaptureUserIds,
	receiptsForMessages
} from './globalAttribution';
import { randomUUID } from 'node:crypto';
import type {
	AgentCallScope,
	ChangeSet,
	Database,
	Json,
	ProposedChange,
	RunResult
} from '@buildos/shared-types';
import { syncInboxItemForAgentRun } from '@buildos/shared-agent-ops';
import { resolveUserCivilTimezone } from '@buildos/shared-agent-ops/dates/civil-date';
import {
	runGatewayWriteOp,
	stageGatewayWriteOp
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { ensureActorId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import {
	preserveCurrentStartHereManagedRegions,
	stripStartHereManagedRegions
} from '@buildos/shared-agent-ops/ontology/start-here';
import { ensureProjectStartHereDocument } from '@buildos/shared-agent-ops/ontology/start-here.service';
import { supabase } from '../../../lib/supabase';
import { accessibleSessionProjectId } from '../../../lib/projectAccess';
import {
	type PromptEntity,
	type PromptMessage,
	type PromptSavedChange,
	latestSavedChanges
} from './capturePrompts';
import type {
	CheckpointCapturePorts,
	CheckpointDocument,
	CheckpointRecord,
	CheckpointSession
} from './checkpointCapture';
import { createCheckpointCompleteJson } from './checkpointLlm';
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import {
	type ChatKnowledgePorts,
	chatKnowledgeCaptureEnabled,
	runChatKnowledgeCapture
} from './knowledgeCapture';
import { type ChatWebPage, uniqueWebPages, webPagesFromToolResult } from './knowledgePrompt';
import { THINKING_LOG_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/thinking-log';

export const START_HERE_CAPTURE_RUN_LABEL = 'Update project START HERE';
const THINKING_LOG_TITLE = 'Thinking log';
const NEW_MESSAGE_BATCH = 60;
const PRIOR_CONTEXT_MESSAGES = 4;
const SAVED_CHANGE_ROWS = 200;
/** Chat tools whose stored results name the pages the chat read (their text is never stored). */
const WEB_TOOL_NAMES = ['web_search', 'web_visit', 'web_navigate'];
const WEB_TOOL_ROWS = 40;
/** Shared-project knowledge reads (tasker 168) whose stored trace lists granted-value keys. */
const LENS_TOOL_NAME = 'get_project_knowledge_lens';
const LENS_TOOL_ROWS = 50;

let knowledgeGate: JevClient | null | undefined;

/** The knowledge gate, built once; null without an OpenRouter key (extraction runs ungated). */
function getKnowledgeGate(): JevClient | null {
	if (knowledgeGate !== undefined) return knowledgeGate;
	const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
	knowledgeGate = apiKey
		? new JevClient({
				apiKey,
				timeoutMs: 6_000,
				maxRequestBytes: 96_000,
				retryOnce: false,
				// Jev latency is bimodal; one hedge rescues most slow calls (chat finder data).
				hedgeAfterMs: 1_500,
				title: 'BuildOS Chat Checkpoint (knowledge gate)',
				usage: new LLMUsageLogger({ supabase: supabase as never })
			})
		: null;
	return knowledgeGate;
}

type AgentRunInsert = Database['public']['Tables']['agent_runs']['Insert'];

/** The document changed after capture read it; the job retries on fresh data. */
export class CheckpointConflictError extends Error {
	constructor(documentId: string) {
		super(`Document ${documentId} changed during checkpoint capture`);
		this.name = 'CheckpointConflictError';
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function documentScope(projectId: string): AgentCallScope {
	return {
		mode: 'read_write',
		project_ids: [projectId],
		allowed_ops: ['onto.document.create', 'onto.document.update']
	};
}

async function assertUnchanged(document: CheckpointDocument): Promise<void> {
	const { data, error } = await supabase
		.from('onto_documents')
		.select('updated_at')
		.eq('id', document.id)
		.maybeSingle();
	if (error) throw error;
	if (!data || data.updated_at !== document.updatedAt) {
		throw new CheckpointConflictError(document.id);
	}
}

function writtenDocument(
	data: unknown,
	fallback: { id: string; content: string }
): CheckpointDocument {
	const document = asRecord(asRecord(data)?.document);
	return {
		id: typeof document?.id === 'string' ? document.id : fallback.id,
		content: fallback.content,
		updatedAt: typeof document?.updated_at === 'string' ? document.updated_at : null
	};
}

// Capture writes these titles into START HERE, so archived records stay out: a title
// captured here reads as current work forever after (tasker 113).
async function loadEntities(projectId: string): Promise<PromptEntity[]> {
	const [documents, goals, plans, milestones, tasks] = await Promise.all([
		supabase
			.from('onto_documents')
			.select('id, title, type_key')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.neq('state_key', 'archived')
			.order('updated_at', { ascending: false })
			.limit(40),
		supabase
			.from('onto_goals')
			.select('id, name')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.limit(10),
		supabase
			.from('onto_plans')
			.select('id, name')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.limit(20),
		supabase
			.from('onto_milestones')
			.select('id, title')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.limit(20),
		supabase
			.from('onto_tasks')
			.select('id, title')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
			.limit(60)
	]);
	return [
		...(documents.data ?? [])
			.filter((doc) => doc.type_key !== 'document.context.project')
			.map((doc) => ({ type: 'document', id: doc.id, title: doc.title ?? null })),
		...(goals.data ?? []).map((goal) => ({
			type: 'goal',
			id: goal.id,
			title: goal.name ?? null
		})),
		...(plans.data ?? []).map((plan) => ({
			type: 'plan',
			id: plan.id,
			title: plan.name ?? null
		})),
		...(milestones.data ?? []).map((milestone) => ({
			type: 'milestone',
			id: milestone.id,
			title: milestone.title ?? null
		})),
		...(tasks.data ?? []).map((task) => ({
			type: 'task',
			id: task.id,
			title: task.title ?? null
		}))
	];
}

async function supersedeRuns(userId: string, runIds: string[], supersededBy: string | null) {
	for (const runId of runIds) {
		const { data, error } = await supabase
			.from('agent_runs')
			.update({
				status: 'cancelled',
				error: supersededBy
					? `superseded: replaced by newer Start Here proposal ${supersededBy}`
					: 'superseded: the Start Here document changed after this proposal was staged',
				completed_at: new Date().toISOString()
			})
			.eq('id', runId)
			.eq('user_id', userId)
			.eq('status', 'proposal_ready')
			.select('*')
			.maybeSingle();
		if (error || !data) continue;
		try {
			await syncInboxItemForAgentRun({
				supabase,
				run: data as unknown as Record<string, unknown>
			});
		} catch (syncError) {
			console.warn(
				`⚠️ Failed to sync AI Inbox item for superseded Start Here proposal ${runId}:`,
				syncError instanceof Error ? syncError.message : syncError
			);
		}
	}
}

export function createSupabaseCheckpointPorts(options?: {
	completeJson?: CheckpointCapturePorts['completeJson'];
	signal?: AbortSignal;
	/** Tests and scripts: replace the knowledge gate / identity seam. */
	knowledge?: Partial<Pick<ChatKnowledgePorts, 'decider' | 'resolveIdentity'>>;
}): CheckpointCapturePorts {
	const watermarks = new Map<string, { at: string | null }>();
	const completeJson =
		options?.completeJson ?? createCheckpointCompleteJson({ signal: options?.signal });

	/** Pages the chat's web tools returned between the watermark and the batch's last message. */
	async function loadWebPages(sessionId: string, throughAt: string): Promise<ChatWebPage[]> {
		const watermarkAt = watermarks.get(sessionId)?.at ?? null;
		let query = supabase
			.from('chat_tool_executions')
			.select('tool_name, result, created_at')
			.eq('session_id', sessionId)
			.eq('success', true)
			.in('tool_name', WEB_TOOL_NAMES)
			.lte('created_at', throughAt)
			.order('created_at', { ascending: true })
			.limit(WEB_TOOL_ROWS);
		if (watermarkAt) query = query.gt('created_at', watermarkAt);
		const { data, error } = await query;
		if (error) throw error;
		return uniqueWebPages(
			(data ?? []).flatMap((row) =>
				webPagesFromToolResult((row as { result: unknown }).result)
			)
		);
	}

	/**
	 * Keys of values the chat only saw through another member's grant, from every lens read in
	 * the session up to the batch's last message (not just since the watermark: the assistant
	 * may repeat a granted value later). The stored trace holds keys, never the values.
	 */
	async function loadGrantedValueKeys(
		sessionId: string,
		throughAt: string
	): Promise<Set<string>> {
		const { data, error } = await supabase
			.from('chat_tool_executions')
			.select('result')
			.eq('session_id', sessionId)
			.eq('success', true)
			.eq('tool_name', LENS_TOOL_NAME)
			.lte('created_at', throughAt)
			.order('created_at', { ascending: false })
			.limit(LENS_TOOL_ROWS);
		if (error) throw error;
		const keys = new Set<string>();
		for (const row of (data ?? []) as Array<{ result: unknown }>) {
			const result = row.result as { granted_value_keys?: unknown } | null;
			if (!Array.isArray(result?.granted_value_keys)) continue;
			for (const key of result.granted_value_keys) {
				if (typeof key === 'string') keys.add(key);
			}
		}
		return keys;
	}

	return {
		async loadSession({ sessionId, userId }) {
			const { data, error } = await supabase
				.from('chat_sessions')
				.select(
					'id, user_id, context_type, entity_id, title, auto_title, capture_watermark_at'
				)
				.eq('id', sessionId)
				.eq('user_id', userId)
				.maybeSingle();
			if (error) throw error;
			if (!data) return null;
			watermarks.set(data.id, { at: data.capture_watermark_at });
			return {
				id: data.id,
				userId: data.user_id,
				// The scope on the row is user-written; capture reads the project with the
				// service role and writes its thinking log and START HERE (paid model calls), so
				// it only follows a project the session's owner can edit.
				projectId: await accessibleSessionProjectId(supabase, data.user_id, data, 'write'),
				title: data.title?.trim() || data.auto_title?.trim() || null
			};
		},

		async attributeProject(session, userMessages) {
			if (!globalCaptureUserIds().includes(session.userId.toLowerCase())) return null;
			const ids = userMessages.map((message) => message.id);
			const [messages, events] = await Promise.all([
				supabase.from('chat_messages').select('id, metadata').in('id', ids),
				supabase
					.from('chat_turn_events')
					.select('payload, created_at')
					.eq('session_id', session.id)
					.eq('event_type', 'context_selection')
					.order('created_at', { ascending: true })
					.limit(500)
			]);
			if (messages.error) throw messages.error;
			if (events.error) throw events.error;
			const clientTurns = new Map(
				(messages.data ?? []).map((row) => {
					const turn = (row.metadata as { client_turn_id?: unknown } | null)
						?.client_turn_id;
					return [row.id, typeof turn === 'string' ? turn : null] as const;
				})
			);
			return attributeGlobalTurns(
				receiptsForMessages(
					ids.map((id) => ({ id, clientTurnId: clientTurns.get(id) ?? null })),
					events.data ?? []
				)
			);
		},

		async loadMessages(session: CheckpointSession) {
			const watermarkAt = watermarks.get(session.id)?.at ?? null;
			let newQuery = supabase
				.from('chat_messages')
				.select('id, role, content, created_at')
				.eq('session_id', session.id)
				.in('role', ['user', 'assistant'])
				.order('created_at', { ascending: true })
				.order('id', { ascending: true })
				.limit(NEW_MESSAGE_BATCH);
			if (watermarkAt) newQuery = newQuery.gt('created_at', watermarkAt);
			const [fresh, prior] = await Promise.all([
				newQuery,
				watermarkAt
					? supabase
							.from('chat_messages')
							.select('id, role, content, created_at')
							.eq('session_id', session.id)
							.in('role', ['user', 'assistant'])
							.lte('created_at', watermarkAt)
							.order('created_at', { ascending: false })
							.limit(PRIOR_CONTEXT_MESSAGES)
					: Promise.resolve({ data: [], error: null })
			]);
			if (fresh.error) throw fresh.error;
			if (prior.error) throw prior.error;
			const toPrompt = (rows: unknown[] | null): PromptMessage[] =>
				((rows ?? []) as Array<Record<string, unknown>>).flatMap((row) =>
					typeof row.id === 'string' &&
					typeof row.created_at === 'string' &&
					typeof row.role === 'string'
						? [
								{
									id: row.id,
									role: row.role,
									content: typeof row.content === 'string' ? row.content : '',
									created_at: row.created_at
								}
							]
						: []
				);
			const newMessages = toPrompt(fresh.data);
			// Receipts up to the last message in this batch, so a capped batch and
			// its receipts cover the same stretch of the chat. Writes only, newest
			// first: read executions carry no receipt and filled the row cap in long
			// chats, so capture told the model "none" when saves had happened.
			const through = newMessages[newMessages.length - 1]?.created_at ?? null;
			let savedChanges: PromptSavedChange[] = [];
			if (through) {
				let receiptQuery = supabase
					.from('chat_tool_executions')
					.select('tool_name, tool_category, success, affected_entities, created_at')
					.eq('session_id', session.id)
					.eq('success', true)
					.or('tool_category.is.null,tool_category.neq.read')
					.lte('created_at', through)
					.order('created_at', { ascending: false })
					.limit(SAVED_CHANGE_ROWS);
				if (watermarkAt) receiptQuery = receiptQuery.gt('created_at', watermarkAt);
				const receipts = await receiptQuery;
				if (receipts.error) throw receipts.error;
				savedChanges = latestSavedChanges(
					(receipts.data ?? []) as Array<Record<string, unknown>>
				);
			}
			return {
				newMessages,
				priorMessages: toPrompt(prior.data).reverse(),
				savedChanges
			};
		},

		async loadProject(session) {
			const { data: project, error } = await supabase
				.from('onto_projects')
				.select('id, name, description, created_at')
				.eq('id', session.projectId)
				// The Workspace holds loose items and has no START HERE: never capture into it.
				.eq('kind', 'project')
				.is('deleted_at', null)
				.maybeSingle();
			if (error) throw error;
			if (!project) return null;
			const actorId = await ensureActorId(supabase, session.userId);
			const [ensured, timezone, thinkingLog, entities] = await Promise.all([
				ensureProjectStartHereDocument({
					supabase,
					projectId: session.projectId,
					actorId,
					projectName: project.name ?? null,
					projectDescription: project.description ?? null
				}),
				resolveUserCivilTimezone(supabase, session.userId),
				supabase
					.from('onto_documents')
					.select('id, content, updated_at')
					.eq('project_id', session.projectId)
					.eq('type_key', THINKING_LOG_TYPE_KEY)
					.is('deleted_at', null)
					.order('created_at', { ascending: true })
					.limit(1)
					.maybeSingle(),
				loadEntities(session.projectId)
			]);
			if (!ensured.ok) throw new Error(ensured.error);
			if (ensured.skipped) return null;
			if (thinkingLog.error) throw thinkingLog.error;
			return {
				name: project.name ?? null,
				createdAt: project.created_at ?? null,
				timezone: timezone ?? 'UTC',
				startHere: {
					id: ensured.document.id,
					content: ensured.document.content ?? '',
					updatedAt: ensured.document.updated_at ?? null
				},
				thinkingLog: thinkingLog.data
					? {
							id: thinkingLog.data.id,
							content: thinkingLog.data.content ?? '',
							updatedAt: thinkingLog.data.updated_at ?? null
						}
					: null,
				entities
			};
		},

		async loadPendingReview(session, startHere) {
			const { data, error } = await supabase
				.from('agent_runs')
				.select('id, change_set')
				.eq('user_id', session.userId)
				.eq('project_id', session.projectId)
				.eq('label', START_HERE_CAPTURE_RUN_LABEL)
				.eq('status', 'proposal_ready')
				.order('created_at', { ascending: false })
				.limit(10);
			if (error) throw error;
			const runs = data ?? [];
			// The newest proposal still describes the document only while its
			// "before" matches the current authored body.
			const newest = asRecord(runs[0]?.change_set);
			const change = asRecord(Array.isArray(newest?.changes) ? newest.changes[0] : null);
			const before = asRecord(change?.before);
			const after = asRecord(change?.after);
			const applies =
				newest?.status === 'pending' &&
				change?.op === 'onto.document.update' &&
				(change.entity_id === startHere.id || after?.document_id === startHere.id) &&
				typeof before?.content === 'string' &&
				typeof after?.content === 'string' &&
				stripStartHereManagedRegions(before.content) ===
					stripStartHereManagedRegions(startHere.content);
			return {
				runIds: runs.map((run) => run.id),
				effectiveContent: applies
					? preserveCurrentStartHereManagedRegions(
							startHere.content,
							after!.content as string
						)
					: null
			};
		},

		completeJson,

		async captureKnowledge({ session, newMessages, priorMessages, throughMessageId }) {
			if (!chatKnowledgeCaptureEnabled()) return null;
			const through = newMessages.find((message) => message.id === throughMessageId);
			let webPages: ChatWebPage[] = [];
			try {
				webPages = through ? await loadWebPages(session.id, through.created_at) : [];
			} catch (error) {
				// Without the page list, web facts can't cite a page and are dropped; user facts still count.
				console.warn(
					`⚠️ Knowledge capture could not read web results for ${session.id}:`,
					error instanceof Error ? error.message : error
				);
			}
			let grantedValueKeys: Set<string>;
			try {
				grantedValueKeys = through
					? await loadGrantedValueKeys(session.id, through.created_at)
					: new Set();
			} catch (error) {
				// Fail closed: without the keys a granted value could be copied, so capture nothing.
				console.warn(
					`⚠️ Knowledge capture could not read shared-project reads for ${session.id}:`,
					error instanceof Error ? error.message : error
				);
				return null;
			}
			return runChatKnowledgeCapture(
				{
					db: supabase as never,
					decider:
						options?.knowledge && 'decider' in options.knowledge
							? (options.knowledge.decider ?? null)
							: getKnowledgeGate(),
					completeJson: (params) => completeJson(params),
					...(options?.knowledge?.resolveIdentity
						? { resolveIdentity: options.knowledge.resolveIdentity }
						: {})
				},
				{
					session: { id: session.id, userId: session.userId, title: session.title },
					newMessages,
					priorMessages,
					webPages,
					throughMessageId,
					grantedValueKeys
				}
			);
		},

		async saveThinkingLog({ session, document, content }) {
			if (document) await assertUnchanged(document);
			const result = document
				? await runGatewayWriteOp({
						admin: supabase,
						userId: session.userId,
						scope: documentScope(session.projectId),
						op: 'onto.document.update',
						args: {
							document_id: document.id,
							content,
							update_strategy: 'replace',
							allow_large_deletion: true
						},
						chatSessionId: session.id
					})
				: await runGatewayWriteOp({
						admin: supabase,
						userId: session.userId,
						scope: documentScope(session.projectId),
						op: 'onto.document.create',
						args: {
							project_id: session.projectId,
							title: THINKING_LOG_TITLE,
							type_key: THINKING_LOG_TYPE_KEY,
							description: 'Your own words from project chats, newest first.',
							content
						},
						chatSessionId: session.id
					});
			if (!result.ok)
				throw new Error(
					`Thinking log write failed: ${result.error?.message ?? 'unknown error'}`
				);
			return writtenDocument(result.data, {
				id: document?.id ?? result.entityId ?? '',
				content
			});
		},

		async saveStartHere({ session, document, content }) {
			await assertUnchanged(document);
			const result = await runGatewayWriteOp({
				admin: supabase,
				userId: session.userId,
				scope: documentScope(session.projectId),
				op: 'onto.document.update',
				args: {
					document_id: document.id,
					content,
					update_strategy: 'replace',
					allow_large_deletion: true
				},
				chatSessionId: session.id
			});
			if (!result.ok)
				throw new Error(
					`START HERE write failed: ${result.error?.message ?? 'unknown error'}`
				);
			return writtenDocument(result.data, { id: document.id, content });
		},

		async stageStartHereReview({ session, document, content, rationale, supersedeRunIds }) {
			const staged = await stageGatewayWriteOp({
				admin: supabase,
				userId: session.userId,
				scope: {
					mode: 'read_write',
					project_ids: [session.projectId],
					allowed_ops: ['onto.document.update']
				},
				op: 'onto.document.update',
				args: {
					document_id: document.id,
					content,
					update_strategy: 'replace',
					allow_large_deletion: true
				},
				rationale
			});
			if (!staged.ok) throw new Error(staged.error.message);
			const runId = randomUUID();
			const now = new Date().toISOString();
			const change: ProposedChange = {
				...staged.change,
				id: randomUUID(),
				rationale,
				decision: 'pending'
			};
			const changeSet: ChangeSet = {
				run_id: runId,
				status: 'pending',
				changes: [change],
				created_at: now
			};
			const metrics = { tokens: 0, cost_usd: 0, tool_calls: 0, duration_ms: 0 };
			const goal =
				'Review the START HERE changes that would remove or reword existing lines.';
			const result: RunResult = {
				run_id: runId,
				label: START_HERE_CAPTURE_RUN_LABEL,
				status: 'proposal_ready',
				summary: goal,
				answer: 'Additions were saved automatically; these edits change existing lines.',
				entities_touched: [],
				proposed_changes: changeSet,
				metrics
			};
			const row: AgentRunInsert = {
				id: runId,
				user_id: session.userId,
				trigger: 'chat',
				parent_session_id: session.id,
				depth: 0,
				label: START_HERE_CAPTURE_RUN_LABEL,
				goal,
				instructions:
					'Created by chat checkpoint capture. Additions already applied; review these removals and rewordings.',
				expected_output: 'A reviewed update to the project START HERE document.',
				context_type: 'project',
				project_id: session.projectId,
				review_required: true,
				status: 'proposal_ready',
				scope_mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				change_set: changeSet as unknown as Json,
				budgets: {} as Json,
				result: result as unknown as Json,
				metrics: metrics as unknown as Json,
				completed_at: now
			};
			const { error } = await supabase.from('agent_runs').insert(row);
			if (error) throw error;
			try {
				await syncInboxItemForAgentRun({
					supabase,
					run: row as unknown as Record<string, unknown>
				});
			} catch (syncError) {
				console.warn(
					`⚠️ Failed to sync AI Inbox item for Start Here proposal ${runId}:`,
					syncError instanceof Error ? syncError.message : syncError
				);
			}
			await supersedeRuns(session.userId, supersedeRunIds, runId);
			return runId;
		},

		async supersedeStartHereReviews({ session, runIds }) {
			await supersedeRuns(session.userId, runIds, null);
		},

		async finishCheckpoint(record: CheckpointRecord) {
			if (record.userMessageCount > 0) {
				const { error } = await supabase.from('chat_capture_checkpoints').insert({
					session_id: record.sessionId,
					user_id: record.userId,
					project_id: record.projectId,
					trigger: record.trigger,
					status: record.status,
					through_message_id: record.throughMessageId,
					through_message_at: record.throughMessageAt,
					user_message_count: record.userMessageCount,
					thinking_log_document_id: record.thinkingLog?.documentId ?? null,
					thinking_log_entry: record.thinkingLog?.entry ?? null,
					start_here_document_id: record.startHere?.documentId ?? null,
					start_here_before: record.startHere?.beforeContent ?? null,
					start_here_after_updated_at: record.startHere?.afterUpdatedAt ?? null,
					applied_sections: record.startHere?.appliedSections ?? [],
					review_run_id: record.review?.runId ?? null,
					review_sections: record.review?.sections ?? [],
					details: {
						skipped: record.skipped,
						invariant_violations: record.invariantViolations,
						dropped_links: record.droppedLinks,
						restated_additions: record.restatedAdditions,
						log_passages: record.thinkingLog?.passageCount ?? 0,
						error: record.error,
						knowledge: record.knowledge
					} as unknown as Json
				});
				if (error) throw error;
			}
			const { error } = await supabase
				.from('chat_sessions')
				.update({
					capture_watermark_message_id: record.throughMessageId,
					capture_watermark_at: record.throughMessageAt
				})
				.eq('id', record.sessionId);
			if (error) throw error;
		}
	};
}
