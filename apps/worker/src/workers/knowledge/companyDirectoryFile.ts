// apps/worker/src/workers/knowledge/companyDirectoryFile.ts
//
// Reading the People Data Labs free company dataset (CC BY 4.0) into company_directory rows
// (tasker 170). The file is a CSV of several million lines, so it is read as a stream, one
// record at a time, and never held in memory. Its documented columns:
//   country, founded, id, industry, linkedin_url, locality, name, region, size, website
//
// Used by scripts/company-directory-load.ts. Pure: no database, no network.

import { companyNameKey, companySizeRank } from '@buildos/shared-agent-ops/knowledge';

/** One row of public.company_directory, as the loader writes it. */
export interface CompanyDirectoryLoadRow {
	name_key: string;
	name: string;
	website: string | null;
	locality: string | null;
	region: string | null;
	country: string | null;
	industry: string | null;
	size: string | null;
	size_rank: number;
	founded: number | null;
	linkedin_url: string | null;
}

export const COMPANY_DIRECTORY_COLUMNS = [
	'name_key',
	'name',
	'website',
	'locality',
	'region',
	'country',
	'industry',
	'size',
	'size_rank',
	'founded',
	'linkedin_url'
] as const satisfies ReadonlyArray<keyof CompanyDirectoryLoadRow>;

/**
 * Records of a delimited text stream (RFC 4180: quoted fields may hold the delimiter, line
 * breaks and doubled quotes). Yields each record as its fields; the caller pairs them with the
 * header. Works on chunks of any size, so a field split across two chunks is read whole.
 */
export async function* delimitedRecords(
	chunks: AsyncIterable<string | Buffer>,
	delimiter = ','
): AsyncGenerator<string[]> {
	let field = '';
	let record: string[] = [];
	let quoted = false;
	/** The last character was a quote inside a quoted field: an escape, or the field's end. */
	let pendingQuote = false;
	let sawAnything = false;
	const decoder = new TextDecoder('utf-8');

	const text = async function* () {
		for await (const chunk of chunks) {
			yield typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
		}
		const rest = decoder.decode();
		if (rest) yield rest;
	};

	for await (const chunk of text()) {
		for (let i = 0; i < chunk.length; i++) {
			const char = chunk[i]!;
			sawAnything = true;
			if (quoted) {
				if (pendingQuote) {
					pendingQuote = false;
					if (char === '"') {
						field += '"';
						continue;
					}
					quoted = false; // the quote closed the field; this character is handled below
				} else if (char === '"') {
					pendingQuote = true;
					continue;
				} else {
					field += char;
					continue;
				}
			}
			if (char === '"' && field === '') {
				quoted = true;
			} else if (char === delimiter) {
				record.push(field);
				field = '';
			} else if (char === '\n') {
				record.push(field);
				field = '';
				yield record;
				record = [];
				sawAnything = false;
			} else if (char !== '\r') {
				field += char;
			}
		}
	}
	// A last line with no line break at the end of the file.
	if (sawAnything && (field !== '' || record.length)) {
		record.push(field);
		yield record;
	}
}

const clean = (value: string | undefined, max: number): string | null => {
	const text = (value ?? '').replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, max) : null;
};

/**
 * A dataset record as a directory row. Null for records the lookup could never use: no name,
 * or neither a town nor a website (nothing to say where the company is or which one it is).
 */
export function directoryRowFromRecord(
	record: Record<string, string | undefined>
): CompanyDirectoryLoadRow | null {
	const name = clean(record.name, 300);
	const nameKey = name ? companyNameKey(name) : null;
	if (!name || !nameKey) return null;
	const website = clean(record.website, 300);
	const locality = clean(record.locality, 200);
	if (!website && !locality) return null;
	const year = Number(clean(record.founded, 8));
	const size = clean(record.size, 20);
	return {
		name_key: nameKey.slice(0, 300),
		name,
		website,
		locality,
		region: clean(record.region, 200),
		country: clean(record.country, 100),
		industry: clean(record.industry, 200),
		size,
		size_rank: companySizeRank(size),
		founded: Number.isInteger(year) && year >= 1000 && year <= 2100 ? year : null,
		linkedin_url: clean(record.linkedin_url, 300)
	};
}

