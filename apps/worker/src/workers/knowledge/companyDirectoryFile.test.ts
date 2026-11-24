// apps/worker/src/workers/knowledge/companyDirectoryFile.test.ts
//
// Reading the company dataset file (tasker 170). A wrong parse here puts companies in the wrong
// town for every user, silently, so the cases are the ones a real export contains: commas and
// quotes inside quoted names, a record split across two read chunks, Windows line endings, the
// pipe-delimited variant, and rows with nothing usable. Expected rows are written by hand.

import { describe, expect, it } from 'vitest';
import {
	delimitedRecords,
	directoryCopyLine,
	directoryRowFromRecord,
	readCompanyDirectoryFile
} from './companyDirectoryFile';

async function* chunksOf(text: string, size: number) {
	for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function all<T>(source: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const item of source) out.push(item);
	return out;
}

const HEADER = 'country,founded,id,industry,linkedin_url,locality,name,region,size,website';
const FILE = [
	HEADER,
	'united states,1914,a1,management consulting,linkedin.com/company/booz-allen-hamilton,mclean,booz allen hamilton,virginia,10001+,boozallen.com',
	'united states,2003,a2,management consulting,linkedin.com/company/summit,washington,"summit consulting, llc",district of columbia,51-200,summitllc.com',
	'united kingdom,,a3,"design, arts",,london,"the ""good"" company ltd",england,1-10,',
	'united states,,a4,,,,nameless town co,,,',
	',,a5,,,,,,,',
	'canada,1999.0,a6,software,,toronto,maple soft inc.,ontario,11-50,maplesoft.example'
].join('\r\n');

describe('delimitedRecords', () => {
	it('reads quoted commas, doubled quotes and line breaks inside a field', async () => {
		const rows = await all(
			delimitedRecords(chunksOf('a,"b,1","say ""hi""","two\nlines"\nc,d,,\n', 1000))
		);
		expect(rows).toEqual([
			['a', 'b,1', 'say "hi"', 'two\nlines'],
			['c', 'd', '', '']
		]);
	});

	it('gives the same records whatever the chunk size', async () => {
		const whole = await all(delimitedRecords(chunksOf(FILE, 100_000)));
		for (const size of [1, 2, 3, 7, 64]) {
			expect(await all(delimitedRecords(chunksOf(FILE, size)))).toEqual(whole);
		}
		expect(whole).toHaveLength(7);
		expect(whole[2]![6]).toBe('summit consulting, llc');
		expect(whole[3]![6]).toBe('the "good" company ltd');
	});

	it('reads a last line with no line break, and ignores a trailing one', async () => {
		expect(await all(delimitedRecords(chunksOf('a,b\nc,d', 4)))).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
		expect(await all(delimitedRecords(chunksOf('a,b\nc,d\n', 4)))).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
		expect(await all(delimitedRecords(chunksOf('', 4)))).toEqual([]);
	});
});

describe('directoryRowFromRecord', () => {
	it('keys the name the way lookups do and ranks its size', () => {
		expect(
			directoryRowFromRecord({
				name: 'summit consulting, llc',
				website: 'summitllc.com',
				locality: 'washington',
				region: 'district of columbia',
				country: 'united states',
				industry: 'management consulting',
				size: '51-200',
				founded: '2003',
				linkedin_url: 'linkedin.com/company/summit'
			})
		).toEqual({
			name_key: 'summitconsulting',
			name: 'summit consulting, llc',
			website: 'summitllc.com',
			locality: 'washington',
			region: 'district of columbia',
			country: 'united states',
			industry: 'management consulting',
			size: '51-200',
			size_rank: 3,
			founded: 2003,
			linkedin_url: 'linkedin.com/company/summit'
		});
	});

	it('drops records with no name, or with neither a town nor a website', () => {
		expect(directoryRowFromRecord({ name: '', website: 'x.example' })).toBeNull();
		expect(
			directoryRowFromRecord({ name: 'nameless town co', country: 'united states' })
		).toBeNull();
		expect(
			directoryRowFromRecord({ name: 'site only', website: 'x.example' })?.locality
		).toBeNull();
	});

	it('keeps a founding year only when it is one', () => {
		expect(
			directoryRowFromRecord({ name: 'a co x', website: 'x.example', founded: '1999.0' })
				?.founded
		).toBe(1999);
		expect(
			directoryRowFromRecord({ name: 'a co x', website: 'x.example', founded: '0' })?.founded
		).toBeNull();
		expect(
			directoryRowFromRecord({ name: 'a co x', website: 'x.example', founded: 'n/a' })
				?.founded
		).toBeNull();
	});
});

describe('readCompanyDirectoryFile', () => {
	it('keeps the usable rows of the countries asked for and counts the rest', async () => {
		const rows: string[] = [];
		const summary = await readCompanyDirectoryFile(chunksOf(FILE, 37), {
			countries: new Set(['united states']),
			onRow: (row) => void rows.push(`${row.name_key}|${row.locality}|${row.size_rank}`)
		});
		expect(rows).toEqual(['boozallenhamilton|mclean|8', 'summitconsulting|washington|3']);
		expect(summary).toMatchObject({ records: 6, kept: 2, unusable: 2, otherCountry: 2 });
		expect([...summary.byCountry]).toEqual([['united states', 2]]);
	});

	it('keeps every country when none is named', async () => {
		const summary = await readCompanyDirectoryFile(chunksOf(FILE, 4096), { countries: null });
		expect(summary).toMatchObject({ records: 6, kept: 4, unusable: 2, otherCountry: 0 });
		expect(summary.byCountry.get('united kingdom')).toBe(1);
		expect(summary.byCountry.get('canada')).toBe(1);
	});

	it('reads the pipe-delimited variant', async () => {
		const piped = [
			HEADER.replaceAll(',', '|'),
			'united states|2003|a2|management consulting||washington|summit consulting, llc|district of columbia|51-200|summitllc.com'
		].join('\n');
		const rows: string[] = [];
		await readCompanyDirectoryFile(chunksOf(piped, 50), {
			countries: null,
			onRow: (row) => void rows.push(`${row.name}|${row.website}`)
		});
		expect(rows).toEqual(['summit consulting, llc|summitllc.com']);
	});

	it('stops at the limit and refuses a file that is not the dataset', async () => {
		const limited = await readCompanyDirectoryFile(chunksOf(FILE, 4096), {
			countries: null,
			limit: 1
		});
		expect(limited.kept).toBe(1);
		await expect(
			readCompanyDirectoryFile(chunksOf('first,last\nJane,Doe\n', 64), { countries: null })
		).rejects.toThrow('does not look like the company dataset');
	});
});

describe('directoryCopyLine', () => {
	it('writes nulls and escapes what would break a COPY line', () => {
		const row = directoryRowFromRecord({
			name: 'tab\tco \\ here',
			website: 'x.example',
			size: '11-50'
		})!;
		expect(directoryCopyLine(row)).toBe(
			[
				'tabcohere',
				'tab co \\\\ here',
				'x.example',
				'\\N',
				'\\N',
				'\\N',
				'\\N',
				'11-50',
				'2',
				'\\N',
				'\\N'
			].join('\t')
		);
	});
});
