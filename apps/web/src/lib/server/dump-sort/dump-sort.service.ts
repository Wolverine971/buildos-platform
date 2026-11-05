// apps/web/src/lib/server/dump-sort/dump-sort.service.ts
//
// "Watch it sort" prototype, two stages on one stream:
//   1. Route: one streamed call says which project each piece of the dump belongs to.
//      Each line becomes an `item` event the moment it is complete.
//   2. Threads: one per project, all in parallel. Reading the project starts as soon as
//      stage 1 names it; once routing ends, each thread lets Jev pick the related records
//      and one streamed call decides update / create / answer / covered / archive per piece.
// Plan only: nothing is saved (batch save + Undo comes after the feel is proven).
import { env } from '$env/dynamic/private';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JSON_PROFILE_MODELS, JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import { resolveUserCivilTimezone } from '@buildos/shared-agent-ops';
import {
	loadContextFinderProject,
	type ContextFinderDecider,
	type ContextFinderProjectV1,
	type ContextFinderReadClient
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { isActiveFacing } from '$lib/config/project-states';
import { civilToday } from '$lib/server/workspace/capture-sort-core';
import {
	DUMP_SORT_OPERATION,
	DUMP_SORT_SYSTEM_PROMPT,
	LineBuffer,
	buildDumpSortPrompt,
	locateQuote,
	readDumpLine,
	splitSentences,
	type DumpFocus,
	type DumpItem,
	type DumpProject,
	type DumpSentence
} from './dump-sort-core';
import { runProjectThread, type ThreadEvent } from './dump-sort-thread';
import type { ThreadChange } from './dump-sort-thread-core';
import {
	REPLAY_PROJECTS,
	REPLAY_RECORDS,
	REPLAY_TEXT,
	REPLAY_THREADS,
	replayChunks
} from './dump-sort-replay';

type Client = SupabaseClient<Database>;

const PROJECT_LIMIT = 25;
/** Pieces about the project itself are shown on the card; they don't need a thread. */
const THREAD_KINDS = new Set(['goal', 'milestone', 'task', 'doc', 'risk', 'update', 'ask']);

/** Everything the page hears, in order. `t` is ms since the request reached the server. */
export type DumpSortEvent =
	| { type: 'start'; t: number; text: string; sentences: DumpSentence[]; mode: 'live' | 'replay' }
	| { type: 'context'; t: number; projects: DumpProject[]; promptChars: number }
	| { type: 'first_token'; t: number; model: string | null }
	| { type: 'thinking'; t: number }
	| { type: 'focus'; t: number; focus: DumpFocus }
	| { type: 'item'; t: number; item: DumpItem }
	| { type: 'skip'; t: number; line: string; reason: string }
	| {
			type: 'routed';
			t: number;
			model: string | null;
			items: number;
			finishReason: string | null;
			usage: { prompt?: number; completion?: number; cost?: number } | null;
	  }
	| ThreadEvent
	| { type: 'done'; t: number }
	| { type: 'error'; t: number; message: string };

async function loadProjects(session: Client, userId: string): Promise<DumpProject[]> {
	const actorId = await ensureActorId(session as never, userId);
	const summaries = await fetchProjectSummaries(session as never, actorId);
	const projects = summaries
		.filter(
			(project) =>
				project.kind !== 'workspace' &&
				(project.access_level === 'admin' || project.access_level === 'write') &&
				isActiveFacing(project.state_key)
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
		title: 'BuildOS Dump Sort Lab',
		usage: new LLMUsageLogger({ supabase: admin })
	});
}

