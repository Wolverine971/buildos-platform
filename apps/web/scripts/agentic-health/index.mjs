#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHealthData } from './data.mjs';
import { buildHealthReport, consoleRows } from './metrics.mjs';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_ROOT, '../..');

try {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		printHelp();
		process.exit(0);
	}

	const sanitizeAssistantFinalText = await loadSanitizer();
	const data = await loadHealthData(options);
	const report = buildHealthReport({
		window: options,
		...data,
		sanitize: sanitizeAssistantFinalText
	});
	const outputPath = options.output ?? defaultOutputPath(options);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

	console.log(
		`Agentic chat health: ${options.since} to ${options.until} (${report.window.user_scope})`
	);
	console.table(consoleRows(report));
	console.log(
		report.window.mature_seven_day_window
			? 'Window maturity: acceptance-ready (at least seven days).'
			: `Window maturity: provisional (${report.window.duration_days} of 7 days).`
	);
	console.log(`Aggregate JSON: ${outputPath}`);
} catch (error) {
	console.error(
		`agentic:health failed: ${error instanceof Error ? error.message : String(error)}`
	);
	process.exit(1);
}

function parseArguments(args) {
	const values = {};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--help' || argument === '-h') return { help: true };
		if (!['--since', '--until', '--user', '--output'].includes(argument)) {
			throw new Error(`Unknown argument: ${argument}`);
		}
		const value = args[index + 1];
		if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
		values[argument.slice(2)] = value;
		index += 1;
	}

	if (!values.since) throw new Error('--since <iso> is required.');
	const since = canonicalIso(values.since, '--since');
	const until = canonicalIso(values.until ?? new Date().toISOString(), '--until');
	if (new Date(since).getTime() >= new Date(until).getTime()) {
		throw new Error('--since must be earlier than --until.');
	}
	if (values.user && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(values.user)) {
		throw new Error('--user must be a UUID.');
	}

	return {
		since,
		until,
		userId: values.user ?? null,
		output: values.output ? path.resolve(values.output) : null
	};
}

function canonicalIso(value, flag) {
	const timestamp = new Date(value);
	if (!Number.isFinite(timestamp.getTime())) throw new Error(`${flag} must be an ISO timestamp.`);
	return timestamp.toISOString();
}

async function loadSanitizer() {
	try {
		const runtime = await import('@buildos/agentic-chat-runtime/loop');
		if (typeof runtime.sanitizeAssistantFinalText !== 'function')
			throw new Error('export missing');
		return runtime.sanitizeAssistantFinalText;
	} catch (error) {
		throw new Error(
			`Could not load the deployed runtime sanitizer. Run "pnpm --filter @buildos/agentic-chat-runtime build" first. (${error instanceof Error ? error.message : String(error)})`
		);
	}
}

function defaultOutputPath(options) {
	const stamp = `${safeTimestamp(options.since)}--${safeTimestamp(options.until)}`;
	return path.join(APP_ROOT, 'output', 'agentic-health', `${stamp}.json`);
}

function safeTimestamp(value) {
	return value.replace(/[:.]/g, '-');
}

function printHelp() {
	console.log(`Usage:
  pnpm agentic:health --since <iso> [--until <iso>] [--user <id>] [--output <path>]

Reads production telemetry without mutations, prints the WP-1 health table, and writes an
aggregate-only JSON report. Use --user with DJ's UUID for the seven-day acceptance report.`);
}
