#!/usr/bin/env node
// scripts/security/verify-rls-lockdown.mjs
/**
 * Non-mutating verification for the Phase 0 RLS/view lockdown.
 *
 * The former verifier attempted POST /rest/v1/<table> with `{}`. A successful
 * policy could turn that probe into a real row, so it was not safe for production.
 * This version calls a service-only, STABLE catalog RPC and checks grants, RLS,
 * policies, and view security options without touching application data.
 *
 * Usage:
 *   node scripts/security/verify-rls-lockdown.mjs --tables scripts/security/rls-phase-0.json
 *
 * Env: PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY. Values are loaded
 * from .env / apps/web/.env when present and are never printed.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
	if (!existsSync(path)) return;
	for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		if (process.env[key]) continue;
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

loadEnvFile(resolve('.env'));
loadEnvFile(resolve('apps/web/.env'));

const args = process.argv.slice(2);
function arg(name) {
	const index = args.indexOf(name);
	return index === -1 ? null : args[index + 1];
}

const manifestPath = arg('--tables');
const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;

if (!manifestPath) {
	console.error('error: --tables <manifest.json> is required');
	process.exit(2);
}
if (!url || !serviceKey) {
	console.error('error: PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY must be set');
	process.exit(2);
}

const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = Array.isArray(parsed) ? parsed : (parsed.relations ?? parsed.tables ?? []);
if (!entries.length) {
	console.error(`error: no relations in ${manifestPath}`);
	process.exit(2);
}

const relationNames = entries.map((entry) => entry.relation ?? entry.table);
if (relationNames.some((name) => typeof name !== 'string' || !name)) {
	console.error('error: every manifest entry needs relation (or legacy table)');
	process.exit(2);
}

const base = url.replace(/\/$/, '');
let response;
try {
	response = await fetch(`${base}/rest/v1/rpc/get_phase0_security_inventory`, {
		method: 'POST',
		headers: {
			apikey: serviceKey,
			Authorization: `Bearer ${serviceKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ p_relations: relationNames })
	});
} catch (cause) {
	console.error(
		`error: catalog request failed: ${cause instanceof Error ? cause.message : cause}`
	);
	process.exit(2);
}

if (!response.ok) {
	const body = await response.text();
	console.error(`error: catalog RPC returned ${response.status}: ${body.slice(0, 500)}`);
	process.exit(2);
}

const inventory = await response.json();
const rows = new Map(inventory.map((row) => [row.relation, row]));
const failures = [];
const results = [];

const dangerousPrivileges = ['truncate', 'references', 'trigger'];
const dmlPrivileges = ['select', 'insert', 'update', 'delete'];

function check(condition, message, checks) {
	checks.push({ pass: Boolean(condition), message });
	if (!condition) failures.push(message);
}

function hasSecurityInvoker(row) {
	return Array.isArray(row.reloptions) && row.reloptions.includes('security_invoker=true');
}

for (const entry of entries) {
	const relation = entry.relation ?? entry.table;
	const expect = entry.expect;
	const row = rows.get(relation);
	const checks = [];

	if (expect === 'absent') {
		check(!row, `${relation}: retired relation still exists`, checks);
		results.push({ relation, expect, checks });
		continue;
	}

	check(Boolean(row), `${relation}: relation is missing from catalog inventory`, checks);
	if (!row) {
		results.push({ relation, expect, checks });
		continue;
	}

	for (const privilege of dangerousPrivileges) {
		check(
			row.anon?.[privilege] === false,
			`${relation}: anon still has ${privilege.toUpperCase()}`,
			checks
		);
		check(
			row.authenticated?.[privilege] === false,
			`${relation}: authenticated still has ${privilege.toUpperCase()}`,
			checks
		);
	}

	if (expect === 'service_only') {
		check(row.rls_enabled === true, `${relation}: RLS is not enabled`, checks);
		for (const role of ['anon', 'authenticated']) {
			for (const privilege of dmlPrivileges) {
				check(
					row[role]?.[privilege] === false,
					`${relation}: ${role} still has ${privilege.toUpperCase()}`,
					checks
				);
			}
		}
	} else if (expect === 'user_scoped') {
		check(row.rls_enabled === true, `${relation}: RLS is not enabled`, checks);
		for (const privilege of dmlPrivileges) {
			check(
				row.anon?.[privilege] === false,
				`${relation}: anon still has ${privilege.toUpperCase()}`,
				checks
			);
		}
		check(row.authenticated?.select === true, `${relation}: authenticated lost SELECT`, checks);
		check(row.policies?.length > 0, `${relation}: no ownership policies found`, checks);
	} else if (expect === 'admin_scoped') {
		check(row.rls_enabled === true, `${relation}: RLS is not enabled`, checks);
		for (const privilege of dmlPrivileges) {
			check(
				row.anon?.[privilege] === false,
				`${relation}: anon still has ${privilege.toUpperCase()}`,
				checks
			);
		}
		const policyText = JSON.stringify(row.policies ?? []);
		check(policyText.includes('is_admin'), `${relation}: no is_admin policy found`, checks);
	} else if (expect === 'authenticated_reference') {
		check(row.rls_enabled === true, `${relation}: RLS is not enabled`, checks);
		check(row.anon?.select === false, `${relation}: anon still has SELECT`, checks);
		check(row.authenticated?.select === true, `${relation}: authenticated lost SELECT`, checks);
		for (const privilege of ['insert', 'update', 'delete']) {
			check(
				row.authenticated?.[privilege] === false,
				`${relation}: authenticated still has ${privilege.toUpperCase()}`,
				checks
			);
		}
	} else if (expect === 'rls_protected') {
		check(row.rls_enabled === true, `${relation}: RLS is not enabled`, checks);
		const anonApplicablePolicies = (row.policies ?? []).filter((policy) => {
			const roles = policy.roles ?? [];
			return roles.includes('public') || roles.includes('anon');
		});
		for (const policy of anonApplicablePolicies) {
			const usingExpression = String(policy.using ?? '')
				.replace(/[()\s]/g, '')
				.toLowerCase();
			const checkExpression = String(policy.check ?? '')
				.replace(/[()\s]/g, '')
				.toLowerCase();
			check(
				usingExpression !== 'true' && checkExpression !== 'true',
				`${relation}: anon-applicable policy ${policy.name} contains an unconditional TRUE expression`,
				checks
			);
		}
	} else if (expect === 'view_service_only') {
		check(
			row.kind === 'view' || row.kind === 'materialized_view',
			`${relation}: expected a view, found ${row.kind}`,
			checks
		);
		check(row.anon?.select === false, `${relation}: anon still has SELECT`, checks);
		check(
			row.authenticated?.select === false,
			`${relation}: authenticated still has SELECT`,
			checks
		);
		if (row.kind === 'view') {
			check(
				hasSecurityInvoker(row),
				`${relation}: ordinary view is not security_invoker`,
				checks
			);
		}
	} else if (expect === 'view_user_scoped') {
		check(row.kind === 'view', `${relation}: expected an ordinary view`, checks);
		check(row.anon?.select === false, `${relation}: anon still has SELECT`, checks);
		check(row.authenticated?.select === true, `${relation}: authenticated lost SELECT`, checks);
		check(hasSecurityInvoker(row), `${relation}: view is not security_invoker`, checks);
	} else {
		check(false, `${relation}: unknown expectation ${JSON.stringify(expect)}`, checks);
	}

	results.push({ relation, expect, checks });
}

const width = Math.max(...results.map((result) => result.relation.length));
console.log(`\nDatabase security verification — ${results.length} relations`);
console.log(`manifest: ${manifestPath}\n`);

for (const result of results) {
	const failed = result.checks.filter((item) => !item.pass);
	console.log(
		`${failed.length ? 'FAIL' : 'PASS'}  ${result.relation.padEnd(width)}  (${result.expect})`
	);
	for (const item of failed) console.log(`        - ${item.message}`);
}

if (failures.length) {
	console.log(`\n${failures.length} failed invariant(s). Verification is not complete.`);
	process.exit(1);
}

console.log(
	`\nAll ${results.length} relations satisfy their catalog invariants. No data was mutated.`
);
