// apps/web/src/lib/tests/layout-shift/layout-shift.live.test.ts
//
// Walks the reader on every surface that has one, as the test user, on a
// throwaway project: change a task's status, step to the next task, archive,
// Undo, close. After each action it checks that nothing closed, reloaded or
// moved that shouldn't have (judge.ts). Writes are answered by the shadow
// server. Report: apps/web/test-results/layout-shift/<time>/report.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ensureTestAuthUser, provisionTestUser } from '../agentic-e2e/harness/test-user';
import type { DbView } from '../agentic-e2e/harness/types';
import {
	ALL_TITLES,
	OPEN_TASKS,
	seedFixture,
	sweepStaleFixtures,
	teardownFixture,
	type Fixture
} from './fixture';
import { judgeStep, type Finding, type PageShot, type StepExpectation } from './judge';
import { pageNow, recordShifts, takeShot } from './probe';
import { createShadowState, installShadowServer, type ShadowState } from './shadow';

const BASE = (process.env.LAYOUT_SHIFT_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const STRICT = process.env.LAYOUT_SHIFT_STRICT !== '0';
const ONLY = (process.env.LAYOUT_SHIFT_SURFACES ?? '').split(',').filter(Boolean);
const HEADED = process.env.LAYOUT_SHIFT_HEADED === '1';
const OUT = resolve('test-results/layout-shift', new Date().toISOString().replace(/[:.]/g, '-'));

interface StepResult {
	surface: string;
	step: string;
	findings: Finding[];
	/** The dev server hot-reloaded during the step (another session saved a file). */
	noisy?: boolean;
	shiftScore: number;
	shiftSources: string[];
	error?: string;
	shots?: string[];
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let db: DbView | null = null;
let fixture: Fixture | null = null;
const shadow: ShadowState = createShadowState();
const pageErrors: string[] = [];

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`[layout-shift] Missing ${name} in apps/web/.env`);
	return value;
}

// ---------- Settling ----------

let inFlight = 0;
let lastActivity = Date.now();
function trackRequests(page: Page) {
	const counts = (url: string, type: string) =>
		url.startsWith(BASE) && type !== 'eventsource' && type !== 'websocket';
	page.on('request', (request) => {
		if (!counts(request.url(), request.resourceType())) return;
		inFlight += 1;
		lastActivity = Date.now();
	});
	const done = (request: { url(): string; resourceType(): string }) => {
		if (!counts(request.url(), request.resourceType())) return;
		inFlight = Math.max(0, inFlight - 1);
		lastActivity = Date.now();
	};
	page.on('requestfinished', done);
	page.on('requestfailed', done);
}

/** Network quiet for a beat, then time for transitions to finish. */
async function settle(page: Page, quietMs = 700, maxMs = 9000) {
	const start = Date.now();
	await page.waitForTimeout(150);
	while (Date.now() - start < maxMs) {
		if (inFlight === 0 && Date.now() - lastActivity >= quietMs) break;
		await page.waitForTimeout(100);
	}
	await page.waitForTimeout(400);
}

// ---------- Actions ----------

const reader = (page: Page) => page.locator('.panes .reader-col');
const currentTitle = async (page: Page) =>
	(await reader(page).locator('.head').textContent())?.replace(/\s+/g, ' ').trim() ?? '';
const titleIn = (text: string) => ALL_TITLES.find((title) => text.includes(title)) ?? text;
/** The reader's header also shows "2 / 6"; only the item it shows matters. */
const shotOf = async (page: Page, since: number): Promise<PageShot> => {
	const shot = await takeShot(page, ALL_TITLES, since);
	return { ...shot, readerTitle: shot.readerTitle === null ? null : titleIn(shot.readerTitle) };
};

async function clickStatus(page: Page, label: string) {
	await reader(page)
		.getByRole('group', { name: 'Task state' })
		.getByRole('button', { name: label, exact: true })
		.click();
}

