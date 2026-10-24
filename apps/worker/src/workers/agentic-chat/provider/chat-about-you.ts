// apps/worker/src/workers/agentic-chat/provider/chat-about-you.ts
//
// About you on every chat turn (tasker/146). Loads the person's own settings and
// the inferred About you note from their Workspace, asks Jev which note sections
// (if any) would change the answer to this message, and returns one block to append
// after the user message. Runs beside the context finder, so it adds no wait on a
// normal turn, and fails open: a slow read or an unavailable gate means the turn
// goes out with only what's always on (or nothing).
//
// The gate (one small Jev call) runs only for the context finder's cohort; everyone
// else gets the always-on part, which needs no model.
import {
	type AboutYouExplicitSettings,
	type AboutYouGateResultV1,
	type ContextFinderDecider,
	gateAboutYouSections,
	renderAboutYouBlock
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	ABOUT_YOU_TYPE_KEY,
	gatedAboutYouSections,
	parseAboutYouDocument,
	type AboutYouSection
} from '@buildos/shared-agent-ops/ontology/about-you';
import {
	allowsContextFinderUser,
	turnConversation,
	withFinderDeadline
} from './chat-context-finder';
import type { AgenticChatTurnProviderRequestV1 } from './contracts';

/** Two indexed reads (cached) plus at most one small Jev call. */
export const CHAT_ABOUT_YOU_DEADLINE_MS = 2_000;
export const CHAT_ABOUT_YOU_GATE_TIMEOUT_MS = 1_500;
/** Edits to the note or settings reach chat within this window. */
const PROFILE_CACHE_TTL_MS = 60_000;
const PROFILE_CACHE_MAX = 500;

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type Query = {
	select(columns: string): Query;
	eq(column: string, value: unknown): Query;
	is(column: string, value: null): Query;
	order(column: string, options: { ascending: boolean }): Query;
	limit(count: number): Query;
	abortSignal?(signal: AbortSignal): Query;
	maybeSingle(): QueryResult<Record<string, unknown>>;
};
export type AboutYouReadClient = { from(table: string): Query };

export type AboutYouProfile = {
	sections: AboutYouSection[];
	settings: AboutYouExplicitSettings | null;
};

export type ChatAboutYouResult = {
	injection: string | null;
	gate: AboutYouGateResultV1 | null;
};

export type AgenticChatAboutYouPort = {
	load(request: AgenticChatTurnProviderRequestV1): Promise<ChatAboutYouResult | null>;
};

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function withSignal(query: Query, signal: AbortSignal): Query {
	return typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query;
}

export async function loadAboutYouProfile(
	client: AboutYouReadClient,
	userId: string,
	workspaceProjectId: string | null,
	signal: AbortSignal
): Promise<AboutYouProfile> {
	const userRead = withSignal(
		client.from('users').select('preferences, onboarding_stakes').eq('id', userId),
		signal
	).maybeSingle();
	const workspaceRead = workspaceProjectId
		? Promise.resolve(workspaceProjectId)
		: (async () => {
				const actor = await withSignal(
					client.from('onto_actors').select('id').eq('user_id', userId),
					signal
				).maybeSingle();
				if (actor.error) throw new Error(actor.error.message);
				const actorId = text(actor.data?.id);
				if (!actorId) return null;
				const workspace = await withSignal(
					client
						.from('onto_projects')
						.select('id')
						.eq('created_by', actorId)
						.eq('kind', 'workspace')
						.is('deleted_at', null)
						.limit(1),
					signal
				).maybeSingle();
				if (workspace.error) throw new Error(workspace.error.message);
				return text(workspace.data?.id);
			})();
	const [user, workspaceId] = await Promise.all([userRead, workspaceRead]);
	if (user.error) throw new Error(user.error.message);
	let sections: AboutYouSection[] = [];
	if (workspaceId) {
		const note = await withSignal(
			client
				.from('onto_documents')
				.select('content')
				.eq('project_id', workspaceId)
				.eq('type_key', ABOUT_YOU_TYPE_KEY)
				.is('deleted_at', null)
				.order('created_at', { ascending: true })
				.limit(1),
			signal
		).maybeSingle();
		if (note.error) throw new Error(note.error.message);
		sections = parseAboutYouDocument(text(note.data?.content));
	}
	const preferences =
		user.data?.preferences && typeof user.data.preferences === 'object'
			? (user.data.preferences as Record<string, unknown>)
			: {};
	const settings: AboutYouExplicitSettings = {
		communicationStyle: text(preferences.communication_style),
		responseLength: text(preferences.response_length),
		proactivityLevel: text(preferences.proactivity_level),
		primaryRole: text(preferences.primary_role),
		domainContext: text(preferences.domain_context),
		stakes: text(user.data?.onboarding_stakes)
	};
	const hasSettings = Object.values(settings).some(Boolean);
	return { sections, settings: hasSettings ? settings : null };
}

export class ChatAboutYou implements AgenticChatAboutYouPort {
	private readonly cache = new Map<string, { expiresAt: number; profile: AboutYouProfile }>();

	constructor(
		private readonly options: {
			client: AboutYouReadClient;
			/** Absent: no gate, only the always-on part. */
			decider?: ContextFinderDecider | null;
			/** Who gets the gate (the context finder's cohort). */
			gateUserIds?: readonly string[] | 'all';
			deadlineMs?: number;
			now?: () => number;
			loadProfile?: typeof loadAboutYouProfile;
		}
	) {}

	private async profile(
		request: AgenticChatTurnProviderRequestV1,
		signal: AbortSignal
	): Promise<AboutYouProfile> {
		const now = (this.options.now ?? Date.now)();
		const cached = this.cache.get(request.userId);
		if (cached && cached.expiresAt > now) return cached.profile;
		const profile = await (this.options.loadProfile ?? loadAboutYouProfile)(
			this.options.client,
			request.userId,
			request.workspaceProjectId ?? null,
			signal
		);
		if (this.cache.size >= PROFILE_CACHE_MAX) this.cache.clear();
		this.cache.set(request.userId, { expiresAt: now + PROFILE_CACHE_TTL_MS, profile });
		return profile;
	}

	async load(request: AgenticChatTurnProviderRequestV1): Promise<ChatAboutYouResult | null> {
		const turn = turnConversation(request);
		if (!turn) return null;
		const outcome = await withFinderDeadline(
			request,
			this.options.deadlineMs ?? CHAT_ABOUT_YOU_DEADLINE_MS,
			async (signal) => {
				const profile = await this.profile(request, signal);
				const gateAllowed =
					!!this.options.decider &&
					allowsContextFinderUser(this.options.gateUserIds ?? [], request.userId) &&
					gatedAboutYouSections(profile.sections).length > 0;
				const gate = gateAllowed
					? await gateAboutYouSections({
							decider: this.options.decider!,
							sections: profile.sections,
							message: turn.message,
							recentConversation: turn.recent,
							signal,
							timeoutMs: CHAT_ABOUT_YOU_GATE_TIMEOUT_MS,
							usage: {
								operationType: 'agentic_chat_about_you_gate',
								userId: request.userId,
								chatSessionId: request.sessionId
							}
						})
					: null;
				return { profile, gate };
			}
		);
		if (!outcome.ok) return null;
		const { profile, gate } = outcome.value;
		return {
			injection: renderAboutYouBlock({
				sections: profile.sections,
				gated: gate?.selected ?? [],
				settings: profile.settings
			}),
			gate
		};
	}
}
