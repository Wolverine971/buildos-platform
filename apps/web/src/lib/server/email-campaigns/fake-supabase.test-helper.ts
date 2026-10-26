// apps/web/src/lib/server/email-campaigns/fake-supabase.test-helper.ts
// In-memory stand-in for the slice of the Supabase query builder the campaign
// services use (select/insert/update/upsert/delete with eq, neq, in, is, not,
// simple ilike `or`, order, range, limit, single, maybeSingle, and rpc).
// Tests only.

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;
type RpcHandler = (args: any, db: FakeDb) => { data: any; error: any } | any;

export interface FakeDb {
	tables: Record<string, Row[]>;
	rpcs: Record<string, RpcHandler>;
	calls: Array<{ table: string; op: string; payload?: unknown }>;
}

// Column defaults the real tables apply on insert.
const TABLE_DEFAULTS: Record<string, Row> = {
	email_campaigns: {
		status: 'draft',
		subject_template: '',
		body_template: '',
		from_name: 'DJ',
		audience: {},
		tailoring_instructions: null,
		wave_size: 20,
		wave_interval_minutes: 60,
		starts_at: null,
		queued_at: null,
		completed_at: null,
		canceled_at: null,
		source: 'admin',
		metadata: {}
	},
	email_campaign_recipients: {
		name: null,
		first_name: null,
		user_id: null,
		beta_signup_id: null,
		segment: 'manual',
		context: {},
		subject_override: null,
		body_override: null,
		override_source: null,
		tailor_status: 'none',
		tailored_at: null,
		tailor_error: null,
		included: true,
		status: 'draft',
		skip_reason: null,
		scheduled_for: null,
		lease_expires_at: null,
		attempt_count: 0,
		email_id: null,
		tracking_id: null,
		message_id: null,
		sent_at: null,
		replied_at: null,
		reply_checked_at: null,
		bounced_at: null,
		error_message: null,
		source_email_id: null
	}
};

let idCounter = 0;
export function fakeId(prefix = 'id'): string {
	idCounter += 1;
	return `${prefix}-${String(idCounter).padStart(4, '0')}`;
}

function readPath(row: Row, column: string): unknown {
	// Supports jsonb text arrows like template_data->>key.
	const arrow = column.split('->>');
	if (arrow.length === 2) {
		const container = row[arrow[0]!];
		return container && typeof container === 'object' ? (container[arrow[1]!] ?? null) : null;
	}
	return row[column];
}

function parseIlikeOr(expression: string): Filter {
	const parts = expression.split(',').map((part) => {
		const [column, op, ...rest] = part.split('.');
		const value = rest.join('.');
		return { column: column!, op: op!, value };
	});
	return (row) =>
		parts.some(({ column, op, value }) => {
			const cell = readPath(row, column);
			if (op === 'ilike') {
				const needle = value.replace(/%/g, '').toLowerCase();
				return String(cell ?? '')
					.toLowerCase()
					.includes(needle);
			}
			if (op === 'is' && value === 'null') return cell === null || cell === undefined;
			return false;
		});
}

class Builder implements PromiseLike<{ data: any; error: any; count?: number }> {
	private filters: Filter[] = [];
	private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
	private payload: any = null;
	private wantSingle: 'single' | 'maybe' | null = null;
	private rangeFrom: number | null = null;
	private rangeTo: number | null = null;
	private limitCount: number | null = null;
	private orderBy: Array<{ column: string; ascending: boolean }> = [];
	private returnRows = false;

	constructor(
		private db: FakeDb,
		private table: string
	) {}