interface Step {
	name: string;
	act: (page: Page) => Promise<void>;
	/** Cap on waiting for the page to settle (the Undo toast only lasts 6 s). */
	settleMax?: number;
	expect: (open: string) => StepExpectation;
}

const HOLD: StepExpectation = {
	keep: ['panes', 'list', 'reader', 'card'],
	still: ['readerHead', 'card', 'list'],
	rowOrder: 'same',
	selectedRowStill: true,
	readerOpen: true
};

let archived = '';
const STEPS: Step[] = [
	{
		name: 'status → In progress',
		act: (page) => clickStatus(page, 'In progress'),
		expect: () => HOLD
	},
	{ name: 'status → Done', act: (page) => clickStatus(page, 'Done'), expect: () => HOLD },
	{
		name: 'status → To do (reopen)',
		act: (page) => clickStatus(page, 'To do'),
		expect: () => HOLD
	},
	{ name: 'status → Blocked', act: (page) => clickStatus(page, 'Blocked'), expect: () => HOLD },
	{ name: 'status → Done again', act: (page) => clickStatus(page, 'Done'), expect: () => HOLD },
	{
		name: 'next task (done row stays put)',
		act: (page) => reader(page).getByRole('button', { name: 'Next task' }).first().click(),
		expect: () => ({
			...HOLD,
			keep: ['panes', 'list', 'card'],
			still: ['card', 'list'],
			selectedRowStill: false,
			readerTitle: 'any'
		})
	},
	{
		name: 'archive',
		act: async (page) => {
			archived = titleIn(await currentTitle(page));
			await reader(page).locator('.lead button.remove').click();
		},
		settleMax: 1500,
		expect: (open) => ({
			keep: ['panes', 'list', 'card'],
			still: ['card', 'list'],
			rowOrder: 'same',
			removed: [open],
			readerOpen: true,
			readerTitle: 'any'
		})
	},
	{
		name: 'undo archive',
		act: (page) => page.getByRole('button', { name: 'Undo' }).first().click(),
		expect: () => ({
			keep: ['panes', 'list', 'card'],
			still: ['card', 'list'],
			rowOrder: 'same',
			added: [archived],
			readerOpen: true,
			readerTitle: 'any'
		})
	},
	{
		// The chat opens over the reader; Esc closes the chat and nothing else.
		name: 'chat about this: open, Esc',
		act: async (page) => {
			await reader(page)
				.getByRole('button', { name: /^Chat about this/ })
				.first()
				.click();
			const dialog = page.getByRole('dialog').last();
			await dialog.waitFor({ state: 'visible', timeout: 15_000 });
			await settle(page);
			await page.keyboard.press('Escape');
			await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
		},
		expect: () => HOLD
	},
	{
		name: 'close reader',
		act: (page) => reader(page).getByRole('button', { name: 'Close' }).first().click(),
		expect: () => ({
			keep: ['card'],
			still: ['card'],
			rowOrder: 'any',
			readerOpen: false
		})
	}
];

// ---------- Surfaces ----------

interface Surface {
	name: string;
	open: (page: Page, fx: Fixture) => Promise<void>;
}

const FIRST = OPEN_TASKS[0].title;

/** Click the task's row in the list column (Today's hero card repeats the title above it). */
async function openFromList(page: Page, title: string) {
	await page.locator('.panes .list-col').getByText(title, { exact: true }).last().click();
	await reader(page).locator('.head').waitFor({ state: 'visible', timeout: 15_000 });
}

async function dismissConsent(page: Page) {
	await page
		.getByRole('button', { name: 'Necessary only' })
		.click({ timeout: 2_000 })
		.catch(() => undefined);
}

