// apps/web/src/lib/services/ensure-today-brief.ts
/**
 * App-open trigger for today's daily brief (`POST /api/daily-briefs/ensure-today`).
 *
 * /today and the Projects Today row (DashboardBriefWidget) both call this. It sends one request
 * per tab, user and day: callers that arrive while it is in flight share it, and later callers
 * reuse its answer, so moving between the two pages never queues a second generation. Answers
 * that can change during the session are not remembered, so the next caller asks again (the
 * widget's old per-mount behavior): no actor / no briefable projects yet (the user may create a
 * first project), a 5xx, or a network failure. A 4xx (e.g. 402 while billing is frozen) is
 * remembered as "no answer" so a frozen account doesn't re-hit the guard on every page.
 *
 * Separate tabs each send one request. The endpoint answers `completed` / `in_flight` and the
 * worker dedups same-day brief jobs, so that still produces a single generation.
 */
import { browser } from '$app/environment';
import { BriefClientService } from '$lib/services/briefClient.service';
import type { DailyBrief } from '$lib/types/daily-brief';

export const ENSURE_TODAY_BRIEF_ENDPOINT = '/api/daily-briefs/ensure-today';

export type EnsureTodayState =
	| 'completed'
	| 'in_flight'
	| 'queued'
	| 'skipped_no_actor'
	| 'skipped_no_projects'
	| 'skipped_recent_failure';

export type EnsureTodayResult = {
	state: EnsureTodayState;
	briefDate: string;
	timezone: string;
	queued: boolean;
	brief?: DailyBrief | null;
	job?: {
		queue_job_id?: string | null;
		status?: string;
		scheduled_for?: string;
	} | null;
};

export type EnsureTodayBriefUser = {
	id: string;
	email?: string | null;
	is_admin?: boolean | null;
	timezone?: string | null;
};

const RECHECK_STATES = new Set<EnsureTodayState>(['skipped_no_actor', 'skipped_no_projects']);

const answers = new Map<string, EnsureTodayResult | null>();
const pending = new Map<string, Promise<EnsureTodayResult | null>>();

// The server picks the canonical brief date from users.timezone; the browser's calendar day is
// only here so a tab left open overnight asks again on the next day.
function browserDay(now = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

type Outcome = { result: EnsureTodayResult | null; remember: boolean };

async function requestEnsure(
	user: EnsureTodayBriefUser,
	supabaseClient: unknown
): Promise<Outcome> {
	let response: Response;
	try {
		response = await fetch(ENSURE_TODAY_BRIEF_ENDPOINT, { method: 'POST' });
	} catch (error) {
		console.warn('Unable to auto-start daily brief generation:', error);
		return { result: null, remember: false };
	}

	if (!response.ok) {
		console.warn('Daily brief ensure request failed:', response.status);
		return { result: null, remember: response.status < 500 };
	}

	let result: EnsureTodayResult | undefined;
	try {
		const payload = await response.json();
		result = payload?.data as EnsureTodayResult | undefined;
	} catch (error) {
		console.warn('Daily brief ensure returned an unreadable response:', error);
		return { result: null, remember: false };
	}
	if (!result?.state) return { result: null, remember: false };

	// Progress and completion live in shared stores, so one monitor serves every caller.
	const jobId = result.job?.queue_job_id;
	if ((result.state === 'queued' || result.state === 'in_flight') && jobId) {
		try {
			await BriefClientService.monitorQueuedGeneration({
				briefDate: result.briefDate,
				jobId,
				user: {
					id: user.id,
					email: user.email || '',
					is_admin: Boolean(user.is_admin)
				},
				timezone: result.timezone || user.timezone || undefined,
				supabaseClient
			});
		} catch (error) {
			console.warn('Unable to follow daily brief generation:', error);
		}
	}

	return { result, remember: !RECHECK_STATES.has(result.state) };
}

/**
 * Make sure today's brief exists or is being generated. Resolves with the endpoint's answer, or
 * null when there is none (signed out, blocked, or the request failed). Never rejects.
 */
export function ensureTodaysBrief(options: {
	user: EnsureTodayBriefUser | null | undefined;
	supabaseClient?: unknown;
}): Promise<EnsureTodayResult | null> {
	const user = options.user;
	if (!browser || !user?.id) return Promise.resolve(null);

	const key = `${user.id}:${browserDay()}`;
	if (answers.has(key)) return Promise.resolve(answers.get(key) ?? null);
	const inFlight = pending.get(key);
	if (inFlight) return inFlight;

	const request = requestEnsure(user, options.supabaseClient)
		.then(({ result, remember }) => {
			if (remember) answers.set(key, result);
			return result;
		})
		.finally(() => {
			pending.delete(key);
		});
	pending.set(key, request);
	return request;
}
