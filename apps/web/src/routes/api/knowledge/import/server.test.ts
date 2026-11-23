// apps/web/src/routes/api/knowledge/import/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseContactFile } from '@buildos/shared-agent-ops/knowledge';

vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock('$lib/server/knowledge/knowledge.server', () => ({
	UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	knowledgeErrorResponse: vi.fn(),
	knowledgeStoreFor: vi.fn(),
	knowledgeDb: vi.fn()
}));

import { knowledgeDb, knowledgeStoreFor } from '$lib/server/knowledge/knowledge.server';
import { DELETE, POST } from './+server';

beforeEach(() => {
	vi.mocked(knowledgeDb).mockReset();
	vi.mocked(knowledgeStoreFor).mockReset();
});

const CSV = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Maya,Chen,https://www.linkedin.com/in/maya-chen,,Palantir,Deployment Strategist,03 Feb 2025
Sam,Rivera,https://www.linkedin.com/in/sam-rivera,sam@palantir.example,Palantir,Engineer,16 Nov 2026
`;

async function gzip(value: unknown): Promise<Blob> {
	const json = new Blob([JSON.stringify(value)]);
	return new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

async function post(form: FormData) {
	const request = new Request('https://build-os.com/api/knowledge/import', {
		method: 'POST',
		body: form
	});
	const locals = { safeGetSession: async () => ({ user: { id: 'u1' } }) };
	const response = await POST({ request, locals } as any);
	return { status: response.status, body: await response.json() };
}

describe('POST /api/knowledge/import', () => {
	it('reads contacts the browser parsed and gzipped', async () => {
		const form = new FormData();
		form.set('contacts', await gzip(parseContactFile('Connections.csv', CSV)), 'c.json.gz');
		form.set('file_name', 'Connections.csv');
		form.set('preview', '1');
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(body.data).toMatchObject({
			preview: true,
			format_label: 'LinkedIn connections',
			contacts: 2,
			with_email: 1,
			with_company: 2
		});
	});

	it('passes normalized LinkedIn rows to the caller-scoped database and returns its receipt', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				people_created: 1,
				people_matched: 1,
				possible_duplicates: 1,
				org_ids: ['o1'],
				facts_added: 7,
				facts_existing: 2
			},
			error: null
		});
		const history = {
			insert: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: { id: 'run-1' } }),
			update: vi.fn().mockReturnThis(),
			eq: vi.fn().mockResolvedValue({ error: null })
		};
		vi.mocked(knowledgeDb)
			.mockReturnValueOnce({ rpc, from: vi.fn() })
			.mockReturnValueOnce({ from: () => history, rpc: vi.fn() });
		const form = new FormData();
		form.set('file', new File([CSV], 'Connections.csv'));
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('knowledge_import_linkedin', {
			p_file_name: 'Connections.csv',
			p_run_id: 'run-1',
			p_rows: [
				{
					name: 'Maya Chen',
					given_name: 'Maya',
					linkedin_key: 'in/maya-chen',
					profile_url: 'https://linkedin.com/in/maya-chen',
					email: null,
					company: 'Palantir',
					title: 'Deployment Strategist',
					connected_on: '2025-02-03'
				},
				{
					name: 'Sam Rivera',
					given_name: 'Sam',
					linkedin_key: 'in/sam-rivera',
					profile_url: 'https://linkedin.com/in/sam-rivera',
					email: 'sam@palantir.example',
					company: 'Palantir',
					title: 'Engineer',
					connected_on: '2026-11-16'
				}
			]
		});
		expect(body.data).toMatchObject({
			contacts: 2,
			people_created: 1,
			people_matched: 1,
			possible_duplicates: 1,
			orgs: 1,
			org_ids: ['o1'],
			facts_added: 7,
			facts_existing: 2
		});
	});

	it('refuses a contacts upload that is not gzipped contact JSON', async () => {
		const form = new FormData();
		form.set('contacts', new Blob(['not gzip']), 'c.json.gz');
		form.set('preview', '1');
		const { status } = await post(form);
		expect(status).toBe(400);
	});
});

// A phone's address book arriving after LinkedIn: one contact with the exact name of someone
// already here, one nickname of someone already here, and one business card.
const PHONE = [
	'BEGIN:VCARD\nVERSION:3.0\nN:Chen;Maya;;;\nFN:Maya Chen\nTEL;type=CELL:(410) 555-0101\nEND:VCARD',
	'BEGIN:VCARD\nVERSION:3.0\nN:Smith;Mike;;;\nFN:Mike Smith\nTEL;type=CELL:(410) 555-0102\nEND:VCARD',
	'BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:Corner Dental\nORG:Corner Dental;\nTEL;type=WORK:(410) 555-0144\nX-ABShowAs:COMPANY\nEND:VCARD'
].join('\n');

/** A store that already holds Maya Chen and Michael Smith, and records what it was asked. */
function phoneStore() {
	const record = vi.fn(async (batch: any, _options: any) => ({
		entities: batch.entities.map((e: any) => ({
			ref: e.ref,
			id: e.self ? 'self' : `id:${e.name}`,
			kind: e.kind,
			name: e.name,
			matched: e.self ? 'self' : e.name === 'Maya Chen' ? 'name' : 'created'
		})),
		facts: { added: 5, existing: 1, superseded: 0, suggested: 2 },
		sources: 1,
		links: 0,
		merge_candidates: 0,
		problems: []
	}));
	const addNameQuestions = vi.fn(async (pairs: unknown[]) => pairs.length);
	const store = {
		record,
		addNameQuestions,
		listPeopleForNearMatch: vi.fn(async () => [
			{ id: 'id:Maya Chen', name: 'Maya Chen', employerIds: [] },
			{ id: 'id:Michael Smith', name: 'Michael Smith', employerIds: [] }
		])
	};
	vi.mocked(knowledgeStoreFor).mockReturnValue(store as any);
	return store;
}

function runHistory() {
	const history = {
		insert: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: { id: 'run-1' } }),
		update: vi.fn().mockReturnThis(),
		eq: vi.fn().mockResolvedValue({ error: null })
	};
	vi.mocked(knowledgeDb)
		.mockReturnValueOnce({ rpc: vi.fn(), from: vi.fn() })
		.mockReturnValueOnce({ from: () => history, rpc: vi.fn() });
	return history;
}

describe('POST /api/knowledge/import: a phone file', () => {
	it('previews how the file lines up with who is already here, saving nothing', async () => {
		const store = phoneStore();
		const form = new FormData();
		form.set('file', new File([PHONE], 'contacts.vcf'));
		form.set('preview', '1');
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(body.data).toMatchObject({
			preview: true,
			contacts: 3,
			companies: 1,
			will_match: 1,
			will_create: 1,
			to_review: 1,
			review_examples: [
				{
					contact: 'Mike Smith',
					existing: 'Michael Smith',
					reason: 'Same last name, similar first name'
				}
			]
		});
		expect(store.record).toHaveBeenCalledTimes(1);
		expect(store.record.mock.calls[0]![1]).toMatchObject({ dryRun: true });
		expect(store.addNameQuestions).not.toHaveBeenCalled();
		// No import run was started: knowledgeDb was only asked for the caller's own client.
		expect(vi.mocked(knowledgeDb)).toHaveBeenCalledTimes(1);
	});

	it('saves carefully, asks about the nickname, and marks the import as undoable', async () => {
		const store = phoneStore();
		const history = runHistory();
		const form = new FormData();
		form.set('file', new File([PHONE], 'contacts.vcf'));
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(store.record.mock.calls[0]![1]).toEqual({
			via: 'import',
			fillOnly: true,
			runId: 'run-1',
			trackRun: true
		});
		// The business card is an organization, never a person the user "knows".
		const batch = store.record.mock.calls[0]![0];
		expect(
			batch.entities.filter((e: any) => !e.self).map((e: any) => `${e.kind}:${e.name}`)
		).toEqual(['person:Maya Chen', 'person:Mike Smith', 'org:Corner Dental']);
		expect(batch.sources[0].meta).toMatchObject({ run_id: 'run-1' });
		expect(store.addNameQuestions).toHaveBeenCalledWith([
			{
				a: 'id:Mike Smith',
				b: 'id:Michael Smith',
				reason: 'Same last name, similar first name',
				score: 0.65
			}
		]);
		expect(body.data).toMatchObject({
			run_id: 'run-1',
			people_created: 1,
			people_matched: 1,
			companies: 1,
			orgs: 1,
			facts_suggested: 2,
			possible_duplicates: 1,
			undoable: true
		});
		expect(history.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'completed',
				stats: expect.objectContaining({ undoable: true, people_created: 1 })
			})
		);
	});

	it('still imports, without Undo, on a database that has no run stamp yet', async () => {
		const store = phoneStore();
		runHistory();
		store.record.mockRejectedValueOnce(
			new Error(
				"Create entities: Could not find the 'run_id' column of 'knowledge_entities' in the schema cache"
			)
		);
		const form = new FormData();
		form.set('file', new File([PHONE], 'contacts.vcf'));
		const { status, body } = await post(form);
		expect(status).toBe(200);
		expect(store.record).toHaveBeenCalledTimes(2);
		expect(store.record.mock.calls[1]![1]).toEqual({
			via: 'import',
			fillOnly: true,
			runId: 'run-1'
		});
		expect(body.data).toMatchObject({ people_created: 1, undoable: false });
	});
});

describe('DELETE /api/knowledge/import (undo)', () => {
	const RUN = '11111111-2222-4333-8444-555555555555';

	function undoSetup(run: unknown) {
		const rpc = vi.fn().mockResolvedValue({
			data: { people_removed: 380, orgs_removed: 41, details_removed: 2104, kept: 3 },
			error: null
		});
		const filters: Array<[string, unknown]> = [];
		const lookup: any = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn((col: string, value: unknown) => {
				filters.push([col, value]);
				return lookup;
			}),
			maybeSingle: vi.fn().mockResolvedValue({ data: run, error: null })
		};
		const marked: any = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
		vi.mocked(knowledgeDb)
			.mockReturnValueOnce({ rpc, from: () => lookup })
			.mockReturnValueOnce({ rpc: vi.fn(), from: () => marked });
		return { rpc, filters, marked };
	}

	async function undo(runId: string) {
		const response = await DELETE({
			url: new URL(`https://build-os.com/api/knowledge/import?run_id=${runId}`),
			locals: { safeGetSession: async () => ({ user: { id: 'u1' } }) }
		} as any);
		return { status: response.status, body: await response.json() };
	}

	it("undoes the caller's own import and records that it was undone", async () => {
		const { rpc, filters, marked } = undoSetup({
			id: RUN,
			status: 'completed',
			stats: { undoable: true, contacts: 744 }
		});
		const { status, body } = await undo(RUN);
		expect(status).toBe(200);
		expect(filters).toEqual([
			['id', RUN],
			['owner_user_id', 'u1'],
			['run_type', 'import']
		]);
		expect(rpc).toHaveBeenCalledWith('knowledge_undo_import', { p_run_id: RUN });
		expect(body.data).toEqual({
			run_id: RUN,
			people_removed: 380,
			orgs_removed: 41,
			details_removed: 2104,
			kept: 3
		});
		expect(marked.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'cancelled',
				stats: expect.objectContaining({ contacts: 744, undone_at: expect.any(String) })
			})
		);
	});

	it.each([
		['an import saved before Undo existed', { id: RUN, status: 'completed', stats: {} }, 400],
		[
			'an import that was already undone',
			{ id: RUN, status: 'cancelled', stats: { undoable: true, undone_at: '2026-11-22' } },
			400
		],
		['an import still running', { id: RUN, status: 'running', stats: { undoable: true } }, 400],
		["a run that isn't the caller's import", null, 404]
	])('refuses %s', async (_label, run, expected) => {
		const { rpc } = undoSetup(run);
		const { status } = await undo(RUN);
		expect(status).toBe(expected);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('refuses a malformed id before touching the database', async () => {
		const { status } = await undo('not-a-run');
		expect(status).toBe(400);
		expect(vi.mocked(knowledgeDb)).not.toHaveBeenCalled();
	});
});
