// apps/web/src/lib/services/agentic-chat/tools/libri/types.ts
export type LibriResourceType = 'person';

export type LibriResponseDepth = 'hit_only' | 'summary' | 'detail';

export type LibriResolverStatus = 'found' | 'queued' | 'pending' | 'needs_input' | 'error';

export type ResolveLibriToolStatus =
	| LibriResolverStatus
	| 'configuration_error'
	| 'resolver_unavailable';

export interface ResolveLibriResourceArgs {
	query: string;
	types?: LibriResourceType[];
	enqueue_if_missing?: boolean;
	response_depth?: LibriResponseDepth;
	project_id?: string;
	reason?: string;
}

export interface LibriResolveSource {
	system: 'buildos';
	contextType: 'global' | 'project';
	projectId?: string;
	sessionId?: string;
	reason?: string;
}

export interface LibriResolverRequest {
	query: string;
	types: LibriResourceType[];
	enqueueIfMissing: boolean;
	responseDepth: LibriResponseDepth;
	source: LibriResolveSource;
}

export interface LibriResolveJob {
	jobId?: string;
	kind?: string;
	status?: string;
	[key: string]: unknown;
}

export interface LibriResolveToolResult {
	status: ResolveLibriToolStatus;
	code?: string;
	message: string;
	query?: string;
	resourceKey?: string | null;
	results: unknown[];
	job: LibriResolveJob | null;
	http_status?: number;
	info?: {
		provider: 'libri';
		endpoint: 'POST /api/v1/resolve';
		response_depth?: LibriResponseDepth;
		types?: LibriResourceType[];
		app_base_url?: string;
		fetched_at?: string;
	};
}
