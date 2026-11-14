// apps/mobile/src/lib/chat/turn-view.ts
// What a work row shows once you open it, built by the website's own rules (moved to
// @buildos/agentic-chat-client so both apps agree): one card per project the turn touched,
// "Pulled in 3 of 9" and "Carried from last turn" from the context finder, each step's action
// and before → after, and the folded receipt ("2 updated · 1 created · 6 read"). The store keeps
// steps as plain rows; this file dresses them as the web's activities for the shared rules.
import {
	buildStepDetails,
	buildTurnReceipt,
	CONTEXT_SELECTION_METADATA_KEY,
	continueInProjectTarget,
	deriveTurnCards,
	describePulled,
	type ActivityEntry,
	type StepDetails,
	type TurnCardProject
} from '@buildos/agentic-chat-client';

import type { WorkRow, WorkStep } from './session-store';

export type TurnStepView = { step: WorkStep; details: StepDetails };

export type TurnCardView = {
	key: string;
	projectId: string | null;
	name: string;
	/** "Report › Budget, Q4 plan" lines loaded from last turn. */
	carried: string[] | null;
	pulled: { label: string; detail: string } | null;
	steps: TurnStepView[];
};

export type TurnView = {
	/** Card heads are drawn only when they add something: several projects, or a "Pulled in". */
	grouped: boolean;
	cards: TurnCardView[];
	/** Global turns: "Checked 12 projects, picked 2". */
	picked: string | null;
	/** "2 updated · 1 created · 6 read" once the turn changed something; null otherwise. */
	receipt: string | null;
	projectCount: number;
};

const EPOCH = new Date(0);

/** The row as the web's activity list: the finder receipt first, then one entry per step. */
export function workActivities(row: WorkRow): ActivityEntry[] {
	const activities: ActivityEntry[] = [];
	if (row.selection) {
		activities.push({
			id: `${row.id}:selection`,
			content: 'Context picked',
			timestamp: EPOCH,
			activityType: 'ontology_loaded',
			metadata: { [CONTEXT_SELECTION_METADATA_KEY]: row.selection }
		});
	}
	for (const step of row.steps) {
		activities.push({
			id: step.id,
			content: step.verb,
			timestamp: EPOCH,
			activityType: 'tool_call',
			status: step.status,
			metadata: step.source
				? {
						arguments: step.source.arguments,
						result: step.source.result,
						affectedEntities: step.source.affectedEntities,
						durationMs: step.source.durationMs ?? undefined,
						sourceQuote: step.source.sourceQuote ?? undefined
					}
				: {}
		});
	}
	return activities;
}

export function buildTurnView(
	row: WorkRow,
	sessionProject: TurnCardProject | null,
	now = new Date()
): TurnView {
	const activities = workActivities(row);
	const { cards, picked } = deriveTurnCards({ activities, sessionProject });
	const byId = new Map(activities.map((activity) => [activity.id, activity]));
	const stepById = new Map(row.steps.map((step) => [step.id, step]));
	const detailsOf = (step: WorkStep): StepDetails =>
		buildStepDetails(byId.get(step.id)!, { projectId: sessionProject?.id ?? null, now });

	const views: TurnCardView[] = cards.map((card) => ({
		key: card.key,
		projectId: card.projectId,
		name: card.name,
		carried: card.carried,
		pulled: card.pulled ? describePulled(card.pulled) : null,
		steps: card.stepIds
			.map((id) => stepById.get(id))
			.filter((step): step is WorkStep => Boolean(step))
			.map((step) => ({ step, details: detailsOf(step) }))
	}));
	// Steps no card claimed (none today, but never drop a step): a plain list.
	const shown = new Set(views.flatMap((card) => card.steps.map((entry) => entry.step.id)));
	const loose = row.steps.filter((step) => !shown.has(step.id));
	if (loose.length > 0 || views.length === 0) {
		views.push({
			key: 'steps',
			projectId: null,
			name: '',
			carried: null,
			pulled: null,
			steps: loose.map((step) => ({ step, details: detailsOf(step) }))
		});
	}

	const projectCount = views.filter((card) => card.projectId !== null).length;
	const grouped =
		projectCount > 1 ||
		picked !== null ||
		views.some((card) => card.pulled !== null || card.carried !== null);

	const done = views.flatMap((card) =>
		card.steps
			.filter((entry) => entry.step.status === 'completed')
			.map((entry) => entry.details)
	);
	const counts = buildTurnReceipt(done);
	const parts = [
		counts.updated ? `${counts.updated} updated` : '',
		counts.created ? `${counts.created} created` : '',
		counts.archived ? `${counts.archived} archived` : ''
	].filter(Boolean);
	if (parts.length && counts.read) parts.push(`${counts.read} read`);

	return {
		grouped,
		cards: views.filter((card) => card.steps.length > 0 || grouped),
		picked: picked
			? `Checked ${picked.checked} ${picked.checked === 1 ? 'project' : 'projects'}, picked ${picked.picked}`
			: null,
		receipt: parts.length ? parts.join(' · ') : null,
		projectCount
	};
}

/** "Continue in X": a finished Workspace turn whose finder picked one project with confidence. */
export function continueTarget(row: WorkRow | null | undefined): TurnCardProject | null {
	if (!row || row.status !== 'completed' || !row.selection) return null;
	return continueInProjectTarget(workActivities(row));
}

/** The words on a step's action badge. */
export const ACTION_LABEL: Record<NonNullable<StepDetails['action']>, string> = {
	created: 'New',
	updated: 'Updated',
	archived: 'Archived',
	deleted: 'Deleted',
	moved: 'Moved',
	linked: 'Linked'
};