	select(_columns?: string) {
		if (this.op !== 'select') this.returnRows = true;
		return this;
	}
	insert(payload: Row | Row[]) {
		this.op = 'insert';
		this.payload = payload;
		return this;
	}
	update(payload: Row) {
		this.op = 'update';
		this.payload = payload;
		return this;
	}
	upsert(payload: Row | Row[], _options?: unknown) {
		this.op = 'upsert';
		this.payload = payload;
		return this;
	}
	delete() {
		this.op = 'delete';
		return this;
	}
	eq(column: string, value: unknown) {
		this.filters.push((row) => readPath(row, column) === value);
		return this;
	}
	neq(column: string, value: unknown) {
		this.filters.push((row) => readPath(row, column) !== value);
		return this;
	}
	in(column: string, values: unknown[]) {
		this.filters.push((row) => values.includes(readPath(row, column)));
		return this;
	}
	is(column: string, value: null) {
		this.filters.push((row) => {
			const cell = readPath(row, column);
			return value === null ? cell === null || cell === undefined : cell === value;
		});
		return this;
	}
	not(column: string, op: string, value: unknown) {
		if (op === 'is' && value === null) {
			this.filters.push((row) => {
				const cell = readPath(row, column);
				return cell !== null && cell !== undefined;
			});
		}
		return this;
	}
	or(expression: string) {
		this.filters.push(parseIlikeOr(expression));
		return this;
	}
	order(column: string, options?: { ascending?: boolean }) {
		this.orderBy.push({ column, ascending: options?.ascending !== false });
		return this;
	}
	range(from: number, to: number) {
		this.rangeFrom = from;
		this.rangeTo = to;
		return this;
	}
	limit(count: number) {
		this.limitCount = count;
		return this;
	}
	single() {
		this.wantSingle = 'single';
		return this;
	}
	maybeSingle() {
		this.wantSingle = 'maybe';
		return this;
	}

	private rows(): Row[] {
		return (this.db.tables[this.table] ??= []);
	}

	private matches(): Row[] {
		return this.rows().filter((row) => this.filters.every((filter) => filter(row)));
	}

	private shape(rows: Row[]) {
		let result = rows.map((row) => ({ ...row }));
		for (const { column, ascending } of [...this.orderBy].reverse()) {
			result = [...result].sort((a, b) => {
				const left = a[column] ?? '';
				const right = b[column] ?? '';
				if (left === right) return 0;
				return (left < right ? -1 : 1) * (ascending ? 1 : -1);
			});
		}
		if (this.rangeFrom !== null && this.rangeTo !== null) {
			result = result.slice(this.rangeFrom, this.rangeTo + 1);
		}
		if (this.limitCount !== null) result = result.slice(0, this.limitCount);
		if (this.wantSingle) {
			const first = result[0] ?? null;
			if (!first && this.wantSingle === 'single') {
				return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
			}
			return { data: first, error: null };
		}
		return { data: result, error: null };
	}

	private execute(): { data: any; error: any } {
		const now = new Date().toISOString();
		this.db.calls.push({ table: this.table, op: this.op, payload: this.payload });
		if (this.op === 'select') return this.shape(this.matches());

		if (this.op === 'insert') {
			const list = Array.isArray(this.payload) ? this.payload : [this.payload];
			const inserted = list.map((row: Row) => ({
				id: row.id ?? fakeId(this.table),
				created_at: now,
				updated_at: now,
				...(TABLE_DEFAULTS[this.table] ?? {}),
				...row
			}));
			this.rows().push(...inserted);
			return this.returnRows || this.wantSingle
				? this.shape(inserted)
				: { data: null, error: null };
		}

		if (this.op === 'upsert') {
			const list = Array.isArray(this.payload) ? this.payload : [this.payload];
			const touched: Row[] = [];
			for (const row of list) {
				const existing = this.rows().find((candidate) => candidate.id === row.id);
				if (existing) {
					Object.assign(existing, row, { updated_at: now });
					touched.push(existing);
				} else {
					const inserted = { id: row.id ?? fakeId(this.table), created_at: now, ...row };
					this.rows().push(inserted);
					touched.push(inserted);
				}
			}
			return this.returnRows ? this.shape(touched) : { data: null, error: null };
		}

		if (this.op === 'update') {
			const matched = this.matches();
			for (const row of matched) Object.assign(row, this.payload, { updated_at: now });
			return this.returnRows || this.wantSingle
				? this.shape(matched)
				: { data: null, error: null };
		}

		// delete
		const doomed = new Set(this.matches());
		this.db.tables[this.table] = this.rows().filter((row) => !doomed.has(row));
		return { data: null, error: null };
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve()
			.then(() => this.execute())
			.then(onfulfilled, onrejected);
	}
}

export function createFakeSupabase(
	tables: Record<string, Row[]> = {},
	rpcs: Record<string, RpcHandler> = {}
) {
	const db: FakeDb = { tables, rpcs, calls: [] };
	const client = {
		from: (table: string) => new Builder(db, table),
		rpc: async (name: string, args: unknown) => {
			const handler = db.rpcs[name];
			if (!handler) return { data: null, error: { message: `no rpc ${name}` } };
			const result = handler(args, db);
			return result && typeof result === 'object' && 'data' in result
				? result
				: { data: result, error: null };
		}
	};
	return { db, client: client as any };
}
