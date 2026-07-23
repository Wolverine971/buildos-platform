// apps/web/src/lib/server/gmail-relevance/metadata-scorer.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectEmailProfileGroups } from './project-email-profile';
import { normalizeEmailRelevanceMetadata } from './metadata-normalizer';
import { scoreEmailRelevanceVariants, type EmailRelevanceScoringProfile } from './metadata-scorer';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function entry(field: string, value: string) {
	return {
		field,
		value,
		normalized_value: value.toLowerCase(),
		sources: [
			{
				source_type: 'project' as const,
				source_id: USER_ID,
				source_field: 'invented'
			}
		],
		value_truncated: false
	};
}

function groups(overrides: Partial<ProjectEmailProfileGroups> = {}): ProjectEmailProfileGroups {
	return {
		identity: [],
		actors: [],
		artifacts: [],
		identifiers: [],
		semantic_context: [],
		negative_evidence: [],
		user_rules: [],
		recency: [],
		...overrides
	};
}

function profile(
	projectId: string,
	profileGroups: ProjectEmailProfileGroups
): EmailRelevanceScoringProfile {
	return {
		project_id: projectId,
		profile_id: projectId.replace(/1$/, '2'),
		profile_version_id: projectId.replace(/1$/, '3'),
		profile_version: 1,
		groups: profileGroups
	};
}

const metadata = normalizeEmailRelevanceMetadata({
	id: 'synthetic_message',
	threadId: 'synthetic_thread',
	internalDate: '1784592000000',
	labelIds: ['INBOX'],
	snippet: 'The orbital launch checklist is ready for ZX-902',
	payload: {
		headers: [
			{ name: 'From', value: 'invented@launch.test' },
			{ name: 'Subject', value: 'ZX-902 launch review' }
		]
	}
});

describe('scoreEmailRelevanceVariants', () => {
	it('scores exact actor/domain/identifier evidence in both variants', () => {
		const target = profile(
			'20000000-0000-4000-8000-000000000001',
			groups({
				actors: [entry('email', 'invented@launch.test'), entry('domain', 'launch.test')],
				identifiers: [entry('ticket', 'ZX-902')]
			})
		);

		const scores = scoreEmailRelevanceVariants({ metadata, profiles: [target] });
		expect(scores).toHaveLength(2);
		for (const score of scores) {
			expect(score.is_candidate).toBe(true);
			expect(score.evidence).toMatchObject({
				actor_overlap: true,
				domain_overlap: true,
				identifier_overlap: true
			});
		}
	});

	it('adds bounded lexical and negative profile evidence only to variant B', () => {
		const target = profile(
			'30000000-0000-4000-8000-000000000001',
			groups({
				identity: [entry('alias', 'orbital launch')],
				negative_evidence: [entry('generic_term', 'checklist')]
			})
		);
		const [a, b] = scoreEmailRelevanceVariants({ metadata, profiles: [target] });

		expect(a).toMatchObject({ variant: 'a', score: 0, is_candidate: false });
		expect(b).toMatchObject({ variant: 'b', score: 0, is_candidate: false });
		expect(b?.evidence).toMatchObject({
			lexical_overlap: true,
			negative_evidence: true
		});
	});

	it('treats explicit thread confirmation and suppression as fixed rule evidence', () => {
		const target = profile('40000000-0000-4000-8000-000000000001', groups());
		const confirmed = scoreEmailRelevanceVariants({
			metadata,
			profiles: [target],
			rules: [
				{
					project_id: target.project_id,
					rule_kind: 'always_thread',
					normalized_value: 'synthetic_thread'
				}
			]
		});
		expect(confirmed.every((score) => score.evidence.confirmed_thread)).toBe(true);
		expect(confirmed.every((score) => score.is_candidate)).toBe(true);

		const suppressed = scoreEmailRelevanceVariants({
			metadata,
			profiles: [target],
			rules: [
				{
					project_id: target.project_id,
					rule_kind: 'always_thread',
					normalized_value: 'synthetic_thread'
				},
				{
					project_id: target.project_id,
					rule_kind: 'never_sender',
					normalized_value: 'invented@launch.test'
				}
			]
		});
		expect(suppressed.every((score) => score.suppressed && !score.is_candidate)).toBe(true);
	});

	it('is invariant to profile and rule input ordering', () => {
		const first = profile(
			'50000000-0000-4000-8000-000000000001',
			groups({ identity: [entry('alias', 'orbital launch')] })
		);
		const second = profile(
			'60000000-0000-4000-8000-000000000001',
			groups({ actors: [entry('domain', 'launch.test')] })
		);
		const rules = [
			{
				project_id: first.project_id,
				rule_kind: 'always_label' as const,
				normalized_value: 'INBOX'
			}
		];
		expect(scoreEmailRelevanceVariants({ metadata, profiles: [first, second], rules })).toEqual(
			scoreEmailRelevanceVariants({
				metadata,
				profiles: [second, first],
				rules: [...rules].reverse()
			})
		);
	});
});
