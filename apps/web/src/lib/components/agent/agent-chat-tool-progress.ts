// apps/web/src/lib/components/agent/agent-chat-tool-progress.ts
//
// Live sub-steps inside a running tool call (worker `tool_progress` events),
// kept on the tool row's activity metadata so they survive the tool's
// completion update, plus reconstruction from a finished web_navigate result
// when a session is reloaded.

export interface ToolProgressStep {
	index: number;
	message: string;
	kind: string;
	data?: Record<string, unknown>;
}

const MAX_STEPS = 32;

function isStep(value: unknown): value is ToolProgressStep {
	if (!value || typeof value !== 'object') return false;
	const step = value as Record<string, unknown>;
	return (
		typeof step.index === 'number' &&
		Number.isInteger(step.index) &&
		typeof step.message === 'string' &&
		typeof step.kind === 'string'
	);
}

export function readToolProgressSteps(value: unknown): ToolProgressStep[] {
	return Array.isArray(value) ? value.filter(isStep) : [];
}

/** Idempotent by index (live replays and reconnects can resend a step). */
export function mergeToolProgressStep(
	existing: unknown,
	step: ToolProgressStep
): ToolProgressStep[] {
	const steps = readToolProgressSteps(existing).filter((s) => s.index !== step.index);
	steps.push(step);
	steps.sort((a, b) => a.index - b.index);
	return steps.slice(-MAX_STEPS);
}

function shortUrl(url: unknown): string {
	if (typeof url !== 'string') return '';
	try {
		const parsed = new URL(url);
		const shown =
			`${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}${parsed.search}`.replace(
				/\/$/,
				''
			);
		return shown.length > 70 ? `${shown.slice(0, 67)}…` : shown;
	} catch {
		return url.slice(0, 70);
	}
}

const percent = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '';

/**
 * Rebuild a compact trail from a persisted web_navigate result (`path` rows),
 * so a reloaded session still shows where navigation went.
 */
export function buildWebNavigateTrailFromResult(result: unknown): ToolProgressStep[] {
	if (!result || typeof result !== 'object') return [];
	const record = result as Record<string, unknown>;
	const path = Array.isArray(record.path) ? record.path : [];
	const steps: ToolProgressStep[] = [];
	for (const entry of path) {
		if (!entry || typeof entry !== 'object') continue;
		const row = entry as Record<string, unknown>;
		if (typeof row.error === 'string') {
			steps.push({
				index: steps.length,
				kind: 'load_failed',
				message: `Couldn't use ${shortUrl(row.url)}`
			});
			continue;
		}
		steps.push({
			index: steps.length,
			kind: 'opened',
			message: `Opened ${shortUrl(row.url)}${row.source === 'tavily_extract' ? ' · via Tavily' : ''}`
		});
		const clicked = row.clicked as Record<string, unknown> | undefined;
		const answer = percent(row.answer_probability);
		// Same words as the worker's live trail; never an internal model name.
		if (clicked && typeof clicked.label === 'string') {
			const chance = percent(clicked.probability);
			steps.push({
				index: steps.length,
				kind: 'decided',
				message: `Not on this page${answer ? ` (${answer})` : ''} → "${clicked.label}"${chance ? ` (${chance})` : ''}`
			});
		} else if (answer) {
			const here =
				typeof row.answer_probability === 'number' && row.answer_probability >= 0.5;
			steps.push({
				index: steps.length,
				kind: 'decided',
				message: `${here ? 'Answer is on this page' : 'Not on this page'} (${answer})`
			});
		}
	}
	const outcome = record.outcome;
	const page = record.answer_page as Record<string, unknown> | undefined;
	if (outcome === 'found' || outcome === 'best_guess' || outcome === 'not_found') {
		const where = typeof page?.title === 'string' ? page.title : shortUrl(page?.url);
		steps.push({
			index: steps.length,
			kind: 'finished',
			message:
				outcome === 'found'
					? `Found it: ${where}`
					: outcome === 'best_guess'
						? `Closest match: ${where}`
						: 'No page answered the goal',
			data: { outcome }
		});
	}
	return steps;
}

function siteOf(url: unknown): string {
	if (typeof url !== 'string') return '';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

/**
 * Rebuild a compact trail from a persisted guided-search result (find_in_knowledge or
 * explore_knowledge), so a reloaded session still shows what the search did: what it looked
 * at, which searches ran, which sites it read, and what it saved. From structured fields only.
 */
export function buildGuidedSearchTrailFromResult(result: unknown): ToolProgressStep[] {
	if (!result || typeof result !== 'object') return [];
	const record = result as Record<string, unknown>;
	const steps: ToolProgressStep[] = [];
	const push = (kind: string, message: string) =>
		steps.push({ index: steps.length, kind, message });
	const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
	const checkKeys = (value: unknown) =>
		(Array.isArray(value) ? value : [])
			.map((check) =>
				check && typeof check === 'object' ? (check as { key?: unknown }).key : null
			)
			.filter((key): key is string => typeof key === 'string');

	const find = record.knowledge_find as Record<string, unknown> | undefined;
	if (find && typeof find === 'object') {
		const pool = find.pool as { total?: unknown; people?: unknown } | undefined;
		// `people` is the shape results stored before other kinds could be searched.
		const pulled =
			typeof pool?.total === 'number'
				? pool.total
				: typeof pool?.people === 'number'
					? pool.people
					: null;
		const kinds = Array.isArray(find.kinds) ? find.kinds : ['person'];
		const onlyPeople = kinds.length === 1 && kinds[0] === 'person';
		if (pulled !== null)
			push(
				'lookup',
				`Pulled · ${onlyPeople ? 'people in your world' : 'entries in your graph'} · ${pulled}`
			);
		const keys = checkKeys(find.checks);
		const counts = find.counts as { pass_all?: unknown; cant_tell?: unknown } | undefined;
		if (keys.length && typeof counts?.pass_all === 'number')
			push(
				'decide',
				`Judged · each against: ${keys.join(', ')} · ${counts.pass_all} pass, ${
					typeof counts.cant_tell === 'number' ? counts.cant_tell : 0
				} can't tell`
			);
		return steps;
	}

	const explore = record.knowledge_explore as Record<string, unknown> | undefined;
	if (!explore || typeof explore !== 'object') return steps;
	for (const query of Array.isArray(explore.queries) ? explore.queries : []) {
		if (typeof query === 'string') push('search', `Searched · ${query}`);
	}
	const sites = [
		...new Set(
			(Array.isArray(explore.pages) ? explore.pages : [])
				.map((page) => siteOf((page as { url?: unknown } | null)?.url))
				.filter(Boolean)
		)
	];
	if (sites.length) push('read', `Read · ${sites.join(', ')}`);
	const found = count(explore.entities);
	if (found) {
		const saved = explore.saved as { new?: unknown } | undefined;
		const fresh = typeof saved?.new === 'number' ? saved.new : 0;
		push(
			'save',
			`Saved · to your graph, marked found on the web · ${fresh} new, ${Math.max(found - fresh, 0)} already there`
		);
	}
	const stopped = explore.stopped as { reason?: unknown } | undefined;
	if (stopped && typeof stopped === 'object') {
		push(
			'stop',
			stopped.reason === 'hop_limit'
				? 'Stopped · 3 hops is the limit for one trail'
				: 'Stopped'
		);
	}
	return steps;
}
