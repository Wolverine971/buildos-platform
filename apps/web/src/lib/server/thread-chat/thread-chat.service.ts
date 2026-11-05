// apps/web/src/lib/server/thread-chat/thread-chat.service.ts
//
// One chat turn for the "chat with threads" lab, streamed as JSON lines:
//   plan (one streamed call) → one thread per project, all in parallel → answer (one
//   streamed call over the threads' reports). The page sends the earlier turns' short
//   reports back with each message, so follow-ups ("yes to 2") reach the right project.
// Lab: changes are decided and shown as saved or asked, but nothing is written yet.
import { env } from '$env/dynamic/private';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JSON_PROFILE_MODELS, JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import { resolveUserCivilTimezone } from '@buildos/shared-agent-ops';
import type {
	ContextFinderDecider,
	ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { isActiveFacing } from '$lib/config/project-states';
import { civilToday } from '$lib/server/workspace/capture-sort-core';
import {
	LineBuffer,
	locateQuote,
	readDumpLine,
	splitSentences,
	type DumpFocus,
	type DumpItem,
	type DumpProject,
	type DumpSentence
} from '../dump-sort/dump-sort-core';
import { REPLAY_PROJECTS, REPLAY_RECORDS } from '../dump-sort/dump-sort-replay';
import {
	CHAT_ANSWER_OPERATION,
	CHAT_ANSWER_SYSTEM_PROMPT,
	CHAT_PLAN_OPERATION,
	CHAT_PLAN_SYSTEM_PROMPT,
	buildAnswerPrompt,
	buildPlanPrompt,
	buildReport,
	projectHistory,
	type ChatChange,
	type ChatHistoryTurn,
	type ThreadReport
} from './thread-chat-core';
import { loadProjectIndex, type ProjectIndexLoad } from './thread-chat-index';
import { liveReadPort, replayReadPort } from './thread-chat-reads';
import { runChatThread, type ChatThreadEvent } from './thread-chat-thread';
import { REPLAY_CHAT_TURNS, replayTurn } from './thread-chat-replay';

type Client = SupabaseClient<Database>;

const PROJECT_LIMIT = 25;
/** Pieces that only describe the project itself don't need a thread. */
const THREAD_KINDS = new Set(['goal', 'milestone', 'task', 'doc', 'risk', 'update', 'ask', 'work']);

export type ChatTurnTotals = {
	threads: number;
	calls: number;
	cost: number;
	planMs: number;
	answerMs: number;
	/** Sum of every thread's own time; compare with the wall time to see the parallelism. */
	threadMsSum: number;
	slowestThreadMs: number;
	promptChars: number;
};

export type ChatTurnEvent =
	| {
			type: 'start';
			t: number;
			message: string;
			sentences: DumpSentence[];
			mode: 'live' | 'replay';
	  }
	| { type: 'context'; t: number; projects: DumpProject[]; promptChars: number }
	| { type: 'plan_token'; t: number; model: string | null }
	| { type: 'focus'; t: number; focus: DumpFocus }
	| { type: 'item'; t: number; item: DumpItem }
	| { type: 'skip'; t: number; line: string; reason: string }
	| {
			type: 'planned';
			t: number;
			model: string | null;
			cost: number | null;
			threads: { alias: string; name: string; pieces: number[] }[];
	  }
	| ChatThreadEvent
	| { type: 'answer_start'; t: number }
	| { type: 'answer_delta'; t: number; text: string }
	| { type: 'answer_done'; t: number; model: string | null; cost: number | null; text: string }
	| { type: 'done'; t: number; totals: ChatTurnTotals }
	| { type: 'error'; t: number; message: string };

async function loadProjects(
	session: Client,
	userId: string,
	only: string | null
): Promise<DumpProject[]> {
	const actorId = await ensureActorId(session as never, userId);
	const summaries = await fetchProjectSummaries(session as never, actorId);
	const projects = summaries
		.filter(
			(project) =>
				project.kind !== 'workspace' &&
				(project.access_level === 'admin' || project.access_level === 'write') &&
				(only ? project.id === only : isActiveFacing(project.state_key))
		)
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
		.slice(0, PROJECT_LIMIT);
	const workspace = summaries.find((project) => project.kind === 'workspace') ?? null;
	return [
		...projects.map((project, index) => ({
			alias: `P${index + 1}`,
			id: project.id,
			name: project.name,
			description: project.description ?? null
		})),
		{
			alias: 'W',
			id: workspace?.id ?? null,
			name: 'Workspace',
			description: 'Loose notes and tasks'
		}
	];
}

function jevDecider(admin: Client): ContextFinderDecider | null {
	const apiKey = env.PRIVATE_OPENROUTER_API_KEY?.trim();
	if (!apiKey) return null;
	return new JevClient({
		apiKey,
		timeoutMs: 5_000,
		retryOnce: false,
		maxRequestBytes: 96_000,
		title: 'BuildOS Thread Chat Lab',
		usage: new LLMUsageLogger({ supabase: admin })
	});
}

function replayIndex(project: DumpProject): ProjectIndexLoad {
	const rows: ContextFinderProjectV1 = REPLAY_RECORDS[project.id ?? ''] ?? {
		project: {
			id: project.id ?? project.alias,
			name: project.name,
			description: project.description
		},
		documents: [],
		tasks: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	};
	return {
		project: rows,
		stats: {
			counts: {
				tasks: rows.tasks.length,
				goals: rows.goals.length,
				milestones: rows.milestones.length,
				docs: rows.documents.length,
				plans: rows.plans.length,
				risks: rows.risks.length
			},
			outlined: rows.documents.length,
			fallback: 0,
			fallbackChars: 0,
			ms: 40
		}
	};
}

function usageCost(raw: unknown): number | null {
	const usage = (raw ?? null) as Record<string, unknown> | null;
	return usage && Number(usage.cost) ? Number(usage.cost) : null;
}

export function streamChatTurn(input: {
	session: Client;
	admin: Client;
	userId: string;
	message: string;
	history: ChatHistoryTurn[];
	projectId: string | null;
	mode: 'live' | 'replay';
	signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
	const startedAt = performance.now();
	const t = () => Math.round(performance.now() - startedAt);
	const encoder = new TextEncoder();
	const replay = input.mode === 'replay';
	const script = replay ? replayTurn(input.history.length) : null;

	return new ReadableStream<Uint8Array>({
		start: async (controller) => {
			const send = (event: ChatTurnEvent) => {
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					// The page went away.
				}
			};
			const totals: ChatTurnTotals = {
				threads: 0,
				calls: 0,
				cost: 0,
				planMs: 0,
				answerMs: 0,
				threadMsSum: 0,
				slowestThreadMs: 0,
				promptChars: 0
			};
			try {
				const message = script ? script.message : input.message;
				const sentences = splitSentences(message);
				send({ type: 'start', t: t(), message, sentences, mode: input.mode });

				const [projects, timezone] = replay
					? [REPLAY_PROJECTS, 'UTC']
					: await Promise.all([
							loadProjects(input.session, input.userId, input.projectId),
							resolveUserCivilTimezone(input.session as never, input.userId)
						]);
				const { today, weekday } = civilToday(new Date(), timezone ?? 'UTC');
				const todayLabel = `${weekday} ${today}`;
				const planPrompt = buildPlanPrompt({
					message,
					sentences,
					projects,
					today: todayLabel,
					history: input.history
				});
				totals.promptChars += CHAT_PLAN_SYSTEM_PROMPT.length + planPrompt.length;
				send({ type: 'context', t: t(), projects, promptChars: planPrompt.length });

				// Reading a project's index starts the moment the plan names it.
				const loads = new Map<string, Promise<ProjectIndexLoad>>();
				const projectByAlias = new Map(projects.map((project) => [project.alias, project]));
				const startLoad = (alias: string) => {
					const project = projectByAlias.get(alias);
					if (!project?.id || loads.has(alias)) return;
					const load = replay
						? new Promise<ProjectIndexLoad>((resolve) =>
								setTimeout(() => resolve(replayIndex(project)), 300)
							)
						: loadProjectIndex(
								input.session,
								project.id,
								input.signal ?? new AbortController().signal
							);
					load.catch(() => undefined);
					loads.set(alias, load);
				};

				// ---- 1. Plan ----
				const known = {
					aliases: new Set(projects.map((project) => project.alias)),
					sentenceCount: sentences.length
				};
				const used: { start: number; end: number }[] = [];
				const buffer = new LineBuffer();
				const items: DumpItem[] = [];
				const created = new Map<string, string>();
				const handleLines = (lines: string[]) => {
					for (const line of lines) {
						const read = readDumpLine(line, known);
						if (read.type === 'focus') {
							read.focus.focus.forEach(startLoad);
							for (const project of read.focus.created)
								created.set(project.alias, project.name);
							send({ type: 'focus', t: t(), focus: read.focus });
						} else if (read.type === 'skip') {
							if (!line.startsWith('```'))
								send({
									type: 'skip',
									t: t(),
									line: line.slice(0, 200),
									reason: read.reason
								});
						} else {
							const span = locateQuote(
								message,
								sentences,
								read.item.sentence,
								read.item.quote,
								used
							);
							if (span.match !== 'sentence' && span.match !== 'none') used.push(span);
							const item = { ...read.item, n: items.length + 1, ...span };
							items.push(item);
							startLoad(item.to);
							send({ type: 'item', t: t(), item });
						}
					}
				};

				const llm = replay
					? null
					: new SmartLLMService({
							supabase: input.admin,
							httpReferer: 'https://build-os.com',
							appName: 'BuildOS Thread Chat Lab'
						});
				let planModel: string | null = null;
				let planCost: number | null = null;
				if (script) {
					await wait(700, input.signal);
					send({ type: 'plan_token', t: t(), model: 'replay' });
					for (let at = 0; at < script.plan.length; at += 14) {
						if (input.signal?.aborted) break;
						handleLines(buffer.push(script.plan.slice(at, at + 14)));
						await wait(22, input.signal);
					}
					planModel = 'replay';
				} else {
					let first = true;
					for await (const event of llm!.streamText({
						messages: [
							{ role: 'system', content: CHAT_PLAN_SYSTEM_PROMPT },
							{ role: 'user', content: planPrompt }
						],
						userId: input.userId,
						models: [...JSON_PROFILE_MODELS.fast],
						temperature: 0.1,
						maxTokens: 1500,
						reasoning: { enabled: false },
						signal: input.signal,
						operationType: CHAT_PLAN_OPERATION,
						contextType: 'thread_chat_lab'
					})) {
						if (event.type === 'text' && event.content) {
							if (first) {
								first = false;
								planModel = event.model ?? null;
								send({ type: 'plan_token', t: t(), model: planModel });
							}
							handleLines(buffer.push(event.content));
						}
						if (event.type === 'error')
							throw new Error(event.error ?? 'Plan call failed');
						if (event.type === 'done') {
							planModel = event.model ?? planModel;
							planCost = usageCost(event.usage);
						}
					}
				}
				handleLines(buffer.flush());
				totals.calls += 1;
				totals.cost += planCost ?? 0;
				totals.planMs = t();

				const byAlias = new Map<string, DumpItem[]>();
				for (const item of items) {
					if (!THREAD_KINDS.has(item.kind)) continue;
					byAlias.set(item.to, [...(byAlias.get(item.to) ?? []), item]);
				}
				send({
					type: 'planned',
					t: t(),
					model: planModel,
					cost: planCost,
					threads: [...byAlias].map(([alias, pieces]) => ({
						alias,
						name: projectByAlias.get(alias)?.name ?? created.get(alias) ?? alias,
						pieces: pieces.map((piece) => piece.n)
					}))
				});

				// ---- 2. Threads, all at once ----
				let question = 0;
				const nextQuestion = () => (question += 1);
				const decider = replay ? null : jevDecider(input.admin);
				const reads = replay
					? replayReadPort()
					: liveReadPort({
							session: input.session,
							userId: input.userId,
							timezone: timezone ?? null,
							signal: input.signal
						});
				const sendThread = (event: ChatThreadEvent) => {
					if (event.type === 'thread_done') {
						totals.calls += event.calls;
						totals.cost += event.cost;
						totals.threadMsSum += event.ms;
						totals.slowestThreadMs = Math.max(totals.slowestThreadMs, event.ms);
						totals.promptChars += event.promptChars;
					}
					send(event);
				};
				const runs: Promise<ThreadReport>[] = [];
				const newProjects: string[] = [];
				for (const [alias, pieces] of byAlias) {
					const project = projectByAlias.get(alias);
					if (!project?.id) {
						const name = project?.name ?? created.get(alias) ?? alias;
						if (!project) newProjects.push(name);
						runs.push(
							Promise.resolve(newProjectThread(alias, name, pieces, sendThread, t))
						);
						continue;
					}
					startLoad(alias);
					runs.push(
						runChatThread({
							alias,
							projectId: project.id,
							load: loads.get(alias)!,
							pieces,
							today: todayLabel,
							userId: input.userId,
							history: projectHistory(input.history, project.id),
							nextQuestion,
							decider,
							llm,
							reads,
							replay: script?.threads[project.id],
							send: sendThread,
							t,
							signal: input.signal
						})
					);
				}
				totals.threads = runs.length;
				const reports = await Promise.all(runs);

				// ---- 3. Answer ----
				const answerAt = t();
				send({ type: 'answer_start', t: t() });
				const answerPrompt = buildAnswerPrompt({
					message,
					history: input.history,
					reports,
					newProjects
				});
				totals.promptChars += CHAT_ANSWER_SYSTEM_PROMPT.length + answerPrompt.length;
				let answer = '';
				let answerModel: string | null = null;
				let answerCost: number | null = null;
				if (script) {
					await wait(500, input.signal);
					for (let at = 0; at < script.answer.length; at += 10) {
						if (input.signal?.aborted) break;
						const text = script.answer.slice(at, at + 10);
						answer += text;
						send({ type: 'answer_delta', t: t(), text });
						await wait(18, input.signal);
					}
					answerModel = 'replay';
				} else {
					for await (const event of llm!.streamText({
						messages: [
							{ role: 'system', content: CHAT_ANSWER_SYSTEM_PROMPT },
							{ role: 'user', content: answerPrompt }
						],
						userId: input.userId,
						models: [...JSON_PROFILE_MODELS.fast],
						temperature: 0.3,
						maxTokens: 700,
						reasoning: { enabled: false },
						signal: input.signal,
						operationType: CHAT_ANSWER_OPERATION,
						contextType: 'thread_chat_lab'
					})) {
						if (event.type === 'text' && event.content) {
							answer += event.content;
							send({ type: 'answer_delta', t: t(), text: event.content });
						}
						if (event.type === 'error')
							throw new Error(event.error ?? 'Answer call failed');
						if (event.type === 'done') {
							answerModel = event.model ?? null;
							answerCost = usageCost(event.usage);
						}
					}
				}
				totals.calls += 1;
				totals.cost += answerCost ?? 0;
				totals.answerMs = t() - answerAt;
				send({
					type: 'answer_done',
					t: t(),
					model: answerModel,
					cost: answerCost,
					text: answer.trim()
				});
				send({ type: 'done', t: t(), totals });
			} catch (error) {
				send({
					type: 'error',
					t: t(),
					message: error instanceof Error ? error.message : 'The turn failed'
				});
			} finally {
				try {
					controller.close();
				} catch {
					// Already closed.
				}
			}
		}
	});
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

/** A project that doesn't exist yet: nothing to look inside, so every piece is new. */
function newProjectThread(
	alias: string,
	name: string,
	pieces: DumpItem[],
	send: (event: ChatThreadEvent) => void,
	t: () => number
): ThreadReport {
	const changes: ChatChange[] = [];
	for (const piece of pieces) {
		const kind =
			piece.kind === 'goal' ||
			piece.kind === 'milestone' ||
			piece.kind === 'risk' ||
			piece.kind === 'task'
				? piece.kind
				: piece.kind === 'doc' || piece.kind === 'work'
					? 'doc'
					: 'note';
		const change: ChatChange = {
			piece: piece.n,
			op: 'create',
			kind,
			title: piece.title,
			description: '',
			due: piece.due,
			why: 'new project',
			status: 'applied',
			question: null
		};
		changes.push(change);
		send({ type: 'thread_change', alias, t: t(), change });
	}
	const report = buildReport({
		alias,
		projectId: null,
		project: name,
		read: [],
		changes,
		failed: null
	});
	send({ type: 'thread_status', alias, t: t(), stage: 'done' });
	send({ type: 'thread_done', alias, t: t(), report, calls: 0, cost: 0, ms: 0, promptChars: 0 });
	return report;
}

export { REPLAY_CHAT_TURNS };
