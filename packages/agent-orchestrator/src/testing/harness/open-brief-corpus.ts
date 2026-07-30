// packages/agent-orchestrator/src/testing/harness/open-brief-corpus.ts
import { z } from 'zod';

import { OpenBriefClarificationLabelSchema } from './open-brief-eval';

export const OpenBriefLabelStatusSchema = z.enum(['proposed', 'dj_rule_derived', 'dj_confirmed']);

export const OpenBriefCorpusBriefSchema = z
	.object({
		brief_id: z.string().min(1),
		text: z.string().min(1),
		applicable_snapshots: z.array(z.string().min(1)),
		clarification_label: z
			.object({
				value: OpenBriefClarificationLabelSchema,
				status: OpenBriefLabelStatusSchema,
				rationale: z.string().min(1)
			})
			.strict(),
		is_swap_test_anchor: z.boolean().optional(),
		dj_verbatim_text: z.string().min(1).optional()
	})
	.passthrough();

export const OpenBriefCorpusSchema = z
	.object({
		schema_version: z.literal(1),
		corpus_version: z.string().min(1),
		status: z.string().min(1),
		swap_test: z
			.object({
				status: z.literal('decided'),
				anchor_brief_id: z.string().min(1),
				pair: z
					.array(
						z
							.object({
								snapshot_ref: z.string().min(1),
								snapshot_sha256: z
									.string()
									.regex(/^[a-f0-9]{64}$/)
									.optional(),
								real_project: z.string().min(1),
								domain: z.string().min(1)
							})
							.passthrough()
					)
					.length(2)
			})
			.passthrough(),
		briefs: z.array(OpenBriefCorpusBriefSchema).min(5),
		pending_from_dj: z.array(
			z
				.object({
					item: z.string().min(1),
					why: z.string().min(1),
					blocks: z.string().min(1)
				})
				.strict()
		),
		design_corrections: z.record(z.unknown()),
		output_contract: z.record(z.unknown()),
		clarification_policy_rule: z.record(z.unknown()),
		acceptance_bar_global: z.record(z.unknown())
	})
	.passthrough()
	.superRefine((corpus, context) => {
		const ids = corpus.briefs.map((brief) => brief.brief_id);
		if (new Set(ids).size !== ids.length) {
			context.addIssue({ code: z.ZodIssueCode.custom, message: 'Brief IDs must be unique' });
		}
		const anchor = corpus.briefs.find(
			(brief) => brief.brief_id === corpus.swap_test.anchor_brief_id
		);
		if (!anchor?.is_swap_test_anchor) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['swap_test', 'anchor_brief_id'],
				message: 'Swap-test anchor must point to the brief marked is_swap_test_anchor'
			});
		}
	});

export type OpenBriefCorpus = z.infer<typeof OpenBriefCorpusSchema>;
export type OpenBriefCorpusBrief = z.infer<typeof OpenBriefCorpusBriefSchema>;

export interface OpenBriefCorpusReadiness {
	scoringReady: boolean;
	reasons: string[];
	pendingBriefIds: string[];
	unconfirmedLabelBriefIds: string[];
}

export interface OpenBriefCorpusCell {
	cellId: string;
	briefId: string;
	snapshotId: string;
	requestText: string;
	clarificationLabel: 'blocked' | 'proceedable';
	isSwapTestAnchor: boolean;
}

export function inspectOpenBriefCorpusReadiness(corpusInput: unknown): OpenBriefCorpusReadiness {
	const corpus = OpenBriefCorpusSchema.parse(corpusInput);
	const reasons: string[] = [];
	const pendingBriefIds = corpus.briefs
		.filter(
			(brief) =>
				/^pending\b/i.test(brief.text.trim()) || brief.applicable_snapshots.length === 0
		)
		.map((brief) => brief.brief_id);
	const unconfirmedLabelBriefIds = corpus.briefs
		.filter((brief) => brief.clarification_label.status !== 'dj_confirmed')
		.map((brief) => brief.brief_id);

	if (corpus.pending_from_dj.length > 0) {
		reasons.push(`${corpus.pending_from_dj.length} pending_from_dj item(s) remain.`);
	}
	if (pendingBriefIds.length > 0) {
		reasons.push(`Brief text or snapshot scope is incomplete: ${pendingBriefIds.join(', ')}.`);
	}
	if (unconfirmedLabelBriefIds.length > 0) {
		reasons.push(`DJ has not confirmed labels for: ${unconfirmedLabelBriefIds.join(', ')}.`);
	}
	const blockedCount = corpus.briefs.filter(
		(brief) => brief.clarification_label.value === 'blocked'
	).length;
	if (blockedCount < 1) reasons.push('The corpus has no blocked clarification control.');
	if (corpus.swap_test.pair.some((entry) => !entry.snapshot_ref)) {
		reasons.push('The swap-test pair is incomplete.');
	}

	return {
		scoringReady: reasons.length === 0,
		reasons,
		pendingBriefIds,
		unconfirmedLabelBriefIds
	};
}

export function buildOpenBriefCorpusCells(corpusInput: unknown): OpenBriefCorpusCell[] {
	const corpus = OpenBriefCorpusSchema.parse(corpusInput);
	const readiness = inspectOpenBriefCorpusReadiness(corpus);
	if (!readiness.scoringReady) {
		throw new Error(`Open-brief corpus is not score-ready: ${readiness.reasons.join(' ')}`);
	}
	return corpus.briefs.flatMap((brief) =>
		brief.applicable_snapshots.map((snapshotId) => ({
			cellId: `${brief.brief_id}__${snapshotId}`,
			briefId: brief.brief_id,
			snapshotId,
			requestText: brief.text,
			clarificationLabel: brief.clarification_label.value,
			isSwapTestAnchor: brief.is_swap_test_anchor === true
		}))
	);
}
