// apps/web/src/lib/server/gmail-relevance/project-email-profile-sources.ts
import type { Json } from '@buildos/shared-types';
import type {
	ProjectEmailProfileCandidate,
	ProjectEmailProfileSourceType
} from './project-email-profile';

export type ProjectEmailProfileProjectRow = {
	id: string;
	name: string;
	description: string | null;
	next_step_short: string | null;
	next_step_long: string | null;
	props: Json;
	updated_at: string;
};

export type ProjectEmailProfileTaskRow = {
	id: string;
	title: string;
	description: string | null;
	state_key: string;
	props: Json;
	updated_at: string;
};

export type ProjectEmailProfileDocumentRow = {
	id: string;
	title: string;
	description: string | null;
	props: Json;
	updated_at: string;
};

export type ProjectEmailProfileGoalRow = {
	id: string;
	name: string;
	description: string | null;
	goal: string | null;
	updated_at: string | null;
};

export type ProjectEmailProfileMilestoneRow = {
	id: string;
	title: string;
	description: string | null;
	milestone: string | null;
	updated_at: string | null;
};

export type ProjectEmailProfileEventRow = {
	id: string;
	title: string;
	description: string | null;
	external_link: string | null;
	updated_at: string;
};

export type ProjectEmailProfileMemberRow = {
	id: string;
	role_name: string | null;
	role_description: string | null;
	actor: {
		id: string;
		name: string;
		email: string | null;
		user_id: string | null;
	} | null;
};

export type ProjectEmailProfileNearbyProject = {
	id: string;
	name: string;
	updated_at: string;
};

export type BuildProjectEmailProfileCandidatesInput = {
	user_id: string;
	project: ProjectEmailProfileProjectRow;
	tasks?: ProjectEmailProfileTaskRow[];
	documents?: ProjectEmailProfileDocumentRow[];
	goals?: ProjectEmailProfileGoalRow[];
	milestones?: ProjectEmailProfileMilestoneRow[];
	events?: ProjectEmailProfileEventRow[];
	members?: ProjectEmailProfileMemberRow[];
	nearby_projects?: ProjectEmailProfileNearbyProject[];
};

const IDENTIFIER_PATTERN = /\b[A-Z][A-Z0-9]{1,11}-\d{1,12}\b/g;
const ACTIVE_TASK_STATES = new Set(['todo', 'in_progress', 'blocked']);
const RECENCY_TTL_DAYS = 45;

function asRecord(value: Json): Record<string, Json | undefined> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function stringList(value: Json | undefined): string[] {
	if (typeof value === 'string') return value.trim() ? [value] : [];
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())
	);
}

function domainFromEmail(value: string): string | null {
	const separator = value.lastIndexOf('@');
	if (separator <= 0 || separator === value.length - 1) return null;
	return value.slice(separator + 1);
}

