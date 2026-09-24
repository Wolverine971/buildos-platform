// apps/web/src/lib/test-helpers/fake-user-data-exports.ts
// In-memory stand-in for the user-scoped Supabase client in the Your data route
// tests: user_data_exports reads (eq/neq/gt/order/limit/maybeSingle/count) and rpc.
import { vi } from 'vitest';
import type { UserDataExportRow } from '$lib/privacy/user-data';

type Filter = (row: UserDataExportRow) => boolean;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

export function exportRow(overrides: Partial<UserDataExportRow> = {}): UserDataExportRow {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		user_id: 'user-1',
		status: 'queued',
		storage_path: null,
		byte_size: null,
		part_count: null,
		error_code: null,
		requested_at: new Date().toISOString(),
		started_at: null,
		completed_at: null,
		expires_at: null,
		...overrides
	};
}

export function fakeUserClient(
	rows: UserDataExportRow[],
	rpc: (name: string) => RpcResult = () => ({ data: null, error: null })
) {
	const rpcCalls: string[] = [];
	const client = {
		rpc: vi.fn(async (name: string) => {
			rpcCalls.push(name);
			return rpc(name);
		}),
		from(table: string) {
			if (table !== 'user_data_exports') throw new Error(`unexpected table ${table}`);
			const filters: Filter[] = [];
			let head = false;
			let limit = Infinity;
			let descending: keyof UserDataExportRow | null = null;
			let single = false;
			const run = () => {
				let result = rows.filter((row) => filters.every((filter) => filter(row)));
				if (descending) {
					const key = descending;
					result = [...result].sort((a, b) =>
						String(b[key] ?? '').localeCompare(String(a[key] ?? ''))
					);
				}
				result = result.slice(0, limit);
				if (head) return { data: null, count: result.length, error: null };
				if (single) return { data: result[0] ?? null, error: null };
				return { data: result, error: null };
			};
			const builder = {
				select(_columns: string, options?: { head?: boolean }) {
					head = options?.head === true;
					return builder;
				},
				eq(column: keyof UserDataExportRow, value: unknown) {
					filters.push((row) => row[column] === value);
					return builder;
				},
				neq(column: keyof UserDataExportRow, value: unknown) {
					filters.push((row) => row[column] !== value);
					return builder;
				},
				gt(column: keyof UserDataExportRow, value: string) {
					filters.push((row) => String(row[column] ?? '') > value);
					return builder;
				},
				order(column: keyof UserDataExportRow, options?: { ascending?: boolean }) {
					if (options?.ascending === false) descending = column;
					return builder;
				},
				limit(count: number) {
					limit = count;
					return builder;
				},
				maybeSingle() {
					single = true;
					return Promise.resolve(run());
				},
				then<T>(resolve: (value: ReturnType<typeof run>) => T) {
					return Promise.resolve(run()).then(resolve);
				}
			};
			return builder;
		}
	};
	return { client, rpcCalls };
}

export function routeEvent(
	client: unknown,
	options: { userId?: string | null; params?: Record<string, string>; url?: string } = {}
) {
	const userId = options.userId === undefined ? 'user-1' : options.userId;
	return {
		params: options.params ?? {},
		url: new URL(options.url ?? 'https://build-os.test/api/account/exports'),
		request: new Request(options.url ?? 'https://build-os.test/api/account/exports'),
		route: { id: '/api/account/exports' },
		locals: {
			supabase: client,
			safeGetSession: vi
				.fn()
				.mockResolvedValue(
					userId ? { user: { id: userId } } : { session: null, user: null }
				)
		}
	};
}
