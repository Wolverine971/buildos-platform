// apps/web/src/lib/tests/agentic-e2e/phase-a/acceptance.ts
import type { TurnResult } from '../harness/types';
import type { FrozenAcceptanceCheck } from './fixtures';

export interface AcceptanceCheckResult {
	validatorId: string;
	required: boolean;
	passed: boolean;
	detail: string;
}

export interface AcceptanceEvaluationOptions {
	resolveUrl?: (url: string) => Promise<boolean>;
}

const MUTATION_TOOL_PATTERN =
	/^(create|update|delete|move|mark|transition|archive|send|schedule|reschedule|commit|apply|link|unlink|add|remove)_/i;

function stringArray(config: Record<string, unknown>, key: string): string[] {
	const value = config[key];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function normalized(value: string): string {
	return value.toLocaleLowerCase();
}

export function extractUrls(text: string): string[] {
	const matches = text.match(/https?:\/\/[^\s)\]}>"']+/g) ?? [];
	return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, ''))));
}

function hasSection(text: string, section: string): boolean {
	const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^(?:#{1,6}\\s+|\\*\\*)?${escaped}(?:\\*\\*)?\\s*:?`, 'im').test(text);
}

async function evaluateCheck(
	check: FrozenAcceptanceCheck,
	text: string,
	options: AcceptanceEvaluationOptions
): Promise<AcceptanceCheckResult> {
	const haystack = normalized(text);
	let passed = false;
	let detail = '';

	switch (check.validator_id) {
		case 'answer.contains_all': {
			const terms = stringArray(check.config, 'terms');
			const missing = terms.filter((term) => !haystack.includes(normalized(term)));
			passed = missing.length === 0;
			detail = passed ? `found all ${terms.length} terms` : `missing: ${missing.join(', ')}`;
			break;
		}
		case 'answer.excludes_all': {
			const terms = stringArray(check.config, 'terms');
			const present = terms.filter((term) => haystack.includes(normalized(term)));
			passed = present.length === 0;
			detail = passed
				? `excluded all ${terms.length} terms`
				: `unexpected: ${present.join(', ')}`;
			break;
		}
		case 'answer.bullet_count': {
			const expected = Number(check.config.count);
			const count = text.split('\n').filter((line) => /^(?:[-*+] |\d+\. )/.test(line)).length;
			passed = Number.isInteger(expected) && count === expected;
			detail = `expected ${expected}, found ${count} top-level bullets`;
			break;
		}
		case 'answer.has_sections': {
			const sections = stringArray(check.config, 'sections');
			const missing = sections.filter((section) => !hasSection(text, section));
			passed = missing.length === 0;
			detail = passed
				? `found all ${sections.length} sections`
				: `missing: ${missing.join(', ')}`;
			break;
		}
		case 'artifact.citations.include_url': {
			const url = typeof check.config.url === 'string' ? check.config.url : '';
			passed = Boolean(url) && text.includes(url);
			detail = passed
				? 'supplied URL cited'
				: `missing citation: ${url || '(invalid URL config)'}`;
			break;
		}
		case 'artifact.claims.cited': {
			const urls = extractUrls(text);
			passed = urls.length > 0;
			detail = passed ? `${urls.length} external URL(s) cited` : 'no external citation found';
			break;
		}
		case 'artifact.citations.resolve': {
			const urls = extractUrls(text);
			const allowZero = check.config.allow_zero_citations_for_original_design === true;
			const minimum = Number(check.config.minimum_citations ?? 0);
			if (urls.length === 0 && allowZero) {
				passed = true;
				detail = 'no citations used; original-design allowance applied';
				break;
			}
			if (urls.length < minimum) {
				passed = false;
				detail = `expected at least ${minimum} citations, found ${urls.length}`;
				break;
			}
			const resolutions = await Promise.all(
				urls.map((url) =>
					options.resolveUrl ? options.resolveUrl(url) : Promise.resolve(true)
				)
			);
			passed = resolutions.every(Boolean);
			detail = passed
				? `${urls.length} citation URL(s) resolved`
				: `${resolutions.filter(Boolean).length}/${urls.length} citation URL(s) resolved`;
			break;
		}
		case 'route.asks_question': {
			const terms = stringArray(check.config, 'terms');
			const missing = terms.filter((term) => !haystack.includes(normalized(term)));
			passed = text.includes('?') && missing.length === 0;
			detail = passed
				? 'asked the required clarifying question'
				: `question=${text.includes('?')}; missing: ${missing.join(', ') || '(none)'}`;
			break;
		}
		case 'route.reports_gap': {
			const capability =
				typeof check.config.capability === 'string'
					? check.config.capability.split('.')[0]
					: '';
			const gapLanguage =
				/(?:cannot|can't|unable|don't have|do not have|not connected|no access)/i.test(
					text
				);
			passed = gapLanguage && (!capability || haystack.includes(normalized(capability)));
			detail = passed
				? 'reported the capability gap'
				: 'missing explicit capability-gap language';
			break;
		}
		default:
			detail = `unknown validator: ${check.validator_id}`;
	}

	return {
		validatorId: check.validator_id,
		required: check.required,
		passed,
		detail
	};
}

export function evaluateAcceptanceChecks(
	checks: FrozenAcceptanceCheck[],
	text: string,
	options: AcceptanceEvaluationOptions = {}
): Promise<AcceptanceCheckResult[]> {
	return Promise.all(checks.map((check) => evaluateCheck(check, text, options)));
}

export function assertNoMutationToolCalls(turn: TurnResult): void {
	const mutationTools = turn.toolCalls
		.map((call) => call.function.name)
		.filter((name) => MUTATION_TOOL_PATTERN.test(name));
	if (mutationTools.length > 0) {
		throw new Error(
			`[phase-a-control] read-only scenario called mutation tools: ${mutationTools.join(', ')}`
		);
	}
}
