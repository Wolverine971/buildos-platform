// packages/api-client/src/index.ts
/**
 * @buildos/api-client — the one typed client for the BuildOS API.
 *
 *   const api = createBuildOsClient({ baseUrl, getAccessToken });
 *   const { feed } = await api.today.get();
 */
import { createBuildOsHttp, type BuildOsClientOptions, type BuildOsHttp } from './client';
import { createActivityEndpoints } from './endpoints/activity';
import { createAgentEndpoints } from './endpoints/agent';
import { createAuthEndpoints } from './endpoints/auth';
import { createBriefEndpoints } from './endpoints/briefs';
import { createDocumentEndpoints } from './endpoints/documents';
import { createProjectEndpoints } from './endpoints/projects';
import { createPushEndpoints } from './endpoints/push';
import { createTaskEndpoints } from './endpoints/tasks';
import { createTodayEndpoints } from './endpoints/today';
import { createTranscribeEndpoint, createVoiceNoteEndpoints } from './endpoints/voice-notes';
import { createWorkspaceEndpoints } from './endpoints/workspace';

export { API_CLIENT_CONTRACT_VERSION, API_CONTRACT_HEADER } from './contract';
export {
	BuildOsApiError,
	isBuildOsApiError,
	type BuildOsApiErrorInit,
	type UpgradeRequiredInfo
} from './errors';
export {
	buildQueryString,
	buildUrl,
	createBuildOsHttp,
	normalizeBaseUrl,
	type BuildOsClientOptions,
	type BuildOsHttp,
	type BuildOsRequestInit,
	type BuildOsResponseMeta,
	type HttpMethod,
	type QueryParams,
	type QueryPrimitive,
	type RequestOptions
} from './client';
export * from './types';
export type { ActivityEndpoints } from './endpoints/activity';
export type { AgentEndpoints } from './endpoints/agent';
export type { AuthEndpoints } from './endpoints/auth';
export type { BriefEndpoints } from './endpoints/briefs';
export type { DocumentEndpoints } from './endpoints/documents';
export type { ProjectEndpoints } from './endpoints/projects';
export type { PushEndpoints } from './endpoints/push';
export type { TaskEndpoints } from './endpoints/tasks';
export type { TodayEndpoints } from './endpoints/today';
export type { TranscribeEndpoint, VoiceNoteEndpoints } from './endpoints/voice-notes';
export type { WorkspaceEndpoints } from './endpoints/workspace';

export interface BuildOsClient extends BuildOsHttp {
	/** GET /api/auth/user */
	me: ReturnType<typeof createAuthEndpoints>['me'];
	auth: ReturnType<typeof createAuthEndpoints>;
	today: ReturnType<typeof createTodayEndpoints>;
	projects: ReturnType<typeof createProjectEndpoints>;
	tasks: ReturnType<typeof createTaskEndpoints>;
	documents: ReturnType<typeof createDocumentEndpoints>;
	briefs: ReturnType<typeof createBriefEndpoints>;
	activity: ReturnType<typeof createActivityEndpoints>;
	voiceNotes: ReturnType<typeof createVoiceNoteEndpoints>;
	/** POST /api/transcribe */
	transcribe: ReturnType<typeof createTranscribeEndpoint>;
	push: ReturnType<typeof createPushEndpoints>;
	agent: ReturnType<typeof createAgentEndpoints>;
	/** Quick capture into the person's Workspace (loose notes and tasks). */
	workspace: ReturnType<typeof createWorkspaceEndpoints>;
}

export function createBuildOsClient(options: BuildOsClientOptions): BuildOsClient {
	const http = createBuildOsHttp(options);
	const auth = createAuthEndpoints(http);
	return {
		...http,
		me: auth.me,
		auth,
		today: createTodayEndpoints(http),
		projects: createProjectEndpoints(http),
		tasks: createTaskEndpoints(http),
		documents: createDocumentEndpoints(http),
		briefs: createBriefEndpoints(http),
		activity: createActivityEndpoints(http),
		voiceNotes: createVoiceNoteEndpoints(http),
		transcribe: createTranscribeEndpoint(http),
		push: createPushEndpoints(http),
		agent: createAgentEndpoints(http),
		workspace: createWorkspaceEndpoints(http)
	};
}
