// apps/web/src/lib/server/people/people-emails.ts
//
// Emails for the people layer, in the plain BuildOS style:
//  - buildProjectInviteEmail: the invite a project owner sends by email or @handle
//    (used by the invite create and resend routes).
//  - sendPeopleRequestReceivedEmail: tells the owner someone (or their agent) asked to
//    see their projects. Call it once, right after create_people_request returns a new
//    request (a request_id and no already_pending).
//  - sendPeopleRequestApprovedEmail: tells the requester what was shared. Call it once,
//    right after decide_people_request approves.
//
// The two send functions never throw: a failed email never fails the request. They are
// transactional (someone acted on your account), like invite and handoff emails, so
// they go out regardless of the opt-in "email notifications" setting; addresses that
// hard-bounced or complained, and deleted or restricted accounts, are skipped.
// Free text from the requester's side (their note, what they asked about, their agent's
// label) is never put in an email: the owner reads it in BuildOS, so a request can't be
// used to mail someone arbitrary words from a BuildOS address. Only their name is used.

import { EmailService } from '$lib/services/email-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { escapeHtmlText, generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import {
	inviteeAgentSentence,
	inviteeRoleSentence,
	roleWithArticle
} from '$lib/components/people/people-copy';
import { appBaseUrl } from './invite-links';

export type PeopleEmailOutcome = 'sent' | 'skipped' | 'failed';

type EmailParts = { subject: string; html: string; text: string };

const INK = '#1A1A1D';
const MUTED = '#6F6E75';
const FAINT = '#9A9A9A';
const PAPER = '#FAF9F7';
const RULE = '#DCD9D1';
const ACCENT = '#D96C1E';

function longDate(value: string | null | undefined): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function paragraph(text: string, options: { muted?: boolean; size?: number } = {}): string {
	const color = options.muted ? MUTED : INK;
	const size = options.size ?? 15;
	return `<p style="margin: 0 0 14px 0; font-size: ${size}px; color: ${color}; line-height: 1.6;">${escapeHtmlText(text)}</p>`;
}

function button(label: string, url: string): string {
	return `<div style="margin: 24px 0;">
	<a href="${escapeHtmlText(url)}" style="display: inline-block; background-color: ${ACCENT}; color: ${PAPER}; font-size: 16px; font-weight: 600; text-decoration: none; padding: 13px 28px; border-radius: 8px;">${escapeHtmlText(label)}</a>
</div>`;
}

function fallbackLink(url: string): string {
	return `<p style="margin: 0 0 14px 0; font-size: 13px; color: ${MUTED}; line-height: 1.6;">Button not working? Paste this link into your browser:<br /><a href="${escapeHtmlText(url)}" style="color: ${ACCENT}; word-break: break-all;">${escapeHtmlText(url)}</a></p>`;
}

function quote(label: string, text: string): string {
	return `<div style="background-color: ${PAPER}; border: 1px solid ${RULE}; border-radius: 8px; padding: 12px 16px; margin: 0 0 16px 0;">
	<p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${FAINT}; font-weight: 600;">${escapeHtmlText(label)}</p>
	<p style="margin: 0; font-size: 14px; color: ${INK}; line-height: 1.5;">${escapeHtmlText(text)}</p>
</div>`;
}

function heading(text: string): string {
	return `<h1 style="margin: 0 0 16px 0; font-size: 22px; color: ${INK}; font-weight: 700; line-height: 1.3;">${escapeHtmlText(text)}</h1>`;
}

function render(subject: string, blocks: string[]): string {
	return generateMinimalEmailHTML({
		subject: escapeHtmlText(subject),
		content: blocks.join('\n')
	});
}

// ---------------------------------------------------------------------------
// The project invite
// ---------------------------------------------------------------------------

export type ProjectInviteEmailInput = {
	inviterName: string;
	projectName: string;
	projectDescription?: string | null;
	roleKey: string;
	agentAccess: string;
	inviteUrl: string;
	expiresAt: string;
	/** A resend: same invite, a reminder subject. */
	reminder?: boolean;
};

const DESCRIPTION_MAX = 280;

