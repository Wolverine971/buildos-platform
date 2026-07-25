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
					detail = passed ? `found all ${terms.length} terms` : `missing: ${missing.join(', ')}`;
					break;
				}
				case 'answer.excludes_all': {
					const terms = stringArray(check.config, 'terms');
					const present = terms.filter((term) => haystack.includes(term.toLocaleLowerCase()));
					passed = present.length === 0;
					detail = passed
						? `excluded all ${terms.length} terms`
						: `unexpected: ${present.join(', ')}`;
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
					detail = passed ? `${urls.length} external URL(s) cited` : 'no external citation found';
					break;
				}
				case 'artifact.citations.resolve': {
					const urls = extractAnswerUrls(params.text);
					const minimum = Number(check.config.minimum_citations ?? 0);
					const allowZero = check.config.allow_zero_citations_for_original_design === true;
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
				default:
					detail = `unsupported A2 workflow validator: ${check.validator_id}`;
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
