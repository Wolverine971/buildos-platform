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
