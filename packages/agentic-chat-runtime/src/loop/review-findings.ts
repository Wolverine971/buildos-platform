// packages/agentic-chat-runtime/src/loop/review-findings.ts
import type { JsonObject } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';

export const MUTATION_REVIEW_FINDING_CODES = [
	'uncommissioned_change',
	'wrong_target',
	'wrong_value',
	'missing_prerequisite',
	'publication_effect',
	'protected_target',
	'other'
] as const;
export type MutationReviewFinding = {
	code: (typeof MUTATION_REVIEW_FINDING_CODES)[number];
	target_ids: string[];
	message: string;
	required_correction: string;
};
export const MUTATION_REVIEW_FINDINGS_SCHEMA: JsonObject = {
	type: 'array',
	maxItems: 8,
	description:
		'Separate actionable defects. Each message is a complete user-facing explanation; keep actor instructions in required_correction. Group targets sharing the same defect. These findings never authorize a write.',
	items: {
		type: 'object',
		additionalProperties: false,
		required: ['code', 'target_ids', 'message', 'required_correction'],
		properties: {
			code: { type: 'string', enum: [...MUTATION_REVIEW_FINDING_CODES] },
			target_ids: {
				type: 'array',
				maxItems: 25,
				items: { type: 'string', minLength: 1, maxLength: 100 }
			},
			message: {
				type: 'string',
				minLength: 1,
				maxLength: 600,
				description:
					'Complete user-facing sentence naming the affected target and defect. Do not include tool names, digests, or actor instructions.'
			},
			required_correction: {
				type: 'string',
				minLength: 1,
				maxLength: 800,
				description:
					'The acting model correction; never a request for user permission to change an uncommissioned target.'
			}
		}
	}
};

/** Structured schema parsing only; no prose classification or silent clipping. */
export function parseMutationReviewFindings(value: unknown): MutationReviewFinding[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 8) return null;
	const result: MutationReviewFinding[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
		const f = item as Record<string, unknown>;
		if (
			!MUTATION_REVIEW_FINDING_CODES.includes(f.code as MutationReviewFinding['code']) ||
			!Array.isArray(f.target_ids) ||
			f.target_ids.length > 25 ||
			f.target_ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 100) ||
			typeof f.message !== 'string' ||
			!f.message.trim() ||
			f.message.length > 600 ||
			typeof f.required_correction !== 'string' ||
			!f.required_correction.trim() ||
			f.required_correction.length > 800 ||
			Object.keys(f).some(
				(k) => !['code', 'target_ids', 'message', 'required_correction'].includes(k)
			)
		)
			return null;
		result.push({
			code: f.code as MutationReviewFinding['code'],
			target_ids: [...new Set(f.target_ids as string[])],
			message: f.message.trim(),
			required_correction: f.required_correction.trim()
		});
	}
	return result;
}

export function extractLastMutationReviewFindings(
	executions: readonly FastToolExecution[]
): MutationReviewFinding[] {
	for (const execution of [...executions].reverse()) {
		if (
			execution.toolCall.function.name !== 'request_proposal_revision' ||
			!execution.result.success ||
			execution.result.result?.status !== 'revision_required'
		)
			continue;
		try {
			const proposed = parseMutationReviewFindings(
				JSON.parse(execution.toolCall.function.arguments).findings
			);
			const persisted = parseMutationReviewFindings(execution.result.result.findings);
			return proposed && persisted && JSON.stringify(proposed) === JSON.stringify(persisted)
				? persisted
				: [];
		} catch {
			return [];
		}
	}
	return [];
}

export function renderMutationReviewFindings(
	findings: readonly MutationReviewFinding[]
): string | null {
	return findings.length
		? findings.map((f) => `- ${f.message.replace(/[\r\n\t]/g, ' ')}`).join('\n')
		: null;
}
