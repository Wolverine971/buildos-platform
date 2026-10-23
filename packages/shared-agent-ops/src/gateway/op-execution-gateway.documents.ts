// packages/shared-agent-ops/src/gateway/op-execution-gateway.documents.ts
import { insertGatewayEntity } from './op-execution-gateway.create-idempotency';
import { isValidUUID } from '@buildos/shared-types';
import { logCreateAsync, logUpdateAsync } from '../ops/async-activity-logger';
import { escapeLikePattern } from '../utils/search-filter';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '../ops/entity-mention-notification.service';
import { normalizeDocumentStateInput } from '../ontology/document-state';
import { normalizeMarkdownInput } from '../utils/markdown-normalization';
import { createOrMergeDocumentVersion, toDocumentSnapshot } from '../ontology/versioning.service';
import {
	DOCUMENT_VERSION_WRITE_WARNING,
	writeDocumentHeadAndVersion
} from '../ontology/document-write.service';
import {
	addDocumentToTree,
	getDocTree,
	getNodePath,
	moveDocument,
	updateDocNodeMetadata
} from '../ontology/doc-structure.service';
import { DOCUMENT_STATES, isValidTypeKey } from '../ontology/onto';
import {
	getDocumentUpdateContentCandidate,
	isAppendOrMergeUpdateStrategy
} from '../ops/update-value-validation';
import {
	pickProjectStartHereDocument,
	preserveCurrentStartHereManagedRegions,
	START_HERE_DOCUMENT_TYPE_KEY
} from '../ontology/start-here';
import {
	formatDocumentEditFailures,
	hasDocumentEdits,
	largeDeletionRefusal,
	resolveDocumentEdits,
	summarizeDocumentChange,
	type AppliedDocumentEdit,
	type DocumentChangeSummaryV1,
	type DocumentSectionEditV1,
	type DocumentTextEditV1
} from '../ontology/document-edits';
import { ONTO_DOCUMENT_SELECT, ONTO_EDGE_SELECT } from './op-execution-gateway.config';
import type { ToolExecutionContext } from './op-execution-gateway.types';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	contextActorId,
	getProjectIdsOrThrow,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { assertValidId } from './op-execution-gateway.ids';
import { loadCoreEntityForAccess } from './op-execution-gateway.entity-access';
import { TASK_DOCUMENT_REL, createEdge } from './op-execution-gateway.edges';
import {
	applyArchivedReadFilter,
	normalizeArchivedUpdate,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeOptionalText,
	normalizeOptionalUuid,
	normalizeProps,
	requireTrimmedString
} from './op-execution-gateway.normalization';
import { searchEntitiesByType } from './op-execution-gateway.search';
import { serializeDocumentTree, serializeExternalEntity } from './op-execution-gateway.serializers';
import { truncateText } from './op-execution-gateway.text';
import {
	assertDocumentUpdateAllowedForTable,
	assertNotTableTypeForDocumentCreate
} from './op-execution-gateway.tables';

const MAX_DOCUMENT_CONTENT_BYTES = 200 * 1024;
/** Enough context-typed rows to run the Start Here selector; projects have 1-2. */
const START_HERE_CANDIDATE_LOOKUP_LIMIT = 10;

function normalizeMaxChars(value: unknown, fallback = 20000): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(50000, Math.max(500, Math.floor(value)));
}

function assertContentWithinCap(value: string | null | undefined, fieldName: string): void {
	if (typeof value !== 'string' || value.length === 0) return;
	const byteLength = Buffer.byteLength(value, 'utf8');
	if (byteLength > MAX_DOCUMENT_CONTENT_BYTES) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} exceeds the 200 KB limit for external document writes`,
			{ byte_length: byteLength, limit_bytes: MAX_DOCUMENT_CONTENT_BYTES }
		);
	}
}

function resolveDocumentTypeKey(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) {
		return 'document.default';
	}
	const trimmed = value.trim();
	return isValidTypeKey(trimmed, 'document') ? trimmed : 'document.default';
}

/**
 * Start Here substitution guard (incident 2026-09-03).
 *
 * `document.context.project` IS the project's Start Here document type. Both
 * `get_project_full` and the page-side selector pick a single context-typed
 * document, so an extra one created by an agent silently takes over the Start
 * Here slot on the project page — that is exactly how a chat-authored
 * "contractor note" replaced a real Start Here. Only the Start Here services
 * may mint that type, and they insert straight into `onto_documents`
 * (`ontology/start-here.service.ts`, `ontology/instantiation.service.ts`)
 * without ever passing through this gateway, so refusing here costs no
 * legitimate write. The refusal names the existing document so the model can
 * pivot to `update_onto_document` inside the same turn.
 */
async function assertStartHereTypeNotAgentCreated(
	context: ToolExecutionContext,
	projectId: string,
	typeKey: string
): Promise<void> {
	if (typeKey !== START_HERE_DOCUMENT_TYPE_KEY) return;

	const { data } = await context.admin
		.from('onto_documents')
		.select('id, title, content, props, created_at, updated_at')
		.eq('project_id', projectId)
		.eq('type_key', START_HERE_DOCUMENT_TYPE_KEY)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(START_HERE_CANDIDATE_LOOKUP_LIMIT);

	const existing = pickProjectStartHereDocument(
		((data ?? []) as Record<string, unknown>[]).map((row) => ({
			id: String(row.id),
			title: typeof row.title === 'string' ? row.title : null,
			content: typeof row.content === 'string' ? row.content : null,
			props: row.props,
			created_at: typeof row.created_at === 'string' ? row.created_at : null,
			updated_at: typeof row.updated_at === 'string' ? row.updated_at : null
		}))
	);

	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		existing
			? `type_key "${START_HERE_DOCUMENT_TYPE_KEY}" is reserved for this project's Start Here document, which already exists: "${
					existing.title ?? 'Start Here'
				}" (document_id ${existing.id}). Creating another one would replace it on the project page. Update that document instead, or retry this create with a different type_key such as "document.default".`
			: `type_key "${START_HERE_DOCUMENT_TYPE_KEY}" is reserved for the project's Start Here document and cannot be created here. Retry with a different type_key such as "document.default".`,
		{
			reserved_type_key: START_HERE_DOCUMENT_TYPE_KEY,
			...(existing
				? {
						start_here_document_id: existing.id,
						start_here_document_title: existing.title ?? null
					}
				: {})
		}
	);
}

