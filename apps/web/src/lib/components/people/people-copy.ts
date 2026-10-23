// apps/web/src/lib/components/people/people-copy.ts
//
// Plain wording and the small rules of the people layer: what each agent setting
// means, which settings a role allows, and what to tell someone after they ask for
// access. Shared by /people, the project share modal, and the people API routes so
// the same thing always reads the same way.

export type AgentAccess = 'off' | 'read' | 'write';
export type PersonRole = 'viewer' | 'editor';

export const AGENT_ACCESS_VALUES: readonly AgentAccess[] = ['off', 'read', 'write'];
export const DEFAULT_AGENT_ACCESS: AgentAccess = 'read';

export function isAgentAccess(value: unknown): value is AgentAccess {
	return value === 'off' || value === 'read' || value === 'write';
}

export function isPersonRole(value: unknown): value is PersonRole {
	return value === 'viewer' || value === 'editor';
}

/** Agents never go past their person: Write needs someone who can edit. */
export function agentAccessAllowed(role: string | null | undefined, access: AgentAccess): boolean {
	return access !== 'write' || role === 'editor' || role === 'owner';
}

/** Keeps a picked agent setting valid when the role changes (Viewer drops Write to Read). */
export function fitAgentAccessToRole(
	role: string | null | undefined,
	access: AgentAccess
): AgentAccess {
	return agentAccessAllowed(role, access) ? access : 'read';
}

export function agentAccessLabel(access: string | null | undefined): string {
	switch (access) {
		case 'off':
			return 'Off';
		case 'write':
			return 'Write';
		default:
			return 'Read';
	}
}

/** One sentence, from the owner's side, about what this person's agents can do here. */
export function agentAccessDescription(access: string | null | undefined): string {
	switch (access) {
		case 'off':
			return 'Their agents can’t open this project.';
		case 'write':
			return 'Their agents can read it, add tasks and docs, and change only what this person created or is assigned to.';
		default:
			return 'Their agents can read this project.';
	}
}

export function roleLabel(role: string | null | undefined): string {
	switch (role) {
		case 'owner':
			return 'Owner';
		case 'editor':
			return 'Editor';
		default:
			return 'Viewer';
	}
}

/** "a viewer" / "an editor", for sentences. */
export function roleWithArticle(role: string | null | undefined): string {
	return role === 'editor' ? 'an editor' : 'a viewer';
}

/** What the invited person will be able to do, in their own terms. */
export function inviteeRoleSentence(role: string | null | undefined): string {
	return role === 'editor'
		? 'You’ll be able to add and change tasks, docs, and plans.'
		: 'You’ll be able to see everything in it and follow along.';
}

/** One line, from the invited person's side, about an AI agent they connect later. */
export function inviteeAgentSentence(access: string | null | undefined): string {
	switch (access) {
		case 'off':
			return 'AI agents you connect to BuildOS won’t be able to open this project.';
		case 'write':
			return 'If you connect an AI agent (like Claude or ChatGPT) to BuildOS, it can read this project, add tasks and docs, and update what you created or are assigned to.';
		default:
			return 'If you connect an AI agent (like Claude or ChatGPT) to BuildOS, it can read this project for you.';
	}
}

/** How long an invite link lasts, as the owner picks it. */
export const INVITE_LINK_DAY_CHOICES = [1, 7, 30] as const;
export const DEFAULT_INVITE_LINK_DAYS = 7;

export function inviteLinkDaysLabel(days: number): string {
	return days === 1 ? '1 day' : `${days} days`;
}

/** "Oct 30", for expiry lines. Empty when the date can't be read. */
export function shortDate(value: string | null | undefined): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The owner-side summary under an invite link:
 * "Anyone with this link can join as a viewer until Oct 30. Their agents can read it."
 */
export function inviteLinkSummary(link: {
	role_key: string | null | undefined;
	agent_access: string | null | undefined;
	expires_at: string | null | undefined;
	expired?: boolean;
}): string {
	const until = shortDate(link.expires_at);
	if (link.expired) {
		return `This link stopped working${until ? ` on ${until}` : ''}. Pick a new length to turn it back on, or reset it.`;
	}
	const agents =
		link.agent_access === 'off'
			? 'Their agents can’t open it.'
			: link.agent_access === 'write'
				? 'Their agents can read it and add tasks and docs.'
				: 'Their agents can read it.';
	return `Anyone with this link can join as ${roleWithArticle(link.role_key)}${until ? ` until ${until}` : ''}. ${agents}`;
}

export type InviteLinkVisitorStatus =
	| 'active'
	| 'expired'
	| 'reset'
	| 'turned_off'
	| 'not_found'
	| 'removed'
	| 'rejoin_denied'
	| 'rate_limited';

