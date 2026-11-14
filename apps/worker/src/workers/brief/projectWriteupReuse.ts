// apps/worker/src/workers/brief/projectWriteupReuse.ts
/**
 * Reusing a project write-up when the project did not change.
 *
 * In prod (30 days to 2026-11-14) 229 of 411 model-written project write-ups were for
 * projects with no changes: the same project was rewritten every morning, and each
 * rewrite replaced the next step shown on the project page. Each write-up now stores
 * a hash of what it was written from. When today's hash equals the hash on the
 * project's most recent write-up, that write-up is used again: no model call and no
 * next-step write. A write-up is reused for at most PROJECT_WRITEUP_REUSE_MAX_DAYS
 * days, so every project is rewritten at least weekly.
 *
 * What the hash covers is defined by the prompt itself; see
 * `OntologyProjectBriefPrompt.buildFingerprintSource`.
 */

import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import { OntologyProjectBriefPrompt } from './ontologyPrompts.js';
import type { ProjectBriefData } from './ontologyBriefTypes.js';

/** A write-up written for day D is reused through day D+6 and rewritten on day D+7. */
export const PROJECT_WRITEUP_REUSE_MAX_DAYS = 7;
/** Bump to make every stored hash stale, which rewrites every project once. */
const INPUT_HASH_VERSION = 'v1';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `generationMode` in `ontology_project_briefs.metadata`. */
export type ProjectWriteupGenerationMode = 'llm' | 'reused' | 'deterministic_fallback';

export interface PreviousProjectWriteup {
	/** The daily brief the stored row belongs to. */
	briefDate: string;
	briefContent: string;
	inputHash: string | null;
	/** A model wrote the content, on `writtenForDate`. Template write-ups are never reused. */
	modelWritten: boolean;
	/** The brief date the content was written for; earlier than `briefDate` on a reused row. */
	writtenForDate: string;
}

export type ProjectWriteupReuseDecision =
	| { reuse: true; briefContent: string; writtenForDate: string }
	| {
			reuse: false;
			reason:
				| 'no_previous_writeup'
				| 'previous_not_model_written'
				| 'inputs_changed'
				| 'weekly_refresh';
	  };

/**
 * Hash of everything the project write-up is written from, in the prompt's day-stable
 * rendering. Equal on two days when nothing changed; different when a task is added,
 * finished or edited, or turns due today or overdue.
 */
export function computeProjectWriteupInputHash(
	project: ProjectBriefData,
	briefDate: string,
	timezone: string
): string {
	const source = OntologyProjectBriefPrompt.buildFingerprintSource({
		date: briefDate,
		timezone,
		project
	});
	return `${INPUT_HASH_VERSION}:${createHash('sha256').update(source).digest('hex')}`;
}

/** Reads the reuse fields back out of a stored project write-up row. */
export function readPreviousProjectWriteup(
	row: { brief_content: string | null; metadata: unknown },
	briefDate: string
): PreviousProjectWriteup {
	const metadata =
		row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
			? (row.metadata as Record<string, unknown>)
			: {};
	const reusedFromDate =
		typeof metadata.writeupReusedFromDate === 'string' &&
		ISO_DATE_PATTERN.test(metadata.writeupReusedFromDate)
			? metadata.writeupReusedFromDate
			: null;
	const wasReused = metadata.generationMode === 'reused' && reusedFromDate !== null;

	return {
		briefDate,
		briefContent: row.brief_content ?? '',
		inputHash: typeof metadata.inputHash === 'string' ? metadata.inputHash : null,
		modelWritten: metadata.generationMode === 'llm' || wasReused,
		writtenForDate: wasReused && reusedFromDate ? reusedFromDate : briefDate
	};
}

export function decideProjectWriteupReuse(params: {
	inputHash: string;
	briefDate: string;
	previous: PreviousProjectWriteup | null | undefined;
}): ProjectWriteupReuseDecision {
	const { inputHash, briefDate, previous } = params;
	if (!previous) return { reuse: false, reason: 'no_previous_writeup' };
	if (!previous.modelWritten || !previous.briefContent.trim()) {
		return { reuse: false, reason: 'previous_not_model_written' };
	}
	if (previous.inputHash !== inputHash) return { reuse: false, reason: 'inputs_changed' };

	const ageDays = differenceInCalendarDays(
		parseISO(`${briefDate}T00:00:00`),
		parseISO(`${previous.writtenForDate}T00:00:00`)
	);
	// A negative age is a write-up from a later day than the brief being generated.
	if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays >= PROJECT_WRITEUP_REUSE_MAX_DAYS) {
		return { reuse: false, reason: 'weekly_refresh' };
	}

	return {
		reuse: true,
		briefContent: previous.briefContent,
		writtenForDate: previous.writtenForDate
	};
}

/**
 * The most recent stored write-up per project, from the user's latest briefs up to and
 * including `briefDate` (today's own rows exist when an earlier attempt at this brief
 * saved some before failing). Two queries for the whole brief. Never throws: without
 * earlier write-ups every project is simply written fresh.
 */
export async function loadPreviousProjectWriteups(
	supabase: TypedSupabaseClient,
	params: { userId: string; projectIds: string[]; briefDate: string }
): Promise<Map<string, PreviousProjectWriteup>> {
	const { userId, projectIds, briefDate } = params;
	const writeups = new Map<string, PreviousProjectWriteup>();
	if (projectIds.length === 0) return writeups;

	try {
		const earliestDate = format(
			subDays(parseISO(`${briefDate}T00:00:00`), PROJECT_WRITEUP_REUSE_MAX_DAYS),
			'yyyy-MM-dd'
		);
		// Today's brief (a retry) and the one before it. Every active project gets a
		// row in every brief, so a project's latest write-up is in one of these two.
		const { data: briefs, error: briefsError } = await supabase
			.from('ontology_daily_briefs')
			.select('id, brief_date')
			.eq('user_id', userId)
			.gte('brief_date', earliestDate)
			.lte('brief_date', briefDate)
			.order('brief_date', { ascending: false })
			.limit(2);
		if (briefsError) throw new Error(briefsError.message);

		const briefDateById = new Map<string, string>();
		for (const brief of Array.isArray(briefs) ? briefs : []) {
			if (brief?.id && typeof brief.brief_date === 'string') {
				briefDateById.set(brief.id, brief.brief_date);
			}
		}
		if (briefDateById.size === 0) return writeups;

		const { data: rows, error: rowsError } = await supabase
			.from('ontology_project_briefs')
			.select('daily_brief_id, project_id, brief_content, metadata')
			.in('daily_brief_id', Array.from(briefDateById.keys()))
			.in('project_id', projectIds);
		if (rowsError) throw new Error(rowsError.message);

		for (const row of Array.isArray(rows) ? rows : []) {
			const rowBriefDate = briefDateById.get(row.daily_brief_id);
			if (!rowBriefDate) continue;
			const current = writeups.get(row.project_id);
			if (current && current.briefDate >= rowBriefDate) continue;
			writeups.set(row.project_id, readPreviousProjectWriteup(row, rowBriefDate));
		}
	} catch (error) {
		console.warn(
			'[OntologyBrief] Could not load earlier project write-ups; writing every project fresh:',
			error
		);
		return new Map();
	}

	return writeups;
}
