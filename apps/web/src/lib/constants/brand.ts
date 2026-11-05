// apps/web/src/lib/constants/brand.ts
// Public positioning and the prompts that teach the core project workflow.
export const BRAND_TAGLINE = 'A project workspace you can talk to.';
export const BRAND_DESCRIPTION =
	'BuildOS is a project workspace you can talk to. Organize rough notes into tasks, documents, and next steps. Tell it what changed and keep going.';
export const BRAND_EXPLAINER =
	'Paste your rough notes or tell BuildOS what you’re working on. It organizes the pieces into tasks, documents, and next steps. Tell it what changes as you go.';
export const START_PROJECT_CTA = 'Start with one project';
/** Home D's one action: scroll to the paste box. */
export const START_WITH_NOTES_CTA = 'Start with my notes';

/** The public nav and footer start button: Home D has a paste box, so there it scrolls to it. */
export function publicStartCta(pathname: string): { href: string; label: string } {
	return pathname === '/home-d'
		? { href: '#d-start', label: START_WITH_NOTES_CTA }
		: { href: '/auth/register', label: START_PROJECT_CTA };
}
export const FIRST_PROJECT_PROMPT =
	"I'm working on ____. Here's what I have so far. Here's where I'm stuck.";
export const PROJECT_UPDATE_PROMPT =
	'Tell BuildOS one thing that changed: something you finished, a new idea, or a deadline that moved.';
