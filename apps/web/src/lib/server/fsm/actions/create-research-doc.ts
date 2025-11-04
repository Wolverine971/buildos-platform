// apps/web/src/lib/server/fsm/actions/create-research-doc.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { executeCreateDocFromTemplateAction } from './create-doc-from-template';
import { mergeDeep } from './utils';
import type { TransitionContext } from '../engine';

type EntityRow = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
	props: Record<string, unknown>;
	name?: string;
	title?: string;
};

type SourceRow = {
	id: string;
	uri: string | null;
	snapshot_uri: string | null;
	props: Record<string, unknown> | null;
};

export type ResearchSource = {
	id: string;
	uri: string | null;
	title: string;
	notes: string | null;
	snapshot_uri: string | null;
};

export function buildResearchSummary(topic: string, sources: ResearchSource[]): string {
	if (sources.length === 0) {
		return `This document contains initial notes for "${topic}". Add sources to enrich the research findings.`;
	}

	const sections = sources
		.map((source, index) => {
			const label = `Source ${index + 1}: ${source.title}`;
			const notes =
				source.notes && source.notes.trim().length > 0
					? source.notes.trim()
					: 'Insights pending. Summarise the key takeaways here.';
			const uriLine = source.uri ? `URL: ${source.uri}` : 'URL: (not provided)';

			return `${label}\n${uriLine}\nNotes: ${notes}`;
		})
		.join('\n\n');

	return `Topic: ${topic}\n\n${sections}`;
}

export async function executeCreateResearchDocAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	const topic = action.topic?.trim();
	if (!topic) {
		throw new Error('create_research_doc requires topic');
	}

	const templateKey = action.template_key ?? 'doc.notes';

	const client = clientParam ?? createAdminSupabaseClient();
	const resolvedSources = await loadSources(client, action.sources);

	const summary = buildResearchSummary(topic, resolvedSources);

	const variables = mergeDeep(
		(typeof action.variables === 'object' && action.variables
			? action.variables
			: {}) as Record<string, unknown>,
		{
			topic,
			summary,
			sources: resolvedSources,
			generated_at: new Date().toISOString()
		}
	);

	const props = mergeDeep(
		(typeof action.props === 'object' && action.props ? action.props : {}) as Record<
			string,
			unknown
		>,
		{
			topic,
			sources: resolvedSources,
			summary
		}
	);

	const docAction = {
		type: 'create_doc_from_template',
		template_key: templateKey,
		variables,
		props
	} as FSMAction;

	return executeCreateDocFromTemplateAction(docAction, entity, ctx, client);
}

async function loadSources(
	client: TypedSupabaseClient,
	sourceIds?: string[] | null
): Promise<ResearchSource[]> {
	if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
		return [];
	}

	const { data, error } = await client
		.from('onto_sources')
		.select('id, uri, snapshot_uri, props')
		.in('id', sourceIds);

	if (error) {
		throw new Error(`Failed to load research sources: ${error.message}`);
	}

	const rows = (data as SourceRow[] | null) ?? [];
	const byId = new Map<string, ResearchSource>();

	for (const row of rows) {
		const props = (row.props ?? {}) as Record<string, unknown>;
		const title =
			(typeof props.title === 'string' && props.title.trim().length > 0
				? props.title
				: typeof props.name === 'string' && props.name.trim().length > 0
					? props.name
					: row.uri) ?? `Source ${byId.size + 1}`;
		const notes =
			typeof props.summary === 'string'
				? props.summary
				: typeof props.notes === 'string'
					? props.notes
					: null;

		byId.set(row.id, {
			id: row.id,
			uri: row.uri,
			title,
			notes,
			snapshot_uri: row.snapshot_uri
		});
	}

	return sourceIds
		.map((id) => byId.get(id))
		.filter((value): value is ResearchSource => Boolean(value));
}
