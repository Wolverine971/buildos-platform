// packages/agentic-chat-runtime/src/loop/project-semantics.ts
const PROJECT_STATE_VALUES = new Set(['planning', 'active', 'paused', 'completed', 'cancelled']);

const PROJECT_STATE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	in_progress: 'active',
	inprogress: 'active',
	started: 'active',
	working: 'active',
	ongoing: 'active',
	on_hold: 'paused',
	hold: 'paused',
	pending: 'planning',
	planned: 'planning',
	backlog: 'planning',
	todo: 'planning',
	draft: 'planning',
	complete: 'completed',
	done: 'completed',
	finished: 'completed',
	shipped: 'completed',
	canceled: 'cancelled',
	aborted: 'cancelled',
	abandoned: 'cancelled',
	archived: 'cancelled'
});

export function normalizeAgenticChatProjectStateV1(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!normalized) return null;
	const candidate = PROJECT_STATE_ALIASES[normalized] ?? normalized;
	return PROJECT_STATE_VALUES.has(candidate) ? candidate : null;
}

export function buildAgenticChatProjectContextDocumentV1(input: {
	name: string;
	description?: string | null;
	spark?: string | null;
	goals?: ReadonlyArray<{ name: string; description?: string | null }>;
	tasks?: ReadonlyArray<{ title: string; stateKey?: string | null }>;
	generatedAt: string;
	props?: JsonObject;
}): {
	title: string;
	content: string;
	body_markdown: string;
	type_key: 'document.context.project';
	state_key: 'active';
	props: JsonObject;
} {
	const summary = input.description?.trim() ?? '';
	const spark = input.spark?.trim() ?? '';
	const goals = (input.goals ?? [])
		.map((goal) => `- ${goal.name}${goal.description ? ` — ${goal.description}` : ''}`)
		.join('\n');
	const tasks = (input.tasks ?? [])
		.map((task) => `- ${task.title}${task.stateKey ? ` · ${task.stateKey}` : ''}`)
		.join('\n');
	const title = `${input.name} Context Document`;
	const content = [
		`# ${title}`,
		'## Vision & Summary',
		summary || 'Not provided yet.',
		'## Source Notes / Spark',
		spark || 'Not provided yet.',
		'## Initial Goals',
		goals || 'No goals captured yet.',
		'## Initial Tasks / Threads',
		tasks || 'No starter tasks captured yet.'
	].join('\n\n');

	return {
		title,
		content,
		body_markdown: content,
		type_key: 'document.context.project',
		state_key: 'active',
		props: {
			source: 'agent_project_creation',
			generated_at: input.generatedAt,
			...(spark ? { source_notes: spark } : {}),
			...(input.props ?? {})
		}
	};
}
import type { JsonObject } from '@buildos/shared-types';
