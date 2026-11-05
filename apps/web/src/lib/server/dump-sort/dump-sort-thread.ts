// apps/web/src/lib/server/dump-sort/dump-sort-thread.ts
//
// Runs one project thread for the "watch it sort" prototype and reports each step:
// read the project → Jev picks the related records → one streamed call decides per piece.
// Plan only: nothing is saved.
import {
	buildContextFinderEntities,
	findProjectContext,
	loadContextFinderPlanText,
	type ContextFinderDecider,
	type ContextFinderEntity,
	type ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import { JSON_PROFILE_MODELS } from '@buildos/smart-llm';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { LineBuffer, type DumpItem } from './dump-sort-core';
import {
	DUMP_FINDER_OPERATION,
	DUMP_THREAD_OPERATION,
	DUMP_THREAD_SYSTEM_PROMPT,
	buildThreadPrompt,
	readThreadLine,
	type ThreadChange,
	type ThreadRecord,
	type ThreadRecordKind
} from './dump-sort-thread-core';

const FULL_RECORDS = 10;
const OTHER_RECORDS = 40;
const FINDER_TIMEOUT_MS = 5_000;

export type ThreadStage = 'reading' | 'searching' | 'deciding' | 'done' | 'failed';

export type ThreadEvent =
	| { type: 'thread_status'; alias: string; t: number; stage: ThreadStage; note?: string }
	| { type: 'thread_read'; alias: string; t: number; counts: Record<string, number> }
	| {
			type: 'thread_found';
			alias: string;
			t: number;
			source: 'jev' | 'recent';
			records: ThreadRecord[];
	  }
	| { type: 'thread_change'; alias: string; t: number; change: ThreadChange }
	| { type: 'thread_skip'; alias: string; t: number; line: string; reason: string }
	| {
			type: 'thread_done';
			alias: string;
			t: number;
			model: string | null;
			cost: number | null;
	  };

/** Scripted stand-ins for Jev and the model, so the replay runs the same steps for free. */
export type ThreadReplay = {
	pick: { id: string; p: number }[];
	answer: string;
	findMs: number;
	firstTokenMs: number;
};

function day(value: unknown): string | null {
	return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

function toRecord(
	entity: ContextFinderEntity,
	p: number | null,
	tier: 'full' | 'summary'
): ThreadRecord {
	const packet = entity.packet as Record<string, unknown>;
	const description = typeof packet.description === 'string' ? packet.description : null;
	return {
		ref: entity.ref,
		id: entity.id,
		kind: entity.kind as ThreadRecordKind,
		title: entity.title,
		state: typeof packet.state === 'string' ? packet.state : null,
		due: day(packet.due ?? packet.date),
		description,
		p,
		tier,
		...(entity.kind === 'document' && tier === 'full' && entity.textLoaded
			? { body: entity.fullText.slice(0, 800) }
			: {})
	};
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

export async function runProjectThread(input: {
	alias: string;
	projectId: string;
	load: Promise<ContextFinderProjectV1>;
	pieces: DumpItem[];
	today: string;
	userId: string;
	decider: ContextFinderDecider | null;
	llm: SmartLLMService | null;
	replay?: ThreadReplay;
	send: (event: ThreadEvent) => void;
	t: () => number;
	signal?: AbortSignal;
}): Promise<void> {
	const { alias, send, t, signal } = input;
	try {
		send({ type: 'thread_status', alias, t: t(), stage: 'reading' });
		const project = await input.load;
		send({
			type: 'thread_read',
			alias,
			t: t(),
			counts: {
				tasks: project.tasks.length,
				goals: project.goals.length,
				milestones: project.milestones.length,
				docs: project.documents.length,
				plans: project.plans.length,
				risks: project.risks.length
			}
		});

		// Jev picks the records these pieces are about.
		send({ type: 'thread_status', alias, t: t(), stage: 'searching' });
		const entities = buildContextFinderEntities(project);
		const byId = new Map(entities.map((entity) => [entity.id, entity]));
		let chosen: { id: string; p: number | null }[] | null = null;
		let source: 'jev' | 'recent' = 'recent';
		if (input.replay) {
			await wait(input.replay.findMs, signal);
			chosen = input.replay.pick;
			source = 'jev';
		} else if (input.decider) {
			const message = input.pieces
				.map((piece) => `- ${piece.quote} (${piece.title})`)
				.join('\n');
			const result = await findProjectContext({
				project,
				message,
				decider: input.decider,
				signal,
				timeoutMs: FINDER_TIMEOUT_MS,
				usage: {
					operationType: DUMP_FINDER_OPERATION,
					userId: input.userId,
					projectId: input.projectId
				}
			});
			if (result.plan && result.evidence.status !== 'unavailable') {
				source = 'jev';
				chosen = result.plan.items.map((item) => ({ id: item.id, p: item.p }));
			}
		}
		// No Jev (off, failed, or timed out): the most recently touched records.
		chosen = (
			chosen ??
			[...entities]
				.sort((a, b) => b.version.localeCompare(a.version))
				.map((entity) => ({ id: entity.id, p: null }))
		)
			.filter((pick) => byId.has(pick.id))
			.slice(0, FULL_RECORDS);
		// Documents load outline-first; read the text of the picked ones only.
		const loaded = new Map(
			(
				await loadContextFinderPlanText({
					project,
					entities,
					plan: null,
					extraIds: chosen.map((pick) => pick.id),
					signal
				})
			).map((entity) => [entity.id, entity])
		);
		const picked = chosen.map((pick) => toRecord(loaded.get(pick.id)!, pick.p, 'full'));
		const pickedIds = new Set(picked.map((record) => record.id));
		const others = [...entities]
			.filter((entity) => !pickedIds.has(entity.id))
			.sort((a, b) => b.version.localeCompare(a.version))
			.slice(0, OTHER_RECORDS)
			.map((entity) => toRecord(entity, null, 'summary'));
		send({ type: 'thread_found', alias, t: t(), source, records: picked });

		// One streamed call decides each piece.
		send({ type: 'thread_status', alias, t: t(), stage: 'deciding' });
		const known = {
			records: new Map([...picked, ...others].map((record) => [record.ref, record])),
			pieces: new Set(input.pieces.map((piece) => piece.n))
		};
		const buffer = new LineBuffer();
		const handle = (lines: string[]) => {
			for (const line of lines) {
				const read = readThreadLine(line, known);
				if (read.type === 'change') {
					send({ type: 'thread_change', alias, t: t(), change: read.change });
				} else if (!line.startsWith('```')) {
					send({
						type: 'thread_skip',
						alias,
						t: t(),
						line: line.slice(0, 200),
						reason: read.reason
					});
				}
			}
		};
		let model: string | null = null;
		let cost: number | null = null;
		if (input.replay) {
			await wait(input.replay.firstTokenMs, signal);
			for (let index = 0; index < input.replay.answer.length; index += 14) {
				if (signal?.aborted) return;
				handle(buffer.push(input.replay.answer.slice(index, index + 14)));
				await wait(30, signal);
			}
			model = 'replay';
		} else if (input.llm) {
			const userPrompt = buildThreadPrompt({
				projectName: project.project.name,
				projectDescription: project.project.description ?? null,
				today: input.today,
				pieces: input.pieces,
				records: picked,
				others
			});
			for await (const event of input.llm.streamText({
				messages: [
					{ role: 'system', content: DUMP_THREAD_SYSTEM_PROMPT },
					{ role: 'user', content: userPrompt }
				],
				userId: input.userId,
				models: [...JSON_PROFILE_MODELS.fast],
				temperature: 0.1,
				maxTokens: 1500,
				reasoning: { enabled: false },
				signal,
				operationType: DUMP_THREAD_OPERATION,
				contextType: 'dump_sort_lab',
				projectId: input.projectId
			})) {
				if (event.type === 'text' && event.content) handle(buffer.push(event.content));
				if (event.type === 'error') throw new Error(event.error ?? 'Model stream failed');
				if (event.type === 'done') {
					model = event.model ?? null;
					const usage = (event.usage ?? null) as Record<string, unknown> | null;
					cost = usage && Number(usage.cost) ? Number(usage.cost) : null;
				}
			}
		}
		handle(buffer.flush());
		send({ type: 'thread_status', alias, t: t(), stage: 'done' });
		send({ type: 'thread_done', alias, t: t(), model, cost });
	} catch (error) {
		send({
			type: 'thread_status',
			alias,
			t: t(),
			stage: 'failed',
			note: error instanceof Error ? error.message : 'This project could not be checked'
		});
	}
}
