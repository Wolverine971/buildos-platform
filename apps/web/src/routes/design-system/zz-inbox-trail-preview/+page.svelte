<!-- apps/web/src/routes/design-system/zz-inbox-trail-preview/+page.svelte -->
<!-- TEMPORARY (tasker 156): the inbox trail on the real cards, with real Wayne Strategies items
     and every save stubbed. Delete after review. -->
<script lang="ts">
	import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
	import InboxActivity from '$lib/components/inbox/InboxActivity.svelte';
	import type { ActivityPayload } from '$lib/components/inbox/inbox-activity';
	import InboxCheckIns from '$lib/components/inbox/InboxCheckIns.svelte';
	import InboxEmailUpdatesStrip from '$lib/components/inbox/InboxEmailUpdatesStrip.svelte';
	import InboxProjectCleanup from '$lib/components/inbox/InboxProjectCleanup.svelte';
	import type { CheckInProject } from '$lib/types/inbox-check-ins';

	const P = 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b';
	const OUTREACH = '7a06e9cf-9767-4176-979e-76921dc4875d';
	const BRAND = '818734e5-3d79-4fed-a0cc-b62aa77b6c13';
	const STRATEGY = '5c774575-184d-4987-806e-bc2c29ed79c7';

	if (typeof window !== 'undefined') {
		const real = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const url =
				typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			if (!url.includes('/api/')) return real(input, init);
			await new Promise((resolve) => setTimeout(resolve, 400));
			return new Response(
				JSON.stringify({ success: true, data: { outcomes: [], view: null } }),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		};
	}

	function op(key: string, actionLabel: string, target: string, before: string, value: string) {
		return {
			key,
			action: 'update',
			actionLabel,
			entityLabel: 'document',
			target,
			summary: null,
			changes: [{ label: 'Where', value, before }]
		};
	}

	const base = {
		source: 'review' as const,
		executable: true,
		seen_count: 1,
		first_seen_at: '2026-11-07T05:01:05.489Z',
		updated_at: '2026-11-07T05:01:06.700Z'
	};

	const archive: ProjectCleanupItem = {
		...base,
		id: 'archive',
		kind: 'doc_outdated',
		section: 'safe_cleanup',
		ask_kind: 'tidy',
		title: 'Archive "Outreach week: Oct 5–11"',
		summary: 'Archive the historical outreach week plan.',
		why_now:
			'Its stated outreach window ended weeks ago, so this week-specific plan no longer belongs in the active working view.',
		rows: [
			{
				suggestion_id: 's-archive',
				kind: 'doc_outdated',
				title: 'Archive "Outreach week: Oct 5–11"',
				operation_count: 1,
				verified_headline: 'Archive "Outreach week: Oct 5–11"',
				verified_fingerprint: 'fp-archive',
				verified_operations: [
					op(
						'a1',
						'Archive',
						'Outreach week: Oct 5–11',
						'Top level',
						'Archived (restorable)'
					)
				],
				tree_operations: [
					{ tool: 'archive_onto_document', args: { document_id: OUTREACH } }
				],
				updated_at: base.updated_at
			}
		],
		evidence_refs: [
			{
				entity_type: 'document',
				entity_id: OUTREACH,
				title: 'Outreach week: Oct 5–11',
				reason: "The document's title and description identify it as a plan for the concluded Oct 5–11 outreach week."
			}
		],
		// Scores from the 2026-10-29 dry run (a real held candidate), on the archive bar.
		auto_check: {
			scores: { about: 0.89, wanted: 0.79, review: 0.52, safe: 0.91 },
			bar: { minAbout: 0.85, minWanted: 0.8, minSafe: 0.9, maxReview: 0.3 },
			outcome: 'below_bar',
			at: '2026-11-07T05:01:40.000Z',
			run_id: null
		}
	};

	const path: ProjectCleanupItem = {
		...base,
		id: 'path',
		kind: 'doc_org',
		section: 'needs_call',
		ask_kind: 'path',
		seen_count: 3,
		first_seen_at: '2026-10-29T05:01:00.000Z',
		title: 'Move "Brand Direction" under "Project Context and Strategy"',
		summary: 'Keeps brand direction with the strategy documents it informs.',
		why_now: 'It was edited this week and still sits at the top level.',
		rows: [
			{
				suggestion_id: 's-path',
				kind: 'doc_org',
				title: 'Move Brand Direction',
				operation_count: 1,
				verified_headline: 'Move "Brand Direction" under "Project Context and Strategy"',
				verified_fingerprint: 'fp-path',
				verified_operations: [
					op(
						'p1',
						'Move',
						'Brand Direction',
						'Top level',
						'Under Project Context and Strategy'
					)
				],
				cautions: ['"Brand Direction" has 2 documents inside; they move with it.'],
				updated_at: base.updated_at
			}
		],
		evidence_refs: [
			{
				entity_type: 'document',
				entity_id: BRAND,
				title: 'Brand Direction',
				reason: 'Edited Nov 6.'
			},
			{
				entity_type: 'document',
				entity_id: STRATEGY,
				title: 'Project Context and Strategy',
				reason: 'Existing hub for Wayne Strategies context and strategic documents.'
			},
			{ entity_type: 'external', title: 'Client email thread' }
		]
	};

	const view: ProjectCleanupView = {
		project_id: P,
		items: [path, archive],
		groups: [
			{
				title: 'Needs your call',
				section: 'needs_call',
				item_ids: ['path'],
				recommendation: null
			},
			{
				title: 'Ready to apply',
				section: 'safe_cleanup',
				item_ids: ['archive'],
				recommendation: null
			}
		],
		bottom_line: 'One old plan can go; one move needs your call.',
		recommendation: null,
		synthesized_at: '2026-11-07T05:01:05.489Z',
		latest_run_id: '50425238-ff90-4351-b2a7-42e5f8dc1d58',
		latest_audit: null,
		counts: { total: 2, safe_cleanup: 1, needs_call: 1, note: 0 },
		recently_closed: [],
		auto_applied: [
			{
				item_id: 'brand',
				suggestion_id: 's-brand',
				title: 'Move "DJ Wayne — Personal Brand Principles" under "Project Context and Strategy".',
				applied_at: '2026-11-07T05:01:44.723Z',
				reason: 'Tidies the document tree to fit the project; you can undo it',
				undoable: true,
				scores: { about: 0.86, wanted: 0.85, review: 0.35, safe: 0.94 },
				bar: { minAbout: 0.85, minWanted: 0.75, minSafe: 0.85, maxReview: 0.65 }
			}
		]
	};

	const checkIn: CheckInProject = {
		project_id: P,
		project_name: 'Wayne Strategies',
		project_state: 'active',
		project_updated_at: '2026-11-06T14:53:34.000Z',
		last_touched_at: '2026-11-06T14:53:34.000Z',
		last_touched_date: '2026-11-06',
		quiet: false,
		overdue_count: 2,
		oldest_due_date: '2026-11-03',
		newest_due_date: '2026-11-05',
		groups: [
			{
				key: '2026-11-05',
				due_date: '2026-11-05',
				label: 'Nov 5',
				task_count: 2,
				tasks: [
					{
						id: 't1',
						title: 'Call Dauntless Dogs',
						state_key: 'todo',
						due_at: '2026-11-05T17:00:00.000Z'
					},
					{
						id: 't2',
						title: 'Send LA Industrial proposal',
						state_key: 'in_progress',
						due_at: '2026-11-05T17:00:00.000Z'
					}
				]
			}
		],
		truncated: false
	};

	const emails = [
		{
			id: 'e1',
			project_id: P,
			project_name: 'Wayne Strategies',
			action: 'update_task' as const,
			task_id: 't2',
			proposal: { due_date: '2026-11-13' },
			current: {
				title: 'Send LA Industrial proposal',
				due_at: '2026-11-05T17:00:00.000Z',
				state_key: 'in_progress'
			},
			title: 'Move "Send LA Industrial proposal" to Nov 13',
			why: 'They asked for the proposal by end of next week.',
			email: {
				subject: 'Re: proposal timing',
				from: 'Sam Ortiz <sam@example.com>',
				account_email: 'me@example.com',
				received_at: '2026-11-08T15:00:00.000Z'
			},
			gmail_url: 'https://mail.google.com/',
			created_at: '2026-11-09T10:30:00.000Z'
		}
	];
	const sug = {
		project_id: P,
		project_name: 'Wayne Strategies',
		rationale: null,
		why_now: null,
		evidence_refs: [],
		preview: null,
		operations: [],
		result: null,
		user_feedback: null,
		rollup: null,
		created_at: '2026-11-07T05:01:06.000Z',
		decided_at: null,
		applied_at: null,
		updated_at: '2026-11-07T05:01:06.000Z'
	};
	const activity: ActivityPayload = {
		since: '2026-11-02T00:00:00.000Z',
		suggestions: [
			{
				...sug,
				id: 'a-brand',
				kind: 'doc_org',
				status: 'applied',
				title: 'Place personal brand principles with Wayne Strategies strategy documents',
				rationale:
					'Nesting them under "Project Context and Strategy" keeps founder direction alongside the related context.',
				why_now:
					'"DJ Wayne — Personal Brand Principles" was updated recently and remains at the project root.',
				evidence_refs: [
					{
						entity_type: 'document',
						entity_id: BRAND,
						title: 'DJ Wayne — Personal Brand Principles',
						reason: 'Defines the personal brand principles.'
					},
					{
						entity_type: 'document',
						entity_id: STRATEGY,
						title: 'Project Context and Strategy',
						reason: 'Existing hub for strategy documents.'
					}
				],
				operations: [
					{
						tool: 'move_document_in_tree',
						label: 'Move DJ Wayne — Personal Brand Principles under Project Context and Strategy'
					}
				],
				result: {
					applied_via: 'auto',
					headline:
						'Move "DJ Wayne — Personal Brand Principles" under "Project Context and Strategy".',
					auto_apply: {
						run_id: 'r1',
						reason: 'Tidies the document tree to fit the project; you can undo it',
						scores: { about: 0.86, wanted: 0.85, review: 0.35, safe: 0.94 }
					}
				},
				applied_at: '2026-11-07T05:01:44.723Z',
				decided_at: '2026-11-07T05:01:44.723Z'
			},
			{
				...sug,
				id: 'a-audit',
				kind: 'audit_recommendation',
				status: 'rejected',
				title: 'Decide how to document key decisions and assign decision owners',
				user_feedback: { reason: 'not_relevant', note: 'Not for this project' },
				decided_at: '2026-11-06T15:00:00.000Z',
				updated_at: '2026-11-06T15:00:00.000Z'
			},
			{
				...sug,
				id: 'a-archive',
				kind: 'doc_outdated',
				status: 'pending',
				title: 'Archive "Outreach week: Oct 5–11"',
				why_now: 'Its stated outreach window ended weeks ago.',
				evidence_refs: archive.evidence_refs,
				operations: [
					{ tool: 'archive_onto_document', label: 'Archive "Outreach week: Oct 5–11"' }
				],
				rollup: {
					first_seen_at: '2026-11-07T05:01:05.489Z',
					summary: 'Archive the historical outreach week plan.',
					auto_check: archive.auto_check
				}
			},
			{
				...sug,
				id: 'a-tbpn',
				project_id: 'tbpn',
				project_name: 'TBPN',
				kind: 'doc_org',
				status: 'pending',
				title: 'Group process logs under "How this project works" and nest it under the project overview',
				why_now: 'The project root has several standalone process and log documents.',
				operations: [
					{
						tool: 'move_document_in_tree',
						label: 'Move "How this project works" under "START HERE - TBPN"'
					},
					{
						tool: 'move_document_in_tree',
						label: 'Move "Research Log" under "How this project works"'
					}
				],
				updated_at: '2026-11-08T05:00:40.000Z'
			}
		],
		runs: [
			{
				id: 'r1',
				project_id: P,
				project_name: 'Wayne Strategies',
				trigger_reason: 'end_of_day',
				status: 'completed',
				suggestion_count: 2,
				cost_usd: 0.0116,
				created_at: '2026-11-07T05:00:00.000Z'
			},
			{
				id: 'r2',
				project_id: 'tbpn',
				project_name: 'TBPN',
				trigger_reason: 'end_of_day',
				status: 'completed',
				suggestion_count: 0,
				cost_usd: 0.0047,
				created_at: '2026-11-07T05:00:00.000Z'
			}
		]
	};
</script>

<div class="mx-auto flex max-w-5xl gap-4 p-4">
	<nav class="hidden w-48 shrink-0 space-y-2 sm:block" aria-label="Projects">
		<button
			type="button"
			data-inbox-project-tab={P}
			class="w-full rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-left text-xs font-medium text-foreground"
		>
			Wayne Strategies
		</button>
		<button
			type="button"
			class="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium text-foreground"
		>
			TBPN
		</button>
	</nav>
	<div class="min-w-0 flex-1 space-y-6">
		<div class="h-[34rem] overflow-hidden rounded-lg border border-border">
			<InboxActivity payload={activity} />
		</div>
		<InboxEmailUpdatesStrip entries={emails} />
		<InboxCheckIns
			project={checkIn}
			today="2026-11-09"
			submitAnswers={(answers) =>
				Promise.resolve(answers.map(() => ({ kind: 'task', ok: true })) as never)}
		/>
		<InboxProjectCleanup {view} projectId={P} projectName="Wayne Strategies" canDecide />
	</div>
</div>
