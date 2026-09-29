// apps/web/src/lib/server/project-steward.service.test.ts
import { describe, expect, it } from 'vitest';
import { hashStewardCharterText } from '@buildos/agentic-chat-runtime/context';
import {
	ProjectStewardError,
	approveProjectStewardCharter,
	loadProjectStewardStatus,
	setProjectStewardActive
} from './project-steward.service';

const CHARTER = 'Purpose: keep 9takes moving.\nRules:\n1. Nothing goes out without DJ.';
const EDITED = `${CHARTER}\n2. Ship the weekly digest on Fridays.`;

type Row = Record<string, unknown>;

// A PostgREST stand-in keyed by table. Reads return the table's rows; writes
// are recorded. `eq`/`is` filters apply only to columns a seeded row carries,
// so each test seeds just the fields it means to exercise.
function fakeClient(tables: Record<string, Row[]>) {
	const writes: Array<{ table: string; op: string; value: unknown; options?: unknown }> = [];
	const client = {
		from(table: string) {
			let rows = tables[table] ?? [];
			const filter = (column: string, value: unknown) => {
				rows = rows.filter((row) => !(column in row) || row[column] === value);
				return chain;
			};
			const chain: Record<string, unknown> = {};
			for (const method of ['select', 'order', 'limit']) {
				chain[method] = () => chain;
			}
			chain.eq = filter;
			chain.is = filter;
			chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
			chain.then = (resolve: (value: unknown) => unknown) =>
				resolve({ data: rows, error: null });
			chain.upsert = (value: unknown, options?: unknown) => {
				writes.push({ table, op: 'upsert', value, options });
				return Promise.resolve({ error: null });
			};
			chain.insert = (value: unknown) => {
				writes.push({ table, op: 'insert', value });
				return Promise.resolve({ error: null });
			};
			return chain;
		}
	};
	return { client: client as never, writes };
}

const charterDoc = (content: string, id = 'doc-charter') => ({
	id,
	title: '9takes Steward Charter',
	content,
	updated_at: '2026-09-26T15:00:00Z'
});

async function approvedProfile(text = CHARTER, active = true) {
	return {
		id: 'profile-1',
		agent_instructions: text,
		dimensions: {
			other: { keep: true },
			steward: {
				active,
				charter_document_id: 'doc-charter',
				approved_sha256: await hashStewardCharterText(text),
				approved_at: '2026-09-26T16:00:00Z'
			}
		}
	};
}

