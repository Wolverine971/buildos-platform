// apps/web/src/lib/components/knowledge/KnowledgeImportDialog.test.ts
// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { summarizeContactFile } from '@buildos/shared-agent-ops/knowledge';
import KnowledgeImportDialog from './KnowledgeImportDialog.svelte';
import { knowledgeApi } from './knowledge-client';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it('guides a LinkedIn export, previews it privately and retries a failed import in place', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	vi.spyOn(knowledgeApi, 'recentImports').mockResolvedValue({ imports: [] });
	const upload = vi
		.spyOn(knowledgeApi, 'importContacts')
		.mockRejectedValueOnce(new Error('Upload interrupted'))
		.mockImplementationOnce(async (parsed) => ({
			...summarizeContactFile(parsed),
			people_created: 1,
			people_matched: 0,
			possible_duplicates: 0
		}));
	const onClose = vi.fn();
	const onImported = vi.fn();
	render(KnowledgeImportDialog, { isOpen: true, onClose, onImported });
	await fireEvent.change(screen.getByLabelText('Contact source'), {
		target: { value: 'linkedin' }
	});
	expect(screen.getByRole('link', { name: 'Get a copy of your data' }).getAttribute('href')).toBe(
		'https://www.linkedin.com/mypreferences/d/download-my-data'
	);
	const picker = document.querySelector<HTMLInputElement>('input[type=file]')!;
	expect(picker.accept).toBe('.zip,.csv');
	const file = new NodeFile(
		[
			'First Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Lovelace,,,Example Co,Engineer,03 Feb 2025\n,,,,,,04 Feb 2025'
		],
		'Connections.csv'
	);
	await fireEvent.change(picker, { target: { files: [file] } });
	expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
	expect(screen.getByText(/1 row has no contact name/)).toBeTruthy();
	expect(upload).not.toHaveBeenCalled();
	await fireEvent.click(screen.getByRole('button', { name: /Import 1 contact/ }));
	expect(await screen.findByRole('alert')).toHaveTextContent('Upload interrupted');
	await fireEvent.click(screen.getByRole('button', { name: 'Retry import' }));
	await waitFor(() =>
		expect(onImported).toHaveBeenCalledWith(
			expect.objectContaining({
				format: 'linkedin_csv',
				people_created: 1,
				people_matched: 0,
				possible_duplicates: 0
			})
		)
	);
	expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows how a phone file lines up with who is already here, then lets the import be undone', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	vi.spyOn(knowledgeApi, 'recentImports').mockResolvedValue({ imports: [] });
	const matches = vi
		.spyOn(knowledgeApi, 'previewContactMatches')
		.mockImplementation(async (parsed) => ({
			...summarizeContactFile(parsed),
			preview: true,
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
		}));
	const upload = vi.spyOn(knowledgeApi, 'importContacts').mockImplementation(async (parsed) => ({
		...summarizeContactFile(parsed),
		run_id: 'run-9',
		people_created: 1,
		people_matched: 1,
		orgs: 1,
		facts_added: 4,
		facts_suggested: 2,
		possible_duplicates: 1,
		undoable: true
	}));
	const undoImport = vi.spyOn(knowledgeApi, 'undoImport').mockResolvedValue({
		run_id: 'run-9',
		people_removed: 1,
		orgs_removed: 1,
		details_removed: 4,
		kept: 0
	});
	const onClose = vi.fn();
	const onImported = vi.fn();
	const onUndone = vi.fn();
	render(KnowledgeImportDialog, { isOpen: true, onClose, onImported, onUndone });

	const picker = document.querySelector<HTMLInputElement>('input[type=file]')!;
	const file = new NodeFile(
		[
			[
				'BEGIN:VCARD\nVERSION:3.0\nN:Chen;Maya;;;\nFN:Maya Chen\nTEL:(410) 555-0101\nEND:VCARD',
				'BEGIN:VCARD\nVERSION:3.0\nN:Smith;Mike;;;\nFN:Mike Smith\nTEL:(410) 555-0102\nEND:VCARD',
				'BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:Corner Dental\nORG:Corner Dental;\nTEL:(410) 555-0144\nX-ABShowAs:COMPANY\nEND:VCARD'
			].join('\n')
		],
		'contacts.vcf'
	);
	await fireEvent.change(picker, { target: { files: [file] } });

	// The preview answers "what happens to people I already have?" before anything is saved.
	const lineup = (await screen.findByText('Against the people you already have')).parentElement!;
	expect(lineup).toHaveTextContent('1 already here');
	expect(lineup).toHaveTextContent('1 new person');
	expect(lineup).toHaveTextContent('1 business, saved as an organization');
	expect(lineup).toHaveTextContent('1 looks like someone already here');
	expect(lineup).toHaveTextContent('Mike Smith · Michael Smith');
	expect(matches).toHaveBeenCalledTimes(1);
	expect(upload).not.toHaveBeenCalled();

	await fireEvent.click(screen.getByRole('button', { name: /Import 3 contacts/ }));
	const done = await screen.findByRole('status');
	expect(done).toHaveTextContent('Imported 3 contacts');
	expect(done).toHaveTextContent('2 job details saved as suggestions');
	expect(onImported).toHaveBeenCalledTimes(1);

	// Undo asks first, then reports what it removed.
	await fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));
	expect(undoImport).not.toHaveBeenCalled();
	expect(screen.getByText(/Anyone you've edited, researched or linked/)).toBeTruthy();
	await fireEvent.click(screen.getByRole('button', { name: 'Undo import' }));
	await waitFor(() => expect(undoImport).toHaveBeenCalledWith('run-9'));
	expect(await screen.findByText(/Import undone/)).toHaveTextContent(
		'Removed 1 person, 1 organization and 4 details.'
	);
	expect(onUndone).toHaveBeenCalledTimes(1);
	expect(onClose).not.toHaveBeenCalled();
});

it('offers Undo on a recent import and marks one already undone', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	vi.spyOn(knowledgeApi, 'recentImports').mockResolvedValue({
		imports: [
			{
				id: 'run-2',
				title: 'Imported Phone contacts (vCard)',
				file_name: 'contacts.vcf',
				created_at: '2026-11-22T15:00:00Z',
				contacts: 744,
				people_created: 380,
				undone: false,
				can_undo: true
			},
			{
				id: 'run-1',
				title: 'Imported LinkedIn connections',
				file_name: 'Connections.csv',
				created_at: '2026-11-22T03:00:00Z',
				contacts: 767,
				people_created: 762,
				undone: false,
				can_undo: false
			}
		]
	});
	render(KnowledgeImportDialog, { isOpen: true, onClose: vi.fn(), onImported: vi.fn() });
	expect(await screen.findByText(/contacts\.vcf/)).toHaveTextContent('744 contacts');
	// Only the import that stamped what it made can be undone here.
	expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
});