/** The type_key an update asks for (raw, so a table type is seen before fallback), else the stored one. */
function requestedDocumentTypeKey(args: Record<string, unknown>, existing: unknown): unknown {
	return typeof args.type_key === 'string' && args.type_key.trim()
		? args.type_key.trim()
		: existing;
}

/**
 * Only BuildOS itself mints the Start Here type (see the create guard above), so an
 * update may never turn another document into one. Otherwise any agent with write
 * access to a document it made, including a guest agent in someone else's project,
 * could retype it and win the "newest explicit Start Here" pick: the owner's project
 * page, their BuildOS chat, and every connector would then load that text as the
 * project's orientation.
 */
function assertDocumentUpdateKeepsStartHereType(
	existingTypeKey: unknown,
	args: Record<string, unknown>
): void {
	if (args.type_key === undefined) return;
	if (existingTypeKey === START_HERE_DOCUMENT_TYPE_KEY) return;
	if (resolveDocumentTypeKey(args.type_key) !== START_HERE_DOCUMENT_TYPE_KEY) return;
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		`type_key "${START_HERE_DOCUMENT_TYPE_KEY}" is reserved for the project's Start Here document, and an existing document can't be changed into it. Keep this document's type, or update the Start Here document itself.`,
		{ reserved_type_key: START_HERE_DOCUMENT_TYPE_KEY }
	);
}

