// apps/worker/scripts/company-directory-load.ts
//
// Load the People Data Labs free company dataset (CC BY 4.0) into public.company_directory,
// the table the free company lookup reads first (tasker 170). Download the CSV yourself from
// https://www.peopledatalabs.com/company-dataset and unzip it; this script never fetches it.
//
//   Look first (default, changes nothing):
//     cd apps/worker && pnpm exec tsx scripts/company-directory-load.ts <file.csv>
//     Prints how many rows would be kept, by country, and roughly how big the table would be.
//   Choose countries (default: united states):
//     ... --countries "united states,canada"        or   --countries all
//   Write a file for psql's \copy (fastest for millions of rows):
//     ... --out /path/to/company_directory.tsv      then run the \copy line it prints
//   Or load through the API in batches (slower, needs no database password):
//     ... --write --release "2026 Q4"
//     Refuses when the table already has rows: empty it first with
//     `TRUNCATE public.company_directory;`, or pass --append.
//   --limit N    only the first N kept rows (a trial run).
//
// Needs migration 20261124010000 for --write. Reads apps/worker/.env. A .gz file is read as is.

import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { once } from 'node:events';
import { createGunzip } from 'node:zlib';
import {
	COMPANY_DIRECTORY_COLUMNS,
	type CompanyDirectoryLoadRow,
	directoryCopyLine,
	readCompanyDirectoryFile
} from '../src/workers/knowledge/companyDirectoryFile';

const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const envFile = join(REPO, 'apps/worker/.env');
if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const FLAGS_WITH_VALUE = ['--countries', '--out', '--release', '--limit'];
const arg = (name: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : undefined;
};

/** Rows per insert through the API. */
const BATCH = 2_000;
/** Rough table bytes per row beyond its text: tuple header, alignment, and its index entry. */
const OVERHEAD_BYTES_PER_ROW = 90;

async function main() {
	const args = process.argv.slice(2);
	const file = args.find(
		(value, i) => !value.startsWith('--') && !FLAGS_WITH_VALUE.includes(args[i - 1] ?? '')
	);
	if (!file || !existsSync(file)) {
		console.error(
			'Usage: tsx scripts/company-directory-load.ts <company-dataset.csv> [--countries "united states"|all] [--out file.tsv | --write --release "<name>"] [--limit N]'
		);
		process.exit(1);
	}
	const countriesArg = (arg('--countries') ?? 'united states').toLowerCase();
	const countries =
		countriesArg === 'all'
			? null
			: new Set(
					countriesArg
						.split(',')
						.map((c) => c.trim())
						.filter(Boolean)
				);
	const out = arg('--out');
	const write = process.argv.includes('--write');
	const limit = Number(arg('--limit')) || undefined;
	if (out && write) throw new Error('Pick one of --out and --write.');

	const source = file.endsWith('.gz')
		? createReadStream(file).pipe(createGunzip())
		: createReadStream(file);

	let onRow: ((row: CompanyDirectoryLoadRow) => void | Promise<void>) | undefined;
	let finish: (() => Promise<void>) | undefined;

	if (out) {
		const stream = createWriteStream(out);
		onRow = async (row) => {
			if (!stream.write(`${directoryCopyLine(row)}\n`)) await once(stream, 'drain');
		};
		finish = async () => {
			stream.end();
			await once(stream, 'finish');
		};
	} else if (write) {
		const release = arg('--release');
		if (!release)
			throw new Error('--write needs --release "<the dataset release you downloaded>"');
		const { supabase } = await import('../src/lib/supabase');
		const db = supabase as unknown as { from(table: string): any };
		const { count, error: countError } = await db
			.from('company_directory')
			.select('name_key', { count: 'estimated', head: true });
		if (countError) throw new Error(`Read company_directory: ${countError.message}`);
		if ((count ?? 0) > 0 && !process.argv.includes('--append'))
			throw new Error(
				`company_directory already holds about ${count} rows. Empty it first (TRUNCATE public.company_directory;) or pass --append.`
			);
		let batch: CompanyDirectoryLoadRow[] = [];
		let written = 0;
		const flush = async () => {
			if (!batch.length) return;
			const rows = batch;
			batch = [];
			const { error } = await db.from('company_directory').insert(rows);
			if (error) throw new Error(`Insert after ${written} rows: ${error.message}`);
			written += rows.length;
			if (written % 100_000 < BATCH)
				console.log(`  ${written.toLocaleString()} rows written`);
		};
		onRow = async (row) => {
			batch.push(row);
			if (batch.length >= BATCH) await flush();
		};
		finish = async () => {
			await flush();
			const { error } = await db.from('company_directory_loads').insert({
				release,
				row_count: written,
				countries: countries ? [...countries] : ['*']
			});
			if (error) throw new Error(`Record the load: ${error.message}`);
		};
	}

	const started = Date.now();
	const summary = await readCompanyDirectoryFile(source, { countries, onRow, limit });
	await finish?.();

	const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(0)} MB`;
	console.log(`\n${file}`);
	console.log(
		`  ${summary.records.toLocaleString()} records read in ${((Date.now() - started) / 1000).toFixed(0)} s`
	);
	console.log(
		`  ${summary.kept.toLocaleString()} kept${limit ? ` (stopped at --limit ${limit})` : ''}`
	);
	console.log(
		`  ${summary.unusable.toLocaleString()} unusable (no name, or neither a town nor a website)`
	);
	console.log(`  ${summary.otherCountry.toLocaleString()} in other countries`);
	const top = [...summary.byCountry].sort((a, b) => b[1] - a[1]).slice(0, 8);
	for (const [country, n] of top) console.log(`    ${country}: ${n.toLocaleString()}`);
	console.log(
		`  Table size, roughly: ${mb(summary.bytes + summary.kept * OVERHEAD_BYTES_PER_ROW)} (${mb(summary.bytes)} of text plus rows and the name index). An estimate, not a measurement.`
	);
	if (out) {
		console.log(`\nWrote ${out}. Load it with psql connected to the database:`);
		console.log(
			`  \\copy public.company_directory (${COMPANY_DIRECTORY_COLUMNS.join(', ')}) FROM '${out}'`
		);
		console.log(
			`  INSERT INTO public.company_directory_loads (release, row_count, countries) VALUES ('<release>', ${summary.kept}, '{${countries ? [...countries].join(',') : '*'}}');`
		);
	} else if (!write) {
		console.log(
			'\nNothing was written. Pass --out <file.tsv> or --write --release "<name>" to load it.'
		);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