const SURFACES: Surface[] = [
	{
		name: 'projects card (/projects)',
		open: async (page, fx) => {
			await page.goto(`${BASE}/projects`, { timeout: 90_000 });
			await dismissConsent(page);
			const tile = page.locator(`[data-tile-id="${fx.projectId}"]`).first();
			await tile.waitFor({ timeout: 30_000 });
			await tile.click();
			// A tile's first click can land as a hover on some pointers; click again if needed.
			if (
				!(await page
					.locator('[data-tab="tasks"]')
					.isVisible()
					.catch(() => false))
			) {
				await page.waitForTimeout(500);
				if (!(await page.locator('[data-tab="tasks"]').isVisible())) await tile.click();
			}
			await page.locator('[data-tab="tasks"]').click();
			await settle(page);
			await openFromList(page, FIRST);
		}
	},
	{
		name: 'project page (/projects/[id])',
		open: async (page, fx) => {
			await page.goto(`${BASE}/projects/${fx.projectId}`, { timeout: 90_000 });
			await dismissConsent(page);
			// A click that lands before hydration is lost: click until the tab takes.
			const tasksTab = page.getByRole('tab', { name: /Tasks/ }).first();
			await expect
				.poll(
					async () => {
						await tasksTab.click({ timeout: 10_000 });
						return tasksTab.getAttribute('aria-selected');
					},
					{ timeout: 30_000, interval: 500 }
				)
				.toBe('true');
			await page.getByText(FIRST, { exact: true }).first().waitFor({ timeout: 30_000 });
			await settle(page);
			await openFromList(page, FIRST);
		}
	},
	{
		name: 'today (/today)',
		open: async (page) => {
			await page.goto(`${BASE}/today`, { timeout: 90_000 });
			await dismissConsent(page);
			await page.getByText(FIRST, { exact: true }).first().waitFor({ timeout: 30_000 });
			await settle(page);
			await openFromList(page, FIRST);
		}
	}
];

// ---------- Run ----------

beforeAll(async () => {
	const home = await fetch(`${BASE}/`).then(
		(response) => response.text(),
		(cause) => {
			throw new Error(
				`[layout-shift] No dev server at ${BASE}. Start one (pnpm --filter @buildos/web dev) ` +
					`or set LAYOUT_SHIFT_BASE_URL. ${cause}`
			);
		}
	);
	if (!home.includes('BuildOS'))
		throw new Error(`[layout-shift] ${BASE} is not BuildOS. Set LAYOUT_SHIFT_BASE_URL.`);

	const email = required('AGENTIC_TEST_USER_EMAIL');
	const password = required('AGENTIC_TEST_USER_PASSWORD');
	await ensureTestAuthUser({ email, password });

	// Playwright's own Chromium when it is downloaded; otherwise the installed Chrome
	// (a fresh temporary profile, never the person's own).
	browser = await chromium.launch({ headless: !HEADED }).catch(() =>
		chromium.launch({
			headless: true,
			executablePath: `${process.env.HOME}/.local/bin/headless-chrome`
		})
	);
	context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const login = await context.request.post(`${BASE}/api/auth/login`, {
		data: { email, password }
	});
	const body = (await login.json().catch(() => null)) as {
		data?: { user?: { id?: string } };
	} | null;
	const userId = body?.data?.user?.id;
	if (!login.ok() || !userId)
		throw new Error(`[layout-shift] Test user login failed (${login.status()})`);

	db = await provisionTestUser({ userId, email });
	await db.admin
		.from('users')
		.update({ onboarding_completed_at: new Date().toISOString() })
		.eq('id', userId);
	await sweepStaleFixtures(db);
	fixture = await seedFixture(db);

	// Installed after login and seeding: from here every write is the shadow's.
	await context.addInitScript(recordShifts);
	await installShadowServer(context, new URL(BASE).origin, shadow);
});

afterAll(async () => {
	await context?.close().catch(() => undefined);
	await browser?.close().catch(() => undefined);
	if (db) await teardownFixture(db, fixture);
});