function normalizeDocumentPosition(value: unknown, fieldName: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a non-negative integer`
		);
	}
	return value;
}

function normalizeDocumentUpdateStrategy(value: unknown): 'replace' | 'append' {
	if (value === undefined || value === null) return 'replace';
	if (value === 'merge_llm') return 'append';
	if (value === 'replace' || value === 'append') {
		return value;
	}
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'update_strategy must be one of: replace, append'
	);
}

function documentBodyOf(document: { content?: unknown; props?: unknown }): string {
	if (typeof document.content === 'string') return document.content;
	const props = document.props as Record<string, unknown> | null | undefined;
	return typeof props?.body_markdown === 'string' ? props.body_markdown : '';
}

/** Surgical edit arguments, or null when the call carries none. Shapes are schema-checked upstream. */
function readDocumentEditArgs(args: Record<string, unknown>): {
	edits: DocumentTextEditV1[];
	section_edits: DocumentSectionEditV1[];
} | null {
	if (!hasDocumentEdits(args)) return null;
	return {
		edits: Array.isArray(args.edits) ? (args.edits as DocumentTextEditV1[]) : [],
		section_edits: Array.isArray(args.section_edits)
			? (args.section_edits as DocumentSectionEditV1[])
			: []
	};
}

async function resolveExternalDocumentContentWithStrategy(params: {
	strategy: 'replace' | 'append';
	newContent: string;
	existingLoader: () => Promise<string>;
}): Promise<string> {
	const { strategy, newContent, existingLoader } = params;

	if (strategy === 'replace') {
		return newContent;
	}

	let existingText = '';
	try {
		existingText = await existingLoader();
	} catch (error) {
		console.warn(
			'[External Tool Gateway] Failed to load existing document content for merge, using provided content:',
			error
		);
		return newContent;
	}

	if (!newContent.trim()) {
		return existingText;
	}

	if (strategy === 'append') {
		return existingText ? `${existingText}\n\n${newContent}` : newContent;
	}

	return newContent;
}

export async function createDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);

	const title = requireTrimmedString(args.title, 'title');
	const description =
		args.description === undefined
			? null
			: args.description === null
				? null
				: requireTrimmedString(args.description, 'description', { allowEmpty: true });

	const rawContent =
		typeof args.content === 'string'
			? args.content
			: typeof args.body_markdown === 'string'
				? args.body_markdown
				: null;
	const normalizedContent = normalizeMarkdownInput(rawContent);
	assertContentWithinCap(normalizedContent, 'content');

	assertNotTableTypeForDocumentCreate(args.type_key);
	const typeKey = resolveDocumentTypeKey(args.type_key);
	await assertStartHereTypeNotAgentCreated(context, project.id, typeKey);

	const stateInput =
		args.state_key === undefined
			? undefined
			: requireTrimmedString(args.state_key, 'state_key');
	const normalizedState =
		stateInput === undefined ? 'draft' : normalizeDocumentStateInput(stateInput);
	if (!normalizedState) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
		);
	}

	const parentDocumentInput =
		args.parent_document_id !== undefined ? args.parent_document_id : args.parent_id;
	if (
		args.parent_document_id !== undefined &&
		args.parent_id !== undefined &&
		args.parent_document_id !== args.parent_id
	) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'parent_document_id and parent_id must match when both are provided'
		);
	}

	const parentDocumentId =
		parentDocumentInput === undefined || parentDocumentInput === null
			? null
			: typeof parentDocumentInput === 'string' && isValidUUID(parentDocumentInput)
				? parentDocumentInput
				: (() => {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							'parent_document_id (or parent_id) must be a valid UUID'
						);
					})();

	const props = normalizeProps(args.props, 'props') ?? {};
	const position = normalizeDocumentPosition(args.position, 'position');
	const actorId = await contextActorId(context);

	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		title,
		description,
		type_key: typeKey,
		state_key: normalizedState,
		content: normalizedContent,
		props: {
			...props,
			...(normalizedContent ? { body_markdown: normalizedContent } : {}),
			origin: 'external_agent'
		},
		created_by: actorId
	};

	const { data, error, replayed } = await insertGatewayEntity(
		context,
		'onto_documents',
		insertPayload,
		ONTO_DOCUMENT_SELECT
	);

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to create document'
		);
	}

	let versionWarning: string | null = null;
	try {
		await createOrMergeDocumentVersion({
			supabase: context.admin,
			documentId: data.id,
			actorId,
			snapshot: toDocumentSnapshot(data),
			changeSource: 'api'
		});
	} catch (versionError) {
		console.warn(
			'[External Tool Gateway] Failed to record initial document version:',
			versionError
		);
		versionWarning = DOCUMENT_VERSION_WRITE_WARNING;
	}

	let structure: Record<string, unknown> | null = null;
	let structureError: string | null = null;
	try {
		const existingTree = replayed
			? await getDocTree(context.admin, project.id, { includeContent: false })
			: null;
		structure =
			existingTree && getNodePath(existingTree.structure.root, String(data.id)).length > 0
				? (existingTree.structure as unknown as Record<string, unknown>)
				: ((await addDocumentToTree(
						context.admin,
						project.id,
						String(data.id),
						{
							parentId: parentDocumentId,
							position,
							title: typeof data.title === 'string' ? data.title : null,
							description:
								typeof data.description === 'string' ? data.description : null
						},
						actorId
					)) as unknown as Record<string, unknown>);
	} catch (treeError) {
		structureError = treeError instanceof Error ? treeError.message : String(treeError);
		console.warn('[External Tool Gateway] Failed to place document in tree:', treeError);
	}

	if (!replayed) {
		await notifyEntityMentionsAdded({
			supabase: context.admin,
			projectId: project.id,
			projectName: project.name,
			entityType: 'document',
			entityId: String(data.id),
			entityTitle: typeof data.title === 'string' ? data.title : null,
			actorUserId: context.userId,
			actorDisplayName: 'BuildOS agent',
			mentionedUserIds: await resolveEntityMentionUserIds({
				supabase: context.admin,
				projectId: project.id,
				projectOwnerActorId: project.owner_actor_id,
				actorUserId: context.userId,
				nextTextValues: [
					typeof data.title === 'string' ? data.title : null,
					typeof data.description === 'string' ? data.description : null,
					typeof data.content === 'string' ? data.content : null
				]
			}),
			source: 'agent_ping'
		});
	}

	if (!replayed) {
		await logCreateAsync(
			context.admin,
			project.id,
			'document',
			String(data.id),
			{
				title: data.title,
				type_key: data.type_key,
				state_key: data.state_key
			},
			context.userId,
			'agent_call',
			context.chatSessionId,
			getExternalAgentActivityContext(context)
		);
	}

	return {
		document: serializeExternalEntity(
			'document',
			data as Record<string, unknown>,
			project.name
		),
		structure,
		structure_error: structureError,
		version_warning: versionWarning
	};
}

type DocumentBodyUpdate = {
	/** Raw whole-body content argument, when the call carried one. */
	contentCandidate: string | undefined;
	edits: ReturnType<typeof readDocumentEditArgs>;
	appliedEdits: AppliedDocumentEdit[] | undefined;
	/** The body this call would store, or undefined for a metadata-only update. */
	nextContent: string | undefined;
};

/**
 * The body an update_onto_document call would store. Shared by the write and
 * its dry-run preview so the reviewer's diff is exactly what executes.
 */
async function resolveDocumentBodyUpdate(params: {
	existingDocument: { project_id: string; content?: unknown; props?: unknown };
	documentId: string;
	args: Record<string, unknown>;
	strategy: 'replace' | 'append';
	nextTypeKey: unknown;
}): Promise<DocumentBodyUpdate> {
	const { existingDocument, documentId, args, strategy } = params;
	const contentCandidate =
		args.content !== undefined || args.body_markdown !== undefined
			? typeof args.content === 'string'
				? args.content
				: typeof args.body_markdown === 'string'
					? args.body_markdown
					: ''
			: undefined;

	const edits = readDocumentEditArgs(args);
	if (edits && contentCandidate !== undefined) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Pass either content (whole-body replace or append) or edits/section_edits (change part of the document), not both.'
		);
	}
	// Edits carry their own text; update_strategy only shapes a content write.
	if (
		!edits &&
		isAppendOrMergeUpdateStrategy(strategy) &&
		!getDocumentUpdateContentCandidate(args)
	) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`update_onto_document ${strategy} requires non-empty content.`
		);
	}

	if (edits) {
		const resolution = resolveDocumentEdits({
			project_id: existingDocument.project_id,
			document_id: documentId,
			content: documentBodyOf(existingDocument),
			...edits
		});
		if (resolution.status === 'rejected') {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				formatDocumentEditFailures(resolution.failures, resolution.matched_edits),
				{ edit_failures: resolution.failures }
			);
		}
		assertContentWithinCap(resolution.next_content, 'content');
		return {
			contentCandidate,
			edits,
			appliedEdits: resolution.applied,
			nextContent: resolution.next_content
		};
	}

	if (contentCandidate === undefined) {
		return { contentCandidate, edits, appliedEdits: undefined, nextContent: undefined };
	}

	const normalizedContent = normalizeMarkdownInput(contentCandidate) ?? '';
	const resolvedContent = await resolveExternalDocumentContentWithStrategy({
		strategy,
		newContent: normalizedContent,
		existingLoader: async () => documentBodyOf(existingDocument)
	});
	const nextContent =
		params.nextTypeKey === START_HERE_DOCUMENT_TYPE_KEY
			? preserveCurrentStartHereManagedRegions(
					typeof existingDocument.content === 'string' ? existingDocument.content : '',
					resolvedContent
				)
			: resolvedContent;
	if (strategy === 'replace' && args.allow_large_deletion !== true) {
		const refusal = largeDeletionRefusal(documentBodyOf(existingDocument), nextContent);
		if (refusal) throw new ExternalToolGatewayError('VALIDATION_ERROR', refusal);
	}
	assertContentWithinCap(nextContent, 'content');
	return { contentCandidate, edits, appliedEdits: undefined, nextContent };
}

/**
 * Dry run of onto.document.update: the same access checks and body resolution
 * as the write, without writing. The chat worker runs it before review so a
 * missed anchor goes straight back to the acting model and the reviewer judges
 * a server-verified diff (tasker 98 p05).
 */
export async function previewDocumentUpdate(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	options: {
		/**
		 * Resolve against this body instead of the stored one. A batch that updates
		 * one document several times executes in order, so each later call is
		 * previewed against the body the earlier calls leave behind.
		 */
		base_content?: string;
	} = {}
): Promise<{
	document_id: string;
	title: string | null;
	document_change: Omit<DocumentChangeSummaryV1, 'revert_patch'> | null;
	edits_applied?: AppliedDocumentEdit[];
	/** The body this call would store (the next chained preview's base); null when unchanged. */
	next_content: string | null;
	/**
	 * The stored document this preview read: its version (`updated_at`) and the
	 * fields a confirm card shows "from" values for. A write guarded by this
	 * version applies exactly the previewed change or nothing.
	 */
	base: {
		updated_at: string | null;
		description: string | null;
		state_key: string | null;
		type_key: string | null;
	};
}> {
	const documentId = args.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'document_id must be a valid UUID');
	}
	const visible = await loadVisibleProjects(context);
	const { data: existingDocument, error } = await context.admin
		.from('onto_documents')
		.select(ONTO_DOCUMENT_SELECT)
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		)
		.maybeSingle();
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load document');
	}
	if (!existingDocument) throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	const project = assertVisibleEntityProject(visible.projectMap, existingDocument.project_id);
	assertProjectWriteAccess(project, context.scope);
	assertDocumentUpdateAllowedForTable(
		existingDocument.type_key,
		args,
		requestedDocumentTypeKey(args, existingDocument.type_key)
	);
	assertDocumentUpdateKeepsStartHereType(existingDocument.type_key, args);
	const baseDocument =
		typeof options.base_content === 'string'
			? {
					...existingDocument,
					content: options.base_content,
					props: {
						...((existingDocument.props as Record<string, unknown> | null) ?? {}),
						body_markdown: options.base_content
					}
				}
			: existingDocument;

	const bodyUpdate = await resolveDocumentBodyUpdate({
		existingDocument: baseDocument,
		documentId,
		args,
		strategy: normalizeDocumentUpdateStrategy(args.update_strategy),
		nextTypeKey:
			args.type_key !== undefined
				? resolveDocumentTypeKey(args.type_key)
				: existingDocument.type_key
	});
	const title = typeof existingDocument.title === 'string' ? existingDocument.title : null;
	const summary =
		bodyUpdate.nextContent === undefined
			? null
			: summarizeDocumentChange({
					project_id: project.id,
					document_id: documentId,
					title,
					before: documentBodyOf(baseDocument),
					after: bodyUpdate.nextContent,
					include_revert_patch: false
				});
	const documentChange = summary
		? (({ revert_patch: _revertPatch, ...rest }) => rest)(summary)
		: null;
	return {
		document_id: documentId,
		title,
		document_change: documentChange,
		...(bodyUpdate.appliedEdits ? { edits_applied: bodyUpdate.appliedEdits } : {}),
		next_content: summary ? (bodyUpdate.nextContent ?? null) : null,
		base: {
			updated_at:
				typeof existingDocument.updated_at === 'string'
					? existingDocument.updated_at
					: null,
			description:
				typeof existingDocument.description === 'string'
					? existingDocument.description
					: null,
			state_key:
				typeof existingDocument.state_key === 'string' ? existingDocument.state_key : null,
			type_key:
				typeof existingDocument.type_key === 'string' ? existingDocument.type_key : null
		}
	};
}

// Keep the declaration tied to the leaf receipt type. Inference expands the
// spread below and emits DocumentPatchV1 through the package root barrel,
// pulling that entire graph into downstream declaration bundling.
type DocumentUpdateResult = {
	document: Record<string, unknown>;
	version_warning: string | null;
	document_change_status?: 'changed';
	document_change?: DocumentChangeSummaryV1 & { edits_applied?: AppliedDocumentEdit[] };
};

export async function updateDocument(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<DocumentUpdateResult> {
	const documentId = args.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'document_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const loadDocumentForWrite = async () => {
		let query = context.admin
			.from('onto_documents')
			.select(ONTO_DOCUMENT_SELECT)
			.eq('id', documentId)
			.in(
				'project_id',
				visible.projects.map((project) => project.id)
			);
		if (archivedAtUpdate !== null) {
			query = query.is('archived_at', null);
		}

		const { data, error } = await query.maybeSingle();
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to load document'
			);
		}
		if (!data) {
			throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
		}
		return data;
	};

	const existingDocument = await loadDocumentForWrite();
	const guard = context.documentWriteGuard;
	if (
		guard &&
		(guard.documentId !== documentId ||
			guard.projectId !== existingDocument.project_id ||
			guard.updatedAt !== existingDocument.updated_at)
	) {
		throw new ExternalToolGatewayError(
			'CONFLICT',
			'The shared document changed after confirmation. Request a fresh preview.',
			{ confirmation_changed: true }
		);
	}

	const project = assertVisibleEntityProject(visible.projectMap, existingDocument.project_id);
	assertProjectWriteAccess(project, context.scope);
	assertDocumentUpdateAllowedForTable(
		existingDocument.type_key,
		args,
		requestedDocumentTypeKey(args, existingDocument.type_key)
	);
	assertDocumentUpdateKeepsStartHereType(existingDocument.type_key, args);
	const actorId = await contextActorId(context);

	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};
	let changedFieldCount = 0;
	let propsTouched = false;
	const mergedProps: Record<string, unknown> = {
		...((existingDocument.props as Record<string, unknown> | null) ?? {})
	};
	const strategy = normalizeDocumentUpdateStrategy(args.update_strategy);

	if (args.title !== undefined) {
		updateData.title = requireTrimmedString(args.title, 'title');
		changedFieldCount += 1;
	}

	if (args.description !== undefined) {
		if (args.description === null) {
			updateData.description = null;
		} else {
			updateData.description = requireTrimmedString(args.description, 'description', {
				allowEmpty: true
			});
		}
		changedFieldCount += 1;
	}

	if (args.type_key !== undefined) {
		updateData.type_key = resolveDocumentTypeKey(args.type_key);
		changedFieldCount += 1;
	}

	if (args.state_key !== undefined) {
		const normalizedStateInput = requireTrimmedString(args.state_key, 'state_key');
		const normalizedState = normalizeDocumentStateInput(normalizedStateInput);
		if (!normalizedState) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}
		updateData.state_key = normalizedState;
		changedFieldCount += 1;
	}

	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changedFieldCount += 1;
	}

	const nextTypeKey =
		typeof updateData.type_key === 'string' ? updateData.type_key : existingDocument.type_key;
	const bodyUpdate = await resolveDocumentBodyUpdate({
		existingDocument,
		documentId,
		args,
		strategy,
		nextTypeKey
	});
	const documentContentCandidate = bodyUpdate.contentCandidate;
	const documentEdits = bodyUpdate.edits;
	let appliedEdits = bodyUpdate.appliedEdits;
	if (bodyUpdate.nextContent !== undefined) {
		updateData.content = bodyUpdate.nextContent;
		mergedProps.body_markdown = bodyUpdate.nextContent;
		propsTouched = true;
		changedFieldCount += 1;
	}

	if (args.props !== undefined) {
		const propsPatch = normalizeProps(args.props, 'props');
		Object.assign(mergedProps, propsPatch ?? {});
		propsTouched = true;
		changedFieldCount += 1;
	}

	if (propsTouched) {
		mergedProps.origin = mergedProps.origin ?? 'external_agent';
		updateData.props = mergedProps;
	}

	if (changedFieldCount === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable document field is required'
		);
	}

	let previousDocument = existingDocument;
	let writeResult = await writeDocumentHeadAndVersion({
		supabase: context.admin,
		documentId,
		projectId: project.id,
		update: updateData,
		expectedUpdatedAt: existingDocument.updated_at,
		actorId,
		previousSnapshot: toDocumentSnapshot(existingDocument),
		changeSource: 'api'
	});

	// A content-only append/merge or exact-text edit expresses an intent that can
	// be safely re-applied to a newer head (edits re-anchor on the fresh body and
	// fail closed if their text moved). Replace, metadata, archive, and props
	// mutations do not: retrying those could overwrite a concurrent human edit.
	const canRetryContentIntent =
		(documentEdits !== null ||
			(documentContentCandidate !== undefined && isAppendOrMergeUpdateStrategy(strategy))) &&
		args.title === undefined &&
		args.description === undefined &&
		args.type_key === undefined &&
		args.state_key === undefined &&
		archivedAtUpdate === undefined &&
		args.props === undefined;
	if (writeResult.status === 'conflict' && canRetryContentIntent && !guard) {
		const refreshedDocument = await loadDocumentForWrite();
		const retryUpdateData: Record<string, unknown> = {
			...updateData,
			updated_at: new Date().toISOString()
		};

		if (documentEdits) {
			const resolution = resolveDocumentEdits({
				project_id: refreshedDocument.project_id,
				document_id: documentId,
				content: documentBodyOf(refreshedDocument),
				...documentEdits
			});
			if (resolution.status === 'rejected') {
				throw new ExternalToolGatewayError(
					'CONFLICT',
					`The document changed while the agent was editing it, and the edit no longer applies. Re-read and retry.\n${formatDocumentEditFailures(resolution.failures, resolution.matched_edits)}`,
					{ edit_failures: resolution.failures }
				);
			}
			appliedEdits = resolution.applied;
			assertContentWithinCap(resolution.next_content, 'content');
			retryUpdateData.content = resolution.next_content;
			retryUpdateData.props = {
				...((refreshedDocument.props as Record<string, unknown> | null) ?? {}),
				body_markdown: resolution.next_content,
				origin:
					(refreshedDocument.props as Record<string, unknown> | null)?.origin ??
					'external_agent'
			};
		}

		if (documentContentCandidate !== undefined) {
			const normalizedContent = normalizeMarkdownInput(documentContentCandidate) ?? '';
			const resolvedContent = await resolveExternalDocumentContentWithStrategy({
				strategy,
				newContent: normalizedContent,
				existingLoader: async () => documentBodyOf(refreshedDocument)
			});
			const nextTypeKey =
				typeof retryUpdateData.type_key === 'string'
					? retryUpdateData.type_key
					: refreshedDocument.type_key;
			const nextContent =
				nextTypeKey === START_HERE_DOCUMENT_TYPE_KEY
					? preserveCurrentStartHereManagedRegions(
							typeof refreshedDocument.content === 'string'
								? refreshedDocument.content
								: '',
							resolvedContent
						)
					: resolvedContent;
			assertContentWithinCap(nextContent, 'content');
			retryUpdateData.content = nextContent;

			const retryProps: Record<string, unknown> = {
				...((refreshedDocument.props as Record<string, unknown> | null) ?? {}),
				body_markdown: nextContent
			};
			if (args.props !== undefined) {
				Object.assign(retryProps, normalizeProps(args.props, 'props') ?? {});
			}
			retryProps.origin = retryProps.origin ?? 'external_agent';
			retryUpdateData.props = retryProps;
		}

		previousDocument = refreshedDocument;
		writeResult = await writeDocumentHeadAndVersion({
			supabase: context.admin,
			documentId,
			projectId: project.id,
			update: retryUpdateData,
			expectedUpdatedAt: refreshedDocument.updated_at,
			actorId,
			previousSnapshot: toDocumentSnapshot(refreshedDocument),
			changeSource: 'api'
		});
	}

	if (writeResult.status === 'conflict') {
		throw new ExternalToolGatewayError(
			'CONFLICT',
			'Document changed while the agent was editing it. Re-read and retry.',
			guard ? { confirmation_changed: true } : undefined
		);
	}

	if (writeResult.status === 'error') {
		const message =
			typeof writeResult.error === 'object' &&
			writeResult.error !== null &&
			'message' in writeResult.error &&
			typeof writeResult.error.message === 'string'
				? writeResult.error.message
				: 'Failed to update document';
		throw new ExternalToolGatewayError('INTERNAL', message);
	}

	const data = writeResult.document;
	if (writeResult.versionError) {
		console.warn(
			'[External Tool Gateway] Document saved without a version:',
			writeResult.versionError
		);
	}

	if (args.title !== undefined || args.description !== undefined) {
		try {
			await updateDocNodeMetadata(
				context.admin,
				project.id,
				documentId,
				{
					title: typeof data.title === 'string' ? data.title : null,
					description: typeof data.description === 'string' ? data.description : null
				},
				actorId
			);
		} catch (treeMetadataError) {
			console.warn(
				'[External Tool Gateway] Failed to sync document tree metadata:',
				treeMetadataError
			);
		}
	}

	try {
		const mentionUserIds = await resolveEntityMentionUserIds({
			supabase: context.admin,
			projectId: project.id,
			projectOwnerActorId: project.owner_actor_id,
			actorUserId: context.userId,
			nextTextValues: [
				typeof data.title === 'string' ? data.title : null,
				typeof data.description === 'string' ? data.description : null,
				typeof data.content === 'string' ? data.content : null
			],
			previousTextValues: [
				typeof previousDocument.title === 'string' ? previousDocument.title : null,
				typeof previousDocument.description === 'string'
					? previousDocument.description
					: null,
				typeof previousDocument.content === 'string' ? previousDocument.content : null
			]
		});
		await notifyEntityMentionsAdded({
			supabase: context.admin,
			projectId: project.id,
			projectName: project.name,
			entityType: 'document',
			entityId: String(data.id),
			entityTitle: typeof data.title === 'string' ? data.title : null,
			actorUserId: context.userId,
			actorDisplayName: 'BuildOS agent',
			mentionedUserIds: mentionUserIds,
			source: 'agent_ping'
		});
	} catch (mentionError) {
		console.warn(
			'[External Tool Gateway] Failed to process document mention notifications:',
			mentionError
		);
	}

	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		String(data.id),
		{
			title: previousDocument.title,
			state_key: previousDocument.state_key,
			type_key: previousDocument.type_key
		},
		{
			title: data.title,
			state_key: data.state_key,
			type_key: data.type_key
		},
		context.userId,
		'agent_call',
		context.chatSessionId,
		getExternalAgentActivityContext(context)
	);

	// GitHub-style receipt of the body change (+/- lines, hunks, Undo patch) for
	// the chat toast/card and the acting model's confirmation.
	const documentChange =
		updateData.content !== undefined
			? summarizeDocumentChange({
					project_id: project.id,
					document_id: String(data.id),
					title: typeof data.title === 'string' ? data.title : null,
					before: documentBodyOf(previousDocument),
					after: documentBodyOf(data)
				})
			: null;

	return {
		document: serializeExternalEntity(
			'document',
			data as Record<string, unknown>,
			project.name
		),
		...(documentChange
			? {
					document_change_status: 'changed',
					document_change: {
						...documentChange,
						...(appliedEdits ? { edits_applied: appliedEdits } : {})
					}
				}
			: {}),
		version_warning: writeResult.versionWarning
	};
}

export async function createTaskDocument(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const taskAccess = await loadCoreEntityForAccess(context, 'task', args.task_id, 'write');
	const actorId = await contextActorId(context);
	let document: Record<string, unknown>;
	let versionWarning: string | null = null;

	if (args.document_id !== undefined) {
		const documentAccess = await loadCoreEntityForAccess(
			context,
			'document',
			args.document_id,
			'write'
		);
		if (documentAccess.project.id !== taskAccess.project.id) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'Document must belong to the same project as the task'
			);
		}
		document = documentAccess.entity;
	} else {
		const rawContent =
			typeof args.content === 'string'
				? args.content
				: typeof args.body_markdown === 'string'
					? args.body_markdown
					: null;
		const normalizedContent = normalizeMarkdownInput(rawContent);
		const title =
			typeof args.title === 'string' && args.title.trim()
				? args.title.trim()
				: `${taskAccess.entity.title ?? 'Task'} Document`;
		const stateInput =
			args.state_key === undefined
				? undefined
				: requireTrimmedString(args.state_key, 'state_key');
		const stateKey =
			stateInput === undefined ? 'draft' : normalizeDocumentStateInput(stateInput);
		if (!stateKey) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}
		const props = normalizeProps(args.props, 'props') ?? {};
		assertNotTableTypeForDocumentCreate(args.type_key);
		const taskDocumentTypeKey =
			typeof args.type_key === 'string' && args.type_key.trim()
				? args.type_key.trim()
				: 'document.task.scratch';
		// Same reserved-type guard as onto.document.create: this op writes the
		// same table and passed type_key through untouched.
		await assertStartHereTypeNotAgentCreated(
			context,
			taskAccess.project.id,
			taskDocumentTypeKey
		);
		const { data, error, replayed } = await insertGatewayEntity(
			context,
			'onto_documents',
			{
				project_id: taskAccess.project.id,
				title,
				type_key: taskDocumentTypeKey,
				state_key: stateKey,
				content: normalizedContent,
				description:
					normalizeOptionalText(args.description, 'description', {
						allowNull: true
					}) ?? null,
				props: {
					...props,
					...(normalizedContent ? { body_markdown: normalizedContent } : {})
				},
				created_by: actorId
			},
			ONTO_DOCUMENT_SELECT
		);

		if (error || !data) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error?.message || 'Failed to create task document'
			);
		}
		document = data as Record<string, unknown>;
		try {
			await createOrMergeDocumentVersion({
				supabase: context.admin,
				documentId: String(document.id),
				actorId,
				snapshot: toDocumentSnapshot(document),
				changeSource: 'api'
			});
		} catch (versionError) {
			console.warn(
				'[External Tool Gateway] Failed to record task document version:',
				versionError
			);
			versionWarning = DOCUMENT_VERSION_WRITE_WARNING;
		}
		if (!replayed) {
			await logCreateAsync(
				context.admin,
				taskAccess.project.id,
				'document',
				String(document.id),
				{
					title: document.title,
					type_key: document.type_key,
					state_key: document.state_key
				},
				context.userId,
				'agent_call',
				context.chatSessionId,
				getExternalAgentActivityContext(context)
			);
		}
	}

	const role =
		typeof args.role === 'string' && args.role.trim() ? args.role.trim() : 'deliverable';
	const edgeResult = await createEdge(
		context,
		{
			src_kind: 'task',
			src_id: taskAccess.entity.id,
			dst_kind: 'document',
			dst_id: document.id,
			rel: TASK_DOCUMENT_REL,
			props: {
				role,
				origin_task_id: taskAccess.entity.id,
				created_at: new Date().toISOString(),
				created_by: actorId
			}
		},
		taskAccess.project
	);

	return {
		document: serializeExternalEntity('document', document, taskAccess.project.name),
		edge: edgeResult.edge,
		message: `Linked document "${document.title ?? 'Document'}" to task.`,
		version_warning: versionWarning
	};
}

export async function moveDocumentInTree(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project, context.scope);
	const documentId = assertValidId(args.document_id, 'document_id');
	const { data: document, error: documentError } = await context.admin
		.from('onto_documents')
		.select('id, project_id')
		.eq('id', documentId)
		.eq('project_id', project.id)
		.is('archived_at', null)
		.maybeSingle();

	if (documentError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			documentError.message || 'Failed to load document'
		);
	}
	if (!document) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	let newParentId = normalizeOptionalUuid(args.new_parent_id ?? args.parent_id, 'new_parent_id');
	if (newParentId) {
		const { data: parent, error: parentError } = await context.admin
			.from('onto_documents')
			.select('id')
			.eq('id', newParentId)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null)
			.maybeSingle();
		if (parentError) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				parentError.message || 'Failed to load parent document'
			);
		}
		if (!parent) {
			throw new ExternalToolGatewayError('NOT_FOUND', 'Parent document not found');
		}
	}

	// Parent by TITLE: reuse the existing document with that title or create the parent.
	// Mirrors the chat executor (2026-07-26): models fabricate parent UUIDs for groupings that
	// do not exist yet; a title path makes grouping single-phase and id-free.
	const rawParentTitle =
		typeof (args.new_parent_title ?? args.parent_title) === 'string'
			? String(args.new_parent_title ?? args.parent_title).trim()
			: '';
	let parentCreated = false;
	if (!newParentId && rawParentTitle) {
		const { data: titledParent, error: titledParentError } = await context.admin
			.from('onto_documents')
			.select('id')
			.eq('project_id', project.id)
			// Exact (case-insensitive) title match: a "%" or "_" in the title must
			// not act as a wildcard and attach the document to some other parent.
			.ilike('title', escapeLikePattern(rawParentTitle))
			.is('deleted_at', null)
			.is('archived_at', null)
			.limit(1)
			.maybeSingle();
		if (titledParentError) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				titledParentError.message || 'Failed to resolve parent document by title'
			);
		}
		if (titledParent && titledParent.id !== documentId) {
			newParentId = titledParent.id;
		} else {
			const createdParent = await createDocument(context, {
				project_id: project.id,
				title: rawParentTitle,
				type_key: 'document.default',
				state_key: 'draft',
				description: 'Grouping document created while organizing the project.',
				content: ''
			});
			const createdParentId =
				typeof createdParent.document.id === 'string' ? createdParent.document.id : null;
			if (!createdParentId || createdParent.structure_error) {
				throw new ExternalToolGatewayError(
					'INTERNAL',
					createdParent.structure_error ||
						`Failed to create parent document "${rawParentTitle}"`
				);
			}
			newParentId = createdParentId;
			parentCreated = true;
		}
	}
	if (newParentId && newParentId === documentId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'A document cannot be moved under itself.'
		);
	}
	const position =
		normalizeDocumentPosition(args.new_position ?? args.position, 'new_position') ?? 0;
	const actorId = await contextActorId(context);
	let structure;
	try {
		structure = await moveDocument(
			context.admin,
			project.id,
			documentId,
			{
				newParentId: newParentId ?? null,
				newPosition: position
			},
			actorId
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (
			message === 'A document cannot be moved under itself.' ||
			message === 'Parent document is not linked in the document tree.' ||
			message === 'Cannot move a folder into its own descendant'
		) {
			throw new ExternalToolGatewayError('VALIDATION_ERROR', message);
		}
		throw error;
	}
	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		documentId,
		{ tree_move: true },
		{
			tree_move: true,
			new_parent_id: newParentId ?? null,
			new_position: position
		},
		context.userId,
		'agent_call',
		context.chatSessionId,
		getExternalAgentActivityContext(context)
	);

	// The resolved parent is part of the receipt so callers that grouped by title
	// (and worker adapters that must prove placement) learn the destination id.
	return {
		project_id: project.id,
		document_id: documentId,
		parent_id: newParentId ?? null,
		parent_created: parentCreated,
		structure,
		message: newParentId
			? parentCreated
				? `Moved document ${documentId} under "${rawParentTitle}" (parent document created).`
				: `Moved document ${documentId} under parent ${newParentId}.`
			: `Moved document ${documentId} to the root of the doc structure.`
	};
}

export async function listDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	const typeKey = normalizeEntityTypeFilter(args.type_key, 'document');
	const stateKey = normalizeEntityStateFilter(args.state_key, 'document');
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			documents: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	let query = context.admin
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, state_key, archived_at, created_at, updated_at',
			{
				count: 'exact'
			}
		)
		.in('project_id', projectIds)
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	query = applyArchivedReadFilter(query, args);

	if (typeKey) {
		query = query.eq('type_key', typeKey);
	}

	if (stateKey) {
		query = query.eq('state_key', stateKey);
	}

	const { data, error, count } = await query;
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to list documents');
	}

	const documents = (data ?? []).map((document: Record<string, unknown>) => ({
		...document,
		project_name: visible.projectMap.get(String(document.project_id))?.name ?? null
	}));

	return {
		documents,
		total: count ?? documents.length,
		pagination: buildPaginationForRows(
			offset,
			limit,
			count ?? documents.length,
			documents.length
		)
	};
}

export async function searchDocuments(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	return searchEntitiesByType(context, args, ['document']);
}

export async function getDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const documentId = args.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'document_id must be a valid UUID');
	}

	const maxChars = normalizeMaxChars(args.max_chars);
	const visible = await loadVisibleProjects(context);

	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	let query = context.admin
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, content, state_key, archived_at, created_at, updated_at'
		)
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	query = applyArchivedReadFilter(query, args);

	const { data, error } = await query.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load document');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, data.project_id);
	const body = truncateText(data.content, maxChars);

	return {
		document: {
			...data,
			project_name: project.name,
			content: body.content,
			content_truncated: body.truncated
		}
	};
}

export async function getDocumentTree(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	const includeDocuments = args.include_documents === true;
	const includeContent = includeDocuments && args.include_content === true;
	const tree = await getDocTree(context.admin, project.id, {
		includeDocuments,
		includeContent
	});

	const countNodes = (nodes: any[]): number =>
		(nodes ?? []).reduce(
			(total, node) =>
				total + 1 + countNodes(Array.isArray(node.children) ? node.children : []),
			0
		);

	return {
		...serializeDocumentTree(tree as unknown as Record<string, unknown>),
		message: `Document tree loaded with ${countNodes(tree.structure.root)} nodes.`
	};
}

export async function getDocumentPath(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const documentId = assertValidId(args.document_id, 'document_id');
	const visible = await loadVisibleProjects(context);
	let projectId: string | null = null;
	let fallbackTitle = 'Untitled';

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectId = project.id;
	} else {
		const projectIds = getProjectIdsOrThrow(visible, 'Document');
		const { data, error } = await context.admin
			.from('onto_documents')
			.select('id, project_id, title')
			.eq('id', documentId)
			.in('project_id', projectIds)
			.is('archived_at', null)
			.maybeSingle();

		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to load document'
			);
		}
		if (!data) {
			throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
		}

		projectId = String(data.project_id);
		fallbackTitle = typeof data.title === 'string' ? data.title : fallbackTitle;
	}

	const tree = await getDocTree(context.admin, projectId, {
		includeDocuments: true,
		includeContent: false
	});
	const pathIds = getNodePath(tree.structure.root, documentId);
	const path = pathIds.map((id) => ({
		id,
		title: tree.documents[id]?.title ?? (id === documentId ? fallbackTitle : 'Untitled')
	}));

	return {
		path,
		document_id: documentId,
		project_id: projectId,
		message:
			path.length > 0
				? `Document path: ${path.map((item) => item.title).join(' > ')}`
				: `Document "${fallbackTitle}" is not placed in the tree.`
	};
}

export async function listTaskDocuments(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const taskAccess = await loadCoreEntityForAccess(context, 'task', args.task_id, 'read');
	const { data: edges, error: edgeError } = await context.admin
		.from('onto_edges')
		.select(ONTO_EDGE_SELECT)
		.eq('src_kind', 'task')
		.eq('src_id', String(taskAccess.entity.id))
		.eq('rel', TASK_DOCUMENT_REL)
		.order('created_at', { ascending: true });

	if (edgeError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			edgeError.message || 'Failed to fetch task document links'
		);
	}

	const edgeRows = (edges ?? []) as Array<Record<string, unknown>>;
	if (edgeRows.length === 0) {
		return {
			documents: [],
			scratch_pad: null,
			message: 'Found 0 documents linked to this task.'
		};
	}

	const documentIds = edgeRows
		.map((edge) => edge.dst_id)
		.filter((id): id is string => typeof id === 'string' && isValidUUID(id));
	const { data: documents, error: documentError } = await context.admin
		.from('onto_documents')
		.select(ONTO_DOCUMENT_SELECT)
		.in('id', documentIds)
		.eq('project_id', taskAccess.project.id)
		.is('archived_at', null);

	if (documentError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			documentError.message || 'Failed to fetch task documents'
		);
	}

	const documentMap = new Map(
		((documents ?? []) as Array<Record<string, unknown>>).map((document) => [
			String(document.id),
			document
		])
	);
	const combined = edgeRows
		.map((edge) => {
			const document = documentMap.get(String(edge.dst_id));
			return document
				? {
						document: serializeExternalEntity(
							'document',
							document,
							taskAccess.project.name
						),
						edge
					}
				: null;
		})
		.filter(
			(item): item is { document: Record<string, unknown>; edge: Record<string, unknown> } =>
				Boolean(item)
		);
	const scratchPad =
		combined.find(
			(item) =>
				item.edge.props &&
				typeof item.edge.props === 'object' &&
				!Array.isArray(item.edge.props) &&
				(item.edge.props as Record<string, unknown>).role === 'scratch'
		) ?? null;

	return {
		documents: combined,
		scratch_pad: scratchPad,
		message: `Found ${combined.length} documents linked to this task.`
	};
}
