// apps/web/src/lib/server/fsm/actions/email-admin.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction } from '$lib/types/onto';
import { sendEmail } from '$lib/utils/email-config';
import { renderTemplate, stripHtml } from './utils';
import type { TransitionContext } from '../engine';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

type EntityRow = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
	props: Record<string, unknown>;
	name?: string;
	title?: string;
};

type Recipient = {
	email: string;
	name: string | null;
};

export async function executeEmailAdminAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	const client = clientParam ?? createAdminSupabaseClient();

	const manualRecipients = normaliseManualRecipients(action.to);
	let recipients: Recipient[];

	if (manualRecipients.length > 0) {
		recipients = manualRecipients;
	} else {
		recipients = await fetchAdminRecipients(client);
	}

	if (recipients.length === 0) {
		console.warn('[FSM] email_admin skipped: no admin recipients available');
		return 'email_admin(skipped - no recipients)';
	}

	const subject =
		action.subject?.trim() ||
		`[BuildOS] ${inferEntityName(entity) || 'Ontology Update'} (${entity.type_key})`;
	const template = (action.body_template ?? action.body ?? action.message ?? '').trim();
	const variables = (action.variables as Record<string, unknown> | undefined) ?? {};

	const sharedContext = buildAdminContext(entity, ctx, variables);
	const failures: string[] = [];

	for (const recipient of recipients) {
		const context = {
			...sharedContext,
			admin_name: recipient.name ?? '',
			admin_email: recipient.email
		};

		const html = renderTemplate(template || defaultAdminBody(context), context);
		const text = stripHtml(html);

		const result = await sendEmail({
			to: recipient.email,
			subject,
			html,
			text,
			from: action.kind as any
		});

		if (!result.success) {
			failures.push(`${recipient.email}: ${result.error ?? 'unknown error'}`);
		}
	}

	if (failures.length > 0) {
		throw new Error(`email_admin failed for recipients: ${failures.join(', ')}`);
	}

	return `email_admin(${recipients.length})`;
}

async function fetchAdminRecipients(
	client: ReturnType<typeof createAdminSupabaseClient>
): Promise<Recipient[]> {
	const { data, error } = await client.from('users').select('email, name').eq('is_admin', true);

	if (error) {
		throw new Error(`Failed to load admin recipients: ${error.message}`);
	}

	return ((data as Recipient[]) ?? []).filter((admin) => Boolean(admin.email));
}

function normaliseManualRecipients(toField: string | undefined): Recipient[] {
	if (!toField) return [];

	return toField
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((email) => ({ email, name: null }));
}

function buildAdminContext(
	entity: EntityRow,
	ctx: TransitionContext,
	variables: Record<string, unknown>
): Record<string, unknown> {
	return {
		entity_name: inferEntityName(entity),
		entity_type: entity.type_key,
		entity_state: entity.state_key,
		project_id: entity.project_id,
		props: entity.props ?? {},
		variables,
		triggered_by_user_id: ctx.user_id ?? null,
		triggered_by_actor_id: ctx.actor_id ?? null,
		...variables
	};
}

function inferEntityName(entity: EntityRow): string | undefined {
	if (typeof entity.name === 'string' && entity.name.length > 0) return entity.name;
	if (typeof entity.title === 'string' && entity.title.length > 0) return entity.title;
	const propsName = (entity.props as Record<string, unknown>)?.['name'];
	return typeof propsName === 'string' && propsName.length > 0 ? propsName : undefined;
}

export function defaultAdminBody(context: Record<string, unknown>): string {
	const entityName =
		typeof context.entity_name === 'string' && context.entity_name.length > 0
			? (context.entity_name as string)
			: 'Ontology entity';
	const state =
		typeof context.entity_state === 'string' && context.entity_state.length > 0
			? (context.entity_state as string)
			: 'updated';
	const type =
		typeof context.entity_type === 'string' && context.entity_type.length > 0
			? (context.entity_type as string)
			: 'unknown';

	return `
<p>${entityName} (${type}) transitioned into the <strong>${state}</strong> state.</p>
<p>Triggered by actor: <strong>${context.triggered_by_actor_id ?? 'unknown'}</strong>.</p>
<p>Project ID: <code>${context.project_id ?? 'n/a'}</code></p>
`.trim();
}
