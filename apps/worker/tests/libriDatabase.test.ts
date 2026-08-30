import { describe, expect, it, vi } from 'vitest';
import type { PoolConfig, QueryResult } from 'pg';
import { createLibriDatabase, type LibriPgPool } from '../src/workers/libri/database';

const DATABASE_URL =
	'postgresql://libri_worker.project-ref:secret@pooler.example.com:5432/postgres';
const CA_CERTIFICATE = '-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----';

describe('Libri restricted PostgreSQL connection', () => {
	it('caps the pool and verifies the live role boundary on every probe', async () => {
		let config: PoolConfig | undefined;
		const { pool, queryMock, endMock } = fakePool(approvedRole());
		const database = createLibriDatabase(DATABASE_URL, {
			caCertificate: CA_CERTIFICATE,
			connectionLimit: 2,
			poolFactory: (received) => {
				config = received;
				return pool;
			}
		});

		await database.probe();

		expect(config).toMatchObject({
			application_name: 'buildos-libri-worker',
			max: 2,
			connectionTimeoutMillis: 5_000,
			ssl: { ca: `${CA_CERTIFICATE}\n`, rejectUnauthorized: true }
		});
		expect(queryMock).toHaveBeenCalledOnce();
		expect(queryMock.mock.calls[0]?.[0]).toContain('pg_catalog.pg_auth_members');
		expect(queryMock.mock.calls[0]?.[0]).toContain("'public.queue_jobs'");

		await database.close();
		expect(endMock).toHaveBeenCalledOnce();
	});

	it.each([
		'postgresql://service_role:secret@pooler.example.com/postgres',
		'postgresql://libri_worker@pooler.example.com/postgres',
		'https://libri_worker:secret@pooler.example.com/postgres',
		'not-a-url'
	])('rejects an unsafe connection string: %s', (databaseUrl) => {
		expect(() =>
			createLibriDatabase(databaseUrl, {
				caCertificate: CA_CERTIFICATE,
				connectionLimit: 2,
				poolFactory: () => fakePool(approvedRole()).pool
			})
		).toThrow();
	});

	it.each(['', 'not-a-certificate'])('rejects an unsafe CA certificate', (caCertificate) => {
		expect(() => createLibriDatabase(DATABASE_URL, { caCertificate })).toThrow(
			'Supabase root certificate PEM'
		);
	});

	it('rejects a live role that gained a dangerous capability', async () => {
		const { pool } = fakePool({ ...approvedRole(), bypasses_rls: true });
		const database = createLibriDatabase(DATABASE_URL, {
			caCertificate: CA_CERTIFICATE,
			poolFactory: () => pool
		});

		await expect(database.probe()).rejects.toThrow('approved restricted role');
	});

	it.each([0, 4, 1.5])('rejects pool size %s outside the database cap', (limit) => {
		expect(() =>
			createLibriDatabase(DATABASE_URL, {
				caCertificate: CA_CERTIFICATE,
				connectionLimit: limit,
				poolFactory: () => fakePool(approvedRole()).pool
			})
		).toThrow('between 1 and 3');
	});
});

function approvedRole() {
	return {
		role_name: 'libri_worker',
		can_login: true,
		is_superuser: false,
		can_create_database: false,
		can_create_role: false,
		inherits_roles: false,
		can_replicate: false,
		bypasses_rls: false,
		connection_limit: 3,
		has_memberships: false,
		can_delete_queue_jobs: false,
		can_retag_queue_jobs: false
	};
}

function fakePool(row: ReturnType<typeof approvedRole>) {
	const queryMock = vi.fn((text: string, values?: readonly unknown[]) => {
		void text;
		void values;
	});
	const endMock = vi.fn(async () => undefined);
	const releaseMock = vi.fn();
	const pool: LibriPgPool = {
		async query<T extends Record<string, unknown> = Record<string, unknown>>(
			text: string,
			values?: readonly unknown[]
		): Promise<QueryResult<T>> {
			queryMock(text, values);
			return { rows: [row] } as unknown as QueryResult<T>;
		},
		async connect() {
			return {
				query: pool.query,
				release: releaseMock
			};
		},
		end: endMock
	};
	return { pool, queryMock, endMock, releaseMock };
}
