// apps/web/src/lib/privacy/retention-policy.test.ts
//
// Every window the product states must equal the interval the SQL enforces. This
// reads the migrations (latest definition wins) and parses the SQL literals.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DATA_EXPORT_REQUESTS_PER_DAY,
	RETENTION_WINDOWS,
	type RetentionSource
} from './retention-policy';

const MIGRATIONS_DIR = resolve(process.cwd(), '../../supabase/migrations');
const migrationFiles = readdirSync(MIGRATIONS_DIR)
	.filter((name) => name.endsWith('.sql'))
	.sort();
const migrationText = new Map<string, string>();
function readMigration(name: string): string {
	let text = migrationText.get(name);
	if (text === undefined) {
		text = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
		migrationText.set(name, text);
	}
	return text;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The body of the last `CREATE [OR REPLACE] FUNCTION public.<fn>(` in one file. */
function functionBody(sql: string, fn: string): string | null {
	const header = new RegExp(
		`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapeRegExp(fn)}\\s*\\(`,
		'gi'
	);
	let start = -1;
	for (const match of sql.matchAll(header)) start = match.index ?? start;
	if (start < 0) return null;
	const rest = sql.slice(start);
	const open = /\bas\s+(\$[a-z_]*\$)/i.exec(rest);
	if (!open) return null;
	const tag = open[1];
	const bodyStart = (open.index ?? 0) + open[0].length;
	const bodyEnd = rest.indexOf(tag, bodyStart);
	// Signature + body: parameter defaults live before AS.
	return bodyEnd < 0 ? null : rest.slice(0, bodyEnd);
}

/** The last migration (by file order) that defines public.<fn>. */
function latestDefinition(fn: string): { file: string; body: string } {
	let found: { file: string; body: string } | null = null;
	for (const file of migrationFiles) {
		const body = functionBody(readMigration(file), fn);
		if (body) found = { file, body };
	}
	if (!found) throw new Error(`No migration defines public.${fn}`);
	return found;
}

/** Days in a SQL interval literal such as '400 days' or '29 days 23 hours'. */
function intervalDays(literal: string): number {
	const match = /^\s*(\d+)\s+days?(?:\s+(\d+)\s+hours?)?\s*$/i.exec(literal);
	if (!match) throw new Error(`Unsupported interval literal: ${literal}`);
	return Number(match[1]) + Number(match[2] ?? 0) / 24;
}

function dayIntervals(sql: string): number[] {
	return [...sql.matchAll(/interval\s+'([^']+)'/gi)]
		.map((match) => match[1] ?? '')
		.filter((literal) => /days?/i.test(literal))
		.map(intervalDays);
}

function enforcedDays(source: RetentionSource): { days: number; file: string } {
	if (source.kind === 'column_default') {
		const sql = readMigration(source.migration);
		const table = new RegExp(
			`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${escapeRegExp(source.table)}\\s*\\(([\\s\\S]*?)\\n\\);`,
			'i'
		).exec(sql);
		if (!table) throw new Error(`${source.migration} does not create ${source.table}`);
		const column = new RegExp(
			`^\\s*${escapeRegExp(source.column)}\\s+timestamptz[^\\n]*default\\s*\\(\\s*now\\(\\)\\s*\\+\\s*interval\\s+'([^']+)'`,
			'im'
		).exec(table[1] ?? '');
		if (!column) throw new Error(`${source.table}.${source.column} has no interval default`);
		for (const file of migrationFiles.filter((name) => name > source.migration)) {
			const altered = new RegExp(
				`alter\\s+table[^;]*\\b${escapeRegExp(source.table)}\\b[^;]*alter\\s+column\\s+${escapeRegExp(source.column)}\\s+set\\s+default`,
				'i'
			).test(readMigration(file));
			if (altered) throw new Error(`${file} changes ${source.table}.${source.column}`);
		}
		return { days: intervalDays(column[1] ?? ''), file: source.migration };
	}

	const { file, body } = latestDefinition(source.fn);
	if (source.kind === 'function_default') {
		const param = new RegExp(
			`${escapeRegExp(source.param)}\\s+integer\\s+default\\s+(\\d+)`,
			'i'
		).exec(body);
		if (!param) throw new Error(`${source.fn} has no default for ${source.param}`);
		return { days: Number(param[1]), file };
	}

	const windows = [...new Set(dayIntervals(body))];
	if (windows.length !== 1) {
		throw new Error(`${source.fn} has ${windows.length} day intervals: ${windows.join(', ')}`);
	}
	return { days: windows[0] as number, file };
}

describe('retention policy matches the SQL that enforces it', () => {
	it.each(Object.entries(RETENTION_WINDOWS))('%s', (_key, window) => {
		const enforced = enforcedDays(window.source);
		expect(enforced.file).toBe(window.source.migration);
		if (window.source.kind === 'column_default' && !Number.isInteger(enforced.days)) {
			// A scheduled job needs slack before the promised day (29 days 23 hours → 30).
			expect(enforced.days).toBeLessThanOrEqual(window.days);
			expect(enforced.days).toBeGreaterThan(window.days - 1);
		} else {
			expect(enforced.days).toBe(window.days);
		}
	});

	it('states the export request limit the SQL enforces', () => {
		const { body } = latestDefinition('request_user_data_export');
		expect(/v_recent\s*>=\s*(\d+)/.exec(body)?.[1]).toBe(String(DATA_EXPORT_REQUESTS_PER_DAY));
		expect(body).toMatch(/requested_at\s*>\s*now\(\)\s*-\s*interval\s+'24 hours'/);
	});

	it('parses interval literals strictly', () => {
		expect(intervalDays('400 days')).toBe(400);
		expect(intervalDays('29 days 23 hours')).toBeCloseTo(29.958, 3);
		expect(() => intervalDays('13 months')).toThrow();
	});
});
