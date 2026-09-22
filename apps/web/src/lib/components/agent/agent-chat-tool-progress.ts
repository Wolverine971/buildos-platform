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
		if (clicked && typeof clicked.label === 'string') {
			steps.push({
				index: steps.length,
				kind: 'decided',
				message: `Jev: not here${answer ? ` (${answer})` : ''} → "${clicked.label}" (${percent(clicked.probability)})`
			});
		} else if (answer) {
			steps.push({ index: steps.length, kind: 'decided', message: `Jev: answer ${answer}` });
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