export function buildProjectInviteEmail(input: ProjectInviteEmailInput): EmailParts {
	const inviter = input.inviterName.trim() || 'Someone';
	const project = input.projectName.trim() || 'a project';
	const subject = `${input.reminder ? 'Reminder: ' : ''}${inviter} invited you to ${project} on BuildOS`;
	const role = `Join as ${roleWithArticle(input.roleKey)}. ${inviteeRoleSentence(input.roleKey)}`;
	const agents = inviteeAgentSentence(input.agentAccess);
	const until = longDate(input.expiresAt);
	const expiry = until
		? `This invite works until ${until}. If you weren’t expecting it, you can ignore this email.`
		: 'If you weren’t expecting this invite, you can ignore this email.';
	const rawDescription = input.projectDescription?.trim() ?? '';
	const description =
		rawDescription.length > DESCRIPTION_MAX
			? `${rawDescription.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
			: rawDescription;

	const html = render(subject, [
		heading(`${inviter} invited you to ${project}`),
		description ? quote('About this project', description) : '',
		paragraph(role),
		paragraph(agents, { muted: true, size: 14 }),
		button(`Join ${project}`, input.inviteUrl),
		paragraph(
			'New to BuildOS? You can make an account from the invite page, then you land right in the project.',
			{ muted: true, size: 13 }
		),
		fallbackLink(input.inviteUrl),
		paragraph(expiry, { muted: true, size: 12 })
	]);

	const text = [
		`${inviter} invited you to ${project} on BuildOS.`,
		description ? `About this project: ${description}` : null,
		role,
		agents,
		`Join ${project}: ${input.inviteUrl}`,
		'New to BuildOS? You can make an account from the invite page, then you land right in the project.',
		expiry
	]
		.filter(Boolean)
		.join('\n\n');

	return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Access requests
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
type Mailer = Pick<EmailService, 'sendEmail'>;

export type PeopleEmailDeps = {
	admin?: AdminClient;
	mailer?: Mailer;
	baseUrl?: string;
};

type PersonRow = {
	id: string;
	name: string | null;
	username: string | null;
	email: string | null;
	deletion_status: string | null;
	access_restricted: boolean | null;
};

function displayName(person: Pick<PersonRow, 'name' | 'username'>): string {
	return person.name?.trim() || (person.username ? `@${person.username}` : '') || 'Someone';
}

function withHandle(person: Pick<PersonRow, 'name' | 'username'>): string {
	const name = person.name?.trim();
	if (name && person.username) return `${name} (@${person.username})`;
	return displayName(person);
}

function redact(error: unknown): string {
	return error instanceof Error ? error.message.replace(/\S+@\S+/g, '[redacted]') : 'unknown';
}

async function loadPeople(admin: AdminClient, ids: string[]): Promise<Map<string, PersonRow>> {
	const { data, error } = await (admin as any)
		.from('users')
		.select('id, name, username, email, deletion_status, access_restricted')
		.in('id', ids);
	if (error) throw error;
	return new Map(((data ?? []) as PersonRow[]).map((row) => [row.id, row]));
}

/** An address we may mail: a live account, not hard-bounced or complained. */
async function emailableAddress(admin: AdminClient, person: PersonRow | undefined) {
	const email = person?.email?.trim().toLowerCase();
	if (!person || !email || person.deletion_status || person.access_restricted === true) {
		return null;
	}
	const { data, error } = await (admin as any)
		.from('email_suppressions')
		.select('reason')
		.eq('email', email)
		.maybeSingle();
	if (error) throw error;
	if (data && (data.reason === 'hard_bounce' || data.reason === 'complaint')) return null;
	return email;
}

async function send(
	mailer: Mailer,
	to: string,
	parts: EmailParts,
	meta: { recipientUserId: string; createdBy: string; type: string; requestId: string }
): Promise<PeopleEmailOutcome> {
	const result = await mailer.sendEmail({
		to,
		subject: parts.subject,
		body: parts.text,
		html: parts.html,
		userId: meta.recipientUserId,
		createdBy: meta.createdBy,
		metadata: { type: meta.type, request_id: meta.requestId }
	});
	if (!result?.success) {
		console.error(`[People Email] ${meta.type} send failed`);
		return 'failed';
	}
	return 'sent';
}

type RequestRow = {
	id: string;
	from_user_id: string;
	to_user_id: string;
	role_requested: string | null;
	note: string | null;
	via: string | null;
	status: string;
	decision: unknown;
	expires_at: string | null;
	kind?: string | null;
	project_id?: string | null;
};

async function loadRequest(admin: AdminClient, requestId: string): Promise<RequestRow | null> {
	const { data, error } = await (admin as any)
		.from('people_requests')
		.select(
			'id, from_user_id, to_user_id, role_requested, note, via, status, decision, expires_at, kind, project_id'
		)
		.eq('id', requestId)
		.maybeSingle();
	if (error) throw error;
	return (data as RequestRow | null) ?? null;
}

/** A former member asked to come back to one project (they used its invite link). */
export function buildRejoinRequestEmail(input: {
	requester: Pick<PersonRow, 'name' | 'username'>;
	projectName: string;
	roleRequested: string | null;
	reviewUrl: string;
	expiresAt: string | null;
}): EmailParts {
	const name = displayName(input.requester);
	const subject = `${name} wants to rejoin ${input.projectName}`;
	const asked = `${withHandle(input.requester)} left ${input.projectName} or was removed, then opened your invite link. They’d come back as ${roleWithArticle(input.roleRequested)}.`;
	const choice =
		'They stay out until you decide. If you deny it, they can’t ask to rejoin this project again.';
	const until = longDate(input.expiresAt);
	const footer = `${until ? `The request expires on ${until} if you don’t answer. ` : ''}You get this email because you shared an invite link for ${input.projectName}.`;

	const html = render(subject, [
		heading(subject),
		paragraph(asked),
		paragraph(choice, { muted: true, size: 14 }),
		button('Review request', input.reviewUrl),
		fallbackLink(input.reviewUrl),
		paragraph(footer, { muted: true, size: 12 })
	]);
	const text = [asked, choice, `Review request: ${input.reviewUrl}`, footer].join('\n\n');
	return { subject, html, text };
}

export function buildRequestReceivedEmail(input: {
	requester: Pick<PersonRow, 'name' | 'username'>;
	roleRequested: string | null;
	viaAgent: boolean;
	hasNote: boolean;
	reviewUrl: string;
	expiresAt: string | null;
}): EmailParts {
	const name = displayName(input.requester);
	const subject = `${name} wants to see your projects`;
	const asked = `${withHandle(input.requester)} asked to see your projects as ${roleWithArticle(input.roleRequested)}.`;
	const viaAgent = input.viaAgent ? 'Their AI agent sent the request for them.' : null;
	const note = input.hasNote ? 'They added a note. You can read it with the request.' : null;
	const choice =
		'Nothing is shared until you choose. You pick which projects, if any, and what their agents can do.';
	const until = longDate(input.expiresAt);
	const footer = `${until ? `The request expires on ${until} if you don’t answer. ` : ''}You get these emails because people can find you by your @handle. You can change that in your profile.`;

	const html = render(subject, [
		heading(subject),
		paragraph(asked),
		viaAgent ? paragraph(viaAgent) : '',
		note ? paragraph(note) : '',
		paragraph(choice, { muted: true, size: 14 }),
		button('Review request', input.reviewUrl),
		fallbackLink(input.reviewUrl),
		paragraph(footer, { muted: true, size: 12 })
	]);
	const text = [asked, viaAgent, note, choice, `Review request: ${input.reviewUrl}`, footer]
		.filter(Boolean)
		.join('\n\n');
	return { subject, html, text };
}

/**
 * Emails the owner that someone asked to see their projects. Safe to call from any
 * path (web or agent) once the request exists; never throws.
 */
export async function sendPeopleRequestReceivedEmail(
	requestId: string,
	deps: PeopleEmailDeps = {}
): Promise<PeopleEmailOutcome> {
	try {
		const admin = deps.admin ?? createAdminSupabaseClient();
		const request = await loadRequest(admin, requestId);
		if (!request || request.status !== 'pending') return 'skipped';

		const people = await loadPeople(admin, [request.from_user_id, request.to_user_id]);
		const requester = people.get(request.from_user_id);
		const owner = people.get(request.to_user_id);
		const to = await emailableAddress(admin, owner);
		if (!requester || !owner || !to) return 'skipped';

		const baseUrl = deps.baseUrl ?? appBaseUrl();
		let rejoinProjectName: string | null = null;
		if (request.kind === 'rejoin' && request.project_id) {
			const { data: project, error: projectError } = await (admin as any)
				.from('onto_projects')
				.select('name')
				.eq('id', request.project_id)
				.maybeSingle();
			if (projectError) throw projectError;
			rejoinProjectName = project?.name?.trim() || 'your project';
		}
		const parts = rejoinProjectName
			? buildRejoinRequestEmail({
					requester,
					projectName: rejoinProjectName,
					roleRequested: request.role_requested,
					reviewUrl: `${baseUrl}/people`,
					expiresAt: request.expires_at
				})
			: buildRequestReceivedEmail({
					requester,
					roleRequested: request.role_requested,
					viaAgent: request.via === 'agent',
					hasNote: Boolean(request.note?.trim()),
					reviewUrl: `${baseUrl}/people`,
					expiresAt: request.expires_at
				});
		return await send(deps.mailer ?? new EmailService(admin as any), to, parts, {
			recipientUserId: owner.id,
			createdBy: requester.id,
			type: 'people_request_received',
			requestId
		});
	} catch (error) {
		console.error('[People Email] request received email failed', redact(error));
		return 'failed';
	}
}

type SharedProject = { id: string; name: string; role: string; agent_access: string };

export function buildRequestApprovedEmail(input: {
	owner: Pick<PersonRow, 'name' | 'username'>;
	projects: SharedProject[];
	baseUrl: string;
}): EmailParts {
	const owner = displayName(input.owner);
	const single = input.projects.length === 1 ? input.projects[0] : null;
	const what = single ? single.name : `${input.projects.length} projects`;
	const subject = `${owner} shared ${what} with you`;
	const url = single ? `${input.baseUrl}/projects/${single.id}` : `${input.baseUrl}/projects`;
	const label = single ? `Open ${single.name}` : 'Open your projects';

	const lines = single
		? [
				`You’re ${roleWithArticle(single.role)}. ${inviteeRoleSentence(single.role)}`,
				inviteeAgentSentence(single.agent_access)
			]
		: [
				...input.projects.map(
					(project) =>
						`${project.name}: ${project.role === 'editor' ? 'you can edit it' : 'you can view it'}.`
				),
				'If you connect an AI agent (like Claude or ChatGPT) to BuildOS, it gets the same access where the owner allowed it.'
			];

	const html = render(subject, [
		heading(subject),
		...lines.map((line, index) =>
			paragraph(line, index === lines.length - 1 ? { muted: true, size: 14 } : {})
		),
		button(label, url),
		fallbackLink(url)
	]);
	const text = [`${subject}.`, ...lines, `${label}: ${url}`].join('\n\n');
	return { subject, html, text };
}

/**
 * Emails the requester what the owner shared. Call after decide_people_request
 * approves; never throws.
 */
export async function sendPeopleRequestApprovedEmail(
	requestId: string,
	deps: PeopleEmailDeps = {}
): Promise<PeopleEmailOutcome> {
	try {
		const admin = deps.admin ?? createAdminSupabaseClient();
		const request = await loadRequest(admin, requestId);
		if (!request || request.status !== 'approved' || !Array.isArray(request.decision)) {
			return 'skipped';
		}

		const grants = (request.decision as Array<Record<string, unknown>>)
			.filter((grant) => typeof grant?.project_id === 'string')
			.map((grant) => ({
				project_id: String(grant.project_id),
				role: grant.role === 'editor' ? 'editor' : 'viewer',
				agent_access:
					grant.agent_access === 'off' || grant.agent_access === 'write'
						? String(grant.agent_access)
						: 'read'
			}));
		if (grants.length === 0) return 'skipped';

		const { data: projectRows, error: projectError } = await (admin as any)
			.from('onto_projects')
			.select('id, name')
			.in(
				'id',
				grants.map((grant) => grant.project_id)
			)
			.is('deleted_at', null);
		if (projectError) throw projectError;
		const names = new Map(
			((projectRows ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
				row.id,
				row.name?.trim() || 'Untitled project'
			])
		);
		const projects: SharedProject[] = grants
			.filter((grant) => names.has(grant.project_id))
			.map((grant) => ({
				id: grant.project_id,
				name: names.get(grant.project_id) ?? 'Untitled project',
				role: grant.role,
				agent_access: grant.agent_access
			}));
		if (projects.length === 0) return 'skipped';

		const people = await loadPeople(admin, [request.from_user_id, request.to_user_id]);
		const requester = people.get(request.from_user_id);
		const owner = people.get(request.to_user_id);
		const to = await emailableAddress(admin, requester);
		if (!requester || !owner || !to) return 'skipped';

		const parts = buildRequestApprovedEmail({
			owner,
			projects,
			baseUrl: deps.baseUrl ?? appBaseUrl()
		});
		return await send(deps.mailer ?? new EmailService(admin as any), to, parts, {
			recipientUserId: requester.id,
			createdBy: owner.id,
			type: 'people_request_approved',
			requestId
		});
	} catch (error) {
		console.error('[People Email] request approved email failed', redact(error));
		return 'failed';
	}
}
