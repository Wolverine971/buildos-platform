// packages/agent-orchestrator/src/testing/harness/acceptance-eval.ts
//
// SINGLE SOURCE OF TRUTH for corpus acceptance validators.
//
// Both comparison lanes must score identically or the comparison is meaningless. This module owns
// every validator id used by `corpus/phase-a.json`; the control lane
// (`apps/web/src/lib/tests/agentic-e2e/phase-a/acceptance.ts`) delegates here rather than keeping a
// parallel implementation. `acceptance-eval.parity.test.ts` fails if the corpus ever introduces a
// validator id this file does not implement.
//
// History: a second implementation lived in the control lane and this one silently returned
// `passed: false` for `answer.bullet_count`, `route.asks_question`, and `route.reports_gap`. Because
// a required-check failure vetoes a workflow blind win regardless of judge preference, that
// divergence could have zeroed the workflow lane. See research/09_INTERNAL_GROUND_TRUTH_MAP.md D12.
export interface HarnessAcceptanceCheck {
	validator_id: string;
	description: string;
	required: boolean;
	config: Record<string, unknown>;
}

export interface HarnessAcceptanceResult {
	validatorId: string;
	required: boolean;
	passed: boolean;
	detail: string;
}

function stringArray(config: Record<string, unknown>, key: string): string[] {
	const value = config[key];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

export function extractAnswerUrls(text: string): string[] {
	const matches = text.match(/https?:\/\/[^\s)\]}>'"]+/g) ?? [];
	return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, ''))));
}

function hasSection(text: string, section: string): boolean {
	const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^(?:#{1,6}\\s+|\\*\\*)?${escaped}(?:\\*\\*)?\\s*:?`, 'im').test(text);
}

export async function evaluateHarnessAcceptance(params: {
	checks: HarnessAcceptanceCheck[];
	text: string;
	resolveUrl?: (url: string) => Promise<boolean>;
}): Promise<HarnessAcceptanceResult[]> {
	const haystack = params.text.toLocaleLowerCase();
	return Promise.all(
		params.checks.map(async (check) => {
			let passed = false;
			let detail = '';
			switch (check.validator_id) {
				case 'answer.contains_all': {
					const terms = stringArray(check.config, 'terms');
					const missing = terms.filter(
						(term) => !haystack.includes(term.toLocaleLowerCase())
					);
					passed = missing.length === 0;
					detail = passed
						? `found all ${terms.length} terms`
						: `missing: ${missing.join(', ')}`;
					break;
				}
				case 'answer.excludes_all': {
					const terms = stringArray(check.config, 'terms');
					const present = terms.filter((term) =>
						haystack.includes(term.toLocaleLowerCase())
					);
					passed = present.length === 0;
					detail = passed
						? `excluded all ${terms.length} terms`
						: `unexpected: ${present.join(', ')}`;
					break;
				}
				case 'answer.bullet_count': {
					const expected = Number(check.config.count);
					const count = params.text
						.split('\n')
						.filter((line) => /^(?:[-*+] |\d+\. )/.test(line)).length;
					passed = Number.isInteger(expected) && count === expected;
					detail = `expected ${expected}, found ${count} top-level bullets`;
					break;
				}
				case 'answer.has_sections': {
					const sections = stringArray(check.config, 'sections');
					const missing = sections.filter((section) => !hasSection(params.text, section));
					passed = missing.length === 0;
					detail = passed
						? `found all ${sections.length} sections`
						: `missing: ${missing.join(', ')}`;
					break;
				}
				case 'artifact.citations.include_url': {
					const url = typeof check.config.url === 'string' ? check.config.url : '';
					passed = Boolean(url) && params.text.includes(url);
					detail = passed ? 'supplied URL cited' : `missing citation: ${url}`;
					break;
				}
				case 'artifact.claims.cited': {
					const urls = extractAnswerUrls(params.text);
					passed = urls.length > 0;
					detail = passed
						? `${urls.length} external URL(s) cited`
						: 'no external citation found';
					break;
				}
				case 'artifact.citations.resolve': {
					const urls = extractAnswerUrls(params.text);
					const minimum = Number(check.config.minimum_citations ?? 0);
					const allowZero =
						check.config.allow_zero_citations_for_original_design === true;
					if (urls.length === 0 && allowZero) {
						passed = true;
						detail = 'no citations used; original-design allowance applied';
						break;
					}
					if (urls.length < minimum) {
						detail = `expected at least ${minimum} citations, found ${urls.length}`;
						break;
					}
					const resolutions = await Promise.all(
						urls.map((url) => params.resolveUrl?.(url) ?? Promise.resolve(true))
					);
					passed = resolutions.every(Boolean);
					detail = passed
						? `${urls.length} citation URL(s) resolved`
						: `${resolutions.filter(Boolean).length}/${urls.length} citation URL(s) resolved`;
					break;
				}
				case 'route.asks_question': {
					const terms = stringArray(check.config, 'terms');
					const missing = terms.filter(
						(term) => !haystack.includes(term.toLocaleLowerCase())
					);
					passed = params.text.includes('?') && missing.length === 0;
					detail = passed
						? 'asked the required clarifying question'
						: `question=${params.text.includes('?')}; missing: ${
								missing.join(', ') || '(none)'
							}`;
					break;
				}
				case 'route.reports_gap': {
					const capability =
						typeof check.config.capability === 'string'
							? check.config.capability.split('.')[0]
							: '';
					const gapLanguage =
						/(?:cannot|can't|unable|don't have|do not have|not connected|no access)/i.test(
							params.text
						);
					passed =
						gapLanguage &&
						(!capability || haystack.includes(capability.toLocaleLowerCase()));
					detail = passed
						? 'reported the capability gap'
						: 'missing explicit capability-gap language';
					break;
				}
				default:
					// Never silently fail an unknown validator: an unimplemented id is a harness bug,
					// and scoring it as a content failure is how a lane gets zeroed by accident.
					throw new Error(
						`Unimplemented acceptance validator "${check.validator_id}". ` +
							'Implement it in packages/agent-orchestrator/src/testing/harness/acceptance-eval.ts ' +
							'— both comparison lanes score through this module.'
					);
			}
			return {
				validatorId: check.validator_id,
				required: check.required,
				passed,
				detail
			};
		})
	);
}