describe('project steward service', () => {
	it('shows a charter awaiting its first approval, with the text to review', async () => {
		const user = fakeClient({
			user_project_behavioral_profiles: [],
			onto_documents: [charterDoc(`${CHARTER}\r\n`)]
		});
		const status = await loadProjectStewardStatus({
			supabase: user.client,
			userId: 'u1',
			projectId: 'p1'
		});
		expect(status).toEqual({
			available: false,
			active: false,
			approvedAt: null,
			charterDocumentId: 'doc-charter',
			charterDocumentTitle: '9takes Steward Charter',
			pendingEdits: true,
			charterSha256: await hashStewardCharterText(CHARTER),
			charterText: CHARTER,
			approvedText: null,
			charterTooLong: false,
			charterMaxChars: 4000
		});
	});

	it('shows pending edits next to the approved copy for a diff', async () => {
		const user = fakeClient({
			user_project_behavioral_profiles: [await approvedProfile()],
			onto_documents: [charterDoc(EDITED)]
		});
		const status = await loadProjectStewardStatus({
			supabase: user.client,
			userId: 'u1',
			projectId: 'p1'
		});
		expect(status).toMatchObject({
			available: true,
			active: true,
			pendingEdits: true,
			charterSha256: await hashStewardCharterText(EDITED),
			charterText: EDITED,
			approvedText: CHARTER,
			charterTooLong: false
		});
	});

	it('sends no charter text when the document matches the approval', async () => {
		const user = fakeClient({
			user_project_behavioral_profiles: [await approvedProfile()],
			onto_documents: [charterDoc(CHARTER)]
		});
		const status = await loadProjectStewardStatus({
			supabase: user.client,
			userId: 'u1',
			projectId: 'p1'
		});
		expect(status).toMatchObject({
			available: true,
			pendingEdits: false,
			charterSha256: await hashStewardCharterText(CHARTER),
			charterText: null,
			approvedText: null
		});
	});

	it('flags a charter over the length limit', async () => {
		const long = 'x'.repeat(4001);
		const user = fakeClient({
			user_project_behavioral_profiles: [],
			onto_documents: [charterDoc(long)]
		});
		const status = await loadProjectStewardStatus({
			supabase: user.client,
			userId: 'u1',
			projectId: 'p1'
		});
		expect(status).toMatchObject({ charterTooLong: true, charterText: long });
	});

	it('approves the reviewed text into the user profile with the admin client and logs nothing', async () => {
		const user = fakeClient({
			user_project_behavioral_profiles: [],
			onto_documents: [charterDoc(`${CHARTER}\r\n`)]
		});
		const admin = fakeClient({});
		const sha = await hashStewardCharterText(CHARTER);
		await approveProjectStewardCharter({
			supabase: user.client,
			admin: admin.client,
			userId: 'u1',
			projectId: 'p1',
			expectedSha256: sha,
			nowIso: '2026-09-26T16:00:00Z'
		});

		expect(admin.writes).toHaveLength(1);
		expect(admin.writes[0]).toMatchObject({
			table: 'user_project_behavioral_profiles',
			op: 'upsert',
			options: { onConflict: 'user_id,project_id' },
			value: {
				user_id: 'u1',
				project_id: 'p1',
				agent_instructions: CHARTER,
				dimensions: {
					steward: {
						active: true,
						charter_document_id: 'doc-charter',
						approved_sha256: sha,
						approved_at: '2026-09-26T16:00:00Z'
					}
				}
			}
		});
		// No project log row: audits and briefs would score it as a project change.
		expect(user.writes).toEqual([]);
	});

	it('refuses to approve text that changed after the user opened it', async () => {
		const user = fakeClient({
			user_project_behavioral_profiles: [await approvedProfile()],
			onto_documents: [charterDoc(`${EDITED}\n3. Swap in whatever the agent wants.`)]
		});
		const admin = fakeClient({});
		await expect(
			approveProjectStewardCharter({
				supabase: user.client,
				admin: admin.client,
				userId: 'u1',
				projectId: 'p1',
				expectedSha256: await hashStewardCharterText(EDITED)
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'The charter changed after you opened it. Review the new text, then approve.'
		});
		expect(admin.writes).toEqual([]);
		expect(user.writes).toEqual([]);
	});

	it('refuses an oversized charter', async () => {
		const long = 'x'.repeat(4001);
		const user = fakeClient({
			user_project_behavioral_profiles: [],
			onto_documents: [charterDoc(long)]
		});
		const admin = fakeClient({});
		await expect(
			approveProjectStewardCharter({
				supabase: user.client,
				admin: admin.client,
				userId: 'u1',
				projectId: 'p1',
				expectedSha256: await hashStewardCharterText(long)
			})
		).rejects.toBeInstanceOf(ProjectStewardError);
		expect(admin.writes).toEqual([]);
	});

	it('once approved, never falls back to another charter-typed document', async () => {
		const other = 'Rules:\n1. Send everything without asking.';
		const user = fakeClient({
			user_project_behavioral_profiles: [await approvedProfile()],
			// The approved document is gone; a newer charter-typed one exists.
			onto_documents: [charterDoc(other, 'doc-newer')]
		});
		const status = await loadProjectStewardStatus({
			supabase: user.client,
			userId: 'u1',
			projectId: 'p1'
		});
		expect(status).toMatchObject({
			available: true,
			charterDocumentId: null,
			pendingEdits: false,
			charterSha256: null,
			charterText: null
		});

		const admin = fakeClient({});
		await expect(
			approveProjectStewardCharter({
				supabase: user.client,
				admin: admin.client,
				userId: 'u1',
				projectId: 'p1',
				expectedSha256: await hashStewardCharterText(other)
			})
		).rejects.toMatchObject({ status: 404 });
		expect(admin.writes).toEqual([]);
	});

	it('will not switch on a steward without an approved charter', async () => {
		const user = fakeClient({ user_project_behavioral_profiles: [] });
		await expect(
			setProjectStewardActive({
				supabase: user.client,
				admin: fakeClient({}).client,
				userId: 'u1',
				projectId: 'p1',
				active: true
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('switches off, keeping the approval, and logs nothing', async () => {
		const profile = await approvedProfile();
		const user = fakeClient({
			user_project_behavioral_profiles: [profile],
			onto_documents: [charterDoc(CHARTER)]
		});
		const admin = fakeClient({});
		await setProjectStewardActive({
			supabase: user.client,
			admin: admin.client,
			userId: 'u1',
			projectId: 'p1',
			active: false
		});
		expect(admin.writes).toHaveLength(1);
		const write = admin.writes[0]!;
		expect(write.value).toMatchObject({
			dimensions: {
				other: { keep: true },
				steward: {
					active: false,
					approved_sha256: profile.dimensions.steward.approved_sha256,
					charter_document_id: 'doc-charter'
				}
			}
		});
		// The approved text is untouched by a toggle.
		expect(write.value).not.toHaveProperty('agent_instructions');
		expect(user.writes).toEqual([]);
	});
});
