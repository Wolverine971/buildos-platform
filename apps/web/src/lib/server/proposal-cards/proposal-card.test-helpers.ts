// apps/web/src/lib/server/proposal-cards/proposal-card.test-helpers.ts
//
// Test-only fakes for the proposal-card resolver: a minimal PostgREST-shaped
// table store that enforces the chat_turn_effects ledger rules the resolver
// relies on (unique ids, insert as reserved, terminal rows immutable, uncertain
// rows undeletable), plus card fixtures.
import {
	buildProposalCardEnvelopeV1,
	type ProposalCardKind
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';

type Row = Record<string, any>;

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const IDS = {
	USER: id(1),
	OTHER_USER: id(2),
	SESSION: id(3),
	OTHER_SESSION: id(4),
	CARD: id(5),
	TURN: id(6),
	CHILD: id(7),
	PARENT: id(8),
	SOURCE: id(9),
	DEST: id(10),
	ALICE: id(11),
	ALICE_MEMBER: id(12),
	OWNER: id(13),
	EVENT: id(14),
	FOLDER: id(15)
};

export const PROPOSED_AT = '2026-10-17T12:00:00.000Z';
export const NOW = new Date('2026-10-17T12:05:00.000Z');

export function fakeDb(tables: Record<string, Row[]>, options: { now?: () => Date } = {}) {
	const writes: Array<{ table: string; op: string; row?: Row }> = [];
	const now = options.now ?? (() => NOW);
	function from(table: string) {
		const rows = (tables[table] ??= []);
		const filters: Array<(row: Row) => boolean> = [];
		let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
		let payload: Row | null = null;
		const matching = () => rows.filter((row) => filters.every((f) => f(row)));
		const run = async () => {
			if (op === 'insert') {
				if (rows.some((row) => row.id === payload!.id))
					return { data: null, error: { code: '23505', message: 'duplicate key' } };
				if (
					table === 'chat_turn_effects' &&
					payload!.state &&
					payload!.state !== 'reserved'
				)
					return {
						data: null,
						error: { message: 'agentic_chat_effect_must_start_reserved' }
					};
				const row = {
					...(table === 'chat_turn_effects'
						? {
								state: 'reserved',
								reserved_at: now().toISOString(),
								started_at: null,
								finished_at: null,
								downstream_receipt: null,
								failure_code: null
							}
						: {}),
					...payload
				};
				rows.push(row);
				writes.push({ table, op, row: { ...row } });
				return { data: { ...row }, error: null };
			}
			if (op === 'update') {
				for (const row of matching()) {
					if (
						table === 'chat_turn_effects' &&
						['succeeded', 'failed', 'cancelled'].includes(row.state)
					)
						return {
							data: null,
							error: { message: 'agentic_chat_effect_terminal_is_immutable' }
						};
					Object.assign(row, payload);
					writes.push({ table, op, row: { ...row } });
				}
				return { data: null, error: null };
			}
			if (op === 'delete') {
				for (const row of matching()) {
					if (table === 'chat_turn_effects' && row.state === 'uncertain')
						return {
							data: null,
							error: { message: 'agentic_chat_uncertain_effect_cannot_be_deleted' }
						};
					rows.splice(rows.indexOf(row), 1);
					writes.push({ table, op, row: { ...row } });
				}
				return { data: null, error: null };
			}
			return { data: matching().map((row) => ({ ...row })), error: null };
		};
		const query: any = {
			select: () => query,
			insert: (row: Row) => ((op = 'insert'), (payload = row), query),
			update: (patch: Row) => ((op = 'update'), (payload = patch), query),
			delete: () => ((op = 'delete'), query),
			eq: (key: string, value: unknown) => (filters.push((row) => row[key] === value), query),
			in: (key: string, values: unknown[]) => (
				filters.push((row) => values.includes(row[key])),
				query
			),
			is: (key: string, value: unknown) => (
				filters.push((row) => (row[key] ?? null) === value),
				query
			),
			maybeSingle: async () => {
				const result = await run();
				if (result.error) return result;
				const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
				return { data, error: null };
			},
			single: async () => {
				const result = await run();
				if (result.error) return result;
				const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
				return { data, error: data ? null : { message: 'no rows' } };
			},
			then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
				run().then(resolve, reject)
		};
		return query;
	}
	return { from, tables, writes, client: { from } as any };
}

export function cardRow(input: {
	kind: ProposalCardKind;
	toolName: string;
	payload: unknown;
	arguments: Record<string, unknown>;
	extra?: Record<string, unknown>;
}) {
	const envelope = buildProposalCardEnvelopeV1({
		kind: input.kind,
		cardId: IDS.CARD,
		sessionId: IDS.SESSION,
		proposedAt: PROPOSED_AT,
		payload: input.payload,
		message: 'Needs your choice.'
	});
	return {
		id: IDS.CARD,
		session_id: IDS.SESSION,
		turn_run_id: IDS.TURN,
		tool_name: input.toolName,
		success: true,
		arguments: input.arguments,
		result: JSON.parse(JSON.stringify({ ...envelope, ...input.extra })),
		created_at: PROPOSED_AT
	};
}

export function turnRow(status = 'completed') {
	return {
		id: IDS.TURN,
		session_id: IDS.SESSION,
		user_id: IDS.USER,
		status,
		execution_generation: 2
	};
}

/** Lets a test hold one call open until another call is waiting. */
export function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}
