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
	clip,
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
	LAB_PROVIDER_ROUTING,
	buildAnswerPrompt,
	buildPlanPrompt,
	buildReport,
	composeTurnReply,
	projectHistory,
	type ChatChange,
	type ChatHistoryTurn,
	type ThreadReport
} from './thread-chat-core';
import { loadProjectIndex, type ProjectIndexLoad } from './thread-chat-index';
import { liveReadPort, replayReadPort, type SearchHit } from './thread-chat-reads';
import { runChatThread, usageTokens, type ChatThreadEvent } from './thread-chat-thread';
import { readContFlag, type WorkingSet } from './thread-chat-carry';
import { capThreads, createTurnPool, runModelCall } from './thread-chat-budget';
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
	/** Real prompt tokens across every call (Jev excluded), and how many hit a prompt cache. */
	promptTokens: number;
	cachedTokens: number;
	/** Tasker 151: text carried from last turn, rereads it saved, searches it skipped. */
	carriedChars: number;
	rereadsSkipped: number;
	searchesSkipped: number;
	/** Server clock (ms from the turn's start): projects loaded, first plan token. */
	projectsMs: number;
	firstPlanTokenMs: number;
	/** Pieces a thread handed back that a second thread picked up elsewhere. */
	rerouted: number;
};

const labRouting = () => ({
	...LAB_PROVIDER_ROUTING,
	order: [...LAB_PROVIDER_ROUTING.order],
	ignore: [...LAB_PROVIDER_ROUTING.ignore]
});

