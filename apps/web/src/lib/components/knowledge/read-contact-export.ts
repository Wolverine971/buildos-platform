// apps/web/src/lib/components/knowledge/read-contact-export.ts
import { parseContactFile, type ParsedContactFile } from '@buildos/shared-agent-ops/knowledge';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_ZIPPED_CSV_BYTES = 32 * 1024 * 1024;

export async function readContactExport(file: File): Promise<ParsedContactFile> {
	const archive = /\.zip$/i.test(file.name);
	if (file.size > MAX_FILE_BYTES) {
		throw new Error(
			archive
				? 'This ZIP is too large. Unzip it and choose Connections.csv.'
				: 'Choose a file smaller than 100 MB.'
		);
	}

	let parsed: ParsedContactFile | null;
	if (archive) {
		const { unzipSync } = await import('fflate');
		const bytes = new Uint8Array(await file.arrayBuffer());
		let matches = 0;
		let tooLarge = false;
		let files: Record<string, Uint8Array>;
		try {
			files = unzipSync(bytes, {
				filter(entry) {
					if (entry.name.split('/').at(-1)?.toLowerCase() !== 'connections.csv')
						return false;
					matches++;
					tooLarge ||= Math.max(entry.originalSize, entry.size) > MAX_ZIPPED_CSV_BYTES;
					return matches === 1 && !tooLarge;
				}
			});
		} catch {
			throw new Error('Could not open this ZIP. Unzip it and choose Connections.csv.');
		}
		if (!matches)
			throw new Error(
				'This ZIP has no Connections.csv. Request Connections in your LinkedIn export.'
			);
		if (matches > 1)
			throw new Error(
				'This ZIP has multiple Connections.csv files. Unzip it and choose one.'
			);
		if (tooLarge)
			throw new Error(
				'Connections.csv is too large to open inside a ZIP. Unzip it and choose the CSV.'
			);
		const [csv] = Object.values(files);
		parsed = parseContactFile('Connections.csv', new TextDecoder().decode(csv));
		if (parsed?.format !== 'linkedin_csv')
			throw new Error('Connections.csv is missing its LinkedIn column headers.');
	} else {
		parsed = parseContactFile(file.name, await file.text());
		if (!parsed)
			throw new Error(
				'Choose a LinkedIn export, a phone vCard (.vcf), or a Google Contacts CSV.'
			);
	}
	if (!parsed.contacts.length) throw new Error('No contacts with names were found in this file.');
	return parsed;
}