/** What to tell someone whose invite link can't add them. */
export function inviteLinkProblem(
	status: InviteLinkVisitorStatus | string | null | undefined,
	projectName?: string | null
): { title: string; message: string } {
	switch (status) {
		case 'expired':
			return {
				title: 'This invite link expired',
				message: 'Ask the person who shared it for a new one.'
			};
		case 'reset':
			return {
				title: 'This invite link was replaced',
				message: 'The owner made a new link. Ask the person who shared it for the new one.'
			};
		case 'turned_off':
			return {
				title: 'This invite link is turned off',
				message: 'The owner stopped using it. Ask them to invite you another way.'
			};
		case 'removed':
			return {
				title: `You were removed from ${projectName?.trim() || 'this project'}`,
				message: 'This link can’t add you back. Ask the owner to invite you directly.'
			};
		case 'rejoin_denied':
			return {
				title: `You can’t rejoin ${projectName?.trim() || 'this project'}`,
				message: 'The owner decided not to let you back in, so this link can’t add you.'
			};
		case 'rate_limited':
			return {
				title: 'You have too many requests waiting',
				message: 'Wait until some of them are answered, then try this link again.'
			};
		default:
			return {
				title: 'This invite link doesn’t work',
				message:
					'Check that you copied the whole link, or ask the person who shared it for a new one.'
			};
	}
}

/** "@sam", or null when there is no handle. */
export function formatHandle(handle: string | null | undefined): string | null {
	const trimmed = handle?.trim();
	return trimmed ? `@${trimmed}` : null;
}

export type RequestOutcomeTone = 'success' | 'info' | 'warning' | 'error';

export type RequestOutcome = {
	tone: RequestOutcomeTone;
	message: string;
};

export type CreateRequestResult = {
	status?: string;
	reason?: string;
	already_pending?: boolean;
};

/** What to tell the person who just asked, for each status create_people_request returns. */
export function requestOutcomeMessage(
	result: CreateRequestResult | null | undefined,
	personName: string
): RequestOutcome {
	const name = personName.trim() || 'They';
	switch (result?.status) {
		case 'pending':
			return result.already_pending
				? {
						tone: 'info',
						message: `You already asked ${name}. Your request is still waiting for an answer.`
					}
				: {
						tone: 'success',
						message: `Request sent. ${name} will see it in BuildOS and choose what to share with you.`
					};
		case 'not_found':
			return {
				tone: 'warning',
				message:
					'No one with that handle can be found. Check the spelling, or ask them to turn on finding by handle in their settings.'
			};
		case 'self':
			return { tone: 'info', message: 'That’s your own handle.' };
		case 'agent_requests_off':
			return { tone: 'warning', message: `${name} doesn’t take requests sent by agents.` };
		case 'declined_recently':
			return {
				tone: 'warning',
				message: `${name} said no to a recent request. You can ask again 30 days after that.`
			};
		case 'rate_limited':
			return result.reason === 'agent_daily_limit'
				? {
						tone: 'warning',
						message: 'Your agent has sent its 5 requests for today. Try again tomorrow.'
					}
				: {
						tone: 'warning',
						message:
							'You have 10 requests waiting for answers. You can ask again once some are answered or expire.'
					};
		default:
			return { tone: 'error', message: 'Your request didn’t go through. Try again.' };
	}
}

/** Status of a request you sent, as you'd say it. */
export function outgoingStatusLabel(status: string | null | undefined): string {
	switch (status) {
		case 'approved':
			return 'Shared with you';
		case 'declined':
			return 'Declined';
		case 'expired':
			return 'Expired';
		case 'canceled':
			return 'Canceled';
		default:
			return 'Waiting for an answer';
	}
}

function normalizeName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Projects to pre-check on the approve sheet because their name matches what the
 * requester typed ("9takes"). This is a loose name match, not a judgment about
 * meaning: it only pre-checks a box the owner sees and can uncheck, so a miss or an
 * extra match is harmless. Exact matches win; otherwise a name and the hint may
 * contain one another (3+ characters).
 */
export function matchProjectHint(
	projects: ReadonlyArray<{ id: string; name: string | null | undefined }>,
	hint: string | null | undefined
): string[] {
	const wanted = hint ? normalizeName(hint) : '';
	if (wanted.length < 2) return [];

	const named = projects
		.map((project) => ({ id: project.id, name: normalizeName(project.name ?? '') }))
		.filter((project) => project.name.length > 0);

	const exact = named.filter((project) => project.name === wanted).map((project) => project.id);
	if (exact.length > 0) return exact;
	if (wanted.length < 3) return [];

	return named
		.filter(
			(project) =>
				(project.name.length >= 3 && wanted.includes(project.name)) ||
				project.name.includes(wanted)
		)
		.map((project) => project.id);
}