export function streamDumpSort(input: {
	session: Client;
	admin: Client;
	userId: string;
	text: string;
	mode: 'live' | 'replay';
	signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
	const startedAt = performance.now();
	const t = () => Math.round(performance.now() - startedAt);
	const encoder = new TextEncoder();
	const replay = input.mode === 'replay';

	return new ReadableStream<Uint8Array>({
		start: async (controller) => {
			const send = (event: DumpSortEvent) => {
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					// The page went away; nothing to tell.
				}
			};
			try {
				const text = replay ? REPLAY_TEXT : input.text;
				const sentences = splitSentences(text);
				send({ type: 'start', t: t(), text, sentences, mode: input.mode });

				const [projects, timezone] = replay
					? [REPLAY_PROJECTS, 'UTC']
					: await Promise.all([
							loadProjects(input.session, input.userId),
							resolveUserCivilTimezone(input.session as never, input.userId)
						]);
				const { today, weekday } = civilToday(new Date(), timezone ?? 'UTC');
				const todayLabel = `${weekday} ${today}`;
				const userPrompt = buildDumpSortPrompt({
					text,
					sentences,
					projects,
					today: todayLabel
				});
				send({ type: 'context', t: t(), projects, promptChars: userPrompt.length });

				// Reading a project starts the moment stage 1 names it, so the read overlaps routing.
				const loads = new Map<string, Promise<ContextFinderProjectV1>>();
				const projectByAlias = new Map(projects.map((project) => [project.alias, project]));
				const startLoad = (alias: string) => {
					const project = projectByAlias.get(alias);
					if (!project?.id || loads.has(alias)) return;
					const load = replay
						? new Promise<ContextFinderProjectV1>((resolve) =>
								setTimeout(
									() =>
										resolve(
											REPLAY_RECORDS[project.id!] ?? emptyProject(project)
										),
									350
								)
							)
						: loadContextFinderProject(
								input.session as unknown as ContextFinderReadClient,
								project.id,
								input.signal ?? new AbortController().signal
							);
					load.catch(() => undefined);
					loads.set(alias, load);
				};

				const known = {
					aliases: new Set(projects.map((project) => project.alias)),
					sentenceCount: sentences.length
				};
				const used: { start: number; end: number }[] = [];
				const buffer = new LineBuffer();
				const items: DumpItem[] = [];
				let firstToken = false;
				let thinking = false;
				let model: string | null = null;
				let finishReason: string | null = null;
				let usage: { prompt?: number; completion?: number; cost?: number } | null = null;

				const handleLines = (lines: string[]) => {
					for (const line of lines) {
						const read = readDumpLine(line, known);
						if (read.type === 'focus') {
							read.focus.focus.forEach(startLoad);
							send({ type: 'focus', t: t(), focus: read.focus });
						} else if (read.type === 'skip') {
							if (!line.startsWith('```')) {
								send({
									type: 'skip',
									t: t(),
									line: line.slice(0, 200),
									reason: read.reason
								});
							}
						} else {
							const span = locateQuote(
								text,
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
							appName: 'BuildOS Dump Sort Lab'
						});

				if (replay) {
					send({ type: 'first_token', t: t() + 900, model: 'replay' });
					for await (const chunk of replayChunks(input.signal))
						handleLines(buffer.push(chunk));
					model = 'replay';
				} else {
					for await (const event of llm!.streamText({
						messages: [
							{ role: 'system', content: DUMP_SORT_SYSTEM_PROMPT },
							{ role: 'user', content: userPrompt }
						],
						userId: input.userId,
						models: [...JSON_PROFILE_MODELS.fast],
						temperature: 0.1,
						maxTokens: 2000,
						// Hidden thinking spent the whole budget on the first live runs (2,000
						// tokens, ~17 s, zero lines). Routing is a fast structured answer.
						reasoning: { enabled: false },
						signal: input.signal,
						operationType: DUMP_SORT_OPERATION,
						contextType: 'dump_sort_lab'
					})) {
						if (event.type === 'reasoning' && !thinking && !firstToken) {
							thinking = true;
							send({ type: 'thinking', t: t() });
						}
						if (event.type === 'text' && event.content) {
							if (!firstToken) {
								firstToken = true;
								model = event.model ?? model;
								send({ type: 'first_token', t: t(), model });
							}
							handleLines(buffer.push(event.content));
						}
						if (event.type === 'error')
							throw new Error(event.error ?? 'Model stream failed');
						if (event.type === 'done') {
							model = event.model ?? model;
							finishReason = event.finished_reason ?? null;
							const raw = (event.usage ?? null) as Record<string, unknown> | null;
							usage = raw
								? {
										prompt: Number(raw.prompt_tokens) || undefined,
										completion: Number(raw.completion_tokens) || undefined,
										cost: Number(raw.cost) || undefined
									}
								: null;
						}
					}
				}
				handleLines(buffer.flush());
				send({ type: 'routed', t: t(), model, items: items.length, finishReason, usage });

				// Stage 2: one thread per project that got pieces, all at once.
				const decider = replay ? null : jevDecider(input.admin);
				const byAlias = new Map<string, DumpItem[]>();
				for (const item of items) {
					if (!THREAD_KINDS.has(item.kind)) continue;
					byAlias.set(item.to, [...(byAlias.get(item.to) ?? []), item]);
				}
				const threads: Promise<void>[] = [];
				for (const [alias, pieces] of byAlias) {
					const project = projectByAlias.get(alias);
					if (!project?.id) {
						// A new project (or a Workspace that doesn't exist yet): nothing to look
						// inside, so every piece is new.
						sendNewProjectThread(alias, pieces, send, t);
						continue;
					}
					startLoad(alias);
					threads.push(
						runProjectThread({
							alias,
							projectId: project.id,
							load: loads.get(alias)!,
							pieces,
							today: todayLabel,
							userId: input.userId,
							decider,
							llm,
							replay: replay ? REPLAY_THREADS[project.id] : undefined,
							send,
							t,
							signal: input.signal
						})
					);
				}
				await Promise.all(threads);
				send({ type: 'done', t: t() });
			} catch (error) {
				send({
					type: 'error',
					t: t(),
					message: error instanceof Error ? error.message : 'Sorting failed'
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

function emptyProject(project: DumpProject): ContextFinderProjectV1 {
	return {
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
}

function sendNewProjectThread(
	alias: string,
	pieces: DumpItem[],
	send: (event: ThreadEvent) => void,
	t: () => number
) {
	for (const piece of pieces) {
		const kind =
			piece.kind === 'goal' || piece.kind === 'milestone' || piece.kind === 'risk'
				? piece.kind
				: piece.kind === 'doc'
					? 'doc'
					: piece.kind === 'task'
						? 'task'
						: 'note';
		const change: ThreadChange = {
			piece: piece.n,
			op: 'create',
			kind,
			title: piece.title,
			description: '',
			due: piece.due,
			why: 'new project'
		};
		send({ type: 'thread_change', alias, t: t(), change });
	}
	send({ type: 'thread_status', alias, t: t(), stage: 'done' });
	send({ type: 'thread_done', alias, t: t(), model: null, cost: null });
}
