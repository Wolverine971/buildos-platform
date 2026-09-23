// apps/web/src/lib/components/agent/agent-chat-initial-review.test.ts
import { describe, expect, it } from 'vitest';
import { resolveInitialReview } from './agent-chat-initial-review';

const ready = { status: 'ready' as const, projectReview: true, documentOrganization: true };

describe('resolveInitialReview', () => {
	it.each(['project_review', 'document_organization'] as const)(
		'selects the %s lane for the launched project',
		(intent) => {
			expect(
				resolveInitialReview({ intent, capabilities: ready, reviewProjectId: 'project-1' })
			).toEqual({ kind: 'ready', selection: { projectId: 'project-1', intent } });
		}
	);

	it('waits for the capability answer instead of sending the draft as chat', () => {
		expect(
			resolveInitialReview({
				intent: 'project_review',
				capabilities: { status: 'loading' },
				reviewProjectId: 'project-1'
			})
		).toEqual({ kind: 'wait' });
	});

	it('waits until the project-wide scope settles', () => {
		expect(
			resolveInitialReview({
				intent: 'project_review',
				capabilities: ready,
				reviewProjectId: null
			})
		).toEqual({ kind: 'wait' });
	});

	it.each([
		['project_review', { ...ready, projectReview: false }, /Project review is not enabled/],
		[
			'document_organization',
			{ ...ready, documentOrganization: false },
			/Specialist document reviews are not enabled/
		],
		['project_review', { status: 'failed' as const }, /could not confirm/]
	] as const)('reports an unavailable %s lane', (intent, capabilities, message) => {
		const decision = resolveInitialReview({
			intent,
			capabilities,
			reviewProjectId: 'project-1'
		});
		expect(decision.kind).toBe('unavailable');
		expect(decision.kind === 'unavailable' && decision.message).toMatch(message);
	});
});