/** One row as a line of PostgreSQL COPY text format (tab-separated, \N for null). */
export function directoryCopyLine(row: CompanyDirectoryLoadRow): string {
	return COMPANY_DIRECTORY_COLUMNS.map((column) => {
		const value = row[column];
		if (value === null || value === undefined) return '\\N';
		return String(value)
			.replace(/\\/g, '\\\\')
			.replace(/\t/g, '\\t')
			.replace(/\n/g, '\\n')
			.replace(/\r/g, '\\r');
	}).join('\t');
}

export interface DirectoryFileSummary {
	records: number;
	kept: number;
	/** No name, or neither a town nor a website. */
	unusable: number;
	/** Usable, but in a country that was not asked for. */
	otherCountry: number;
	byCountry: Map<string, number>;
	/** The text of the kept rows, in bytes: a floor for the table's size. */
	bytes: number;
}

/**
 * Read a dataset file's records into directory rows. `countries` limits what is kept (lowercase
 * names as the dataset writes them, e.g. "united states"); null keeps every country. `onRow`
 * receives each kept row and may be async (a write to the database or a file).
 */
export async function readCompanyDirectoryFile(
	chunks: AsyncIterable<string | Buffer>,
	options: {
		countries: ReadonlySet<string> | null;
		onRow?: (row: CompanyDirectoryLoadRow) => void | Promise<void>;
		limit?: number;
	}
): Promise<DirectoryFileSummary> {
	const summary: DirectoryFileSummary = {
		records: 0,
		kept: 0,
		unusable: 0,
		otherCountry: 0,
		byCountry: new Map(),
		bytes: 0
	};
	let header: string[] | null = null;
	let delimiter: string | null = null;
	// The dataset ships comma- and pipe-delimited: the header line says which this file is.
	const sniffed = (async function* () {
		let first = true;
		for await (const chunk of chunks) {
			if (first) {
				const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
				const line = text.split('\n', 1)[0] ?? '';
				delimiter = line.split('|').length > line.split(',').length ? '|' : ',';
				first = false;
			}
			yield chunk;
		}
	})();
	// The generator above sets `delimiter` on its first chunk, before any record is parsed.
	const records = delimitedRecordsLazy(sniffed, () => delimiter ?? ',');
	for await (const fields of records) {
		if (!header) {
			header = fields.map((name) => name.trim().toLowerCase());
			if (!header.includes('name'))
				throw new Error(
					`This does not look like the company dataset: no "name" column in ${header.join(', ')}`
				);
			continue;
		}
		summary.records++;
		const record: Record<string, string> = {};
		header.forEach((name, i) => (record[name] = fields[i] ?? ''));
		const row = directoryRowFromRecord(record);
		if (!row) {
			summary.unusable++;
			continue;
		}
		const country = (row.country ?? '').toLowerCase();
		if (options.countries && !options.countries.has(country)) {
			summary.otherCountry++;
			continue;
		}
		summary.kept++;
		summary.byCountry.set(
			country || '(none)',
			(summary.byCountry.get(country || '(none)') ?? 0) + 1
		);
		summary.bytes += Buffer.byteLength(directoryCopyLine(row)) + 1;
		await options.onRow?.(row);
		if (options.limit && summary.kept >= options.limit) break;
	}
	return summary;
}

/** delimitedRecords, with the delimiter read once the first chunk has arrived. */
async function* delimitedRecordsLazy(
	chunks: AsyncIterable<string | Buffer>,
	delimiter: () => string
): AsyncGenerator<string[]> {
	const iterator = chunks[Symbol.asyncIterator]();
	const first = await iterator.next();
	if (first.done) return;
	const rest: AsyncIterable<string | Buffer> = {
		[Symbol.asyncIterator]: () => {
			let sentFirst = false;
			return {
				next: async () => {
					if (!sentFirst) {
						sentFirst = true;
						return first;
					}
					return iterator.next();
				}
			};
		}
	};
	yield* delimitedRecords(rest, delimiter());
}
