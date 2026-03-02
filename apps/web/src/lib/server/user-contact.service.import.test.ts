// apps/web/src/lib/server/user-contact.service.import.test.ts
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	commitUserContactCsvImport,
	previewUserContactCsvImport,
	resolveSensitiveContactExposure
} from './user-contact.service';
import type { ContactImportNormalizedInput } from '$lib/types/profile-contacts';

function hashValue(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function createSupabaseStub(dataByTable: Record<string, Record<string, any>[]>) {
	return {
		from(table: string) {
			const filters: Array<(row: Record<string, any>) => boolean> = [];
			let rowLimit: number | null = null;

			const query = {
				select() {
					return query;
				},
				eq(column: string, value: unknown) {
					filters.push((row) => row[column] === value);
					return query;
				},
				in(column: string, values: unknown[]) {
					filters.push((row) => values.includes(row[column]));
					return query;
				},
				is(column: string, value: unknown) {
					filters.push((row) => row[column] === value);
					return query;
				},
				order() {
					return query;
				},
				limit(value: number) {
					rowLimit = value;
					return query;
				},
				then(resolve: (value: { data: Record<string, any>[]; error: null }) => unknown) {
					const baseRows = Array.isArray(dataByTable[table]) ? dataByTable[table] : [];
					let rows = baseRows.filter((row) =>
						filters.every((predicate) => predicate(row))
					);
					if (typeof rowLimit === 'number') {
						rows = rows.slice(0, rowLimit);
					}
					return Promise.resolve(resolve({ data: rows, error: null }));
				}
			};

			return query;
		}
	} as any;
}

describe('previewUserContactCsvImport', () => {
	it('classifies valid row with no strong match as create_new', async () => {
		const supabase = createSupabaseStub({
			user_contact_methods: [],
			user_contacts: []
		});
		const csv = 'display_name,email\nStacy Chen,stacy@example.com\n';

		const result = await previewUserContactCsvImport({
			supabase,
			userId: 'user_1',
			csvText: csv
		});

		expect(result.summary.ready).toBe(1);
		expect(result.rows[0]?.action).toBe('create_new');
		expect(result.rows[0]?.status).toBe('ready');
	});

	it('flags missing identity as error', async () => {
		const supabase = createSupabaseStub({
			user_contact_methods: [],
			user_contacts: []
		});
		const csv = 'email,phone\nstacy@example.com,+14155551234\n';

		const result = await previewUserContactCsvImport({
			supabase,
			userId: 'user_1',
			csvText: csv
		});

		expect(result.summary.errors).toBe(1);
		expect(result.rows[0]?.status).toBe('error');
		expect(result.rows[0]?.reason).toContain('display_name');
	});

	it('classifies exact strong match as upsert_existing', async () => {
		const emailHash = hashValue('stacy@example.com');
		const supabase = createSupabaseStub({
			user_contact_methods: [
				{
					user_id: 'user_1',
					contact_id: 'contact_1',
					method_type: 'email',
					value_hash: emailHash,
					deleted_at: null
				}
			],
			user_contacts: [{ id: 'contact_1', user_id: 'user_1', display_name: 'Stacy Chen' }]
		});
		const csv = 'display_name,email\nStacy,stacy@example.com\n';

		const result = await previewUserContactCsvImport({
			supabase,
			userId: 'user_1',
			csvText: csv
		});

		expect(result.summary.ready).toBe(1);
		expect(result.rows[0]?.action).toBe('upsert_existing');
		expect(result.rows[0]?.matched_contact_id).toBe('contact_1');
		expect(result.rows[0]?.matched_contact_name).toBe('Stacy Chen');
	});

	it('skips row when strong method matches multiple contacts', async () => {
		const emailHash = hashValue('shared@example.com');
		const supabase = createSupabaseStub({
			user_contact_methods: [
				{
					user_id: 'user_1',
					contact_id: 'contact_1',
					method_type: 'email',
					value_hash: emailHash,
					deleted_at: null
				},
				{
					user_id: 'user_1',
					contact_id: 'contact_2',
					method_type: 'email',
					value_hash: emailHash,
					deleted_at: null
				}
			],
			user_contacts: []
		});
		const csv = 'display_name,email\nStacy,shared@example.com\n';

		const result = await previewUserContactCsvImport({
			supabase,
			userId: 'user_1',
			csvText: csv
		});

		expect(result.summary.skipped).toBe(1);
		expect(result.rows[0]?.status).toBe('skipped');
		expect(result.rows[0]?.reason).toContain('Multiple strong method matches');
	});

	it('enforces CSV row limits', async () => {
		const supabase = createSupabaseStub({
			user_contact_methods: [],
			user_contacts: []
		});
		const rows = Array.from(
			{ length: 501 },
			(_, index) => `Name ${index},name${index}@example.com`
		);
		const csv = ['display_name,email', ...rows].join('\n');

		await expect(
			previewUserContactCsvImport({
				supabase,
				userId: 'user_1',
				csvText: csv
			})
		).rejects.toThrow('CSV row count exceeds');
	});
});

describe('resolveSensitiveContactExposure', () => {
	it('keeps sensitive values masked by default', () => {
		const result = resolveSensitiveContactExposure({});
		expect(result.exposeSensitive).toBe(false);
		expect(result.warning).toBeUndefined();
	});

	it('requires user confirmation and reason to expose sensitive values', () => {
		const denied = resolveSensitiveContactExposure({
			includeSensitiveValues: true,
			userConfirmedSensitive: false,
			reason: 'debug'
		});
		expect(denied.exposeSensitive).toBe(false);
		expect(denied.warning).toContain('Sensitive values remain redacted');

		const allowed = resolveSensitiveContactExposure({
			includeSensitiveValues: true,
			userConfirmedSensitive: true,
			reason: 'support ticket'
		});
		expect(allowed.exposeSensitive).toBe(true);
		expect(allowed.warning).toBeUndefined();
	});
});

describe('commitUserContactCsvImport', () => {
	const normalizedInput: ContactImportNormalizedInput = {
		display_name: 'Stacy Chen',
		methods: [{ method_type: 'email', value: 'stacy@example.com' }]
	};

	it('returns mixed success and failure summaries', async () => {
		const createHandler = vi.fn(async () => ({
			contact: { id: 'contact_create_1' },
			created: true
		}));
		const updateHandler = vi
			.fn()
			.mockResolvedValueOnce({ contact: { id: 'contact_update_1' }, updated: true })
			.mockRejectedValueOnce(new Error('patch failed'));

		const result = await commitUserContactCsvImport({
			supabase: {} as any,
			userId: 'user_1',
			rows: [
				{
					row_number: 2,
					action: 'create_new',
					normalized_input: normalizedInput
				},
				{
					row_number: 3,
					action: 'upsert_existing',
					normalized_input: normalizedInput,
					matched_contact_id: 'contact_3'
				},
				{
					row_number: 4,
					action: 'upsert_existing',
					normalized_input: normalizedInput,
					matched_contact_id: 'contact_4'
				}
			],
			handlers: {
				createOrUpsertUserContact: createHandler as any,
				updateUserContact: updateHandler as any
			}
		});

		expect(result.summary.requested).toBe(3);
		expect(result.summary.imported).toBe(2);
		expect(result.summary.failed).toBe(1);
		expect(result.results).toEqual([
			{ row_number: 2, success: true, contact_id: 'contact_create_1' },
			{ row_number: 3, success: true, contact_id: 'contact_update_1' },
			{ row_number: 4, success: false, error: 'patch failed' }
		]);
		expect(createHandler).toHaveBeenCalledTimes(1);
		expect(updateHandler).toHaveBeenCalledTimes(2);
	});

	it('rejects invalid action and row_number inputs', async () => {
		const result = await commitUserContactCsvImport({
			supabase: {} as any,
			userId: 'user_1',
			rows: [
				{
					row_number: 0,
					action: 'create_new',
					normalized_input: normalizedInput
				},
				{
					row_number: 3,
					action: 'none' as unknown as 'create_new' | 'upsert_existing',
					normalized_input: normalizedInput
				}
			]
		});

		expect(result.summary.requested).toBe(2);
		expect(result.summary.imported).toBe(0);
		expect(result.summary.failed).toBe(2);
		expect(result.results[0]?.success).toBe(false);
		expect(result.results[1]?.success).toBe(false);
	});
});
