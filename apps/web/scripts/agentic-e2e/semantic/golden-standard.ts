// apps/web/scripts/agentic-e2e/semantic/golden-standard.ts
export type GoldenScenarioId = 'gs1' | 'gs2';

export type GoldenScenario = {
	id: GoldenScenarioId;
	label: string;
	goal: string;
	instructions: string;
	expectedOutput: string;
	requiredReadKeys: string[];
	requiredUpdateKeys: string[];
	allowedExistingTouchKeys: string[];
	decoyKeys: string[];
};

const MARKETING_CORE = [
	'document:Brand positioning — Driftline',
	'document:Who we serve',
	'document:Campaigns',
	'document:Spring trailhead launch',
	'document:Welcome email series',
	'document:Creator seeding program',
	'goal:Grow direct sales to 40% of revenue',
	'milestone:Spring launch live',
	'plan:Q2 demand push',
	'task:Write April field-notes newsletter',
	'task:Book product photoshoot for spring line',
	'task:Shortlist 20 hiking micro-creators',
	'task:Set up abandoned-cart email sequence'
] as const;

const MARKETING_GUARDRAILS = [
	'risk:Discount-heavy launch erodes brand',
	'requirement:Every customer-facing send and caption passes the field-notes voice check: specific, unhurried, no "premium", no discount shouting.'
] as const;

const DECOYS = [
	'task:Fix checkout double-charge bug',
	'task:Reconcile warehouse inventory sync',
	'document:Fulfillment runbook',
	'document:Vendor payment terms',
	'document:Storefront platform notes',
	'task:Interview part-time warehouse associate',
	'goal:Cut fulfillment time to 2 days',
	'milestone:Warehouse move complete',
	'risk:Buckle supplier lead times slip past 6 weeks'
] as const;

export const GOLDEN_SCENARIOS: Record<GoldenScenarioId, GoldenScenario> = {
	gs1: {
		id: 'gs1',
		label: 'GS-1 — Reorient Driftline marketing to bike commuters',
		goal: 'Reorient Driftline’s whole marketing direction away from broad weekend-hiker emphasis and toward bike commuters in metro areas.',
		instructions: `First discover and read the complete current marketing working set across documents, goals, plans, milestones, tasks, risks, and requirements. Then stage one coherent proposal that reorients the existing work toward bike commuters in metro areas, whose decisive need is a waterproof, office-ready pack that still works for the ride home and weekend trails.

Update the brand and audience framing, each existing campaign brief, the direct-sales goal, Q2 demand plan, spring milestone, and every existing marketing execution task so they tell the same strategic story. Preserve Driftline’s field-notes voice and no-discount guardrail. Keep the existing Campaigns document hierarchy intact. Do not create a parallel strategy, and do not touch engineering, checkout, warehouse, fulfillment, vendor-finance, hiring, or supplier work.

This is review-required: stage changes only. Do not apply or commit them.`,
		expectedOutput:
			'A pending review proposal containing the complete per-entity reorientation, grounded in prior reads, with no unrelated changes.',
		requiredReadKeys: [...MARKETING_CORE, ...MARKETING_GUARDRAILS],
		requiredUpdateKeys: MARKETING_CORE.filter((key) => key !== 'document:Campaigns'),
		allowedExistingTouchKeys: [...MARKETING_CORE, ...MARKETING_GUARDRAILS],
		decoyKeys: [...DECOYS]
	},
	gs2: {
		id: 'gs2',
		label: 'GS-2 — Insert a structured Instagram campaign',
		goal: 'Add a six-week Instagram campaign for Driftline’s bike-commuter audience inside the existing marketing structure.',
		instructions: `First discover and read the existing marketing landscape, especially the Campaigns document tree, current campaign briefs, Q2 demand plan, direct-sales goal, spring milestone, and related execution tasks.

Stage a new campaign brief titled “City Miles Instagram Series” as a child of the existing Campaigns document. The brief should target metro bike commuters; feature waterproof, office-ready daypacks in real commute conditions; run for six weeks; publish three Reels and two carousels per week; preserve the specific, unhurried field-notes voice; and use no discount codes.

Stage exactly three concrete execution tasks: build the six-week content calendar, recruit commuter creators for field-use posts, and report weekly saves plus profile visits. Follow the project’s established execution structure by placing the tasks in Q2 demand push and linking them to the existing direct-sales goal; use the spring milestone where appropriate. Do not modify or link to engineering, checkout, warehouse, fulfillment, vendor-finance, hiring, or supplier work.

This is review-required: stage changes only. Do not apply or commit them.`,
		expectedOutput:
			'A pending review proposal with one nested campaign brief and exactly three linked execution tasks, grounded in prior reads and with no unrelated changes.',
		requiredReadKeys: [
			'document:Campaigns',
			'document:Spring trailhead launch',
			'document:Welcome email series',
			'document:Creator seeding program',
			'goal:Grow direct sales to 40% of revenue',
			'milestone:Spring launch live',
			'plan:Q2 demand push',
			'task:Book product photoshoot for spring line',
			'task:Shortlist 20 hiking micro-creators',
			'task:Set up abandoned-cart email sequence'
		],
		requiredUpdateKeys: [],
		allowedExistingTouchKeys: [...MARKETING_CORE, ...MARKETING_GUARDRAILS],
		decoyKeys: [...DECOYS]
	}
};

