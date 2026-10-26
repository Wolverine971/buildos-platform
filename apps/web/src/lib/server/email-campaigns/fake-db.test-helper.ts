// apps/web/src/lib/server/email-campaigns/fake-db.test-helper.ts
// Tiny in-memory stand-in for the Supabase query builder, for email-campaign
// tests. Supports the chains the campaign services use: select (incl. count/head),
// update, insert, delete, eq/neq/lt/lte/gt/gte/in/is, order, limit, single,
// maybeSingle, and rpc via registered handlers.

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;
type RpcHandler = (args: Record<string, any>, db: FakeDb) => { data: any; error: any };

export class FakeDb {
	tables: Record<string, Row[]>;
	rpcHandlers: Record<string, RpcHandler> = {};
	rpcCalls: Array<{ name: string; args: Record<string, any> }> = [];
	/** Make the next query against a table fail with this message. */
	failures: Record<string, string> = {};

	constructor(tables: Record<string, Row[]> = {}) {
		this.tables = tables;
	}

	table(name: string): Row[] {
		this.tables[name] ??= [];
		return this.tables[name]!;
	}

	from(name: string) {
		return new FakeQuery(this, name);
	}

	async rpc(name: string, args: Record<string, any> = {}) {
		this.rpcCalls.push({ name, args });
		const handler = this.rpcHandlers[name];
		if (!handler) return { data: null, error: null };
		return handler(args, this);
	}
}

class FakeQuery implements PromiseLike<{ data: any; error: any; count?: number | null }> {
	private op: 'select' | 'update' | 'insert' | 'delete' = 'select';
	private patch: Row | Row[] | null = null;
	private filters: Filter[] = [];
	private returnRows = false;
	private countMode = false;
	private head = false;
	private limitN: number | null = null;
	private orderBy: { column: string; ascending: boolean; nullsFirst: boolean } | null = null;
	private singleMode: 'single' | 'maybeSingle' | null = null;

	constructor(
		private db: FakeDb,
		private name: string
	) {}

	select(_columns?: string, options?: { count?: string; head?: boolean }) {
		if (this.op === 'select') {
			this.countMode = Boolean(options?.count);
			this.head = Boolean(options?.head);
		} else {
			this.returnRows = true;
		}
		return this;
	}

	update(patch: Row) {
		this.op = 'update';
		this.patch = patch;
		return this;
	}

	insert(rows: Row | Row[]) {
		this.op = 'insert';
		this.patch = rows;
		return this;
	}

	delete() {
		this.op = 'delete';
		return this;
	}

	eq(column: string, value: unknown) {
		this.filters.push((row) => row[column] === value);
		return this;
	}

	neq(column: string, value: unknown) {
		this.filters.push((row) => row[column] !== value);
		return this;
	}

	lt(column: string, value: any) {
		this.filters.push((row) => row[column] != null && row[column] < value);
		return this;
	}

	lte(column: string, value: any) {
		this.filters.push((row) => row[column] != null && row[column] <= value);
		return this;
	}

	gt(column: string, value: any) {
		this.filters.push((row) => row[column] != null && row[column] > value);
		return this;
	}

	gte(column: string, value: any) {
		this.filters.push((row) => row[column] != null && row[column] >= value);
		return this;
	}

	in(column: string, values: unknown[]) {
		this.filters.push((row) => values.includes(row[column]));
		return this;
	}

	is(column: string, value: null | boolean) {
		this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
		return this;
	}

	order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
		this.orderBy = {
			column,
			ascending: options.ascending ?? true,
			nullsFirst: options.nullsFirst ?? false
		};
		return this;
	}

	limit(n: number) {
		this.limitN = n;
		return this;
	}

	single() {
		this.singleMode = 'single';
		return this;
	}

	maybeSingle() {
		this.singleMode = 'maybeSingle';
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
	}

	private matches(): Row[] {
		return this.db
			.table(this.name)
			.filter((row) => this.filters.every((filter) => filter(row)));
	}

	private execute(): { data: any; error: any; count?: number | null } {
		const failure = this.db.failures[this.name];
		if (failure) {
			delete this.db.failures[this.name];
			return { data: null, error: { message: failure } };
		}

		if (this.op === 'insert') {
			const rows = (Array.isArray(this.patch) ? this.patch : [this.patch]) as Row[];
			this.db.table(this.name).push(...rows.map((row) => ({ ...row })));
			return { data: this.returnRows ? rows : null, error: null };
		}

		if (this.op === 'update') {
			const matched = this.matches();
			for (const row of matched) Object.assign(row, this.patch);
			return {
				data: this.returnRows ? matched.map((row) => ({ ...row })) : null,
				error: null
			};
		}

		if (this.op === 'delete') {
			const matched = new Set(this.matches());
			const remaining = this.db.table(this.name).filter((row) => !matched.has(row));
			this.db.tables[this.name] = remaining;
			return { data: null, error: null };
		}

		let rows = this.matches().map((row) => ({ ...row }));
		if (this.orderBy) {
			const { column, ascending, nullsFirst } = this.orderBy;
			rows.sort((a, b) => {
				const av = a[column];
				const bv = b[column];
				if (av == null && bv == null) return 0;
				if (av == null) return nullsFirst ? -1 : 1;
				if (bv == null) return nullsFirst ? 1 : -1;
				return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1);
			});
		}
		if (this.limitN !== null) rows = rows.slice(0, this.limitN);
		if (this.countMode) {
			return { data: this.head ? null : rows, error: null, count: rows.length };
		}
		if (this.singleMode) {
			if (rows.length === 0) {
				return this.singleMode === 'single'
					? { data: null, error: { code: 'PGRST116', message: 'not found' } }
					: { data: null, error: null };
			}
			return { data: rows[0], error: null };
		}
		return { data: rows, error: null };
	}
}

/** claim_email_campaign_sends, as the SQL does it (minus locking). */
export function registerClaimRpc(db: FakeDb, now: () => Date = () => new Date()): void {
	db.rpcHandlers.claim_email_campaign_sends = (args, fake) => {
		const nowIso = now().toISOString();
		const campaigns = new Map(fake.table('email_campaigns').map((c) => [c.id, c]));
		const due = fake
			.table('email_campaign_recipients')
			.filter(
				(row) =>
					row.status === 'queued' &&
					row.included !== false &&
					row.scheduled_for <= nowIso &&
					campaigns.get(row.campaign_id)?.status === 'sending'
			)
			.sort((a, b) => (a.scheduled_for < b.scheduled_for ? -1 : 1))
			.slice(0, args.p_limit);
		const lease = new Date(
			now().getTime() + (args.p_lease_seconds ?? 120) * 1000
		).toISOString();
		for (const row of due) {
			row.status = 'sending';
			row.lease_expires_at = lease;
			row.attempt_count = (row.attempt_count ?? 0) + 1;
		}
		return { data: due.map((row) => ({ ...row })), error: null };
	};
}
