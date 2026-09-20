// apps/worker/src/workers/agentic-chat/workflow/prototype-provider.ts
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
	CHAT_WORKFLOW_PROTOTYPE_VERSION,
	type ChatWorkflowProgress,
	type ChatWorkflowStep,
	type JsonObject,
	isChatWorkflowCommand
} from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import {
	PROJECT_REVIEW_RULES_PREAMBLE_V1,
	PROJECT_REVIEW_RULES_V1,
	PROJECT_REVIEW_SPECIALISTS_V1
} from '@buildos/agentic-chat-runtime/specialists';
import type { AgenticChatProviderCapacity } from '../providerCapacity';
import { buildPromptSnapshot } from '../provider/request-builders';
import { AgenticChatProviderExecutionError } from '../provider/contracts';
import type {
	AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderInputV1,
	AgenticChatProviderPortV1,
	AgenticChatProviderStepV1,
	AgenticChatProviderUsageV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderClientRequestV1
} from '../provider/contracts';
import {
	CHAT_WORKFLOW_DISPATCH_POLICY,
	type ChatWorkflowRoleReportV1,
	type ChatWorkflowSpecialistRole,
	buildSpecialistReportInstructions,
	buildWorkflowEvidenceIndex,
	parseWorkflowRoleReport,
	renderWorkflowRoleReport,
	workflowReportForEditor
} from './role-report';

/** The first line is also the SQL fence for persisting a workflow prompt snapshot. */
export const WORKFLOW_RULES_PREAMBLE = PROJECT_REVIEW_RULES_PREAMBLE_V1;
const RULES = PROJECT_REVIEW_RULES_V1;
/** Shared with the durable workflow runner so both lanes send identical read-only rules. */
export const WORKFLOW_RULES = RULES;

type Assignment = { analyst: string; reviewer: string };
type Ports = {
	direct: AgenticChatProviderPortV1;
	client: AgenticChatTurnProviderClientPortV1;
	capacity: AgenticChatProviderCapacity;
	allowedUserIds: readonly string[];
	loadContext(
		userId: string,
		projectId: string,
		signal: AbortSignal
	): Promise<MasterPromptContext>;
};

type WorkflowAttemptCode =
	| 'workflow_response_truncated'
	| 'workflow_incomplete_response'
	| 'workflow_report_invalid';

/** A completed provider call whose output cannot be accepted. Transport errors stay as thrown. */
export class WorkflowAttemptError extends Error {
	constructor(
		readonly code: WorkflowAttemptCode,
		readonly detail: string
	) {
		super(code);
		this.name = 'WorkflowAttemptError';
	}
}

type SpecialistSpec = {
	index: 2 | 3;
	retryRound: 5 | 6;
	role: ChatWorkflowSpecialistRole;
	label: string;
	assignment: string;
};
type SpecialistOutcome =
	| { spec: SpecialistSpec; kind: 'accepted'; report: ChatWorkflowRoleReportV1; attempts: number }
	| { spec: SpecialistSpec; kind: 'retry'; reason: string }
	| {
			spec: SpecialistSpec;
			kind: 'failed';
			attempts: number;
			code: string;
			reason: string | null;
	  };

/** First live pilot: existing durable chat lifecycle, bounded model passes, no tools. */
export class ChatWorkflowPrototypeProvider implements AgenticChatProviderPortV1 {
	constructor(private readonly ports: Ports) {}