async function runSurface(surface: Surface): Promise<StepResult[]> {
	const results: StepResult[] = [];
	// Each surface starts from the seeded data: the page's first render comes from the
	// server, which never saw the shadow's writes.
	shadow.states.clear();
	shadow.gone.clear();
	const page = await context!.newPage();
	page.on('pageerror', (error) => pageErrors.push(`${surface.name}: ${error.message}`));
	// Vite logs its hot updates; one during a step means the page changed under us.
	let devReloads = 0;
	page.on('console', (message) => {
		if (
			/\[vite\] (hot updated|page reload|program reload|server connection lost)/.test(
				message.text()
			)
		)
			devReloads += 1;
	});
	trackRequests(page);
	try {
		await surface.open(page, fixture!);
		await settle(page);
	} catch (cause) {
		results.push({
			surface: surface.name,
			step: 'open the first task',
			findings: [],
			shiftScore: 0,
			shiftSources: [],
			error: cause instanceof Error ? cause.message.split('\n')[0] : String(cause),
			shots: [await saveShot(page, surface.name, 'open-failed')]
		});
		await page.close();
		return results;
	}

	for (const step of STEPS) {
		const open = titleIn(await currentTitle(page).catch(() => ''));
		const before = await shotOf(page, 0);
		const beforeImage = await page.screenshot();
		const since = await pageNow(page);
		const reloadsBefore = devReloads;
		let after: PageShot;
		try {
			await step.act(page);
			await settle(page, 700, step.settleMax);
			after = await shotOf(page, since);
		} catch (cause) {
			results.push({
				surface: surface.name,
				step: step.name,
				findings: [],
				shiftScore: 0,
				shiftSources: [],
				error: cause instanceof Error ? cause.message.split('\n')[0] : String(cause),
				shots: [await saveShot(page, surface.name, step.name)]
			});
			break; // later steps assume this one happened
		}
		const findings = judgeStep(before, after, step.expect(open));
		const result: StepResult = {
			surface: surface.name,
			step: step.name,
			findings,
			noisy: devReloads !== reloadsBefore,
			shiftScore: after.shiftScore,
			shiftSources: after.shiftSources
		};
		if (findings.length) {
			const name = `${slug(surface.name)}--${slug(step.name)}`;
			writeFileSync(join(OUT, `${name}--before.png`), beforeImage);
			result.shots = [
				`${name}--before.png`,
				await saveShot(page, surface.name, step.name, 'after')
			];
		}
		results.push(result);
	}
	await page.close();
	return results;
}

// ---------- History ----------
// Not a reader surface: a grid of past chats and captures. Checks that a background
// refetch swaps rows in place (no skeleton flash) and that opening and closing a
// chat over it leaves the grid where it was.

interface GridShot {
	path: string;
	scrollY: number;
	gridStamp: string | null;
	rows: { label: string; top: number }[];
}

/** The card grid (its cards each carry a stretched "Open …" button) and its rows. */
const HISTORY_GRID = '.grid:has(> div > button[aria-label^="Open "])';
const HISTORY_ROW = `${HISTORY_GRID} > div > button[aria-label^="Open "]`;

async function gridShot(page: Page): Promise<GridShot> {
	return page.evaluate(
		({ gridSelector, rowSelector }) => {
			const grid = document.querySelector<HTMLElement>(gridSelector);
			if (grid && !grid.dataset.lsStamp)
				grid.dataset.lsStamp = Math.random().toString(36).slice(2);
			const rows = [...document.querySelectorAll<HTMLElement>(rowSelector)];
			return {
				path: location.pathname,
				scrollY: window.scrollY,
				gridStamp: grid?.dataset.lsStamp ?? null,
				rows: rows.slice(0, 9).map((row) => ({
					label: row.getAttribute('aria-label') ?? '',
					top: Math.round(row.getBoundingClientRect().top)
				}))
			};
		},
		{ gridSelector: HISTORY_GRID, rowSelector: HISTORY_ROW }
	);
}