export type GoldenExecution = {
	id: string;
	tool_category: string | null;
	gateway_op: string | null;
	arguments: unknown;
	result: unknown;
	success: boolean;
	mutation_mode: string | null;
	proposed_change_id: string | null;
	created_at: string;
};

export type GoldenChange = {
	id: string;
	op: string;
	entity_type: string;
	entity_id?: string;
	action: 'create' | 'update' | 'delete';
	before?: Record<string, unknown>;
	after?: Record<string, unknown>;
	decision?: string;
};

export type GoldenRun = {
	id: string;
	status: string;
	review_required: boolean;
	scope_mode: string;
	project_id: string | null;
	change_set: unknown;
};

export type GoldenGradeInput = {
	scenario: GoldenScenario;
	projectId: string;
	entityIds: Map<string, string>;
	run: GoldenRun;
	executions: GoldenExecution[];
	liveStateUnchanged: boolean;
};

export type GoldenCheck = {
	id: string;
	pass: boolean;
	detail: string;
};

export type GoldenGrade = {
	pass: boolean;
	checks: GoldenCheck[];
	readCoverage: { found: string[]; missing: string[] };
	touched: string[];
	decoysTouched: string[];
	changes: GoldenChange[];
};

const UUID_PATTERN =
	/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function collectUuidStrings(
	value: unknown,
	output = new Set<string>(),
	seen = new WeakSet<object>()
) {
	if (typeof value === 'string') {
		for (const match of value.match(UUID_PATTERN) ?? []) output.add(match.toLowerCase());
		return output;
	}
	if (!value || typeof value !== 'object') return output;
	if (seen.has(value)) return output;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const entry of value) collectUuidStrings(entry, output, seen);
	} else {
		for (const entry of Object.values(value as Record<string, unknown>)) {
			collectUuidStrings(entry, output, seen);
		}
	}
	return output;
}

function asChanges(changeSet: unknown): GoldenChange[] {
	if (!changeSet || typeof changeSet !== 'object' || Array.isArray(changeSet)) return [];
	const changes = (changeSet as { changes?: unknown }).changes;
	if (!Array.isArray(changes)) return [];
	return changes.filter(
		(change): change is GoldenChange =>
			Boolean(change) &&
			typeof change === 'object' &&
			typeof (change as GoldenChange).id === 'string' &&
			typeof (change as GoldenChange).op === 'string'
	);
}

function keywordCoverage(
	value: unknown,
	keywords: string[]
): { found: string[]; missing: string[] } {
	const haystack = JSON.stringify(value ?? '').toLowerCase();
	const found = keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
	return { found, missing: keywords.filter((keyword) => !found.includes(keyword)) };
}

function check(id: string, pass: boolean, detail: string): GoldenCheck {
	return { id, pass, detail };
}

