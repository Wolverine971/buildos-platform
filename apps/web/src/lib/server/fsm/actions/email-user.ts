// apps/web/src/lib/server/fsm/actions/email-user.ts
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

type UserRow = {
	email: string;
	name: string | null;
};

type ProjectRow = {
	name: string;
};

export type { EntityRow as EmailActionEntity };

export async function executeEmailUserAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	if (!ctx.user_id) {
		console.warn('[FSM] email_user skipped: no user_id in transition context');
		return 'email_user(skipped - no user)';
	}

	const client = clientParam ?? createAdminSupabaseClient();

	const { data: user, error: userError } = await client
		.from('users')
		.select('email, name')
		.eq('id', ctx.user_id)
		.maybeSingle();

	if (userError) {
		throw new Error(`Failed to load user for email_user action: ${userError.message}`);
	}

	if (!user?.email) {
		console.warn('[FSM] email_user skipped: user record missing email', {
			userId: ctx.user_id
		});
		return 'email_user(skipped - no email)';
	}

	const subject = action.subject?.trim() || 'Project Update';
	const bodyTemplate = (action.body_template ?? action.body ?? '').trim();

	const projectInfo = await resolveProjectName(client, entity.project_id);

	const context = buildTemplateContext({
		user,
		entity,
		projectName: projectInfo?.name,
		variables: (action.variables as Record<string, unknown> | undefined) ?? {}
	});

	const renderedHtml = renderTemplate(bodyTemplate || defaultBodyTemplate(context), context);
	const renderedText = stripHtml(renderedHtml);

	const result = await sendEmail({
		to: user.email,
		subject,
		html: renderedHtml,
		text: renderedText,
		from: action.kind as any
	});

	if (!result.success) {
		throw new Error(`email_user delivery failed: ${result.error ?? 'unknown error'}`);
	}

	return `email_user(${user.email})`;
}

async function resolveProjectName(
	client: ReturnType<typeof createAdminSupabaseClient>,
	projectId: string | undefined
): Promise<ProjectRow | null> {
	if (!projectId) return null;

	const { data, error } = await client
		.from('onto_projects')
		.select('name')
		.eq('id', projectId)
		.maybeSingle();

	if (error) {
		console.warn('[FSM] email_user: failed to resolve project name', {
			projectId,
			error: error.message
		});
		return null;
	}

	return (data as ProjectRow | null) ?? null;
}

function buildTemplateContext({
	user,
	entity,
	projectName,
	variables
}: {
	user: UserRow;
	entity: EntityRow;
	projectName?: string | null;
	variables: Record<string, unknown>;
}) {
	const entityName = entity.name ?? (entity.title as string | undefined);
	const context = {
		user_name: user.name ?? '',
		user_email: user.email,
		project_name: projectName ?? entityName ?? '',
		project_id: entity.project_id,
		state: entity.state_key,
		entity_name: entityName ?? projectName ?? '',
		entity_type: entity.type_key,
		entity_state: entity.state_key,
		variables,
		props: entity.props ?? {}
	};

	return {
		...context,
		...variables
	};
}

export function defaultBodyTemplate(context: Record<string, unknown>): string {
	const entityName =
		typeof context.entity_name === 'string' && context.entity_name.length > 0
			? context.entity_name
			: 'Your project';
	const state =
		typeof context.state === 'string' && context.state.length > 0 ? context.state : 'updated';

	return `<p>${entityName} is now in the <strong>${state}</strong> state.</p>`;
}
