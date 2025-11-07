// apps/web/src/lib/server/fsm/actions/create-doc-from-template.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction } from '$lib/types/onto';
import type { TransitionContext } from '../engine';
import { inferEntityKindFromType, mergeDeep, renderTemplate } from './utils';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';

type EntityRow = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
	props: Record<string, unknown>;
	name?: string;
	title?: string;
};

type TemplateRow = {
	id: string;
	name: string;
	default_props: Record<string, unknown> | null;
	metadata: Record<string, unknown> | null;
};

type DocumentInsertResponse = {
	id: string;
	title: string;
};

export type { EntityRow as CreateDocEntityRow };

export async function executeCreateDocFromTemplateAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	if (!action.template_key) {
		throw new Error('create_doc_from_template requires template_key');
	}

	if (!ctx.actor_id) {
		throw new Error('create_doc_from_template requires actor context');
	}

	if (!entity.project_id) {
		throw new Error('create_doc_from_template requires entity.project_id');
	}

	const client = clientParam ?? createAdminSupabaseClient();
	const template = await fetchTemplate(client, action.template_key);

	if (!template) {
		throw new Error(`Document template not found: ${action.template_key}`);
	}

	const variables = normaliseVariables(
		(action.variables as Record<string, unknown> | undefined) ?? {}
	);
	const context = buildTemplateContext(entity, variables);

	const titleTemplate = template.name || action.template_key;
	const title = renderTemplate(titleTemplate, context);

	const props = mergeDeep(template.default_props ?? {}, {
		variables,
		generated_by_fsm: true,
		source_entity: {
			id: entity.id,
			type_key: entity.type_key,
			state_key: entity.state_key
		}
	});

	const document = await createDocument(client, {
		project_id: entity.project_id,
		title,
		type_key: action.template_key,
		props: props as Json,
		created_by: ctx.actor_id
	});

	const content = await generateDocumentContent(action.template_key, entity, context);

	await client.from('onto_document_versions').insert({
		document_id: document.id,
		number: 1,
		storage_uri: `generated/${document.id}/v1.md`,
		props: {
			content,
			format: 'markdown',
			generated_at: new Date().toISOString(),
			template_key: action.template_key
		} as Json,
		created_by: ctx.actor_id
	});

	await client.from('onto_edges').insert({
		src_kind: inferEntityKindFromType(entity.type_key),
		src_id: entity.id,
		rel: 'produces',
		dst_kind: 'document',
		dst_id: document.id,
		props: {
			origin: 'fsm_action',
			template_key: action.template_key
		} as Json
	});

	return `create_doc_from_template(${document.title})`;
}

async function fetchTemplate(
	client: ReturnType<typeof createAdminSupabaseClient>,
	templateKey: string
): Promise<TemplateRow | null> {
	const { data, error } = await client
		.from('onto_templates')
		.select('id, name, default_props, metadata')
		.eq('type_key', templateKey)
		.eq('scope', 'document')
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch document template "${templateKey}": ${error.message}`);
	}

	return (data as TemplateRow | null) ?? null;
}

async function createDocument(
	client: ReturnType<typeof createAdminSupabaseClient>,
	payload: {
		project_id: string;
		title: string;
		type_key: string;
		props: Json;
		created_by: string;
	}
): Promise<DocumentInsertResponse> {
	const { data, error } = await client
		.from('onto_documents')
		.insert(payload)
		.select('id, title')
		.single();

	if (error || !data) {
		throw new Error(`Failed to create document row: ${error?.message ?? 'unknown error'}`);
	}

	return data as DocumentInsertResponse;
}

function normaliseVariables(input: Record<string, unknown>): Record<string, unknown> {
	const normalised: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		normalised[key] = value;
	}
	return normalised;
}

function buildTemplateContext(
	entity: EntityRow,
	variables: Record<string, unknown>
): Record<string, unknown> {
	const entityName = entity.name ?? (entity.title as string | undefined);

	return {
		entity_name: entityName ?? variables['entity_name'] ?? 'Entity',
		entity_type: entity.type_key,
		state: entity.state_key,
		project_id: entity.project_id,
		props: entity.props ?? {},
		variables,
		...variables
	};
}

export async function generateDocumentContent(
	templateKey: string,
	entity: EntityRow,
	context: Record<string, unknown>
): Promise<string> {
	const entityName =
		typeof context.entity_name === 'string' && context.entity_name.length > 0
			? (context.entity_name as string)
			: 'Document';

	switch (templateKey) {
		case 'doc.campaign_report':
			return renderCampaignReport(entity, context);
		case 'doc.brief':
			return renderProjectBrief(entity, context);
		case 'doc.notes':
			return renderResearchNotes(entity, context);
		default:
			return `# ${entityName}\n\nGenerated from ${templateKey} for ${entity.type_key}.`;
	}
}