	prepare(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1> {
		const message = input.executionInput.requestPayload.message;
		if (!isChatWorkflowCommand(message)) return this.ports.direct.prepare!(input);
		const context = input.executionInput.requestPayload.context as JsonObject;
		const projectId = context?.projectId ?? context?.entityId;
		const question = message.replace(/^\s*\/workflow\s*/i, '').trim();
		let rejection: string | null = null;
		if (!this.ports.allowedUserIds.includes(input.executionInput.claim.userId))
			rejection = 'The workflow prototype is not enabled for this account.';
		else if (context?.type !== 'project' || typeof projectId !== 'string')
			rejection = 'Open a project chat to run a workflow review.';
		else if (question.length > 6000)
			rejection = 'Keep the workflow question under 6,000 characters.';
		else if (question.length < 3)
			rejection = 'Add a question after /workflow, such as: What should we prioritize next?';
		else if ((input.executionInput.requestPayload.attachments as unknown[] | undefined)?.length)
			rejection =
				'This first workflow prototype reads saved project context. Please send a text-only question.';
		if (rejection) return Promise.resolve(staticAnswer(rejection));

		// Creating the invocation must not fetch context or call a model before the executor's start fence.
		const controller = new AbortController();
		const signal = AbortSignal.any([input.signal, controller.signal]);
		let started = false;
		let snapshot: AgenticChatPreparedProviderInvocationV1['promptSnapshot'];
		const self = this;
		return Promise.resolve({
			automaticDomainCapture: 'disabled',
			get promptSnapshot() {
				return snapshot;
			},
			async *stream() {
				if (started) throw new Error('A workflow invocation can only be streamed once');
				started = true;
				try {
					yield* self.run(
						input,
						projectId as string,
						question,
						signal,
						(value) => {
							snapshot ??= value;
						},
						() => controller.abort()
					);
				} finally {
					controller.abort();
				}
			},
			release() {
				controller.abort();
			}
		});
	}

	private async *run(
		input: AgenticChatProviderInputV1,
		projectId: string,
		question: string,
		signal: AbortSignal,
		setSnapshot: (value: AgenticChatPreparedProviderInvocationV1['promptSnapshot']) => void,
		abort: () => void
	): AsyncGenerator<AgenticChatProviderStepV1> {
		const steps: ChatWorkflowStep[] = [
			{ id: 'context', label: 'Gather project context', status: 'pending' },
			{ id: 'plan', label: 'Plan the review', status: 'pending' },
			{
				id: 'analyst',
				label: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.label,
				status: 'pending'
			},
			{
				id: 'reviewer',
				label: PROJECT_REVIEW_SPECIALISTS_V1.risk_reviewer.label,
				status: 'pending'
			},
			{ id: 'answer', label: 'Combine recommendations', status: 'pending' }
		];
		let contextHash: string | undefined;
		const progress = (
			index: number,
			status: ChatWorkflowStep['status'],
			detail?: string
		): AgenticChatProviderStepV1 => {
			steps[index]!.status = status;
			const workflow: ChatWorkflowProgress = {
				version: CHAT_WORKFLOW_PROTOTYPE_VERSION,
				steps: steps.map((step) => ({ ...step })),
				...(contextHash ? { contextHash } : {})
			};
			const activity = detail ?? `${steps[index]!.label}: ${status}`;
			return {
				type: 'semantic',
				transitionId: randomUUID(),
				phase: index === 0 ? 'prompt' : 'llm',
				eventType: 'agent_state',
				currentActivity: activity,
				eventPayload: {
					type: 'agent_state',
					state: 'thinking',
					contextType: 'project',
					details: activity,
					activity_visibility: 'activity_log',
					workflow: workflow as unknown as JsonObject
				}
			};
		};
		const usage: AgenticChatProviderUsageV1 = {
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0
		};
		const claim = input.executionInput.claim;
		// The parent executor's five-minute timer remains authoritative. Context gets a smaller bound.
		yield progress(0, 'running');
		let brief: string;
		let evidence: Map<string, string>;
		try {
			const context = await this.ports.loadContext(
				claim.userId,
				projectId,
				AbortSignal.any([signal, AbortSignal.timeout(20_000)])
			);
			signal.throwIfAborted();
			brief = buildWorkflowProjectBrief(context, projectId);
			evidence = buildWorkflowEvidenceIndex(context);
			contextHash = createHash('sha256').update(brief).digest('hex');
		} catch (error) {
			if (signal.aborted) throw error;
			yield progress(0, 'failed', 'Project context could not be loaded');
			throw error;
		}
		yield progress(0, 'completed');

		const history = input.executionInput.artifact.history.slice(-6).map((m) => ({
			role: m.role,
			content: m.content.slice(0, 1500)
		}));
		const shared = `USER QUESTION\n${question}\n\nFROZEN CONVERSATION (context only)\n${JSON.stringify(history)}\n\nPROJECT EVIDENCE\n${brief}`;
		const client = this.ports.client;
		const acquire = () => this.acquire(claim.turnRunId, signal);
		let dispatches = 0;
		const streamCall = async function* (
			round: number,
			role: string,
			task: string,
			evidenceText: string,
			maxTokens: number,
			forwardText = false,
			prefix = ''
		): AsyncGenerator<AgenticChatProviderStepV1, string> {
			signal.throwIfAborted();
			if (++dispatches > CHAT_WORKFLOW_DISPATCH_POLICY.maxProviderCalls)
				throw new AgenticChatProviderExecutionError(
					'workflow_provider_call_limit',
					'permanent',
					'Workflow exceeded its provider call limit'
				);
			const request: AgenticChatTurnProviderClientRequestV1 = {
				messages: [
					{ role: 'system', content: `${RULES}\n\nROLE: ${role}\n${task}` },
					{ role: 'user', content: evidenceText }
				],
				tools: [],
				toolChoice: 'none',
				userId: claim.userId,
				sessionId: claim.sessionId,
				turnRunId: claim.turnRunId,
				streamRunId: input.executionInput.streamRunId,
				clientTurnId: input.executionInput.clientTurnId,
				contextType: 'project',
				entityId: projectId,
				projectId,
				queueJobId: claim.queueJobId,
				processingToken: input.processingToken,
				executionGeneration: claim.executionGeneration,
				logicalProviderRound: round,
				providerRound: round === 1 ? 'initial' : 'synthesis',
				passRole: round === 4 ? 'final_response' : 'acting',
				maxOutputTokens: maxTokens,
				reasoningEffort: CHAT_WORKFLOW_DISPATCH_POLICY.reasoningEffort,
				budget: input.budget,
				signal
			};
			setSnapshot(buildPromptSnapshot(request.messages, []));
			const lease = await acquire();
			try {
				let text = '',
					finishedReason: string | null = null,
					completionTokens = 0,
					emittedText = false;
				for await (const event of client.stream(request)) {
					signal.throwIfAborted();
					if (event.type === 'tool_call')
						throw new Error('Workflow attempted an unsupported tool call');
					if (event.type === 'error') throw new Error(event.error);
					if (event.type === 'text') {
						text += event.content;
						if (text.length > 16_000)
							throw new Error('Workflow response exceeded its text limit');
						if (forwardText && event.content) {
							yield {
								type: 'text_delta',
								text: (emittedText ? '' : prefix) + event.content
							};
							emittedText = true;
							signal.throwIfAborted();
						}
					}
					if (event.type === 'done') {
						finishedReason = event.finishedReason ?? 'stop';
						const u = event.usage;
						completionTokens = u?.completionTokens ?? u?.completion_tokens ?? 0;
						usage.promptTokens += u?.promptTokens ?? u?.prompt_tokens ?? 0;
						usage.completionTokens += completionTokens;
						usage.totalTokens += u?.totalTokens ?? u?.total_tokens ?? 0;
					}
				}
				// Hidden reasoning shares the completion budget. A response that used all
				// of it is cut off whatever finish reason the provider reports.
				if (finishedReason === 'length' || completionTokens >= maxTokens)
					throw new WorkflowAttemptError(
						'workflow_response_truncated',
						'it reached its output limit before finishing'
					);
				if (finishedReason === null || !text.trim())
					throw new WorkflowAttemptError(
						'workflow_incomplete_response',
						'the response ended without a complete result'
					);
				return text.trim();
			} finally {
				lease.release();
			}
		};
		// Planning and specialist drafts stay private until their complete result
		// is accepted. Only the final editor feeds the existing batched publisher.
		const call = async (...args: Parameters<typeof streamCall>) => {
			const stream = streamCall(...args);
			while (true) {
				const next = await stream.next();
				if (next.done) return next.value;
			}
		};

		yield progress(1, 'running');
		const fallback: Assignment = {
			analyst: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.instructions.defaultAssignment,
			reviewer: PROJECT_REVIEW_SPECIALISTS_V1.risk_reviewer.instructions.defaultAssignment
		};
		let assignments = fallback;
		let usedFallback = true;
		try {
			const plan = await call(
				1,
				'Planner',
				'Assign two complementary investigations for the user question. Return only JSON with keys analyst and reviewer, each a short assignment string. Do not add agents or tools.',
				shared,
				CHAT_WORKFLOW_DISPATCH_POLICY.planner.maxOutputTokens
			);
			const parsed = parseWorkflowAssignments(plan);
			if (parsed) {
				assignments = parsed;
				usedFallback = false;
			}
		} catch (error) {
			if (signal.aborted) throw error;
		}
		steps[2]!.objective = assignments.analyst;
		steps[3]!.objective = assignments.reviewer;
		steps[1]!.result = `${usedFallback ? 'Planner unavailable or invalid; using the fixed two-specialist plan.\n\n' : ''}Project analyst: ${assignments.analyst}\n\nRisk reviewer: ${assignments.reviewer}`;
		yield progress(
			1,
			'completed',
			usedFallback ? 'Using the default review plan' : 'Review plan ready'
		);
		yield progress(2, 'running');
		yield progress(3, 'running');

		const specs: SpecialistSpec[] = [
			{
				index: 2,
				retryRound: 5,
				role: 'project_analyst',
				label: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.label,
				assignment: assignments.analyst
			},
			{
				index: 3,
				retryRound: 6,
				role: 'risk_reviewer',
				label: PROJECT_REVIEW_SPECIALISTS_V1.risk_reviewer.label,
				assignment: assignments.reviewer
			}
		];
		const policy = CHAT_WORKFLOW_DISPATCH_POLICY;
		const retryFits = () =>
			input.budget === undefined ||
			input.budget.deadlineAtMs - Date.now() >= policy.retryMinRemainingMs;
		const attemptSpecialist = (
			spec: SpecialistSpec,
			attempt: number,
			retryReason?: string
		): Promise<SpecialistOutcome> =>
			call(
				attempt === 1 ? spec.index : spec.retryRound,
				spec.label,
				buildSpecialistReportInstructions(
					spec.assignment,
					retryReason === undefined ? undefined : { reason: retryReason }
				),
				shared,
				policy.specialist.maxOutputTokens
			)
				.then((text): SpecialistOutcome => {
					const parsed = parseWorkflowRoleReport(text, spec.role, evidence);
					if (!parsed.ok)
						throw new WorkflowAttemptError('workflow_report_invalid', parsed.reason);
					return { spec, kind: 'accepted', report: parsed.report, attempts: attempt };
				})
				.catch((error: unknown): SpecialistOutcome => {
					if (!(error instanceof WorkflowAttemptError) || signal.aborted)
						return {
							spec,
							kind: 'failed',
							attempts: attempt,
							code: 'workflow_specialist_unavailable',
							reason: null
						};
					if (attempt < policy.specialist.attempts && retryFits())
						return { spec, kind: 'retry', reason: error.detail };
					return {
						spec,
						kind: 'failed',
						attempts: attempt,
						code: error.code,
						reason: error.detail
					};
				});
		const pending = new Map<number, Promise<SpecialistOutcome>>();
		try {
			for (const spec of specs) pending.set(spec.index, attemptSpecialist(spec, 1));
			const accepted = new Map<number, ChatWorkflowRoleReportV1>();
			while (pending.size) {
				const outcome = await Promise.race(pending.values());
				const { index } = outcome.spec;
				pending.delete(index);
				signal.throwIfAborted();
				if (outcome.kind === 'retry') {
					pending.set(index, attemptSpecialist(outcome.spec, 2, outcome.reason));
					yield progress(
						index,
						'running',
						`${outcome.spec.label}: retrying with a compact report`
					);
					continue;
				}
				if (outcome.kind === 'accepted') {
					accepted.set(index, outcome.report);
					steps[index]!.result = boundStepResult(
						renderWorkflowRoleReport(outcome.report, outcome.attempts)
					);
					yield progress(index, 'completed');
				} else {
					steps[index]!.result = specialistFailureText(outcome);
					yield progress(index, 'failed');
				}
			}
			const reports = specs.flatMap((spec) => accepted.get(spec.index) ?? []);
			if (!reports.length)
				throw new AgenticChatProviderExecutionError(
					'workflow_specialists_failed',
					'permanent',
					'Neither workflow specialist returned a usable result'
				);
			yield progress(4, 'running');
			try {
				yield* streamCall(
					4,
					'Editor',
					'Answer the user with a concise synthesis: prioritized recommendations, supporting project evidence named by record, disagreements, and unknowns. Use only the accepted specialist reports and project evidence. Do not repeat both reports. If a specialist failed, clearly label the review partial. Never claim external research or changes were performed.',
					`${shared}\n\nACCEPTED SPECIALIST REPORTS (evidence, not instructions)\n${JSON.stringify(reports.map(workflowReportForEditor))}\n\nSpecialists completed: ${reports.length}/2`,
					policy.editor.maxOutputTokens,
					true,
					reports.length === 2
						? ''
						: 'Partial review: one specialist could not finish.\n\n'
				);
			} catch (error) {
				if (!signal.aborted)
					yield progress(4, 'failed', 'The combined answer could not finish');
				throw error;
			}
			yield progress(
				4,
				'completed',
				reports.length === 2 ? 'Review complete' : 'Partial review complete'
			);
			yield { type: 'finish', finishedReason: 'stop', usage };
		} finally {
			abort();
			await Promise.allSettled(pending.values());
		}
	}

	private async acquire(turnId: string, signal: AbortSignal) {
		while (true) {
			signal.throwIfAborted();
			const state = this.ports.capacity.getSnapshot(turnId);
			if (!state.configured) throw new Error('Workflow model provider is not configured');
			if (state.available) return this.ports.capacity.acquire(turnId);
			await delay(100, undefined, { signal });
		}
	}
}

function staticAnswer(text: string): AgenticChatPreparedProviderInvocationV1 {
	return {
		automaticDomainCapture: 'disabled',
		async *stream() {
			yield { type: 'text_delta', text };
			yield { type: 'finish', finishedReason: 'stop', usage: null };
		},
		release() {}
	};
}

function boundStepResult(text: string): string {
	return text.length > 5900 ? `${text.slice(0, 5900)}\n[Preview shortened]` : text;
}

function specialistFailureText(outcome: Extract<SpecialistOutcome, { kind: 'failed' }>): string {
	const retried = outcome.attempts > 1 ? ' Its one compact retry also did not succeed.' : '';
	switch (outcome.code) {
		case 'workflow_response_truncated':
			return `This specialist reached its response limit before completing its report.${retried}`;
		case 'workflow_report_invalid':
			return `This specialist's report was not accepted: ${outcome.reason}.${retried}`;
		case 'workflow_incomplete_response':
			return `This specialist's response ended before its report was complete.${retried}`;
		default:
			return 'This specialist did not return a usable result. Provider receipts are available in the run diagnostics.';
	}
}

export function parseWorkflowAssignments(text: string): Assignment | null {
	try {
		const data = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
		if (
			!data ||
			typeof data !== 'object' ||
			!['analyst', 'reviewer'].every(
				(key) =>
					typeof data[key] === 'string' &&
					data[key].trim().length >= 3 &&
					data[key].length <= 1000
			)
		)
			return null;
		return { analyst: data.analyst.trim(), reviewer: data.reviewer.trim() };
	} catch {
		return null;
	}
}

export function buildWorkflowProjectBrief(context: MasterPromptContext, projectId: string): string {
	const data = context.data;
	if (
		context.contextLoadSource !== 'rpc' ||
		!data ||
		typeof data !== 'object' ||
		(data.project as { id?: string } | undefined)?.id !== projectId
	) {
		throw new Error('Project context is unavailable or access was denied');
	}
	const packet = Object.fromEntries(
		[
			'project',
			'goals',
			'milestones',
			'plans',
			'tasks',
			'documents',
			'events',
			'start_here',
			'context_meta'
		].map((key) => [key, data[key]])
	);
	const brief = JSON.stringify(
		{ timezone: context.timezone, loadedAt: new Date().toISOString(), data: packet },
		(_key, value) =>
			typeof value === 'string' && value.length > 5000
				? `${value.slice(0, 5000)}\n[Truncated]`
				: value
	);
	if (brief.length > 64_000) throw new Error('Project context exceeds the prototype input limit');
	return brief;
}
