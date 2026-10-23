// apps/web/src/lib/server/agent-call/cross-user-isolation.test-helpers.ts
//
// Test-only in-memory stand-in for the service-role Supabase client, used by
// cross-user-isolation.test.ts. It honors the PostgREST filters the gateway uses
// (eq / in / is / not / or / ilike / contains / range ...) over seeded rows, and is
// LEAKY by default: a filter it can't evaluate (JSON paths, full-text search,
// nested or() groups) passes every row. So a handler that forgets its project
// filter returns another user's rows here and the isolation test fails, instead
// of the fake silently hiding the leak.
//
// Every write (insert / update / upsert / delete, and every RPC) is recorded so a
// test can assert nothing touched rows in a project the caller may not write.

export type FakeRow = Record<string, any>;
type Predicate = (row: FakeRow) => boolean;
export type FakeRpcHandler = (
	args: Record<string, unknown>,
	db: FakeDb
) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;

export type FakeWrite = {
	table: string;
	kind: 'insert' | 'update' | 'upsert' | 'delete';
	/** Rows as they were before the write (update/delete) or as inserted. */
	rows: FakeRow[];
	patch?: FakeRow;
};

export type FakeRpcCall = { name: string; args: Record<string, unknown> };

let idCounter = 0;
function nextId(): string {
	idCounter += 1;
	const hex = idCounter.toString(16).padStart(12, '0');
	return `fa4e0000-0000-4000-8000-${hex}`;
}

function clone<T>(value: T): T {
	return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function readColumn(row: FakeRow, column: string): { known: boolean; value: unknown } {
	// JSON paths (props->>x), casts and embedded resources are not modelled: leaky.
	if (/->|::|\./.test(column)) return { known: false, value: undefined };
	return { known: true, value: row[column] };
}

function parseInList(raw: string): string[] {
	const trimmed = raw.trim().replace(/^\(/, '').replace(/\)$/, '');
	if (!trimmed) return [];
	return trimmed.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));
}

