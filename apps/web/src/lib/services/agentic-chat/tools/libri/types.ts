// apps/web/src/lib/services/agentic-chat/tools/libri/types.ts
export type LibriResourceType = 'person';

export type LibriResponseDepth = 'hit_only' | 'summary' | 'detail';

export type LibriResolverStatus = 'found' | 'queued' | 'pending' | 'needs_input' | 'error';

export type LibriLibraryQueryAction =
	| 'overview'
	| 'search'
	| 'search_books'
	| 'list_book_categories'
	| 'list_books_by_category'
	| 'list_authors'
	| 'get_author'
	| 'list_videos'
	| 'search_videos';

export type LibriLibraryQueryStatus =
	| 'ok'
	| 'needs_input'
	| 'configuration_error'
	| 'resolver_unavailable'
	| 'error';

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

export interface QueryLibriLibraryArgs {
	action: LibriLibraryQueryAction;
	query?: string;
	category?: string;
	types?: Array<'book' | 'author' | 'person' | 'youtubeVideo' | 'video'>;
	limit?: number;
	response_depth?: LibriResponseDepth;
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

export interface LibriLibraryQueryToolResult {
	status: LibriLibraryQueryStatus;
	code?: string;
	message: string;
	action?: LibriLibraryQueryAction;
	query?: string;
	category?: string;
	data?: unknown;
	http_status?: number;
	info?: {
		provider: 'libri';
		endpoint: string;
		action?: LibriLibraryQueryAction;
		app_base_url?: string;
		fetched_at?: string;
	};
}

export type LibriManifestOperationKind = 'read' | 'write';

export interface LibriManifestOperation {
	op: string;
	toolName: string;
	domain: string;
	resource?: string;
	kind: LibriManifestOperationKind;
	method: 'GET' | 'POST';
	path: string;
	description: string;
	requiredScopes: string[];
	requiresIdempotencyKey?: boolean;
	idempotency?: {
		header?: string;
		recommendedKeyFields?: string[];
	};
	inputSchema: Record<string, any>;
	outputSchema?: Record<string, any>;
	examples?: unknown[];
	safety: {
		modelVisible?: boolean;
		adminOnly?: boolean;
		allowDirectToolMaterialization?: boolean;
		allowGenericBridgeExecution?: boolean;
	};
	sequenceId?: string;
}

export interface LibriManifestDomain {
	id: string;
	label: string;
	description: string;
	resources?: Record<string, unknown>;
	operations: LibriManifestOperation[];
	sequences?: Record<
		string,
		{
			id?: string;
			description?: string;
			steps?: Array<{
				op?: string;
				purpose?: string;
				requiresPreviousSuccess?: string;
			}>;
		}
	>;
}

export interface ValidatedLibriManifest {
	version: string;
	manifestVersion: string;
	generatedAt?: string;
	fetchedAt: string;
	stale: boolean;
	domains: Record<string, LibriManifestDomain>;
	operations: Record<string, LibriManifestOperation>;
	byToolName: Record<string, LibriManifestOperation>;
	warnings: string[];
}

export interface LibriOverviewArgs {
	refresh?: boolean;
	includeDomains?: boolean;
}

export interface LibriSearchCapabilitiesArgs {
	domain?: string;
	query?: string;
	resource?: string;
	kind?: LibriManifestOperationKind;
	limit?: number;
	refresh?: boolean;
}

export interface LibriGetCapabilitySchemaArgs {
	op: string;
	includeExamples?: boolean;
	refresh?: boolean;
}