function addDays(value: string, days: number): string | null {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return null;
	return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function uniqueIdentifiers(text: string | null | undefined): string[] {
	if (!text) return [];
	return [...new Set(text.match(IDENTIFIER_PATTERN) ?? [])];
}

export function buildProjectEmailProfileCandidates(
	input: BuildProjectEmailProfileCandidatesInput
): ProjectEmailProfileCandidate[] {
	const projectId = input.project.id;
	const candidates: ProjectEmailProfileCandidate[] = [];

	const add = (
		group: ProjectEmailProfileCandidate['group'],
		field: string,
		value: string | null | undefined,
		sourceType: ProjectEmailProfileSourceType,
		sourceId: string,
		sourceField: string,
		sourceUpdatedAt?: string | null,
		expiresAt?: string | null
	) => {
		if (!value?.trim()) return;
		candidates.push({
			group,
			field,
			value,
			source: {
				user_id: input.user_id,
				project_id: projectId,
				source_type: sourceType,
				source_id: sourceId,
				source_field: sourceField,
				...(sourceUpdatedAt ? { source_updated_at: sourceUpdatedAt } : {})
			},
			...(expiresAt ? { expires_at: expiresAt } : {})
		});
	};

	const addIdentifiers = (
		values: Array<string | null | undefined>,
		sourceType: ProjectEmailProfileSourceType,
		sourceId: string,
		sourceField: string,
		updatedAt?: string | null
	) => {
		for (const identifier of uniqueIdentifiers(values.filter(Boolean).join(' '))) {
			const prefix = identifier.split('-', 1)[0] ?? '';
			const field = prefix.startsWith('INV')
				? 'invoice'
				: prefix.startsWith('CON')
					? 'contract'
					: 'ticket';
			add('identifiers', field, identifier, sourceType, sourceId, sourceField, updatedAt);
		}
	};

	add(
		'identity',
		'name',
		input.project.name,
		'project',
		projectId,
		'name',
		input.project.updated_at
	);
	add(
		'semantic_context',
		'summary',
		input.project.description,
		'project',
		projectId,
		'description',
		input.project.updated_at
	);
	add(
		'semantic_context',
		'workstream',
		input.project.next_step_short,
		'project',
		projectId,
		'next_step_short',
		input.project.updated_at
	);
	add(
		'semantic_context',
		'workstream',
		input.project.next_step_long,
		'project',
		projectId,
		'next_step_long',
		input.project.updated_at
	);
	addIdentifiers(
		[input.project.name, input.project.description],
		'project',
		projectId,
		'name+description',
		input.project.updated_at
	);

	const props = asRecord(input.project.props);
	for (const [prop, field] of [
		['aliases', 'alias'],
		['email_aliases', 'alias'],
		['products', 'product'],
		['vocabulary', 'vocabulary']
	] as const) {
		for (const value of stringList(props?.[prop])) {
			add(
				'identity',
				field,
				value,
				'project',
				projectId,
				`props.${prop}`,
				input.project.updated_at
			);
		}
	}
	for (const prop of ['urls', 'websites', 'repository_urls'] as const) {
		for (const value of stringList(props?.[prop])) {
			add(
				'artifacts',
				prop === 'repository_urls' ? 'repository' : 'url',
				value,
				'project',
				projectId,
				`props.${prop}`,
				input.project.updated_at
			);
		}
	}
	for (const value of stringList(props?.excluded_senders)) {
		add(
			'negative_evidence',
			'excluded_sender',
			value,
			'project',
			projectId,
			'props.excluded_senders',
			input.project.updated_at
		);
	}
	for (const value of stringList(props?.excluded_domains)) {
		add(
			'negative_evidence',
			'excluded_domain',
			value,
			'project',
			projectId,
			'props.excluded_domains',
			input.project.updated_at
		);
	}

	for (const member of (input.members ?? []).slice(0, 30)) {
		if (!member.actor || member.actor.user_id === input.user_id) continue;
		add('actors', 'person', member.actor.name, 'actor', member.actor.id, 'name');
		add('actors', 'email', member.actor.email, 'actor', member.actor.id, 'email');
		if (member.actor.email) {
			add(
				'actors',
				'domain',
				domainFromEmail(member.actor.email),
				'actor',
				member.actor.id,
				'email'
			);
		}
		add(
			'actors',
			'relationship',
			member.role_description ?? member.role_name,
			'project_member',
			member.id,
			member.role_description ? 'role_description' : 'role_name'
		);
	}

	const activeTasks = (input.tasks ?? [])
		.filter((task) => ACTIVE_TASK_STATES.has(task.state_key))
		.slice(0, 8);
	for (const task of activeTasks) {
		add(
			'semantic_context',
			'workstream',
			task.title,
			'task',
			task.id,
			'title',
			task.updated_at
		);
		const expiresAt = addDays(task.updated_at, RECENCY_TTL_DAYS);
		add(
			'recency',
			'focus_term',
			task.title,
			'task',
			task.id,
			'title',
			task.updated_at,
			expiresAt
		);
		addIdentifiers(
			[task.title, task.description],
			'task',
			task.id,
			'title+description',
			task.updated_at
		);
	}

	for (const document of (input.documents ?? []).slice(0, 20)) {
		add(
			'artifacts',
			'document',
			document.title,
			'document',
			document.id,
			'title',
			document.updated_at
		);
		addIdentifiers(
			[document.title, document.description],
			'document',
			document.id,
			'title+description',
			document.updated_at
		);
	}

	for (const goal of (input.goals ?? []).slice(0, 6)) {
		add(
			'semantic_context',
			'goal',
			goal.goal ?? goal.name,
			'goal',
			goal.id,
			goal.goal ? 'goal' : 'name',
			goal.updated_at
		);
		addIdentifiers(
			[goal.name, goal.description, goal.goal],
			'goal',
			goal.id,
			'goal',
			goal.updated_at
		);
	}

	for (const milestone of (input.milestones ?? []).slice(0, 6)) {
		add(
			'semantic_context',
			'deliverable',
			milestone.milestone ?? milestone.title,
			'milestone',
			milestone.id,
			milestone.milestone ? 'milestone' : 'title',
			milestone.updated_at
		);
		addIdentifiers(
			[milestone.title, milestone.description, milestone.milestone],
			'milestone',
			milestone.id,
			'milestone',
			milestone.updated_at
		);
	}

	for (const event of (input.events ?? []).slice(0, 10)) {
		add(
			'artifacts',
			'url',
			event.external_link,
			'event',
			event.id,
			'external_link',
			event.updated_at
		);
		addIdentifiers(
			[event.title, event.description],
			'event',
			event.id,
			'title+description',
			event.updated_at
		);
	}

	for (const nearbyProject of (input.nearby_projects ?? []).slice(0, 30)) {
		if (nearbyProject.id === projectId) continue;
		add(
			'negative_evidence',
			'nearby_project',
			nearbyProject.name,
			'project',
			nearbyProject.id,
			'name',
			nearbyProject.updated_at
		);
	}

	return candidates;
}

export function getProjectEmailProfileSnapshotAt(
	input: BuildProjectEmailProfileCandidatesInput
): string {
	const timestamps = [
		input.project.updated_at,
		...(input.tasks ?? []).map((row) => row.updated_at),
		...(input.documents ?? []).map((row) => row.updated_at),
		...(input.goals ?? []).map((row) => row.updated_at),
		...(input.milestones ?? []).map((row) => row.updated_at),
		...(input.events ?? []).map((row) => row.updated_at),
		...(input.nearby_projects ?? []).map((row) => row.updated_at)
	]
		.filter(
			(value): value is string =>
				typeof value === 'string' && Number.isFinite(Date.parse(value))
		)
		.sort();

	return timestamps.at(-1) ?? input.project.updated_at;
}
