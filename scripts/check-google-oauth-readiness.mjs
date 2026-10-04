// scripts/check-google-oauth-readiness.mjs
// Free, read-only checks. Never prints env values, sends credentials, or calls Google APIs.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

export function checkConfiguration(env) {
	const checks = [];
	const value = (key) => (env[key] ?? '').trim();
	const add = (name, pass) => checks.push({ name, status: pass ? 'pass' : 'fail' });
	for (const key of [
		'PUBLIC_GOOGLE_CLIENT_ID',
		'PRIVATE_GOOGLE_CLIENT_ID',
		'PRIVATE_GOOGLE_CLIENT_SECRET',
		'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
		'PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET',
		'PRIVATE_GMAIL_READ_CLIENT_ID',
		'PRIVATE_GMAIL_READ_CLIENT_SECRET'
	]) {
		add(`${key} is configured`, Boolean(value(key)));
	}
	for (const key of [
		'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1',
		'PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1'
	]) {
		add(`${key} has at least 32 UTF-8 bytes`, Buffer.byteLength(value(key), 'utf8') >= 32);
	}
	add(
		'Public and private sign-in client IDs match',
		Boolean(value('PUBLIC_GOOGLE_CLIENT_ID')) &&
			value('PUBLIC_GOOGLE_CLIENT_ID') === value('PRIVATE_GOOGLE_CLIENT_ID')
	);
	const clients = [
		'PRIVATE_GOOGLE_CLIENT_ID',
		'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
		'PRIVATE_GMAIL_READ_CLIENT_ID'
	].map(value);
	add(
		'Sign-in, Calendar, and Gmail use three distinct clients',
		clients.every(Boolean) && new Set(clients).size === 3
	);
	const enabled = ['1', 'true', 'yes', 'on'].includes(
		value('PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED').toLowerCase()
	);
	const allowlist = value('PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS')
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item && item !== '*');
	checks.push({
		name: 'Multi-account Calendar rollout',
		status: enabled && allowlist.length > 0 ? 'pass' : 'review',
		detail:
			enabled && allowlist.length > 0
				? 'Enabled for an explicit allowlist; verify the demonstration user is included.'
				: 'Not enabled with an explicit allowlist. This may be intentional; legacy Calendar is separate.'
	});
	return checks;
}

export async function checkPublicPages(fetchPage = fetch) {
	// Fixed public URLs only: no cookies, tokens, caller-provided hosts, or OAuth callbacks.
	return Promise.all(
		['/', '/privacy', '/terms', '/auth/login'].map(async (path) => {
			const url = `https://build-os.com${path}`;
			try {
				const response = await fetchPage(url, {
					redirect: 'manual',
					signal: AbortSignal.timeout(20_000)
				});
				const html = await response.text();
				return {
					url,
					status: response.status === 200 ? 'pass' : 'fail',
					httpStatus: response.status,
					sha256: createHash('sha256').update(html).digest('hex')
				};
			} catch {
				// Network error objects can carry request details. Keep diagnostics content-free.
				return { url, status: 'fail', detail: 'Public GET failed or timed out.' };
			}
		})
	);
}

async function main() {
	const { values } = parseArgs({
		options: {
			'env-file': { type: 'string' },
			offline: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false }
		}
	});
	if (values.help) {
		console.log(
			'node scripts/check-google-oauth-readiness.mjs [--env-file apps/web/.env] [--offline]'
		);
		console.log(
			'JSON report. Without --env-file, checks process env only. A supplied file is checked in isolation.'
		);
		console.log(
			'Exit 1 means a check failed; exit 0 is NOT Google verification or a successful consent test.'
		);
		return;
	}
	// Explicit env selection prevents silently mixing production and local credentials.
	const env = values['env-file'] ? parse(await readFile(values['env-file'])) : process.env;
	const configuration = checkConfiguration(env);
	const publicPages = values.offline ? [] : await checkPublicPages();
	const report = {
		checkedAt: new Date().toISOString(),
		configurationSource: values['env-file']
			? 'Explicit env file (not deployed configuration)'
			: 'Process environment (deployment not independently verified)',
		configuration,
		publicPages,
		manualChecks: [
			'Google Console branding, publishing status, user cap, and scope verification',
			'Exact callback URIs in each OAuth client and enabled Google APIs',
			'Supabase Google provider accepts the sign-in client ID',
			'Public disclosure content matches the deployed product and data handling',
			'Fresh sign-in, Calendar consent, Gmail consent, and disconnect with a demo account',
			'Demo video, final scope justification, and restricted-scope security assessment'
		]
	};
	console.log(JSON.stringify(report, null, 2));
	if ([...configuration, ...publicPages].some((check) => check.status === 'fail'))
		process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch(() => {
		console.error(
			'Readiness check failed. Check arguments and env-file readability; no secrets were printed.'
		);
		process.exitCode = 1;
	});
}
