// apps/web/src/lib/components/knowledge/contact-export.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { summarizeContactFile, type ParsedContactFile } from '@buildos/shared-agent-ops/knowledge';
import { prepareContactImport } from './knowledge-client';
import { readContactExport } from './read-contact-export';

const csv =
	'First Name,Last Name,URL,Email Address,Company,Position,Connected On\r\nAda,Lovelace,,,Example Co,Engineer,03 Feb 2025';

function archive(files: Record<string, Uint8Array>) {
	const bytes = zipSync(files);
	return new File([Uint8Array.from(bytes)], 'LinkedIn.zip', { type: 'application/zip' });
}

describe('reading a LinkedIn archive in the browser', () => {
	it('uses only the nested Connections.csv, even when other CSVs contain contact data', async () => {
		const file = archive({
			'messages.csv': strToU8(csv.replace('Lovelace', 'Unrelated')),
			'LinkedIn/Connections.csv': strToU8(csv)
		});
		const parsed = await readContactExport(file);
		expect(parsed.format).toBe('linkedin_csv');
		expect(parsed.contacts.map((contact) => contact.name)).toEqual(['Ada Lovelace']);
		expect(parsed.contacts[0]?.connectedOn).toBe('2025-02-03');
	});

	it('explains how to recover from a missing, ambiguous or unreadable CSV', async () => {
		await expect(readContactExport(archive({ 'messages.csv': strToU8(csv) }))).rejects.toThrow(
			'no Connections.csv'
		);
		await expect(
			readContactExport(
				archive({
					'A/Connections.csv': strToU8(csv),
					'B/Connections.csv': strToU8(csv)
				})
			)
		).rejects.toThrow('multiple Connections.csv');
		await expect(
			readContactExport(archive({ 'Connections.csv': strToU8('Wrong,Header') }))
		).rejects.toThrow('column headers');
		await expect(readContactExport(new File(['broken'], 'LinkedIn.zip'))).rejects.toThrow(
			'Could not open'
		);
	});

	it('checks the advertised uncompressed CSV size before extracting', async () => {
		const bytes = zipSync({ 'Connections.csv': strToU8(csv) });
		const zip = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const centralDirectory = zip.getUint32(bytes.length - 22 + 16, true);
		zip.setUint32(centralDirectory + 24, 256 * 1024 * 1024, true);
		await expect(
			readContactExport(new File([Uint8Array.from(bytes)], 'LinkedIn.zip'))
		).rejects.toThrow('too large');
	});
});

afterEach(() => vi.unstubAllGlobals());

it('retries only the failed batch and counts the whole import, including distinct organizations', async () => {
	const contact = (await readContactExport(new File([csv], 'Connections.csv'))).contacts[0]!;
	const parsed: ParsedContactFile = {
		format: 'linkedin_csv',
		skipped: 2,
		contacts: Array.from({ length: 1502 }, (_, i) => ({ ...contact, name: `Contact ${i}` }))
	};
	const requests: Array<{ from: string; count: number; skipped: number; run: unknown }> = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const form = init.body as FormData;
			const payload = form.get('contacts') as Blob;
			const batch = (await new Response(
				payload.stream().pipeThrough(new DecompressionStream('gzip'))
			).json()) as ParsedContactFile;
			requests.push({
				from: batch.contacts[0]!.name,
				count: batch.contacts.length,
				skipped: batch.skipped,
				run: form.get('run_id')
			});
			if (requests.length === 2) throw new Error('Connection lost');
			const first = requests.length === 1;
			return Response.json({
				success: true,
				data: {
					people_created: first ? 1200 : 1,
					people_matched: first ? 300 : 1,
					possible_duplicates: first ? 20 : 1,
					facts_added: first ? 823 : 5,
					org_ids: first ? ['org-a', 'org-b'] : ['org-b', 'org-c'],
					run_id: 'run-1',
					undoable: true
				}
			});
		})
	);
	const run = prepareContactImport(parsed, 'Connections.csv', summarizeContactFile(parsed));
	const progress: number[] = [];
	await expect(run((n) => progress.push(n))).rejects.toThrow('Connection lost');
	const result = await run((n) => progress.push(n));
	// Later batches (and the retry) join the first batch's import: one Undo for the whole file.
	expect(requests).toEqual([
		{ from: 'Contact 0', count: 1500, skipped: 2, run: null },
		{ from: 'Contact 1500', count: 2, skipped: 0, run: 'run-1' },
		{ from: 'Contact 1500', count: 2, skipped: 0, run: 'run-1' }
	]);
	expect(progress).toEqual([1500, 1502]);
	expect(result).toMatchObject({
		format: 'linkedin_csv',
		contacts: 1502,
		skipped: 2,
		orgs: 3,
		people_created: 1201,
		people_matched: 301,
		possible_duplicates: 21,
		facts_added: 828,
		run_id: 'run-1',
		undoable: true
	});
});