/** This project's working set from the latest turn that ran a thread for it. */
export function priorWorkingSet(
	history: readonly ChatHistoryTurn[],
	projectId: string
): WorkingSet | null {
	for (let at = history.length - 1; at >= 0; at -= 1) {
		const report = history[at]!.threads.find((entry) => entry.projectId === projectId);
		if (report)
			return {
				carry: report.carry ?? [],
				scanned: report.scanned ?? [],
				scannedCount: report.scannedCount ?? 0
			};
	}
	return null;
}

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
	| {
			/** Pieces handed back by a thread, and where each was sent (null: nowhere found). */
			type: 'rerouted';
			t: number;
			moves: {
				piece: number;
				from: string;
				to: string | null;
				toName: string | null;
				lookFor: string;
				found: string | null;
			}[];
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
				promptChars: 0,
				promptTokens: 0,
				cachedTokens: 0,
				carriedChars: 0,
				rereadsSkipped: 0,
				searchesSkipped: 0,
				projectsMs: 0,
				firstPlanTokenMs: 0,
				rerouted: 0
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
				totals.projectsMs = t();
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
				const continuing = new Set<number>();
				const created = new Map<string, string>();
				const focusAliases: string[] = [];
				const handleLines = (lines: string[]) => {
					for (const line of lines) {
						const read = readDumpLine(line, known);
						if (read.type === 'focus') {
							focusAliases.push(...read.focus.focus);
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
							if (readContFlag(line)) continuing.add(item.n);
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
				let planFailed = false;
				let planCost: number | null = null;
				if (script) {
					await wait(700, input.signal);
					totals.firstPlanTokenMs = t();
					send({ type: 'plan_token', t: t(), model: 'replay' });
					for (let at = 0; at < script.plan.length; at += 14) {
						if (input.signal?.aborted) break;
						handleLines(buffer.push(script.plan.slice(at, at + 14)));
						await wait(22, input.signal);
					}
					planModel = 'replay';
				} else {
					let first = true;
					try {
						await runModelCall({
							open: (callSignal) =>
								llm!.streamText({
									messages: [
										{ role: 'system', content: CHAT_PLAN_SYSTEM_PROMPT },
										{ role: 'user', content: planPrompt }
									],
									userId: input.userId,
									models: [...JSON_PROFILE_MODELS.fast],
									temperature: 0.1,
									maxTokens: 1500,
									reasoning: { enabled: false },
									providerRouting: labRouting(),
									signal: callSignal,
									operationType: CHAT_PLAN_OPERATION,
									contextType: 'thread_chat_lab'
								}),
							signal: input.signal,
							idleMs: 15_000,
							isOutput: (event) => event.type === 'text' && !!event.content,
							errorOf: (event) =>
								event.type === 'error' ? (event.error ?? 'Plan call failed') : null,
							onRetry: (reason) =>
								send({
									type: 'skip',
									t: t(),
									line: '',
									reason: `Plan call retried: ${reason}`
								}),
							onEvent: (event) => {
								if (event.type === 'text' && event.content) {
									if (first) {
										first = false;
										planModel = event.model ?? null;
										totals.firstPlanTokenMs = t();
										send({ type: 'plan_token', t: t(), model: planModel });
									}
									handleLines(buffer.push(event.content));
								}
								if (event.type === 'done') {
									planModel = event.model ?? planModel;
									planCost = usageCost(event.usage);
									const tokens = usageTokens(event.usage);
									totals.promptTokens += tokens.prompt;
									totals.cachedTokens += tokens.cached;
								}
							}
						});
					} catch (error) {
						if (input.signal?.aborted) throw error;
						planFailed = true;
						// Pieces that already arrived still run; with none, the fallback below decides.
						send({
							type: 'skip',
							t: t(),
							line: '',
							reason: `Plan call failed: ${error instanceof Error ? error.message : 'unknown error'}`
						});
					}
				}
				handleLines(buffer.flush());
				totals.calls += 1;
				totals.cost += planCost ?? 0;
				totals.planMs = t();

				// The plan call failed before placing anything: hand the whole message to the one
				// project it can only be about, if there is one. (A plan that ran and placed nothing,
				// like a "thanks", gets a plain reply below.)
				if (planFailed && !items.length && message.trim()) {
					const only = input.projectId
						? projects.find((project) => project.id === input.projectId)
						: focusAliases.length === 1
							? projectByAlias.get(focusAliases[0]!)
							: undefined;
					if (only) {
						const item: DumpItem = {
							n: 1,
							sentence: 1,
							kind: 'ask',
							to: only.alias,
							title: clip(message.trim(), 100),
							quote: message.trim(),
							due: null,
							start: 0,
							end: message.length,
							match: 'sentence'
						};
						items.push(item);
						startLoad(only.alias);
						send({ type: 'item', t: t(), item });
					}
				}

				const grouped = new Map<string, DumpItem[]>();
				for (const item of items) {
					if (!THREAD_KINDS.has(item.kind)) continue;
					grouped.set(item.to, [...(grouped.get(item.to) ?? []), item]);
				}
				// At most TURN_BUDGET.maxThreads threads: the projects with the most pieces first.
				// The rest are named in the reply so the person can send them again.
				const { kept: byAlias, deferred: overflow } = capThreads(grouped);
				const deferred = overflow.map(([alias, pieces]) => {
					const name = projectByAlias.get(alias)?.name ?? created.get(alias) ?? alias;
					return `${name}: ${pieces.map((piece) => clip(piece.title, 60)).join(', ')}`;
				});
				// The plan call broke partway: the sentences after its last piece were never sorted.
				if (planFailed && items.length) {
					const last = Math.max(...items.map((item) => item.sentence));
					if (last < sentences.length)
						deferred.push(
							`the rest of your message after sentence ${last} (the sorting step was cut off)`
						);
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
					? replayReadPort(replayCatalog())
					: liveReadPort({
							session: input.session,
							userId: input.userId,
							timezone: timezone ?? null,
							signal: input.signal
						});
				const changesByAlias = new Map<string, ChatChange[]>();
				const sendThread = (event: ChatThreadEvent) => {
					if (event.type === 'thread_change') {
						const list = changesByAlias.get(event.alias) ?? [];
						const at = event.replaces
							? list.findIndex((change) => change.key === event.replaces)
							: -1;
						if (at >= 0) list[at] = event.change;
						else list.push(event.change);
						changesByAlias.set(event.alias, list);
					}
					if (event.type === 'thread_done') {
						totals.calls += event.calls;
						totals.cost += event.cost;
						totals.threadMsSum += event.ms;
						totals.slowestThreadMs = Math.max(totals.slowestThreadMs, event.ms);
						totals.promptChars += event.promptChars;
						totals.promptTokens += event.stats.promptTokens;
						totals.cachedTokens += event.stats.cachedTokens;
						totals.carriedChars += event.stats.carriedChars;
						totals.rereadsSkipped += event.stats.rereadsSkipped;
						if (event.stats.finder === 'skipped') totals.searchesSkipped += 1;
					}
					send(event);
				};
				const pool = createTurnPool();
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
							carry: priorWorkingSet(input.history, project.id),
							continues: pieces.every((piece) => continuing.has(piece.n)),
							replay: script?.threads[project.id],
							pool,
							send: sendThread,
							t,
							signal: input.signal
						})
					);
				}
				totals.threads = runs.length;
				const reports = await Promise.all(runs);

				// ---- 2b. Pieces a thread handed back ("not in this project") ----
				// Search the person's other projects for what the thread named, and run a second,
				// small thread where it lives. One hop only: a second-wave thread can't hand back.
				const handedBack = reports.flatMap((report) =>
					(report.elsewhere ?? []).map((entry) => ({ entry, from: report }))
				);
				if (handedBack.length && !input.signal?.aborted) {
					const byId = new Map(
						projects.flatMap((project) => (project.id ? [[project.id, project]] : []))
					);
					const placed = await Promise.all(
						handedBack.map(async ({ entry, from }) => {
							const piece = items.find((item) => item.n === entry.piece);
							let hits: SearchHit[] = [];
							try {
								hits = await reads.search(entry.lookFor);
							} catch {
								// No search: the piece is reported as not placed.
							}
							const hit = hits
								.filter(
									(h) => h.projectId !== from.projectId && byId.has(h.projectId)
								)
								.sort((a, b) => b.score - a.score)[0];
							return {
								entry,
								from,
								piece,
								hit,
								home: hit ? byId.get(hit.projectId)! : null
							};
						})
					);
					const groups = new Map<string, { project: DumpProject; pieces: DumpItem[] }>();
					for (const move of placed) {
						if (!move.piece) continue;
						if (!move.home) {
							deferred.push(
								`"${clip(move.piece.title, 60)}" (I couldn't find which project has "${move.entry.lookFor}"; tell me the project)`
							);
							continue;
						}
						const group = groups.get(move.home.alias) ?? {
							project: move.home,
							pieces: []
						};
						group.pieces.push(move.piece);
						groups.set(move.home.alias, group);
					}
					const ranAlready = new Set(reports.map((report) => report.alias));
					const second = [...groups.values()].map((group) => ({
						...group,
						alias: ranAlready.has(group.project.alias)
							? `${group.project.alias}·2`
							: group.project.alias
					}));
					send({
						type: 'rerouted',
						t: t(),
						moves: placed.map((move) => ({
							piece: move.entry.piece,
							from: move.from.alias,
							to: move.home?.alias ?? null,
							toName: move.home?.name ?? null,
							lookFor: move.entry.lookFor,
							found: move.hit?.title ?? null
						})),
						threads: second.map((group) => ({
							alias: group.alias,
							name: group.project.name,
							pieces: group.pieces.map((piece) => piece.n)
						}))
					});
					const secondRuns = second.map((group) => {
						const from = placed.filter(
							(move) => move.home?.alias === group.project.alias
						);
						sendThread({
							type: 'thread_step',
							alias: group.alias,
							t: t(),
							step: {
								id: 'handed-over',
								kind: 'elsewhere',
								label: `Handed over from ${[...new Set(from.map((move) => move.from.project))].join(', ')}`,
								detail: from
									.map((move) => `found "${clip(move.hit?.title ?? '', 50)}"`)
									.join(' · '),
								state: 'done'
							}
						});
						startLoad(group.project.alias);
						return runChatThread({
							alias: group.alias,
							projectId: group.project.id!,
							load: loads.get(group.project.alias)!,
							pieces: group.pieces,
							today: todayLabel,
							userId: input.userId,
							history: projectHistory(input.history, group.project.id),
							nextQuestion,
							decider,
							llm,
							reads,
							carry: priorWorkingSet(input.history, group.project.id!),
							replay: script?.threads[`${group.project.id}#rerouted`],
							pool,
							send: sendThread,
							t,
							signal: input.signal
						});
					});
					const secondReports = await Promise.all(secondRuns);
					totals.threads += secondRuns.length;
					totals.rerouted += second.reduce(
						(total, group) => total + group.pieces.length,
						0
					);
					for (const report of secondReports) {
						// One hop: a piece handed back twice is reported, not chased.
						for (const entry of report.elsewhere ?? []) {
							const piece = items.find((item) => item.n === entry.piece);
							if (piece)
								deferred.push(
									`"${clip(piece.title, 60)}" (not in ${report.project} either; tell me the project)`
								);
						}
						reports.push(report);
					}
				}

				// ---- 3. Answer ----
				const answerAt = t();
				send({ type: 'answer_start', t: t() });
				const answerPrompt = buildAnswerPrompt({
					message,
					history: input.history,
					reports,
					newProjects,
					deferred
				});
				let answer = '';
				let answerModel: string | null = null;
				let answerCost: number | null = null;
				// Threads ran: the reply is built from their own decision lines, word for word, with
				// no model call to paraphrase them (composeTurnReply). No threads (a "thanks", or
				// nothing placed): the reply call answers briefly.
				const direct = reports.length > 0;
				if (!direct)
					totals.promptChars += CHAT_ANSWER_SYSTEM_PROMPT.length + answerPrompt.length;
				if (direct) {
					answer = composeTurnReply({
						threads: reports.map((report) => ({
							project: report.project,
							changes: changesByAlias.get(report.alias) ?? [],
							failed: report.failed,
							unfinished: report.unfinished
						})),
						deferred
					});
					send({ type: 'answer_delta', t: t(), text: answer });
					answerModel = 'composed';
				} else if (script) {
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
					try {
						await runModelCall({
							open: (callSignal) =>
								llm!.streamText({
									messages: [
										{ role: 'system', content: CHAT_ANSWER_SYSTEM_PROMPT },
										{ role: 'user', content: answerPrompt }
									],
									userId: input.userId,
									models: [...JSON_PROFILE_MODELS.fast],
									temperature: 0.3,
									maxTokens: 700,
									reasoning: { enabled: false },
									providerRouting: labRouting(),
									signal: callSignal,
									operationType: CHAT_ANSWER_OPERATION,
									contextType: 'thread_chat_lab'
								}),
							signal: input.signal,
							idleMs: 15_000,
							isOutput: (event) => event.type === 'text' && !!event.content,
							errorOf: (event) =>
								event.type === 'error'
									? (event.error ?? 'Answer call failed')
									: null,
							onEvent: (event) => {
								if (event.type === 'text' && event.content) {
									answer += event.content;
									send({ type: 'answer_delta', t: t(), text: event.content });
								}
								if (event.type === 'done') {
									answerModel = event.model ?? null;
									answerCost = usageCost(event.usage);
									const tokens = usageTokens(event.usage);
									totals.promptTokens += tokens.prompt;
									totals.cachedTokens += tokens.cached;
								}
							}
						});
					} catch (error) {
						if (input.signal?.aborted) throw error;
						// The reply call failed: fall back to each project's own report, word for word.
						const own = planFailed
							? "I couldn't sort that message just now. Try sending it again."
							: "I couldn't tell which project this is about. Which project should I look in?";
						const fallback = `${answer.trim() ? '\n\n' : ''}${own}`;
						answer += fallback;
						send({ type: 'answer_delta', t: t(), text: fallback });
						answerModel = 'fallback';
					}
				}
				if (!direct) totals.calls += 1;
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
		const done = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		signal?.addEventListener('abort', done, { once: true });
	});
}

/** Replay search: every sample project's record titles. */
function replayCatalog() {
	return REPLAY_PROJECTS.flatMap((project) => {
		const rows = project.id ? REPLAY_RECORDS[project.id] : undefined;
		if (!rows || !project.id) return [];
		const title = (row: Record<string, unknown>) =>
			typeof row.title === 'string'
				? row.title
				: typeof row.name === 'string'
					? row.name
					: '';
		const titles = [
			...rows.documents,
			...rows.tasks,
			...rows.goals,
			...rows.plans,
			...rows.milestones,
			...rows.risks
		]
			.map((row) => title(row as Record<string, unknown>))
			.filter(Boolean);
		return [{ projectId: project.id, projectName: project.name, titles }];
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
	send({
		type: 'thread_done',
		alias,
		t: t(),
		report,
		calls: 0,
		cost: 0,
		ms: 0,
		promptChars: 0,
		stats: {
			rounds: 0,
			promptTokens: 0,
			cachedTokens: 0,
			providers: [],
			carried: 0,
			carriedChars: 0,
			changed: 0,
			reads: 0,
			readChars: 0,
			rereadsSkipped: 0,
			finder: 'none'
		}
	});
	return report;
}

export { REPLAY_CHAT_TURNS };
