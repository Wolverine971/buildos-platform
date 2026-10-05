// apps/web/src/lib/components/tables/table-import.test.ts
import { describe, expect, it } from 'vitest';
import { coerceCellValue } from '@buildos/shared-agent-ops/tables';
import { buildJobApplicationsTable, COL } from './fixtures';
import {
	buildBlankPayload,
	buildCreatePayload,
	buildImportPreview,
	firstLineIsHeader,
	mapHeadersToColumns,
	overrideColumnType,
	planAppend,
	recordsToCells,
	titleFromFilename,
	uniqueHeaders
} from './table-import';

const SHEET = [
	'Company\tSalary\tApplied\tRemote\tLink',
	'Northwind\t$150,000\t2026-09-01\tyes\thttps://a.example',
	'Lumen\t$120k\t2026-09-02\tno\thttps://b.example',
	'\t\t\t\t'
].join('\n');

describe('import preview', () => {
	it('parses pasted TSV, drops blank rows and infers column types', () => {
		const preview = buildImportPreview(SHEET)!;
		expect(preview.delimiter).toBe('\t');
		expect(preview.rowCount).toBe(2);
		expect(preview.columns.map((c) => [c.name, c.type])).toEqual([
			['Company', 'text'],
			['Salary', 'number'],
			['Applied', 'date'],
			['Remote', 'checkbox'],
			['Link', 'url']
		]);
		expect(preview.sample).toHaveLength(2);
	});

	it('names blank and duplicate headers', () => {
		expect(uniqueHeaders(['Name', '', 'name', 'Name'])).toEqual([
			'Name',
			'Column 2',
			'name (2)',
			'Name (3)'
		]);
		expect(buildImportPreview('   ')).toBeNull();
	});

	it('drops choices when a column stops being a choice column', () => {
		const changed = overrideColumnType(
			{ name: 'Status', type: 'select', options: { choices: [{ value: 'A' }] } },
			'text'
		);
		expect(changed).toEqual({ name: 'Status', type: 'text', options: undefined });
	});

	it('titles from file names', () => {
		expect(titleFromFilename('job_applications-2026.csv')).toBe('Job applications 2026');
		expect(titleFromFilename('.csv')).toBe('Untitled table');
	});
});

describe('create payloads', () => {
	it('sends the raw text when the inferred types were kept', () => {
		const preview = buildImportPreview(SHEET)!;
		const payload = buildCreatePayload({
			projectId: 'p1',
			title: ' Jobs ',
			text: SHEET,
			preview,
			columns: preview.columns,
			sourceKind: 'paste'
		});
		expect(payload).toMatchObject({
			project_id: 'p1',
			title: 'Jobs',
			csv: SHEET,
			source: { kind: 'paste' }
		});
		expect(payload.columns).toBeUndefined();
	});

	it('sends typed columns + rows by name after an override', () => {
		const preview = buildImportPreview(SHEET)!;
		const columns = preview.columns.map((c, i) =>
			i === 3 ? overrideColumnType(c, 'text') : c
		);
		const payload = buildCreatePayload({
			projectId: 'p1',
			parentId: 'doc-parent',
			title: 'Jobs',
			text: SHEET,
			preview,
			columns,
			sourceKind: 'csv',
			filename: 'jobs.csv'
		});
		expect(payload.csv).toBeUndefined();
		expect(payload.columns?.[3]?.type).toBe('text');
		expect(payload.rows?.[1]).toEqual({
			Company: 'Lumen',
			Salary: '$120k',
			Applied: '2026-09-02',
			Remote: 'no',
			Link: 'https://b.example'
		});
		expect(payload).toMatchObject({
			parent_id: 'doc-parent',
			source: { kind: 'csv', filename: 'jobs.csv' }
		});
	});

	it('starts blank tables with a couple of useful columns', () => {
		const payload = buildBlankPayload({ projectId: 'p1', title: '' });
		expect(payload.title).toBe('Untitled table');
		expect(payload.columns?.map((c) => c.name)).toEqual(['Name', 'Notes']);
		expect(payload.source).toEqual({ kind: 'blank' });
	});
});

describe('appending to an existing table', () => {
	it('matches headers by name and spots this table’s own header row', () => {
		const { schema } = buildJobApplicationsTable();
		const { mappings, unknown } = mapHeadersToColumns(schema, ['company', 'Stage', 'Salary']);
		expect(mappings.map((m) => m.columnId)).toEqual([COL.company, null, COL.salary]);
		expect(unknown).toEqual(['Stage']);
		expect(firstLineIsHeader(schema, ['Company', 'Role', 'Whatever'])).toBe(true);
		expect(firstLineIsHeader(schema, ['Acme', 'FDE', 'Applied'])).toBe(false);
	});

	it('plans rows by header name and can add unknown columns', () => {
		const { schema } = buildJobApplicationsTable();
		const preview = buildImportPreview('Company\tStage\tSalary\nOrbit\tPhone screen\t$140k')!;
		const withNew = planAppend(schema, preview, { hasHeader: true, addUnknown: true });
		expect(withNew.newColumns.map((c) => c.name)).toEqual(['Stage']);
		expect(withNew.records).toEqual([
			{ Company: 'Orbit', Stage: 'Phone screen', Salary: '$140k' }
		]);
		const without = planAppend(schema, preview, { hasHeader: true, addUnknown: false });
		expect(without.ignored).toEqual(['Stage']);
		expect(without.records).toEqual([{ Company: 'Orbit', Salary: '$140k' }]);
	});

	it('fills visible columns left to right when there is no header line', () => {
		const { schema } = buildJobApplicationsTable();
		const preview = buildImportPreview('Orbit\tFDE\nTern\tSE')!;
		const plan = planAppend(schema, preview, { hasHeader: false, addUnknown: false });
		expect(plan.records).toEqual([
			{ Company: 'Orbit', Role: 'FDE' },
			{ Company: 'Tern', Role: 'SE' }
		]);
	});

	it('types planned records against the final schema', () => {
		const { schema } = buildJobApplicationsTable();
		const { rows, errors } = recordsToCells(
			schema,
			[{ Company: 'Orbit', Salary: '$140k', Remote: 'maybe' }],
			(column, raw) => coerceCellValue(column, raw)
		);
		expect(rows).toEqual([{ [COL.company]: 'Orbit', [COL.salary]: 140000 }]);
		expect(errors).toHaveLength(1);
	});
});