export function renderCampaignReport(entity: EntityRow, context: Record<string, unknown>): string {
	const props = entity.props as Record<string, any>;
	const variables = (context.variables as Record<string, unknown> | undefined) ?? {};
	const entityName =
		typeof context.entity_name === 'string' && context.entity_name.length > 0
			? (context.entity_name as string)
			: 'Campaign';
	const metrics = props?.performance_metrics || {};
	const start = props?.start_date || variables['start_date'] || 'Unknown';
	const end = props?.end_date || variables['end_date'] || 'Unknown';
	const goal = props?.campaign_goal || variables['campaign_goal'] || 'N/A';
	const channels = Array.isArray(props?.channels) ? props.channels : [];

	return [
		`# Campaign Performance Report`,
		`## Campaign: ${(variables['campaign_name'] as string) || entityName}`,
		``,
		`### Overview`,
		`- **Goal**: ${goal}`,
		`- **Duration**: ${start} to ${end}`,
		`- **Budget**: $${props?.budget ?? variables['budget'] ?? 0}`,
		`- **Channels**: ${channels.length ? channels.join(', ') : 'Not specified'}`,
		``,
		`### Performance Metrics`,
		`- **Impressions**: ${metrics.impressions ?? 0}`,
		`- **Clicks**: ${metrics.clicks ?? 0}`,
		`- **Conversions**: ${metrics.conversions ?? 0}`,
		`- **ROI**: ${metrics.roi ?? 0}%`,
		``,
		`### Key Learnings`,
		`- Placeholder for campaign insights`,
		``,
		`### Recommendations`,
		`- Placeholder for next steps`
	].join('\n');
}

export function renderProjectBrief(entity: EntityRow, context: Record<string, unknown>): string {
	const props = entity.props as Record<string, any>;
	const variables = (context.variables as Record<string, unknown> | undefined) ?? {};
	const entityName =
		typeof context.entity_name === 'string' && context.entity_name.length > 0
			? (context.entity_name as string)
			: 'Project';
	const summary =
		variables['summary'] ||
		props?.summary ||
		'Provide a concise description of the project objectives and desired outcomes.';
	const stakeholders =
		Array.isArray(props?.stakeholders) && props.stakeholders.length > 0
			? props.stakeholders.join(', ')
			: 'Not specified';
	const deliverables =
		Array.isArray(props?.deliverables) && props.deliverables.length > 0
			? props.deliverables.map((d: any) => `- ${d}`).join('\n')
			: '- Identify key deliverables';

	return [
		`# Project Brief`,
		`## ${entityName}`,
		``,
		`### Summary`,
		summary,
		``,
		`### Stakeholders`,
		stakeholders,
		``,
		`### Key Deliverables`,
		deliverables,
		``,
		`### Milestones`,
		`- Outline major milestones and target dates.`,
		``,
		`### Risks & Dependencies`,
		`- Document known risks and dependencies here.`
	].join('\n');
}

function renderResearchNotes(entity: EntityRow, context: Record<string, unknown>): string {
	const variables = (context.variables as Record<string, unknown> | undefined) ?? {};
	const topic =
		typeof variables.topic === 'string' && variables.topic.length > 0
			? (variables.topic as string)
			: typeof context.entity_name === 'string' && context.entity_name.length > 0
				? (context.entity_name as string)
				: (entity.name ?? 'Research Notes');

	const sources = Array.isArray(variables.sources) ? (variables.sources as any[]) : [];
	const generatedSummary =
		typeof variables.summary === 'string' ? (variables.summary as string) : '';

	const sections = sources
		.map((source, index) => {
			const title = typeof source.title === 'string' ? source.title : `Source ${index + 1}`;
			const uri = typeof source.uri === 'string' ? source.uri : null;
			const notes = typeof source.notes === 'string' ? source.notes : null;

			const lines = [
				`### Source ${index + 1}: ${title}`,
				uri ? `- URL: ${uri}` : '- URL: Not provided',
				notes
					? `- Notes: ${notes}`
					: '- Notes: Add key insights or takeaways for this source.'
			];

			return lines.join('\n');
		})
		.join('\n\n');

	return [
		`# Research Notes: ${topic}`,
		generatedSummary ? `\n${generatedSummary}\n` : '',
		sources.length > 0 ? sections : '\nNo sources have been attached yet.\n',
		``,
		`---`,
		`_Generated on ${new Date().toISOString()}_`
	].join('\n');
}
