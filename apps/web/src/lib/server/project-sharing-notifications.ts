// apps/web/src/lib/server/project-sharing-notifications.ts
/**
 * Best-effort emails for shared-project events (handoff, delete, restore).
 * Never throws; failures are logged without email addresses.
 *
 * Recipient emails are read with the admin client: an explicit privileged read
 * (members' addresses are not readable by other members under RLS).
 */
import { PUBLIC_APP_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';

const FALLBACK_APP_URL = 'https://build-os.com';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

function projectUrl(projectId: string): string {
	return `${PUBLIC_APP_URL || FALLBACK_APP_URL}/projects/${projectId}`;
}

interface EmailPayload {
	subject: string;
	paragraph: string;
	linkLabel: string | null;
	url: string | null;
	type: string;
	projectId: string;
}

async function sendToUsers(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	userEmails: Array<{ id: string; email: string }>,
	senderUserId: string,
	payload: EmailPayload
): Promise<void> {
	const emailService = new EmailService(admin as any);
	const safeParagraph = escapeHtml(payload.paragraph);
	const linkHtml =
		payload.url && payload.linkLabel
			? `\n<p style="margin: 0;"><a href="${payload.url}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">${escapeHtml(payload.linkLabel)}</a></p>`
			: '';
	const content = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #1A1A1D; line-height: 1.6;">${safeParagraph}</p>${linkHtml}`;
	const html = generateMinimalEmailHTML({ subject: escapeHtml(payload.subject), content });
	const body = payload.url
		? `${payload.paragraph}\n\n${payload.linkLabel}: ${payload.url}`
		: payload.paragraph;

	for (const recipient of userEmails) {
		try {
			const result = await emailService.sendEmail({
				to: recipient.email,
				subject: payload.subject,
				body,
				html,
				userId: senderUserId,
				createdBy: senderUserId,
				metadata: { type: payload.type, project_id: payload.projectId }
			});
			if (!result?.success) {
				console.error(`[Project Sharing Email] ${payload.type} send failed`);
			}
		} catch (error) {
			console.error(`[Project Sharing Email] ${payload.type} send threw`, errorName(error));
		}
	}
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.message.replace(/\S+@\S+/g, '[redacted]') : 'unknown';
}

async function loadUserEmails(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	userIds: string[]
): Promise<Array<{ id: string; email: string }>> {
	if (userIds.length === 0) return [];
	const { data, error } = await admin.from('users').select('id, email').in('id', userIds);
	if (error) throw error;
	return ((data ?? []) as Array<{ id: string; email: string | null }>).filter(
		(row): row is { id: string; email: string } => Boolean(row.email)
	);
}

async function loadActiveMemberUserIds(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	projectId: string,
	excludeUserId: string
): Promise<string[]> {
	const { data: members, error: memberError } = await admin
		.from('onto_project_members')
		.select('actor_id')
		.eq('project_id', projectId)
		.is('removed_at', null);
	if (memberError) throw memberError;
	const actorIds = ((members ?? []) as Array<{ actor_id: string }>).map((m) => m.actor_id);
	if (actorIds.length === 0) return [];

	const { data: actors, error: actorError } = await admin
		.from('onto_actors')
		.select('user_id')
		.in('id', actorIds);
	if (actorError) throw actorError;
	const userIds = ((actors ?? []) as Array<{ user_id: string | null }>)
		.map((a) => a.user_id)
		.filter((id): id is string => Boolean(id) && id !== excludeUserId);
	return Array.from(new Set(userIds));
}

export async function notifyOwnershipReceived(params: {
	projectId: string;
	projectName: string;
	newOwnerUserId: string;
	fromName: string;
	senderUserId: string;
}): Promise<void> {
	try {
		const admin = createAdminSupabaseClient();
		const recipients = await loadUserEmails(admin, [params.newOwnerUserId]);
		await sendToUsers(admin, recipients, params.senderUserId, {
			subject: `You're now the owner of "${params.projectName}"`,
			paragraph: `${params.fromName} handed you "${params.projectName}". You can invite people, hand it on, or delete it.`,
			linkLabel: 'Open the project',
			url: projectUrl(params.projectId),
			type: 'project_ownership_received',
			projectId: params.projectId
		});
	} catch (error) {
		console.error('[Project Sharing Email] ownership notice failed', errorName(error));
	}
}

export async function notifyMembersProjectDeleted(params: {
	projectId: string;
	projectName: string;
	ownerName: string;
	excludeUserId: string;
	restorableUntil: string | null;
	reason: 'deleted' | 'account_deleted';
	senderUserId: string;
}): Promise<void> {
	try {
		const admin = createAdminSupabaseClient();
		const userIds = await loadActiveMemberUserIds(
			admin,
			params.projectId,
			params.excludeUserId
		);
		const recipients = await loadUserEmails(admin, userIds);
		const paragraph =
			params.reason === 'account_deleted'
				? `${params.ownerName} is deleting their BuildOS account and chose to delete "${params.projectName}". It is no longer available.`
				: `${params.ownerName} deleted "${params.projectName}". They can restore it until ${
						params.restorableUntil
							? formatDate(params.restorableUntil)
							: 'the restore window closes'
					}; after that it is erased.`;
		await sendToUsers(admin, recipients, params.senderUserId, {
			subject: `"${params.projectName}" was deleted`,
			paragraph,
			linkLabel: null,
			url: null,
			type: 'project_deleted',
			projectId: params.projectId
		});
	} catch (error) {
		console.error('[Project Sharing Email] delete notice failed', errorName(error));
	}
}

export async function notifyMembersProjectRestored(params: {
	projectId: string;
	projectName: string;
	ownerName: string;
	excludeUserId: string;
	senderUserId: string;
}): Promise<void> {
	try {
		const admin = createAdminSupabaseClient();
		const userIds = await loadActiveMemberUserIds(
			admin,
			params.projectId,
			params.excludeUserId
		);
		const recipients = await loadUserEmails(admin, userIds);
		await sendToUsers(admin, recipients, params.senderUserId, {
			subject: `"${params.projectName}" is back`,
			paragraph: `${params.ownerName} restored "${params.projectName}". It's back in your projects.`,
			linkLabel: 'Open the project',
			url: projectUrl(params.projectId),
			type: 'project_restored',
			projectId: params.projectId
		});
	} catch (error) {
		console.error('[Project Sharing Email] restore notice failed', errorName(error));
	}
}
