// apps/web/src/lib/services/errorLogger.service.test.ts
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ErrorLoggerService } from './errorLogger.service';

type ErrorRow = {
	id: string;
	endpoint: string | null;
	error_message: string | null;
	operation_type: string | null;
	metadata: Record<string, unknown> | null;
	severity: 'critical' | 'error' | 'warning' | 'info';
	resolved: boolean;
	created_at: string;
	user_id?: string | null;
};

type UserRow = {
	id: string;
	email: string;
	name?: string | null;
};

class FakeQuery<T extends Record<string, any>>
	implements PromiseLike<{ data: T[] | T | null; error: null }>
{
	private filters: Array<(row: T) => boolean> = [];
	private orderColumn: string | null = null;
	private ascending = true;
	private rangeStart: number | null = null;
	private rangeEnd: number | null = null;
	private isSingle = false;

	constructor(private readonly rows: T[]) {}

	select(_columns: string) {
		return this;
	}

	order(column: string, options?: { ascending?: boolean }) {
		this.orderColumn = column;
		this.ascending = options?.ascending ?? true;
		return this;
	}

	range(start: number, end: number) {
		this.rangeStart = start;
		this.rangeEnd = end;
		return this;
	}

	eq(column: string, value: unknown) {
		this.filters.push((row) => row[column] === value);
		return this;
	}

	in(column: string, values: unknown[]) {
		this.filters.push((row) => values.includes(row[column]));
		return this;
	}

	single() {
		this.isSingle = true;
		return this;
	}

	private async execute() {
		let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));

		if (this.orderColumn) {
			const column = this.orderColumn;
			data = [...data].sort((a, b) => {
				const left = a[column];
				const right = b[column];
				if (left === right) return 0;
				if (left == null) return this.ascending ? -1 : 1;
				if (right == null) return this.ascending ? 1 : -1;
				return left > right ? (this.ascending ? 1 : -1) : this.ascending ? -1 : 1;
			});
		}

		if (this.rangeStart !== null && this.rangeEnd !== null) {
			data = data.slice(this.rangeStart, this.rangeEnd + 1);
		}

		return {
			data: this.isSingle ? (data[0] ?? null) : data,
			error: null
		};
	}

	then<TResult1 = { data: T[] | T | null; error: null }, TResult2 = never>(
		onfulfilled?:
			| ((value: { data: T[] | T | null; error: null }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	): Promise<TResult1 | TResult2> {
		return this.execute().then(onfulfilled, onrejected);
	}
}

class FakeSupabase {
	constructor(
		private readonly tables: {
			error_logs: ErrorRow[];
			users: UserRow[];
		}
	) {}

	from(table: 'error_logs' | 'users') {
		return new FakeQuery(this.tables[table]);
	}
}

function makeNoiseError(id: string, createdAt: string): ErrorRow {
	return {
		id,
		endpoint: '/wp-admin/setup-config.php',
		error_message: 'Not found: /wp-admin/setup-config.php',
		operation_type: 'hooks.handle_error',
		metadata: { routeId: null },
		severity: 'warning',
		resolved: false,
		created_at: createdAt
	};
}

function makeVisibleError(
	id: string,
	createdAt: string,
	overrides: Partial<ErrorRow> = {}
): ErrorRow {
	return {
		id,
		endpoint: '/admin/errors',
		error_message: 'Request failed with status 500',
		operation_type: 'hooks.handle_error',
		metadata: { routeId: '/admin/errors', status: 500 },
		severity: 'error',
		resolved: false,
		created_at: createdAt,
		...overrides
	};
}

function createService(errorLogs: ErrorRow[], users: UserRow[] = []) {
	return ErrorLoggerService.getInstance(
		new FakeSupabase({
			error_logs: errorLogs,
			users
		}) as unknown as SupabaseClient<Database>
	);
}

describe('ErrorLoggerService', () => {
	it('scans past suppressed noise and paginates displayable errors', async () => {
		const baseTime = Date.parse('2026-04-03T12:00:00.000Z');
		const noise = Array.from({ length: 260 }, (_, index) =>
			makeNoiseError(`noise-${index + 1}`, new Date(baseTime - index * 1000).toISOString())
		);
		const actionable = [
			makeVisibleError('visible-1', new Date(baseTime - 261_000).toISOString(), {
				user_id: 'user-1'
			}),
			makeVisibleError('visible-2', new Date(baseTime - 262_000).toISOString())
		];
		const service = createService(
			[...noise, ...actionable],
			[{ id: 'user-1', email: 'ops@example.com', name: 'Ops' }]
		);

		const firstPage = await service.getRecentErrorsPage(1, 1, { resolved: false });
		const secondPage = await service.getRecentErrorsPage(2, 1, { resolved: false });

		expect(firstPage.errors.map((error) => error.id)).toEqual(['visible-1']);
		expect(firstPage.errors[0]?.user?.email).toBe('ops@example.com');
		expect(firstPage.hasMore).toBe(true);
		expect(secondPage.errors.map((error) => error.id)).toEqual(['visible-2']);
		expect(secondPage.hasMore).toBe(false);
	});

	it('counts only displayable errors in the summary', async () => {
		const now = Date.parse('2026-04-03T12:00:00.000Z');
		const service = createService([
			makeNoiseError('noise-1', new Date(now - 1_000).toISOString()),
			makeVisibleError('visible-open', new Date(now - 5 * 60 * 1000).toISOString()),
			makeVisibleError('visible-critical', new Date(now - 2 * 60 * 60 * 1000).toISOString(), {
				severity: 'critical'
			}),
			makeVisibleError(
				'visible-resolved',
				new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
				{
					resolved: true,
					severity: 'warning'
				}
			)
		]);

		const summary = await service.getErrorSummary();

		expect(summary).toEqual({
			total_errors: 3,
			unresolved_errors: 2,
			critical_errors: 1,
			errors_last_24h: 2,
			error_trend: 0
		});
	});
});
