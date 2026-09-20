// apps/worker/tests/specialistWorkbench.postgres.test.ts
// No hosted database or paid inference. Verifies the actual catalog RPCs and owner scoping.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createSpecialistWorkbenchDraftV1,
	compileSpecialistWorkbenchVersionV1,
	hashSpecialistWorkbenchValue
} from '@buildos/agentic-chat-runtime/specialists';
import {
	createPgSupabaseShim,
	serviceClient,
	startDisposableWorkflowPostgres,
	postgresAvailable,
	type DisposablePostgres
} from './helpers/workflowPostgres';
import { seedE2EOwner, E2E_USER_ID } from './helpers/workflowEndToEnd';
import {
	saveSpecialistWorkbenchDraft,
	publishSpecialistWorkbenchVersion,
	getSpecialistWorkbenchVersion,
	listSpecialistWorkbench,
	type SpecialistWorkbenchClient
} from '../../web/src/lib/services/agentic-chat-v2/specialist-workbench.server';

(postgresAvailable ? describe : describe.skip)('specialist workbench persistence', () => {
	let pg: DisposablePostgres,
		admin: Client,
		service: Client,
		shim: ReturnType<typeof createPgSupabaseShim>,
		client: SpecialistWorkbenchClient;
	const stranger = 'ff000000-0000-4000-8000-000000000002';
	beforeAll(async () => {
		const root = resolve(process.cwd(), '../..');
		pg = await startDisposableWorkflowPostgres(root, 'buildos-workbench-pg-');
		admin = new Client(pg.connection);
		await admin.connect();
		// Match hosted Supabase defaults; GRANT alone never removes inherited defaults.
		await admin.query(
			'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role'
		);
		await admin.query(
			readFileSync(
				resolve(
					root,
					'supabase/migrations/20260920162616_agentic_chat_specialist_workbench_v1.sql'
				),
				'utf8'
			)
		);
		await seedE2EOwner(admin);
		await admin.query('INSERT INTO public.users(id) VALUES($1)', [stranger]);
		service = await serviceClient(pg.connection);
		shim = createPgSupabaseShim(service);
		client = shim as unknown as SpecialistWorkbenchClient;
	}, 120000);
	afterAll(async () => {
		await service?.end();
		await admin?.end();
		pg?.stop();
	});
	it('saves, previews via compiler, publishes, lists and restores exact frozen knowledge', async () => {
		const id = randomUUID();
		const draft = createSpecialistWorkbenchDraftV1();
		const saved = await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 0, draft);
		expect(saved.draft.revision).toBe(1);
		const first = await publishSpecialistWorkbenchVersion(client, E2E_USER_ID, id, 1);
		expect(first.version.version).toBe(1);
		const retry = await publishSpecialistWorkbenchVersion(client, E2E_USER_ID, id, 1);
		expect(retry).toEqual(first);
		draft.knowledge[0]!.text = 'Updated expertise';
		const second = await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 1, draft);
		expect(second.draft.revision).toBe(2);
		const next = await publishSpecialistWorkbenchVersion(client, E2E_USER_ID, id, 2);
		expect(next.version.version).toBe(2);
		expect(next.snapshot.knowledgePacket.notes[0]!.text).toBe('Updated expertise');
		expect(await getSpecialistWorkbenchVersion(client, E2E_USER_ID, id, 1)).toEqual(first);
		const list = await listSpecialistWorkbench(client, E2E_USER_ID);
		expect(list.versions.filter((v) => v.draftId === id)).toHaveLength(2);
		expect(list.versions[0]?.name).toBe('Document organizer');
		await expect(
			admin.query(
				'UPDATE public.agentic_chat_specialist_versions SET snapshot=snapshot WHERE draft_id=$1',
				[id]
			)
		).rejects.toThrow('immutable');
	});
	it('rejects stale edits and publication, while preserving idempotent save retries', async () => {
		const id = randomUUID();
		const d = createSpecialistWorkbenchDraftV1();
		const saved = await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 0, d);
		expect(await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 0, d)).toEqual(saved);
		d.name = 'New name';
		await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 1, d);
		await expect(
			saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 1, {
				...d,
				name: 'Stale overwrite'
			})
		).rejects.toMatchObject({ status: 409 });
		await expect(
			publishSpecialistWorkbenchVersion(client, E2E_USER_ID, id, 1)
		).rejects.toMatchObject({ status: 409 });
	});
	it('serializes concurrent creation and conflicting edits', async () => {
		const service2 = await serviceClient(pg.connection);
		const client2 = createPgSupabaseShim(service2) as unknown as SpecialistWorkbenchClient;
		try {
			const id = randomUUID(),
				d = createSpecialistWorkbenchDraftV1();
			const initial = await Promise.all([
				saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 0, d),
				saveSpecialistWorkbenchDraft(client2, E2E_USER_ID, id, 0, d)
			]);
			expect(initial[0]).toEqual(initial[1]);
			const changed = await Promise.allSettled([
				saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 1, { ...d, name: 'A' }),
				saveSpecialistWorkbenchDraft(client2, E2E_USER_ID, id, 1, { ...d, name: 'B' })
			]);
			expect(changed.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
			expect(changed.filter((r) => r.status === 'rejected')).toHaveLength(1);
		} finally {
			await service2.end();
		}
	});
	it('does not expose or overwrite another owner’s draft or versions', async () => {
		const id = randomUUID(),
			d = createSpecialistWorkbenchDraftV1();
		await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 0, d);
		await publishSpecialistWorkbenchVersion(client, E2E_USER_ID, id, 1);
		expect((await listSpecialistWorkbench(client, stranger)).drafts).toEqual([]);
		expect((await listSpecialistWorkbench(client, stranger)).versions).toEqual([]);
		await expect(
			saveSpecialistWorkbenchDraft(client, stranger, id, 0, d)
		).rejects.toMatchObject({ status: 404 });
		await expect(getSpecialistWorkbenchVersion(client, stranger, id, 1)).rejects.toMatchObject({
			status: 404
		});
		await expect(
			publishSpecialistWorkbenchVersion(client, stranger, id, 1)
		).rejects.toMatchObject({ status: 404 });
	});
	it('binds publication to the current draft hash and version counter', async () => {
		const id = randomUUID(),
			d = createSpecialistWorkbenchDraftV1();
		await saveSpecialistWorkbenchDraft(client, E2E_USER_ID, id, 0, d);
		const snapshot = await compileSpecialistWorkbenchVersionV1({
			draftId: id,
			draftRevision: 1,
			version: 1,
			draft: d
		});
		snapshot.draftHash = 'f'.repeat(64);
		const receipt = await shim.rpc('publish_specialist_workbench_version_v1', {
			p_user_id: E2E_USER_ID,
			p_id: id,
			p_expected_revision: 1,
			p_snapshot: snapshot,
			p_snapshot_hash: await hashSpecialistWorkbenchValue(snapshot)
		});
		expect(receipt.error?.message).toContain('specialist_version_invalid');
	});
	it('removes hosted service-role defaults before granting the exact catalog operations', async () => {
		const privileges = (
			await admin.query(`
			SELECT relname AS name,
				has_table_privilege('service_role', oid, 'SELECT') AS can_select,
				has_table_privilege('service_role', oid, 'INSERT') AS can_insert,
				has_table_privilege('service_role', oid, 'UPDATE') AS can_update,
				has_table_privilege('service_role', oid, 'DELETE') AS can_delete,
				has_table_privilege('service_role', oid, 'TRUNCATE') AS can_truncate,
				has_table_privilege('service_role', oid, 'TRIGGER') AS can_trigger
			FROM pg_class WHERE oid IN ('public.agentic_chat_specialist_drafts'::regclass, 'public.agentic_chat_specialist_versions'::regclass)
			ORDER BY relname
		`)
		).rows;
		expect(privileges).toEqual([
			{
				name: 'agentic_chat_specialist_drafts',
				can_select: true,
				can_insert: true,
				can_update: true,
				can_delete: false,
				can_truncate: false,
				can_trigger: false
			},
			{
				name: 'agentic_chat_specialist_versions',
				can_select: true,
				can_insert: true,
				can_update: false,
				can_delete: false,
				can_truncate: false,
				can_trigger: false
			}
		]);
		await expect(
			service.query('DELETE FROM public.agentic_chat_specialist_versions WHERE false')
		).rejects.toThrow('permission denied');
	});
	it('keeps both tables and mutation functions private to service role', async () => {
		await admin.query('SET ROLE authenticated');
		try {
			for (const table of [
				'agentic_chat_specialist_drafts',
				'agentic_chat_specialist_versions'
			])
				await expect(admin.query(`SELECT * FROM public.${table}`)).rejects.toThrow(
					'permission denied'
				);
			await expect(
				admin.query(
					'SELECT public.save_specialist_workbench_draft_v1(null,null,0,null,null)'
				)
			).rejects.toThrow('permission denied');
		} finally {
			await admin.query('RESET ROLE');
		}
		const tables = (
			await admin.query(
				"SELECT relrowsecurity FROM pg_class WHERE relname IN ('agentic_chat_specialist_drafts','agentic_chat_specialist_versions')"
			)
		).rows;
		expect(tables).toHaveLength(2);
		expect(tables.every((t) => t.relrowsecurity)).toBe(true);
	});
});
