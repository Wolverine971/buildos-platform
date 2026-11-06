// apps/web/src/routes/history/history-chat-projects.ts
/**
 * Which projects a chat was about, for the History card label.
 *
 * A chat's projects come from four trails, strongest first:
 * - its home project (project chats) or the project a workspace chat focused on
 * - session-project links (inbox, audit, agent-run chats)
 * - projects the chat changed (onto_project_logs)
 * - projects the context finder pulled into a workspace turn (llm_usage_logs)
 *
 * Workspace pseudo-projects (kind = 'workspace') never count as a project.
 */

export interface ChatProjectRef {
	id: string;
	name: string;
}

export interface ChatProjectSessionInput {
	id: string;
	context_type: string;
	entity_id: string | null;
}

export interface ChatProjectTrails {
	/** session id → focused project id (workspace chats) */
	focusBySession: Map<string, string>;
	/** rows from chat_sessions_projects */
	links: Array<{ chat_session_id: string; project_id: string }>;
	/** rows from onto_project_logs (one per change) */
	changes: Array<{ chat_session_id: string; project_id: string }>;
	/** rows from llm_usage_logs with a project (one per model call) */
	reads: Array<{ chat_session_id: string; project_id: string }>;
}

export interface ChatProjects {
	/** Real projects, most relevant first */
	projects: ChatProjectRef[];
	/** The chat sat in (or touched) the user's Workspace */
	workspace: boolean;
}

export interface ChatProjectProjectRow {
	id: string;
	name: string;
	kind: string | null;
}

const PRIMARY_WEIGHT = 1_000_000;
const LINK_WEIGHT = 10_000;
const CHANGE_WEIGHT = 100;
const READ_WEIGHT = 1;

/** Ranks each session's projects and resolves names. Pure: no I/O. */
export function rankChatProjects(
	sessions: ChatProjectSessionInput[],
	trails: ChatProjectTrails,
	projects: ChatProjectProjectRow[]
): Map<string, ChatProjects> {
	const projectsById = new Map(projects.map((project) => [project.id, project]));
	const scores = new Map<string, Map<string, number>>();

	const add = (sessionId: string, projectId: string | null | undefined, weight: number) => {
		if (!projectId) return;
		let sessionScores = scores.get(sessionId);
		if (!sessionScores) {
			sessionScores = new Map();
			scores.set(sessionId, sessionScores);
		}
		sessionScores.set(projectId, (sessionScores.get(projectId) ?? 0) + weight);
	};

	for (const session of sessions) {
		if (session.context_type === 'project') add(session.id, session.entity_id, PRIMARY_WEIGHT);
		add(session.id, trails.focusBySession.get(session.id), PRIMARY_WEIGHT);
	}
	for (const row of trails.links) add(row.chat_session_id, row.project_id, LINK_WEIGHT);
	for (const row of trails.changes) add(row.chat_session_id, row.project_id, CHANGE_WEIGHT);
	for (const row of trails.reads) add(row.chat_session_id, row.project_id, READ_WEIGHT);

	const result = new Map<string, ChatProjects>();
	for (const session of sessions) {
		const ranked = [...(scores.get(session.id) ?? new Map<string, number>()).entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([projectId]) => projectsById.get(projectId))
			.filter((project): project is ChatProjectProjectRow => Boolean(project));
		result.set(session.id, {
			projects: ranked
				.filter((project) => project.kind !== 'workspace')
				.map((project) => ({ id: project.id, name: project.name })),
			workspace:
				session.context_type === 'global' ||
				ranked.some((project) => project.kind === 'workspace')
		});
	}
	return result;
}

/** Card label when a chat has no projects to show. */
export function chatScopeFallbackLabel(contextType: string, workspace = false): string {
	if (workspace) return 'Workspace chat';
	switch (contextType) {
		case 'project_create':
			return 'New project';
		case 'daily_brief':
			return 'Daily brief';
		case 'calendar':
			return 'Calendar';
		default:
			// Project chats whose project is gone or hidden fall here too.
			return contextType === 'project' ? 'Project chat' : 'Workspace chat';
	}
}

/** Loads the project trails for one page of chats. Never throws: no label beats a broken page. */
export async function loadChatProjects(
	supabase: any,
	sessions: ChatProjectSessionInput[]
): Promise<Map<string, ChatProjects>> {
	if (sessions.length === 0) return new Map();

	try {
		const sessionIds = sessions.map((session) => session.id);
		const workspaceIds = sessions
			.filter((session) => session.context_type === 'global')
			.map((session) => session.id);

		const [focusResult, linksResult, changesResult, readsResult] = await Promise.all([
			workspaceIds.length
				? supabase
						.from('chat_sessions')
						.select('id, focus_project_id:agent_metadata->focus->>projectId')
						.in('id', workspaceIds)
				: { data: [] },
			supabase
				.from('chat_sessions_projects')
				.select('chat_session_id, project_id')
				.in('chat_session_id', sessionIds),
			supabase
				.from('onto_project_logs')
				.select('chat_session_id, project_id')
				.in('chat_session_id', sessionIds)
				.limit(2000),
			workspaceIds.length
				? supabase
						.from('llm_usage_logs')
						.select('chat_session_id, project_id')
						.in('chat_session_id', workspaceIds)
						.not('project_id', 'is', null)
						// Chat-turn calls only, not background passes tagged with the session.
						.like('operation_type', 'agentic_chat%')
						.limit(2000)
				: { data: [] }
		]);

		const focusBySession = new Map<string, string>();
		for (const row of (focusResult.data ?? []) as Array<{
			id: string;
			focus_project_id: string | null;
		}>) {
			if (row.focus_project_id) focusBySession.set(row.id, row.focus_project_id);
		}

		const trails: ChatProjectTrails = {
			focusBySession,
			links: linksResult.data ?? [],
			changes: changesResult.data ?? [],
			reads: readsResult.data ?? []
		};

		const projectIds = new Set<string>();
		for (const session of sessions) {
			if (session.context_type === 'project' && session.entity_id) {
				projectIds.add(session.entity_id);
			}
		}
		for (const id of focusBySession.values()) projectIds.add(id);
		for (const row of [...trails.links, ...trails.changes, ...trails.reads]) {
			if (row.project_id) projectIds.add(row.project_id);
		}
		if (projectIds.size === 0) return rankChatProjects(sessions, trails, []);

		const { data: projectRows, error } = await supabase
			.from('onto_projects')
			.select('id, name, kind')
			.in('id', [...projectIds])
			.is('deleted_at', null);
		if (error) throw error;

		return rankChatProjects(sessions, trails, projectRows ?? []);
	} catch (err) {
		console.warn('Error loading chat projects for history:', err);
		return new Map();
	}
}
