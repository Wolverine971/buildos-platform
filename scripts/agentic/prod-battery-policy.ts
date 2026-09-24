// scripts/agentic/prod-battery-policy.ts
//
// Pure checks for the deployed-stack battery (`pnpm agentic:prod-battery`): the
// target must be production and the dedicated harness account, and web and
// worker must both serve one clean commit. Kept apart from the orchestrator so
// every refusal has a free unit test.
import type { SourceProvenance } from '@buildos/agentic-chat-runtime/provenance';
import { CEDAR_CASES, evaluateGateScorecard } from './gate-policy';

/** sha256 of zero bytes: a deploy built from an exact commit with no local edits. */
export const CLEAN_TREE_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Only a dedicated harness account; a real person's account can never be targeted. */
export const HARNESS_ACCOUNT_EMAIL = /^agentic-e2e-[a-z0-9-]+@example\.com$/;

export const DEFAULT_PROD_WEB_URL = 'https://build-os.com';
export const DEFAULT_PROD_WORKER_URL = 'https://agentic-chat-worker-production.up.railway.app';

export function assertProdBatteryTarget(input: {
	confirmed: boolean;
	testUserEmail: string | undefined;
	supabaseUrl: string | undefined;
	webUrl: string;
	workerUrl: string;
}): void {
	if (!input.confirmed)
		throw new Error(
			'The deployed battery writes to production as the harness account and spends model budget. Pass --confirm-prod once the run is approved, or --preflight-only to check setup for free.'
		);
	if (!input.testUserEmail || !HARNESS_ACCOUNT_EMAIL.test(input.testUserEmail))
		throw new Error(
			`AGENTIC_TEST_USER_EMAIL must be a dedicated harness account (agentic-e2e-…@example.com), got ${input.testUserEmail ? 'another address' : 'nothing'}`
		);
	for (const [name, url] of [
		['web', input.webUrl],
		['worker', input.workerUrl],
		['Supabase', input.supabaseUrl ?? '']
	] as const) {
		if (!/^https:\/\/[^/]+$/.test(url))
			throw new Error(`Deployed ${name} URL must be an https origin, got ${url}`);
	}
}

export type VercelDeployment = { sha: string; deploymentId: string; url: string | null };

/** Reads `GET /v13/deployments/<production alias>`; refuses anything but a ready production git build. */
export function parseVercelProductionDeployment(value: unknown): VercelDeployment {
	const deployment = value as {
		id?: unknown;
		url?: unknown;
		readyState?: unknown;
		target?: unknown;
		source?: unknown;
		meta?: { githubCommitSha?: unknown };
		error?: { message?: unknown };
	};
	if (deployment?.error)
		throw new Error(`Vercel deployment lookup failed: ${String(deployment.error.message)}`);
	const sha = deployment?.meta?.githubCommitSha;
	if (
		deployment?.readyState !== 'READY' ||
		deployment?.target !== 'production' ||
		typeof sha !== 'string' ||
		!/^[0-9a-f]{40}$/.test(sha) ||
		typeof deployment.id !== 'string'
	)
		throw new Error(
			'Vercel production alias is not a ready production deployment built from a git commit'
		);
	return {
		sha,
		deploymentId: deployment.id,
		url: typeof deployment.url === 'string' ? deployment.url : null
	};
}

/**
 * Both services must run the same commit, and the worker must report a clean
 * tree (Railway builds the exact deployment SHA). The result is what every
 * turn's executing worker receipt is compared against.
 */
export function deployedProvenance(
	workerHealth: unknown,
	web: VercelDeployment
): { expected: SourceProvenance; web: SourceProvenance } {
	const worker = (workerHealth as { provenance?: Partial<SourceProvenance> } | null)?.provenance;
	if (
		worker?.version !== 1 ||
		typeof worker.gitSha !== 'string' ||
		typeof worker.dirtyTreeSha256 !== 'string'
	)
		throw new Error('Deployed worker health carries no source provenance');
	if (worker.dirtyTreeSha256 !== CLEAN_TREE_SHA256)
		throw new Error('Deployed worker was not built from a clean commit');
	if (worker.gitSha !== web.sha)
		throw new Error(
			`Web and worker run different commits (web ${web.sha.slice(0, 9)}, worker ${worker.gitSha.slice(0, 9)}); wait for both deploys to finish`
		);
	const expected: SourceProvenance = {
		version: 1,
		gitSha: worker.gitSha,
		dirtyTreeSha256: CLEAN_TREE_SHA256
	};
	return { expected, web: { ...expected } };
}

/** Same deployment before and after the run, or the scorecard describes two builds. */
export function assertDeploymentUnchanged(
	before: SourceProvenance,
	after: SourceProvenance,
	label: string
): void {
	if (before.gitSha !== after.gitSha || before.dirtyTreeSha256 !== after.dirtyTreeSha256)
		throw new Error(
			`${label} changed during the run (${before.gitSha.slice(0, 9)} → ${after.gitSha.slice(0, 9)}); the result mixes two deployments`
		);
}

/** Cedar House case number → battery scenario id (apps/web …/scenarios/cedar-house). */
export const CEDAR_SCENARIO_IDS: Readonly<Record<number, string>> = Object.freeze({
	1: 'cedar-01-project-create',
	2: 'cedar-02-task-batch',
	3: 'cedar-03-no-duplicate',
	4: 'cedar-04-narrow-update',
	5: 'cedar-05-ambiguous-reference',
	6: 'cedar-06-dependency-conflict',
	7: 'cedar-07-document-create',
	8: 'cedar-08-document-edit',
	9: 'cedar-09-hostile-source',
	10: 'cedar-10-calendar-availability',
	11: 'cedar-11-dst-validation',
	13: 'cedar-13-cold-retrieval',
	14: 'cedar-14-grounded-status'
});

/** `--cases=1,2,14` → sorted case numbers; null means the full battery. */
export function parseCaseSelection(argv: readonly string[]): number[] | null {
	const flag = argv.find((arg) => arg.startsWith('--cases='));
	if (!flag) return null;
	const cases = flag
		.slice('--cases='.length)
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
		.map(Number);
	if (!cases.length || cases.some((value) => !CEDAR_CASES.includes(value)))
		throw new Error(`--cases must list Cedar House cases from: ${CEDAR_CASES.join(', ')}`);
	return [...new Set(cases)].sort((a, b) => a - b);
}

/**
 * A subset run scores exactly the selected cases with the full-gate rules and
 * never counts as a full post-deploy pass.
 */
export function evaluateCaseSubset(
	scorecard: unknown,
	cases: readonly number[],
	repetitions: number
): string[] {
	const ran = ((scorecard as { cases?: Array<{ case: number }> })?.cases ?? []).map(
		(entry) => entry.case
	);
	const failures = evaluateGateScorecard(scorecard, repetitions).filter(
		(failure) => failure !== 'The complete 13-case battery did not run'
	);
	if (JSON.stringify(ran) !== JSON.stringify([...cases]))
		failures.unshift(
			`Selected cases ${cases.join(', ')} did not all run (ran: ${ran.join(', ')})`
		);
	return failures;
}