export function gradeGoldenRun(input: GoldenGradeInput): GoldenGrade {
	const { scenario, run, entityIds } = input;
	const changes = asChanges(run.change_set);
	const executions = [...input.executions].sort((a, b) => {
		const byTime = a.created_at.localeCompare(b.created_at);
		return byTime || a.id.localeCompare(b.id);
	});
	const idToKey = new Map([...entityIds.entries()].map(([key, id]) => [id.toLowerCase(), key]));
	const readIds = new Set<string>();
	const readIdsBeforeExecution = new Map<string, Set<string>>();
	for (const execution of executions) {
		readIdsBeforeExecution.set(execution.id, new Set(readIds));
		if (execution.tool_category !== 'read' || !execution.success) continue;
		collectUuidStrings(execution.arguments, readIds);
		collectUuidStrings(execution.result, readIds);
	}

	const readFound = scenario.requiredReadKeys.filter((key) => {
		const id = entityIds.get(key);
		return id ? readIds.has(id.toLowerCase()) : false;
	});
	const readMissing = scenario.requiredReadKeys.filter((key) => !readFound.includes(key));

	const touchedExistingIds = new Set<string>();
	for (const change of changes) {
		if (change.entity_id) touchedExistingIds.add(change.entity_id.toLowerCase());
	}
	const touched = [...touchedExistingIds].map((id) => idToKey.get(id) ?? id).sort();
	const existingTouchCounts = new Map<string, number>();
	for (const change of changes) {
		if (!change.entity_id) continue;
		const id = change.entity_id.toLowerCase();
		existingTouchCounts.set(id, (existingTouchCounts.get(id) ?? 0) + 1);
	}
	const duplicateExistingTouches = [...existingTouchCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([id, count]) => `${idToKey.get(id) ?? id} (${count} changes)`);
	const requiredUpdatesMissing = scenario.requiredUpdateKeys.filter((key) => {
		const id = entityIds.get(key);
		return !id || !touchedExistingIds.has(id.toLowerCase());
	});
	const allowedExistingIds = new Set(
		scenario.allowedExistingTouchKeys
			.map((key) => entityIds.get(key)?.toLowerCase())
			.filter(Boolean)
	);
	const unrelatedExistingTouches = [...touchedExistingIds]
		.filter((id) => !allowedExistingIds.has(id))
		.map((id) => idToKey.get(id) ?? id);

	const allChangeIds = collectUuidStrings(changes);
	const decoysTouched = scenario.decoyKeys.filter((key) => {
		const id = entityIds.get(key);
		return id ? allChangeIds.has(id.toLowerCase()) : false;
	});

	const stagedExecutions = executions.filter(
		(execution) => execution.tool_category === 'write' && execution.success
	);
	const commitExecutions = executions.filter(
		(execution) => execution.tool_category === 'write' && execution.mutation_mode === 'commit'
	);
	const executionByChangeId = new Map(
		stagedExecutions
			.filter((execution) => execution.proposed_change_id)
			.map((execution) => [execution.proposed_change_id!, execution])
	);
	const ungroundedChanges: string[] = [];
	for (const change of changes) {
		const execution = executionByChangeId.get(change.id);
		if (!execution) {
			ungroundedChanges.push(`${change.id}: no successful staged-write receipt`);
			continue;
		}
		const priorReads = readIdsBeforeExecution.get(execution.id) ?? new Set<string>();
		if (priorReads.size === 0) {
			ungroundedChanges.push(`${change.id}: no successful read preceded the write`);
			continue;
		}
		const references = collectUuidStrings(change.action === 'create' ? change.after : change);
		for (const reference of references) {
			if (
				reference === input.projectId.toLowerCase() ||
				!idToKey.has(reference) ||
				priorReads.has(reference)
			) {
				continue;
			}
			ungroundedChanges.push(
				`${change.id}: ${idToKey.get(reference) ?? reference} was not read before the write`
			);
		}
	}

	const pendingOnly =
		changes.length > 0 &&
		changes.every((change) => !change.decision || change.decision === 'pending');
	const commonChecks: GoldenCheck[] = [
		check('proposal_ready', run.status === 'proposal_ready', `run status is ${run.status}`),
		check(
			'review_policy',
			run.review_required &&
				run.scope_mode === 'read_write' &&
				run.project_id === input.projectId,
			`review=${run.review_required} scope=${run.scope_mode} project=${run.project_id}`
		),
		check(
			'pending_change_set',
			pendingOnly,
			`${changes.length} changes; all decisions must remain pending`
		),
		check(
			'staged_only',
			stagedExecutions.length === changes.length && commitExecutions.length === 0,
			`${stagedExecutions.length} staged receipts, ${commitExecutions.length} commit receipts`
		),
		check(
			'read_coverage',
			readMissing.length === 0,
			readMissing.length === 0
				? `all ${readFound.length} labeled entities were discovered/read`
				: `missing ${readMissing.join(', ')}`
		),
		check(
			'grounding',
			ungroundedChanges.length === 0,
			ungroundedChanges.length === 0
				? 'every staged write was preceded by the reads it depends on'
				: ungroundedChanges.join('; ')
		),
		check(
			'zero_decoys',
			decoysTouched.length === 0,
			decoysTouched.length === 0
				? 'no decoy ids appear in proposed changes'
				: decoysTouched.join(', ')
		),
		check(
			'no_unrelated_updates',
			unrelatedExistingTouches.length === 0,
			unrelatedExistingTouches.length === 0
				? 'all existing-entity touches are inside the labeled marketing set'
				: unrelatedExistingTouches.join(', ')
		),
		check(
			'no_duplicate_updates',
			duplicateExistingTouches.length === 0,
			duplicateExistingTouches.length === 0
				? 'each existing entity has at most one proposed change'
				: duplicateExistingTouches.join(', ')
		),
		check(
			'live_state_unchanged',
			input.liveStateUnchanged,
			input.liveStateUnchanged
				? 'fixture rows are byte-for-byte unchanged at the snapshot boundary'
				: 'one or more live fixture rows changed during the review run'
		)
	];

	const scenarioChecks: GoldenCheck[] = [];
	if (scenario.id === 'gs1') {
		const creates = changes.filter((change) => change.action === 'create');
		const direction = keywordCoverage(changes, [
			'bike commuter',
			'waterproof',
			'office',
			'field-notes',
			'discount'
		]);
		scenarioChecks.push(
			check(
				'gs1_update_coverage',
				requiredUpdatesMissing.length === 0,
				requiredUpdatesMissing.length === 0
					? `all ${scenario.requiredUpdateKeys.length} labeled entities have staged updates`
					: `missing updates for ${requiredUpdatesMissing.join(', ')}`
			),
			check(
				'gs1_no_parallel_strategy',
				creates.length === 0,
				`${creates.length} create changes`
			),
			check(
				'gs1_directional_coherence',
				direction.missing.length === 0,
				direction.missing.length === 0
					? `proposal carries all direction markers: ${direction.found.join(', ')}`
					: `missing direction markers: ${direction.missing.join(', ')}`
			)
		);
	} else {
		const campaignParentId = entityIds.get('document:Campaigns')?.toLowerCase();
		const planId = entityIds.get('plan:Q2 demand push')?.toLowerCase();
		const goalId = entityIds.get('goal:Grow direct sales to 40% of revenue')?.toLowerCase();
		const documentCreates = changes.filter(
			(change) => change.action === 'create' && change.op === 'onto.document.create'
		);
		const taskCreates = changes.filter(
			(change) => change.action === 'create' && change.op === 'onto.task.create'
		);
		const campaign = documentCreates.find((change) =>
			String(change.after?.title ?? '')
				.toLowerCase()
				.includes('city miles instagram')
		);
		const campaignContent = keywordCoverage(campaign?.after, [
			'bike commuter',
			'waterproof',
			'office',
			'six week',
			'reel',
			'carousel',
			'field-notes',
			'no discount'
		]);
		const taskText = taskCreates.map((change) => change.after);
		const taskPurposes = keywordCoverage(taskText, [
			'content calendar',
			'creator',
			'saves',
			'profile visits'
		]);
		const taskLinksValid = taskCreates.every((change) => {
			const ids = collectUuidStrings(change.after);
			return Boolean(planId && goalId && ids.has(planId) && ids.has(goalId));
		});
		scenarioChecks.push(
			check(
				'gs2_one_campaign_brief',
				documentCreates.length === 1 && Boolean(campaign),
				`${documentCreates.length} document creates; expected City Miles Instagram Series`
			),
			check(
				'gs2_campaign_placement',
				Boolean(
					campaignParentId &&
						String(campaign?.after?.parent_document_id ?? '').toLowerCase() ===
							campaignParentId
				),
				`parent_document_id=${String(campaign?.after?.parent_document_id ?? 'missing')}`
			),
			check(
				'gs2_campaign_coherence',
				campaignContent.missing.length === 0,
				campaignContent.missing.length === 0
					? `brief carries all campaign markers: ${campaignContent.found.join(', ')}`
					: `brief missing: ${campaignContent.missing.join(', ')}`
			),
			check(
				'gs2_three_tasks',
				taskCreates.length === 3,
				`${taskCreates.length} task creates; expected exactly 3`
			),
			check(
				'gs2_task_purposes',
				taskPurposes.missing.length === 0,
				taskPurposes.missing.length === 0
					? `tasks cover ${taskPurposes.found.join(', ')}`
					: `tasks missing: ${taskPurposes.missing.join(', ')}`
			),
			check(
				'gs2_task_links',
				taskCreates.length === 3 && taskLinksValid,
				'tasks must reference both Q2 demand push and the direct-sales goal'
			),
			check(
				'gs2_only_expected_creates',
				changes.length === documentCreates.length + taskCreates.length,
				`${changes.length} total changes, ${documentCreates.length + taskCreates.length} expected creates`
			)
		);
	}

	const checks = [...commonChecks, ...scenarioChecks];
	return {
		pass: checks.every((entry) => entry.pass),
		checks,
		readCoverage: { found: readFound, missing: readMissing },
		touched,
		decoysTouched,
		changes
	};
}