function judgeGrid(before: GridShot, after: GridShot): Finding[] {
	const findings: Finding[] = [];
	if (after.path !== before.path)
		findings.push({ rule: 'navigated', detail: `${before.path} → ${after.path}` });
	if (Math.abs(after.scrollY - before.scrollY) > 2)
		findings.push({ rule: 'page-scrolled', detail: `${after.scrollY - before.scrollY}px` });
	if (!after.gridStamp) findings.push({ rule: 'closed', detail: 'the list disappeared' });
	else if (after.gridStamp !== before.gridStamp)
		findings.push({ rule: 'remounted', detail: 'the list was rebuilt (skeleton flash)' });
	const was = before.rows.map((row) => row.label).join('\n');
	const now = after.rows.map((row) => row.label).join('\n');
	if (was !== now) findings.push({ rule: 'reordered', detail: 'the rows changed' });
	const moved = before.rows.filter((row, index) => {
		const next = after.rows[index];
		return next && next.label === row.label && Math.abs(next.top - row.top) > 2;
	});
	if (moved.length)
		findings.push({ rule: 'moved', detail: `${moved.length} row(s) moved on screen` });
	return findings;
}

/** The app's own `invalidate` (same module instance the page imported, dev only). */
async function invalidateInPage(page: Page, key: string) {
	// A string, so vitest leaves the dynamic import alone (it rewrites the ones it sees).
	await page.evaluate(`(async () => {
		const url = performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.find((name) => name.includes('/runtime/app/navigation.js'));
		if (!url) throw new Error('could not find $app/navigation in the page');
		const navigation = await import(url);
		await navigation.invalidate(${JSON.stringify(key)});
	})()`);
}

async function runHistory(): Promise<StepResult[]> {
	const surface = 'history (/history)';
	const results: StepResult[] = [];
	shadow.states.clear();
	shadow.gone.clear();
	const page = await context!.newPage();
	page.on('pageerror', (error) => pageErrors.push(`${surface}: ${error.message}`));
	trackRequests(page);
	const steps: { name: string; act: () => Promise<void> }[] = [
		{
			name: 'background refresh (chat closed after sending)',
			act: () => invalidateInPage(page, 'history:data')
		},
		{
			name: 'open a past chat, Esc',
			act: async () => {
				await page.locator(HISTORY_ROW).first().click();
				const dialog = page.getByRole('dialog').last();
				await dialog.waitFor({ state: 'visible', timeout: 15_000 });
				await settle(page);
				await page.keyboard.press('Escape');
				await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
			}
		}
	];
	try {
		await page.goto(`${BASE}/history?type=chats`, { timeout: 90_000 });
		await dismissConsent(page);
		await page.locator(HISTORY_ROW).first().waitFor({ timeout: 30_000 });
		await settle(page);
	} catch (cause) {
		results.push({
			surface,
			step: 'open History (needs a past chat on the test user)',
			findings: [],
			shiftScore: 0,
			shiftSources: [],
			error: cause instanceof Error ? cause.message.split('\n')[0] : String(cause),
			shots: [await saveShot(page, surface, 'open-failed')]
		});
		await page.close();
		return results;
	}
	for (const step of steps) {
		const before = await gridShot(page);
		const beforeImage = await page.screenshot();
		const since = await pageNow(page);
		try {
			await step.act();
			await settle(page);
		} catch (cause) {
			results.push({
				surface,
				step: step.name,
				findings: [],
				shiftScore: 0,
				shiftSources: [],
				error: cause instanceof Error ? cause.message.split('\n')[0] : String(cause),
				shots: [await saveShot(page, surface, step.name)]
			});
			break;
		}
		const after = await gridShot(page);
		const shifts = await page.evaluate(
			(from) => (window.__lsShifts ?? []).filter((shift) => shift.at >= from),
			since
		);
		const findings = judgeGrid(before, after);
		const result: StepResult = {
			surface,
			step: step.name,
			findings,
			shiftScore: shifts.reduce((sum, shift) => sum + shift.value, 0),
			shiftSources: [...new Set(shifts.flatMap((shift) => shift.sources))].slice(0, 8)
		};
		if (findings.length) {
			const name = `${slug(surface)}--${slug(step.name)}`;
			writeFileSync(join(OUT, `${name}--before.png`), beforeImage);
			result.shots = [
				`${name}--before.png`,
				await saveShot(page, surface, step.name, 'after')
			];
		}
		results.push(result);
	}
	await page.close();
	return results;
}

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

