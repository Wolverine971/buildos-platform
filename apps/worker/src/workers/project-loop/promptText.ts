// apps/worker/src/workers/project-loop/promptText.ts
//
// How Project Review and Project Audit prompts shorten user text. Every cut is visible ("…")
// and every prompt says what "…" means. An unmarked cut made the loop report the stored goal
// as "truncated mid-word" when the prompt builder had cut it (tasker 107).

export const PROJECT_REVIEW_CLIPPED_TEXT_RULE =
	'Text ending in "…" was shortened for this review; the full text exists in the project. Never report a name, description, goal, or document as truncated, cut off, or incomplete because it ends in "…".';

/**
 * Cut at a word boundary with a visible "…"; text within `max` passes through whole.
 * `keepLines` keeps line breaks (lists, sections); otherwise whitespace collapses to one line.
 */
export function clipForPrompt(
	value: string | null | undefined,
	max: number,
	options: { keepLines?: boolean } = {}
): string {
	const raw = String(value ?? '');
	const text = options.keepLines
		? raw
				.replace(/\r\n?/g, '\n')
				.replace(/[ \t]+/g, ' ')
				.replace(/\n{3,}/g, '\n\n')
				.trim()
		: raw.replace(/\s+/g, ' ').trim();
	if (text.length <= max) return text;
	const cut = text.slice(0, Math.max(1, max - 1));
	const boundary = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
	return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}
