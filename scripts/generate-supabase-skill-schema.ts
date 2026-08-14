// scripts/generate-supabase-skill-schema.ts
//
// Regenerates .claude/skills/supabase/references/schema.md from the generated
// packages/shared-types/src/database.schema.ts so the skill's schema reference
// can never drift from the real schema again (it sat 7 months / 111 tables
// stale before this existed). Runs as part of `pnpm gen:schema` / `gen:all`.
//
// Output is deterministic for a given database.schema.ts (the stamped date is
// the source file's own generation timestamp, not the run time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const SOURCE = path.join(repoRoot, 'packages/shared-types/src/database.schema.ts');
const TARGET = path.join(repoRoot, '.claude/skills/supabase/references/schema.md');

// Ordered: first match wins; keep the catch-all last.
const DOMAIN_RULES: Array<[RegExp, string]> = [
	[/^(users|admin_users|user_context|user_profiles|visitors|account_deletion)/, 'Users & Auth'],
	[/^user_contact|^person_|^people/, 'People & Contacts'],
	[/^onto_/, 'Ontology System'],
	[/^(projects?|tasks?|phases?|notes?)(_|$)/, 'Projects & Tasks (Legacy)'],
	[/braindump|brain_dump/, 'Brain Dumps'],
	[/^(chat_|agent_|agents$|skill_)/, 'Chat & Agents'],
	[/calendar|^cal_/, 'Calendar'],
	[/notification/, 'Notifications'],
	[/^(sms_|twilio)|_sms_/, 'SMS & Twilio'],
	[/email|gmail/, 'Email'],
	[/stripe|billing|subscription|payment|invoice|discount|trial|ledger/, 'Billing'],
	[/^beta_/, 'Beta Program'],
	[/^queue_|_jobs?$|^cron_/, 'Queue & Jobs'],
	[/^(daily_brief|briefs?_)|_brief/, 'Daily Briefs'],
	[/llm_|_usage|error_log|_logs?$|analytics|metric|telemetry/, 'Monitoring & Analytics'],
	[/^web_page|^webhook/, 'Web & Webhooks'],
	[/.*/, 'Other']
];

interface Table {
	name: string;
	columns: Array<{ name: string; type: string }>;
}

function parseSchema(source: string): { tables: Table[]; generatedAt: string } {
	const generatedAt = source.match(/^\/\/ Generated on: (\S+)/m)?.[1] ?? 'unknown';
	const tables: Table[] = [];
	let current: Table | null = null;
	let inSchemaType = false;

	for (const line of source.split('\n')) {
		if (/^export type DatabaseSchema = \{/.test(line)) {
			inSchemaType = true;
			continue;
		}
		if (!inSchemaType) continue;
		if (/^\};/.test(line)) break;

		const tableMatch = line.match(/^(?:\t| {4})([a-z0-9_]+): \{$/);
		if (tableMatch) {
			current = { name: tableMatch[1], columns: [] };
			tables.push(current);
			continue;
		}
		const columnMatch = line.match(/^(?:\t\t| {8})([a-z0-9_]+): (.+?);?$/);
		if (columnMatch && current) {
			let type = columnMatch[2];
			const nullable = / \| null$/.test(type);
			if (nullable) type = type.replace(/ \| null$/, '');
			current.columns.push({ name: columnMatch[1], type: nullable ? `${type}?` : type });
		}
	}
	return { tables, generatedAt };
}

function domainFor(tableName: string): string {
	for (const [pattern, domain] of DOMAIN_RULES) {
		if (pattern.test(tableName)) return domain;
	}
	return 'Other';
}

function anchor(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^a-z0-9 -]/g, '')
		.trim()
		.replace(/ /g, '-');
}

function render(tables: Table[], generatedAt: string): string {
	const byDomain = new Map<string, Table[]>();
	for (const table of tables) {
		const domain = domainFor(table.name);
		if (!byDomain.has(domain)) byDomain.set(domain, []);
		byDomain.get(domain)!.push(table);
	}
	// Stable domain order = rule order, with only non-empty domains included.
	const domainOrder = [...new Set(DOMAIN_RULES.map(([, d]) => d))].filter((d) => byDomain.has(d));

	const lines: string[] = [
		'# BuildOS Database Schema Reference',
		'',
		`Complete column listing for all ${tables.length} tables, grouped by domain.`,
		'',
		'**Source:** `packages/shared-types/src/database.schema.ts`',
		`**Schema generated:** ${generatedAt}`,
		'',
		'GENERATED FILE — do not edit by hand. Regenerate with `pnpm gen:schema`',
		'(script: `scripts/generate-supabase-skill-schema.ts`).',
		'',
		'Types are TypeScript shapes from the generated schema; `?` = nullable.',
		'For enum values, constraints, and RLS, check migrations in `supabase/migrations/`.',
		'',
		'## Table of Contents',
		''
	];
	for (const domain of domainOrder) {
		lines.push(`- [${domain}](#${anchor(domain)}) (${byDomain.get(domain)!.length} tables)`);
	}

	for (const domain of domainOrder) {
		lines.push('', '---', '', `## ${domain}`);
		for (const table of byDomain.get(domain)!.sort((a, b) => a.name.localeCompare(b.name))) {
			lines.push('', `### ${table.name}`, '');
			lines.push(table.columns.map((c) => `${c.name} \`${c.type}\``).join(' · '));
		}
	}
	lines.push('');
	return lines.join('\n');
}

function main() {
	const source = fs.readFileSync(SOURCE, 'utf8');
	const { tables, generatedAt } = parseSchema(source);
	if (tables.length === 0) {
		console.error('Parsed 0 tables from database.schema.ts — format changed? Aborting.');
		process.exit(1);
	}
	fs.writeFileSync(TARGET, render(tables, generatedAt), 'utf8');
	console.log(
		`Wrote ${path.relative(repoRoot, TARGET)}: ${tables.length} tables (schema generated ${generatedAt})`
	);
}

main();