function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
	// PostgREST accepts * for %; escaped wildcards (backslash-% or -_) match literally.
	let escaped = '';
	for (let i = 0; i < pattern.length; i += 1) {
		const char = pattern[i]!;
		if (char === '\\' && i + 1 < pattern.length) {
			escaped += pattern[i + 1]!.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
			i += 1;
		} else if (char === '%' || char === '*') escaped += '.*';
		else if (char === '_') escaped += '.';
		else escaped += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${escaped}$`, caseInsensitive ? 'is' : 's');
}

function compareValues(op: string, left: unknown, right: unknown): boolean {
	if (left === undefined || left === null) return false;
	const l = typeof left === 'number' ? left : String(left);
	const r = typeof left === 'number' ? Number(right) : String(right);
	switch (op) {
		case 'gt':
			return l > r;
		case 'gte':
			return l >= r;
		case 'lt':
			return l < r;
		case 'lte':
			return l <= r;
		default:
			return true;
	}
}

function coerceIsValue(value: unknown): unknown {
	if (value === 'null') return null;
	if (value === 'true') return true;
	if (value === 'false') return false;
	return value;
}

/** One `col.op.value` term from a PostgREST or()/filter string; null when unknown. */
function termPredicate(term: string): Predicate | null {
	const match = /^([a-zA-Z0-9_]+)\.(not\.)?([a-z]+)\.(.*)$/s.exec(term.trim());
	if (!match) return null;
	const column = match[1] ?? '';
	const negated = match[2];
	const op = match[3] ?? '';
	const quotedValue = match[4] ?? '';
	// PostgREST quotes values with reserved characters: "…", with \" and \\ escapes.
	const rawValue = /^".*"$/s.test(quotedValue)
		? quotedValue.slice(1, -1).replace(/\\(.)/g, '$1')
		: quotedValue;
	let predicate: Predicate | null = null;
	switch (op) {
		case 'eq':
			predicate = (row) => String(row[column]) === rawValue;
			break;
		case 'neq':
			predicate = (row) => String(row[column]) !== rawValue;
			break;
		case 'is':
			predicate = (row) => (row[column] ?? null) === coerceIsValue(rawValue);
			break;
		case 'in': {
			const values = parseInList(rawValue);
			predicate = (row) => values.includes(String(row[column]));
			break;
		}
		case 'ilike':
		case 'like': {
			const regex = likeToRegExp(rawValue, op === 'ilike');
			predicate = (row) => typeof row[column] === 'string' && regex.test(row[column]);
			break;
		}
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte':
			predicate = (row) => compareValues(op, row[column], rawValue);
			break;
		default:
			return null;
	}
	return negated ? (row) => !predicate!(row) : predicate;
}

/** Split a PostgREST logic string on top-level commas. */
function splitTopLevel(expression: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of expression) {
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	if (current) parts.push(current);
	return parts;
}

function orPredicate(expression: string): Predicate {
	const terms = splitTopLevel(expression).map(termPredicate);
	// Any term we can't evaluate makes the whole or() leaky.
	if (terms.some((term) => term === null)) return () => true;
	return (row) => terms.some((term) => term!(row));
}

function containsValue(haystack: unknown, needle: unknown): boolean {
	if (Array.isArray(needle)) {
		return Array.isArray(haystack) && needle.every((item) => haystack.includes(item));
	}
	if (needle && typeof needle === 'object') {
		if (!haystack || typeof haystack !== 'object') return false;
		return Object.entries(needle as Record<string, unknown>).every(([key, value]) =>
			containsValue((haystack as Record<string, unknown>)[key], value)
		);
	}
	return haystack === needle;
}

class FakeQuery implements PromiseLike<any> {
	private predicates: Predicate[] = [];
	private kind: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
	private payload: FakeRow[] = [];
	private patch: FakeRow = {};
	private returning = false;
	private countMode: string | null = null;
	private head = false;
	private orderBy: Array<{ column: string; ascending: boolean }> = [];
	private limitCount: number | null = null;
	private rangeFrom: number | null = null;
	private rangeTo: number | null = null;
	private singleMode: 'single' | 'maybeSingle' | null = null;
	private upsertConflict: string[] = ['id'];
	private columns = '';

	constructor(
		private db: FakeDb,
		private table: string
	) {}

	select(columns?: string, options?: { count?: string; head?: boolean }) {
		if (this.kind !== 'select') this.returning = true;
		this.columns = columns ?? '';
		if (options?.count) this.countMode = options.count;
		if (options?.head) this.head = true;
		return this;
	}
	insert(values: FakeRow | FakeRow[]) {
		this.kind = 'insert';
		this.payload = (Array.isArray(values) ? values : [values]).map((row) => clone(row));
		return this;
	}
	upsert(values: FakeRow | FakeRow[], options?: { onConflict?: string }) {
		this.kind = 'upsert';
		this.payload = (Array.isArray(values) ? values : [values]).map((row) => clone(row));
		if (options?.onConflict) {
			this.upsertConflict = options.onConflict.split(',').map((part) => part.trim());
		}
		return this;
	}
	update(values: FakeRow) {
		this.kind = 'update';
		this.patch = clone(values);
		return this;
	}
	delete() {
		this.kind = 'delete';
		return this;
	}

	private log(entry: string) {
		this.db.queryLog.push(`${this.table}: ${entry}`);
	}

	private where(column: string, test: (value: unknown) => boolean) {
		this.log(`filter ${column}`);
		this.predicates.push((row) => {
			const { known, value } = readColumn(row, column);
			return known ? test(value) : true;
		});
		return this;
	}
	eq(column: string, value: unknown) {
		return this.where(column, (current) =>
			value === null ? current == null : String(current) === String(value)
		);
	}
	neq(column: string, value: unknown) {
		return this.where(column, (current) => String(current) !== String(value));
	}
	in(column: string, values: unknown[]) {
		const set = new Set((values ?? []).map(String));
		return this.where(column, (current) => set.has(String(current)));
	}
	is(column: string, value: unknown) {
		return this.where(column, (current) => (current ?? null) === coerceIsValue(value));
	}
	not(column: string, operator: string, value: unknown) {
		if (operator === 'is') {
			return this.where(column, (current) => (current ?? null) !== coerceIsValue(value));
		}
		if (operator === 'in') {
			const values = Array.isArray(value) ? value.map(String) : parseInList(String(value));
			return this.where(column, (current) => !values.includes(String(current)));
		}
		if (operator === 'eq') {
			return this.where(column, (current) => String(current) !== String(value));
		}
		return this;
	}
	gt(column: string, value: unknown) {
		return this.where(column, (current) => compareValues('gt', current, value));
	}
	gte(column: string, value: unknown) {
		return this.where(column, (current) => compareValues('gte', current, value));
	}
	lt(column: string, value: unknown) {
		return this.where(column, (current) => compareValues('lt', current, value));
	}
	lte(column: string, value: unknown) {
		return this.where(column, (current) => compareValues('lte', current, value));
	}
	ilike(column: string, pattern: string) {
		const regex = likeToRegExp(pattern, true);
		return this.where(column, (current) => typeof current === 'string' && regex.test(current));
	}
	like(column: string, pattern: string) {
		const regex = likeToRegExp(pattern, false);
		return this.where(column, (current) => typeof current === 'string' && regex.test(current));
	}
	contains(column: string, value: unknown) {
		return this.where(column, (current) => containsValue(current, value));
	}
	overlaps(column: string, values: unknown[]) {
		return this.where(
			column,
			(current) => Array.isArray(current) && current.some((item) => values.includes(item))
		);
	}
	match(values: Record<string, unknown>) {
		for (const [column, value] of Object.entries(values)) this.eq(column, value);
		return this;
	}
	or(expression: string) {
		this.log(`or ${expression}`);
		this.predicates.push(orPredicate(expression));
		return this;
	}
	filter(column: string, operator: string, value: unknown) {
		const predicate = termPredicate(`${column}.${operator}.${String(value)}`);
		if (predicate) this.predicates.push(predicate);
		return this;
	}
	textSearch() {
		return this;
	}
	order(column: string, options?: { ascending?: boolean }) {
		if (!/->|\./.test(column)) {
			this.orderBy.push({ column, ascending: options?.ascending !== false });
		}
		return this;
	}
	limit(count: number) {
		this.limitCount = count;
		return this;
	}
	range(from: number, to: number) {
		this.rangeFrom = from;
		this.rangeTo = to;
		return this;
	}
	abortSignal() {
		return this;
	}
	returns() {
		return this;
	}
	throwOnError() {
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

	private matches(row: FakeRow): boolean {
		return this.predicates.every((predicate) => predicate(row));
	}

	private execute(): { data: unknown; error: unknown; count?: number | null } {
		const rows = this.db.table(this.table);
		let result: FakeRow[] = [];

		if (this.kind === 'insert') {
			const inserted = this.payload.map((row) => ({ id: row.id ?? nextId(), ...row }));
			rows.push(...inserted.map((row) => clone(row)));
			this.db.writes.push({ table: this.table, kind: 'insert', rows: clone(inserted) });
			result = inserted;
		} else if (this.kind === 'upsert') {
			const written: FakeRow[] = [];
			for (const row of this.payload) {
				const existing = rows.find((candidate) =>
					this.upsertConflict.every(
						(column) => String(candidate[column]) === String(row[column])
					)
				);
				if (existing) {
					Object.assign(existing, row);
					written.push(clone(existing));
				} else {
					const next = { id: row.id ?? nextId(), ...row };
					rows.push(clone(next));
					written.push(next);
				}
			}
			this.db.writes.push({ table: this.table, kind: 'upsert', rows: clone(written) });
			result = written;
		} else if (this.kind === 'update') {
			const targets = rows.filter((row) => this.matches(row));
			this.db.writes.push({
				table: this.table,
				kind: 'update',
				rows: clone(targets),
				patch: clone(this.patch)
			});
			for (const row of targets) Object.assign(row, clone(this.patch));
			result = targets.map((row) => clone(row));
		} else if (this.kind === 'delete') {
			const targets = rows.filter((row) => this.matches(row));
			this.db.writes.push({ table: this.table, kind: 'delete', rows: clone(targets) });
			this.db.tables[this.table] = rows.filter((row) => !targets.includes(row));
			result = targets.map((row) => clone(row));
		} else {
			result = rows.filter((row) => this.matches(row)).map((row) => clone(row));
		}
		// Embedded resources (`actor:onto_actors!fk(...)`) resolve only when selected.
		for (const embed of this.db.embeds[this.table] ?? []) {
			if (!this.columns.includes(`${embed.alias}:`)) continue;
			result = result.map((row) => ({ ...row, [embed.alias]: embed.resolve(row, this.db) }));
		}

		for (const { column, ascending } of [...this.orderBy].reverse()) {
			result.sort((a, b) => {
				const left = a[column];
				const right = b[column];
				if (left === right) return 0;
				if (left === undefined || left === null) return 1;
				if (right === undefined || right === null) return -1;
				return (left > right ? 1 : -1) * (ascending ? 1 : -1);
			});
		}
		const total = result.length;
		if (this.rangeFrom !== null && this.rangeTo !== null) {
			result = result.slice(this.rangeFrom, this.rangeTo + 1);
		}
		if (this.limitCount !== null) result = result.slice(0, this.limitCount);

		const count = this.countMode ? total : null;
		if (this.kind !== 'select' && !this.returning && !this.singleMode) {
			return { data: null, error: null, count };
		}
		if (this.head) return { data: null, error: null, count };
		if (this.singleMode === 'single') {
			return result.length === 1
				? { data: result[0], error: null, count }
				: {
						data: null,
						error: {
							code: 'PGRST116',
							message: `expected 1 row, got ${result.length}`
						},
						count
					};
		}
		if (this.singleMode === 'maybeSingle') {
			if (result.length > 1) {
				return {
					data: null,
					error: { code: 'PGRST116', message: 'multiple rows returned' },
					count
				};
			}
			return { data: result[0] ?? null, error: null, count };
		}
		return { data: result, error: null, count };
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

class FakeRpc implements PromiseLike<any> {
	private singleMode = false;
	constructor(
		private db: FakeDb,
		private name: string,
		private args: Record<string, unknown>
	) {}
	abortSignal() {
		return this;
	}
	single() {
		this.singleMode = true;
		return this;
	}
	maybeSingle() {
		this.singleMode = true;
		return this;
	}
	select() {
		return this;
	}
	returns() {
		return this;
	}
	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve()
			.then(async () => {
				this.db.rpcCalls.push({ name: this.name, args: clone(this.args) });
				const handler = this.db.rpcs[this.name];
				if (!handler) {
					return {
						data: null,
						error: { code: 'FAKE_RPC', message: `rpc ${this.name} is not modelled` }
					};
				}
				const result = await handler(this.args, this.db);
				if (this.singleMode && Array.isArray(result.data)) {
					return { ...result, data: result.data[0] ?? null };
				}
				return result;
			})
			.then(onfulfilled, onrejected);
	}
}

export class FakeDb {
	tables: Record<string, FakeRow[]> = {};
	rpcs: Record<string, FakeRpcHandler> = {};
	writes: FakeWrite[] = [];
	rpcCalls: FakeRpcCall[] = [];
	/** Embedded resources per table, attached only when a select names their alias. */
	embeds: Record<
		string,
		Array<{ alias: string; resolve: (row: FakeRow, db: FakeDb) => unknown }>
	> = {};
	/** Filter calls in order, for debugging a test. */
	queryLog: string[] = [];
	/** Tables read during the test, for debugging. */
	reads = new Set<string>();

	constructor(seed: Record<string, FakeRow[]> = {}) {
		for (const [table, rows] of Object.entries(seed)) this.tables[table] = clone(rows);
	}

	table(name: string): FakeRow[] {
		if (!this.tables[name]) this.tables[name] = [];
		return this.tables[name];
	}

	from = (table: string) => {
		this.reads.add(table);
		return new FakeQuery(this, table);
	};

	rpc = (name: string, args: Record<string, unknown> = {}) => new FakeRpc(this, name, args);

	/** Storage is never exercised by these tests; any use is a visible failure. */
	storage = {
		from: () => ({
			createSignedUrl: async () => ({
				data: null,
				error: { message: 'storage not modelled' }
			}),
			createSignedUrls: async () => ({
				data: null,
				error: { message: 'storage not modelled' }
			})
		})
	};
}