async function saveShot(page: Page, surface: string, step: string, suffix = 'failed') {
	const name = `${slug(surface)}--${slug(step)}--${suffix}.png`;
	await page.screenshot({ path: join(OUT, name) }).catch(() => undefined);
	return name;
}

function report(results: StepResult[]): string {
	const failed = results.filter(
		(result) => (result.findings.length && !result.noisy) || result.error
	);
	const lines = [
		`# Layout-shift harness`,
		'',
		`${new Date().toLocaleString()} · ${BASE} · ${results.length} steps · **${failed.length} failing**`,
		'',
		`Writes answered by the shadow server (none reached the database): ${shadow.writes.length}`,
		''
	];
	for (const surface of [...new Set(results.map((result) => result.surface))]) {
		lines.push(`## ${surface}`, '', '| Step | Result | Shift score |', '| --- | --- | --- |');
		for (const result of results.filter((entry) => entry.surface === surface)) {
			const verdict = result.error
				? `💥 ${result.error}`
				: result.noisy && result.findings.length
					? `⚠️ inconclusive: the dev server hot-reloaded during this step (another session saved a file). Rerun.`
					: result.findings.length
						? `❌ ${result.findings.map((finding) => `**${finding.rule}**: ${finding.detail.replace(/\n/g, '<br>')}`).join('<br>')}`
						: '✅';
			lines.push(`| ${result.step} | ${verdict} | ${result.shiftScore.toFixed(3)} |`);
		}
		lines.push('');
		for (const result of results.filter((entry) => entry.surface === surface && entry.shots))
			lines.push(
				`- ${result.step}: ${result.shots!.map((shot) => `[${shot}](${shot})`).join(' · ')}`
			);
		lines.push('');
	}
	const moved = results.filter((result) => result.shiftSources.length);
	if (moved.length) {
		lines.push('## What the browser saw move (for diagnosis)', '');
		for (const result of moved)
			lines.push(`- ${result.surface} · ${result.step}: ${result.shiftSources.join('; ')}`);
		lines.push('');
	}
	if (pageErrors.length)
		lines.push('## Page errors', '', ...pageErrors.map((error) => `- ${error}`), '');
	return lines.join('\n');
}

test('the reader holds still on every surface', async () => {
	mkdirSync(OUT, { recursive: true });
	const results: StepResult[] = [];
	for (const surface of SURFACES) {
		if (ONLY.length && !ONLY.some((name) => surface.name.includes(name))) continue;
		results.push(...(await runSurface(surface)));
	}
	if (!ONLY.length || ONLY.some((name) => 'history'.includes(name)))
		results.push(...(await runHistory()));
	const markdown = report(results);
	writeFileSync(join(OUT, 'report.md'), markdown);
	writeFileSync(
		join(OUT, 'report.json'),
		JSON.stringify({ base: BASE, results, writes: shadow.writes, pageErrors }, null, 2)
	);
	console.log(`\n${markdown}\nReport: ${join(OUT, 'report.md')}\n`);
	const failing = results.filter(
		(result) => (result.findings.length && !result.noisy) || result.error
	);
	if (STRICT)
		expect(
			failing.map((result) => `${result.surface} · ${result.step}`),
			`see ${join(OUT, 'report.md')}`
		).toEqual([]);
});
