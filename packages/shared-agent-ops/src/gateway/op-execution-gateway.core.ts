// packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts
//
// Shared execution core for BuildOS gateway operations. This module owns the
// public handler catalog plus the external-agent dispatcher. Web-only concerns
// such as discovery tools, concrete calendar/task-sync services, and the web
// tool registry are supplied through ports and explicit parameters.
import { isValidUUID } from '@buildos/shared-types';
import type { AgentCallScope, BuildosAgentAllowedOp, Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logCreateAsync, logUpdateAsync } from '../ops/async-activity-logger';
import { ensureActorId, type OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { resolveGatewayOpAlias } from '../ops/gateway-op-aliases';
import {
	defaultAllowedOpsForMode,
	isSupportedOp,
	isWriteOp,
	requiredScopeModeForOp
} from '../policy';
import {
	AgentCallWritePendingError,
	AgentCallWriteReplayError,
	recordToolExecutionFailure,
	recordToolExecutionSuccess,
	recordWriteExecutionFailure,
	recordWriteExecutionSuccess,
	reserveWriteExecution
} from './write-audit.service';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '../ops/entity-mention-notification.service';
import { normalizeDocumentStateInput } from '../ontology/document-state';
import { normalizeMarkdownInput } from '../utils/markdown-normalization';
import { createOrMergeDocumentVersion, toDocumentSnapshot } from '../ontology/versioning.service';
import {
	addDocumentToTree,
	getDocTree,
	getNodePath,
	moveDocument
} from '../ontology/doc-structure.service';
import { DOCUMENT_STATES, isValidTypeKey } from '../ontology/onto';
import { logSecurityEvent, type SecurityEventLogOptions } from '../ops/security-event-logger';
import {
	getDocumentUpdateContentCandidate,
	isAppendOrMergeUpdateStrategy
} from '../ops/update-value-validation';
import { loadProjectGraphData } from '../ontology/project-graph-loader';
import {
	instantiateProject,
	OntologyInstantiationError,
	validateProjectSpec
} from '../ontology/instantiation.service';
import {
	preserveCurrentStartHereManagedRegions,
	START_HERE_DOCUMENT_TYPE_KEY
} from '../ontology/start-here';
import {
	ARCHIVABLE_ENTITY_KINDS,
	CORE_ENTITY_CONFIG,
	EXTERNAL_CUSTOM_OPS,
	EXTERNAL_WRITE_OP_SCHEMAS,
	LINK_ENTITY_SELECTS,
	LINK_ENTITY_TABLES,
	ONTO_DOCUMENT_SELECT,
	ONTO_EDGE_SELECT,
	withExternalArchiveUpdateParameter,
	type ExternalEntityKind,
	type ExternalLinkEntityKind
} from './op-execution-gateway.config';
import type {
	CalendarPort,
	ExternalGatewayRegistry,
	ExternalGatewayRegistryEntry,
	RegistryOp,
	TaskSyncPort,
	ToolExecutionContext
} from './op-execution-gateway.types';
import { entityKindFromGatewayOp } from './op-execution-gateway.mutations';
import {
	normalizeAndValidateGatewayArgs,
	type GatewayLegacyArgAliasUsage
} from './op-execution-gateway.validation';
import {
	ExternalToolGatewayError,
	buildExecError,
	buildGatewaySuccessResponse,
	buildToolExecutionAuditPayload,
	extractWriteEntityMeta,
	normalizeGatewayError
} from './op-execution-gateway.responses';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	getProjectIdsForVisibleContext,
	getProjectIdsOrThrow,
	loadVisibleProjects,
	withProjectName
} from './op-execution-gateway.access';
import {
	createCalendarEvent,
	deleteCalendarEvent,
	getCalendarEventDetails,
	getProjectCalendar,
	listCalendarEvents,
	setProjectCalendar,
	updateCalendarEvent
} from './op-execution-gateway.calendar';
import { getProjectStatus } from './op-execution-gateway.project-status';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { getAsset, searchAssets } from './op-execution-gateway.assets';
import { assertValidId } from './op-execution-gateway.ids';
import { getProject, listProjects, searchProjects } from './op-execution-gateway.projects';
import {
	createGoal,
	createMilestone,
	createPlan,
	createRisk,
	getGoal,
	getMilestone,
	getPlan,
	getRisk,
	listGoals,
	listMilestones,
	listPlans,
	listRisks,
	searchGoals,
	searchMilestones,
	searchPlans,
	searchRisks,
	updateGoal,
	updateMilestone,
	updatePlan,
	updateRisk
} from './op-execution-gateway.core-entities';
import {
	createTask,
	getTask,
	listTasks,
	searchTasks,
	updateTask
} from './op-execution-gateway.tasks';
import {
	loadCoreEntityForAccess,
	loadEntityForAccess,
	normalizeEntityKind,
	type EntityAccessResult
} from './op-execution-gateway.entity-access';
import {
	TASK_DOCUMENT_REL,
	createEdge,
	linkOntoEntities,
	unlinkOntoEdge
} from './op-execution-gateway.edges';
import {
	applyArchivedReadFilter,
	normalizeArchivedUpdate,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeOptionalDate,
	normalizeOptionalText,
	normalizeOptionalUuid,
	normalizeProps,
	normalizeProjectState,
	requireTrimmedString
} from './op-execution-gateway.normalization';
import { searchEntitiesByType, searchOntology } from './op-execution-gateway.search';
import {
	serializeDocumentTree,
	serializeExternalEntity,
	serializeProjectGraphData
} from './op-execution-gateway.serializers';
import { truncateText } from './op-execution-gateway.text';

type GatewaySupabaseClient = SupabaseClient<Database>;

export {
	EXTERNAL_CUSTOM_OPS,
	EXTERNAL_WRITE_OP_SCHEMAS,
	withExternalArchiveUpdateParameter
} from './op-execution-gateway.config';
export { clampLimit } from './op-execution-gateway.pagination';
export { summarizeDescription } from './op-execution-gateway.text';
export {
	ExternalToolGatewayError,
	buildExecError,
	extractWriteEntityMeta,
	normalizeGatewayError
} from './op-execution-gateway.responses';
export type {
	CalendarPort,
	ExternalGatewayRegistry,
	ExternalGatewayRegistryEntry,
	RegistryOp,
	TaskSyncPort,
	ToolExecutionContext
} from './op-execution-gateway.types';

const MAX_DOCUMENT_CONTENT_BYTES = 200 * 1024;

export const EXTERNAL_OP_HANDLERS: Record<
	BuildosAgentAllowedOp,
	(
		context: ToolExecutionContext,
		args: Record<string, unknown>
	) => Promise<Record<string, unknown>>
> = {
	'onto.project.list': listProjects,
	'onto.project.search': searchProjects,
	'onto.project.get': getProject,
	'onto.project.status.get': getProjectStatus,
	'onto.project.graph.get': getProjectGraph,
	'onto.task.list': listTasks,
	'onto.task.search': searchTasks,
	'onto.task.get': getTask,
	'onto.task.create': createTask,
	'onto.task.update': updateTask,
	'onto.task.docs.list': listTaskDocuments,
	'onto.task.docs.create_or_attach': createTaskDocument,
	'onto.document.list': listDocuments,
	'onto.document.search': searchDocuments,
	'onto.document.get': getDocument,
	'onto.document.create': createDocument,
	'onto.document.update': updateDocument,
	'onto.document.tree.get': getDocumentTree,
	'onto.document.tree.move': moveDocumentInTree,
	'onto.document.path.get': getDocumentPath,
	'onto.goal.list': listGoals,
	'onto.goal.search': searchGoals,
	'onto.goal.get': getGoal,
	'onto.plan.list': listPlans,
	'onto.plan.search': searchPlans,
	'onto.plan.get': getPlan,
	'onto.milestone.list': listMilestones,
	'onto.milestone.search': searchMilestones,
	'onto.milestone.get': getMilestone,
	'onto.risk.list': listRisks,
	'onto.risk.search': searchRisks,
	'onto.risk.get': getRisk,
	'onto.asset.search': searchAssets,
	'onto.asset.get': getAsset,
	'onto.entity.relationships.get': getEntityRelationships,
	'onto.entity.links.get': getLinkedEntities,
	'onto.search': searchOntology,
	'cal.event.list': listCalendarEvents,
	'cal.event.get': getCalendarEventDetails,
	'cal.event.create': createCalendarEvent,
	'cal.event.update': updateCalendarEvent,
	'cal.event.delete': deleteCalendarEvent,
	'cal.project.get': getProjectCalendar,
	'cal.project.set': setProjectCalendar,
	'onto.project.create': createProject,
	'onto.project.update': updateProject,
	'onto.goal.create': createGoal,
	'onto.goal.update': updateGoal,
	'onto.plan.create': createPlan,
	'onto.plan.update': updatePlan,
	'onto.milestone.create': createMilestone,
	'onto.milestone.update': updateMilestone,
	'onto.risk.create': createRisk,
	'onto.risk.update': updateRisk,
	'onto.edge.link': linkOntoEntities,
	'onto.edge.unlink': unlinkOntoEdge
};

function normalizeMaxChars(value: unknown, fallback = 20000): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(50000, Math.max(500, Math.floor(value)));
}

export function buildRegistryVersion(registryVersion: string, opNames: string[]): string {
	return `${registryVersion}/external/${opNames.join(',')}`;
}

export function buildExternalToolDescription(entry: RegistryOp): string {
	const scopeNotice =
		'Only projects in the caller-approved BuildOS scope are visible; public project visibility does not grant connector access.';

	if (entry.op === 'onto.project.create') {
		return `${entry.description} Project creation requires read_write access with onto.project.create whitelisted. A project-scoped key may create projects; each project it creates is automatically added to the key's scope. ${scopeNotice}`;
	}

	if (entry.group !== 'cal') {
		return `${entry.description} ${scopeNotice}`;
	}

	return `${entry.description} External callers must scope calendar access to an allowed project_id or task_id; broad user calendar access is not exposed through the BuildOS call gateway. ${scopeNotice}`;
}

function normalizeRelationshipDirection(value: unknown): 'outgoing' | 'incoming' | 'both' {
	if (value === undefined || value === null || value === '') {
		return 'both';
	}
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'direction must be one of: outgoing, incoming, both'
		);
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'out' || normalized === 'outgoing') return 'outgoing';
	if (normalized === 'in' || normalized === 'incoming') return 'incoming';
	if (normalized === 'both') return 'both';
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'direction must be one of: outgoing, incoming, both'
	);
}

function ensureWriteExecutionContext(
	context: ToolExecutionContext,
	op: BuildosAgentAllowedOp
): { callerId: string; callSessionId: string } {
	if (!context.callerId || !context.callSessionId) {
		throw new ExternalToolGatewayError('INTERNAL', `Missing write execution context for ${op}`);
	}

	return {
		callerId: context.callerId,
		callSessionId: context.callSessionId
	};
}

async function logGatewayCompatibilityAliasUsage(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	requestedOp: string;
	canonicalOp: string;
	opAliasUsed: boolean;
	argAliasesUsed?: GatewayLegacyArgAliasUsage[];
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<void> {
	const argAliasesUsed = params.argAliasesUsed ?? [];
	if (!params.opAliasUsed && argAliasesUsed.length === 0) {
		return;
	}

	await logSecurityEvent(
		{
			eventType: 'agent.tool.alias_used',
			category: 'agent',
			outcome: 'info',
			severity: 'low',
			actorType: 'external_agent',
			actorUserId: params.userId,
			externalAgentCallerId: params.callerId ?? null,
			sessionId: params.callSessionId ?? null,
			reason: 'gateway_compatibility_alias',
			metadata: {
				requestedOp: params.requestedOp,
				canonicalOp: params.canonicalOp,
				scopeMode: params.scope.mode,
				opAliasUsed: params.opAliasUsed,
				argAliasesUsed
			}
		},
		{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
	);
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

function normalizeDocumentUpdateStrategy(value: unknown): 'replace' | 'append' | 'merge_llm' {
	if (value === undefined || value === null) return 'replace';
	if (value === 'replace' || value === 'append' || value === 'merge_llm') {
		return value;
	}
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'update_strategy must be one of: replace, append, merge_llm'
	);
}

async function resolveExternalDocumentContentWithStrategy(params: {
	strategy: 'replace' | 'append' | 'merge_llm';
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

	if (strategy === 'append' || strategy === 'merge_llm') {
		return existingText ? `${existingText}\n\n${newContent}` : newContent;
	}

	return newContent;
}

async function createDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);

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

	const typeKey = resolveDocumentTypeKey(args.type_key);

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
	const actorId = await ensureActorId(context.admin, context.userId);

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

	const { data, error } = await context.admin
		.from('onto_documents')
		.insert(insertPayload)
		.select(ONTO_DOCUMENT_SELECT)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to create document'
		);
	}

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
	}

	let structure: Record<string, unknown> | null = null;
	let structureError: string | null = null;
	try {
		structure = (await addDocumentToTree(
			context.admin,
			project.id,
			String(data.id),
			{
				parentId: parentDocumentId,
				position,
				title: typeof data.title === 'string' ? data.title : null,
				description: typeof data.description === 'string' ? data.description : null
			},
			actorId
		)) as unknown as Record<string, unknown>;
	} catch (treeError) {
		structureError = treeError instanceof Error ? treeError.message : String(treeError);
		console.warn('[External Tool Gateway] Failed to place document in tree:', treeError);
	}

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
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		document: serializeExternalEntity(
			'document',
			data as Record<string, unknown>,
			project.name
		),
		structure,
		structure_error: structureError
	};
}

async function updateDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const documentId = args.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'document_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	let existingDocumentQuery = context.admin
		.from('onto_documents')
		.select(ONTO_DOCUMENT_SELECT)
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	if (archivedAtUpdate !== null) {
		existingDocumentQuery = existingDocumentQuery.is('archived_at', null);
	}

	const { data: existingDocument, error: existingError } =
		await existingDocumentQuery.maybeSingle();

	if (existingError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			existingError.message || 'Failed to load document'
		);
	}

	if (!existingDocument) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, existingDocument.project_id);
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);

	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};
	let changedFieldCount = 0;
	let propsTouched = false;
	const mergedProps: Record<string, unknown> = {
		...((existingDocument.props as Record<string, unknown> | null) ?? {})
	};
	const strategy = normalizeDocumentUpdateStrategy(args.update_strategy);
	const mergeInstructions =
		args.merge_instructions === undefined
			? undefined
			: requireTrimmedString(args.merge_instructions, 'merge_instructions', {
					allowEmpty: true
				});
	void mergeInstructions;

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

	const documentContentCandidate =
		args.content !== undefined || args.body_markdown !== undefined
			? typeof args.content === 'string'
				? args.content
				: typeof args.body_markdown === 'string'
					? args.body_markdown
					: ''
			: undefined;

	if (isAppendOrMergeUpdateStrategy(strategy) && !getDocumentUpdateContentCandidate(args)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`update_onto_document ${strategy} requires non-empty content.`
		);
	}

	if (documentContentCandidate !== undefined) {
		const normalizedContent = normalizeMarkdownInput(documentContentCandidate) ?? '';
		const resolvedContent = await resolveExternalDocumentContentWithStrategy({
			strategy,
			newContent: normalizedContent,
			existingLoader: async () =>
				typeof existingDocument.content === 'string'
					? existingDocument.content
					: typeof (existingDocument.props as Record<string, unknown> | null)
								?.body_markdown === 'string'
						? ((existingDocument.props as Record<string, unknown>)
								.body_markdown as string)
						: ''
		});
		const nextTypeKey =
			typeof updateData.type_key === 'string'
				? updateData.type_key
				: existingDocument.type_key;
		const nextContent =
			nextTypeKey === START_HERE_DOCUMENT_TYPE_KEY
				? preserveCurrentStartHereManagedRegions(
						typeof existingDocument.content === 'string'
							? existingDocument.content
							: '',
						resolvedContent
					)
				: resolvedContent;
		assertContentWithinCap(nextContent, 'content');
		updateData.content = nextContent;
		mergedProps.body_markdown = nextContent;
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

	const { data, error } = await context.admin
		.from('onto_documents')
		.update(updateData)
		.eq('id', documentId)
		.select(ONTO_DOCUMENT_SELECT)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to update document'
		);
	}

	try {
		await createOrMergeDocumentVersion({
			supabase: context.admin,
			documentId: data.id,
			actorId,
			snapshot: toDocumentSnapshot(data),
			changeSource: 'api'
		});
	} catch (versionError) {
		console.warn('[External Tool Gateway] Failed to record document version:', versionError);
	}

	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		String(data.id),
		{
			title: existingDocument.title,
			state_key: existingDocument.state_key,
			type_key: existingDocument.type_key
		},
		{
			title: data.title,
			state_key: data.state_key,
			type_key: data.type_key
		},
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		document: serializeExternalEntity('document', data as Record<string, unknown>, project.name)
	};
}

async function createProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	// Project creation is gated only by the `onto.project.create` write op being in
	// the caller's whitelist (enforced by registry inclusion) plus read_write mode.
	// It is intentionally NOT tied to all-project scope: a project-scoped key may
	// create new projects, and the created project is auto-added to the key's scope
	// below so the same caller can immediately read and write it.

	if (Array.isArray(args.clarifications) && args.clarifications.length > 0) {
		return {
			project_id: '',
			counts: {},
			clarifications: args.clarifications,
			message: 'Additional information is required before creating the project.'
		};
	}

	const contextDocument =
		args.context_document &&
		typeof args.context_document === 'object' &&
		!Array.isArray(args.context_document)
			? {
					...(args.context_document as Record<string, unknown>),
					body_markdown:
						typeof (args.context_document as Record<string, unknown>).body_markdown ===
						'string'
							? (args.context_document as Record<string, unknown>).body_markdown
							: (args.context_document as Record<string, unknown>).content
				}
			: undefined;
	const spec = {
		project: args.project,
		entities: Array.isArray(args.entities) ? args.entities : [],
		relationships: Array.isArray(args.relationships) ? args.relationships : [],
		...(contextDocument ? { context_document: contextDocument } : {})
	};
	const validation = validateProjectSpec(spec);
	if (!validation.valid) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			validation.errors[0] ?? 'Invalid ProjectSpec'
		);
	}

	let result: { project_id: string; counts: Record<string, number | undefined> };
	try {
		result = await instantiateProject(context.admin, spec as any, context.userId, {
			activityLog: {
				changeSource: 'agent_call',
				actorContext: getExternalAgentActivityContext(context)
			}
		});
	} catch (error) {
		if (error instanceof OntologyInstantiationError) {
			throw new ExternalToolGatewayError('VALIDATION_ERROR', error.message);
		}
		throw error;
	}

	await grantCallerProjectAccess(context, result.project_id);

	const { data: project } = await context.admin
		.from('onto_projects')
		.select(CORE_ENTITY_CONFIG.project.select)
		.eq('id', result.project_id)
		.maybeSingle();

	return {
		project_id: result.project_id,
		project: project ?? { id: result.project_id },
		counts: result.counts,
		message: `Created project "${(project as { name?: string } | null)?.name ?? result.project_id}".`
	};
}

/**
 * After a project-scoped caller creates a project, add it to that caller's scope
 * so the same key can immediately read and write the project it just made.
 *
 * - Unscoped callers (project_ids absent) already see all projects — no-op.
 * - The in-memory scope is updated so later calls in this same session work.
 * - The caller policy is persisted so future sessions keep the access. Runtime
 *   auth (both static keys and OAuth) derives scope from external_agent_callers.
 *   policy, so updating it here is sufficient.
 */
async function grantCallerProjectAccess(
	context: ToolExecutionContext,
	projectId: string
): Promise<void> {
	if (!context.callerId) return;
	if (!Array.isArray(context.scope.project_ids)) return;
	if (context.scope.project_ids.includes(projectId)) return;

	// Update the in-session scope immediately.
	context.scope.project_ids = [...context.scope.project_ids, projectId];

	try {
		const { data: caller } = await context.admin
			.from('external_agent_callers')
			.select('policy')
			.eq('id', context.callerId)
			.maybeSingle();

		const policy = ((caller?.policy as Record<string, unknown> | null) ?? {}) as Record<
			string,
			unknown
		>;
		const existing = Array.isArray(policy.allowed_project_ids)
			? (policy.allowed_project_ids as unknown[]).filter(
					(id): id is string => typeof id === 'string'
				)
			: null;

		// A null stored allowlist means the key is unscoped in storage; don't
		// narrow it to a single project. Only append when an explicit list exists.
		if (!existing || existing.includes(projectId)) return;

		await context.admin
			.from('external_agent_callers')
			.update({ policy: { ...policy, allowed_project_ids: [...existing, projectId] } })
			.eq('id', context.callerId);
	} catch {
		// Persisting the scope expansion is best-effort. The project was created and
		// is usable for the rest of this session even if the policy write fails.
	}
}

async function updateProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const access = await loadCoreEntityForAccess(context, 'project', args.project_id, 'write', {
		includeArchived: archivedAtUpdate === null
	});
	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
	let changed = 0;

	if (args.name !== undefined) {
		updateData.name = requireTrimmedString(args.name, 'name');
		changed += 1;
	}
	if (args.description !== undefined) {
		updateData.description = normalizeOptionalText(args.description, 'description', {
			allowNull: true
		});
		changed += 1;
	}
	if (args.state_key !== undefined || args.state !== undefined) {
		updateData.state_key = normalizeProjectState(args.state_key ?? args.state);
		changed += 1;
	}
	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	if (startAt !== undefined) {
		updateData.start_at = startAt;
		changed += 1;
	}
	const endAt = normalizeOptionalDate(args.end_at, 'end_at');
	if (endAt !== undefined) {
		updateData.end_at = endAt;
		changed += 1;
	}
	if (args.props !== undefined) {
		updateData.props = {
			...((access.entity.props as Record<string, unknown> | null) ?? {}),
			...(normalizeProps(args.props, 'props') ?? {})
		};
		changed += 1;
	}
	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changed += 1;
	}

	if (changed === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable project field is required'
		);
	}

	const { data, error } = await context.admin
		.from('onto_projects')
		.update(updateData)
		.eq('id', access.project.id)
		.select(CORE_ENTITY_CONFIG.project.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to update project'
		);
	}

	await logUpdateAsync(
		context.admin,
		access.project.id,
		'project',
		access.project.id,
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		project: data,
		message: `Updated ontology project "${data.name ?? access.project.id}".`
	};
}

async function createTaskDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskAccess = await loadCoreEntityForAccess(context, 'task', args.task_id, 'write');
	const actorId = await ensureActorId(context.admin, context.userId);
	let document: Record<string, unknown>;

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
		const { data, error } = await context.admin
			.from('onto_documents')
			.insert({
				project_id: taskAccess.project.id,
				title,
				type_key:
					typeof args.type_key === 'string' && args.type_key.trim()
						? args.type_key.trim()
						: 'document.task.scratch',
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
			})
			.select(ONTO_DOCUMENT_SELECT)
			.single();

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
		}
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
			undefined,
			getExternalAgentActivityContext(context)
		);
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
		message: `Linked document "${document.title ?? 'Document'}" to task.`
	};
}

async function moveDocumentInTree(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);
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

	const newParentId = normalizeOptionalUuid(
		args.new_parent_id ?? args.parent_id,
		'new_parent_id'
	);
	if (newParentId) {
		const { data: parent, error: parentError } = await context.admin
			.from('onto_documents')
			.select('id')
			.eq('id', newParentId)
			.eq('project_id', project.id)
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
	const position =
		normalizeDocumentPosition(args.new_position ?? args.position, 'new_position') ?? 0;
	const actorId = await ensureActorId(context.admin, context.userId);
	const structure = await moveDocument(
		context.admin,
		project.id,
		documentId,
		{
			newParentId: newParentId ?? null,
			newPosition: position
		},
		actorId
	);
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
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		project_id: project.id,
		document_id: documentId,
		structure,
		message: `Moved document ${documentId} in doc structure.`
	};
}

async function listDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
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

async function searchDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['document']);
}

async function getDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
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

async function getProjectGraph(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	const graph = await loadProjectGraphData(context.admin, project.id, {
		excludeCompletedTasks: true
	});

	return {
		graph: serializeProjectGraphData(graph as unknown as Record<string, unknown>),
		metadata: {
			projectId: project.id,
			queryPattern: 'project-graph-loader',
			generatedAt: new Date().toISOString()
		}
	};
}

async function getDocumentTree(context: ToolExecutionContext, args: Record<string, unknown>) {
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

async function getDocumentPath(context: ToolExecutionContext, args: Record<string, unknown>) {
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

async function listTaskDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
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

async function resolveVisibleEntityById(
	context: ToolExecutionContext,
	entityId: unknown,
	access: 'read' | 'write'
): Promise<EntityAccessResult> {
	const id = assertValidId(entityId, 'entity_id');
	const kinds: ExternalLinkEntityKind[] = [
		'project',
		'task',
		'plan',
		'goal',
		'milestone',
		'document',
		'risk',
		'event',
		'requirement',
		'metric',
		'source'
	];
	let lastError: unknown = null;

	for (const kind of kinds) {
		try {
			return await loadEntityForAccess(context, kind, id, access);
		} catch (error) {
			if (error instanceof ExternalToolGatewayError && error.code === 'NOT_FOUND') {
				lastError = error;
				continue;
			}
			throw error;
		}
	}

	throw lastError instanceof ExternalToolGatewayError
		? new ExternalToolGatewayError('NOT_FOUND', 'Entity not found')
		: new ExternalToolGatewayError('NOT_FOUND', 'Entity not found');
}

async function getEntityRelationships(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const direction = normalizeRelationshipDirection(args.direction);
	const entity = await resolveVisibleEntityById(context, args.entity_id, 'read');
	const relationships: Array<Record<string, unknown>> = [];

	if (direction === 'outgoing' || direction === 'both') {
		const { data, error } = await context.admin
			.from('onto_edges')
			.select(ONTO_EDGE_SELECT)
			.eq('project_id', entity.project.id)
			.eq('src_id', String(entity.entity.id))
			.limit(50);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to fetch outgoing relationships'
			);
		}
		relationships.push(
			...((data ?? []) as Array<Record<string, unknown>>).map((edge) => ({
				...edge,
				direction: 'outgoing'
			}))
		);
	}

	if (direction === 'incoming' || direction === 'both') {
		const { data, error } = await context.admin
			.from('onto_edges')
			.select(ONTO_EDGE_SELECT)
			.eq('project_id', entity.project.id)
			.eq('dst_id', String(entity.entity.id))
			.limit(50);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to fetch incoming relationships'
			);
		}
		relationships.push(
			...((data ?? []) as Array<Record<string, unknown>>).map((edge) => ({
				...edge,
				direction: 'incoming'
			}))
		);
	}

	return {
		relationships,
		message: `Found ${relationships.length} relationships for entity ${String(entity.entity.id)}.`
	};
}

function pluralKind(kind: string): string {
	if (kind === 'milestone') return 'milestones';
	if (kind === 'risk') return 'risks';
	return `${kind}s`;
}

type LinkedEntityRef = {
	kind: ExternalLinkEntityKind;
	id: string;
	edge: Record<string, unknown>;
};

async function getLinkedEntities(context: ToolExecutionContext, args: Record<string, unknown>) {
	const entityKind = normalizeEntityKind(args.entity_kind, 'entity_kind');
	const source = await loadEntityForAccess(context, entityKind, args.entity_id, 'read');
	const filterKind =
		typeof args.filter_kind === 'string' && args.filter_kind !== 'all'
			? normalizeEntityKind(args.filter_kind, 'filter_kind')
			: null;

	const { relationships } = await getEntityRelationships(context, {
		entity_id: source.entity.id,
		entity_kind: entityKind,
		direction: 'both'
	});

	const linkedRefs = (relationships as Array<Record<string, unknown>>)
		.map<LinkedEntityRef | null>((edge) => {
			const isOutgoing = edge.src_id === source.entity.id;
			const kind = String(isOutgoing ? edge.dst_kind : edge.src_kind);
			const id = String(isOutgoing ? edge.dst_id : edge.src_id);
			if (filterKind && kind !== filterKind) return null;
			if (!Object.prototype.hasOwnProperty.call(LINK_ENTITY_TABLES, kind)) return null;
			return {
				kind: kind as ExternalLinkEntityKind,
				id,
				edge
			};
		})
		.filter((ref): ref is LinkedEntityRef => ref !== null && isValidUUID(ref.id));

	const linkedByKind: Record<string, LinkedEntityRef[]> = {};
	for (const ref of linkedRefs) {
		if (!linkedByKind[ref.kind]) linkedByKind[ref.kind] = [];
		linkedByKind[ref.kind]!.push(ref);
	}

	const linkedEntities: Record<string, Array<Record<string, unknown>>> = {};
	for (const [kind, refs] of Object.entries(linkedByKind)) {
		const table = LINK_ENTITY_TABLES[kind as ExternalLinkEntityKind];
		const selectColumns = LINK_ENTITY_SELECTS[kind as ExternalLinkEntityKind];
		const ids = refs.map((ref) => ref.id);
		const { data, error } = await context.admin.from(table).select(selectColumns).in('id', ids);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || `Failed to fetch linked ${kind} entities`
			);
		}
		const rowsById = new Map(
			((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
		);
		linkedEntities[pluralKind(kind)] = refs
			.map<Record<string, unknown> | null>((ref) => {
				const row = rowsById.get(ref.id);
				if (!row) return null;
				return {
					...serializeExternalEntity(kind as ExternalLinkEntityKind, row),
					edge_id: ref.edge.id,
					edge_rel: ref.edge.rel,
					edge_direction: ref.edge.direction
				};
			})
			.filter((row): row is Record<string, unknown> => Boolean(row));
	}

	const counts = Object.fromEntries(
		Object.entries(linkedEntities).map(([kind, rows]) => [kind, rows.length])
	);
	const total = Object.values(counts).reduce(
		(sum, count) => sum + (typeof count === 'number' ? count : 0),
		0
	);

	return {
		linked_entities: linkedEntities,
		counts: {
			...counts,
			total
		},
		summary: `${total} linked entities`,
		message: `Found ${total} linked entities for ${entityKind} ${String(source.entity.id)}.`
	};
}

export function buildExternalGatewayRegistry(
	scope: AgentCallScope,
	registryOps: Record<string, RegistryOp>,
	registryVersion: string
): ExternalGatewayRegistry {
	const allowedOps = (scope.allowed_ops ?? defaultAllowedOpsForMode(scope.mode)).filter((op) =>
		scope.mode === 'read_write' ? true : !isWriteOp(op)
	);
	const ops: Record<string, ExternalGatewayRegistryEntry> = {};

	for (const op of allowedOps) {
		const entry = registryOps[op] ?? EXTERNAL_CUSTOM_OPS[op];
		const handler = EXTERNAL_OP_HANDLERS[op];
		if (!entry || !handler) continue;
		const parametersSchema =
			EXTERNAL_WRITE_OP_SCHEMAS[op] ??
			withExternalArchiveUpdateParameter(op, entry.parameters_schema);
		ops[op] = {
			...entry,
			parameters_schema: parametersSchema,
			required_scope_mode: isWriteOp(op) ? 'read_write' : 'read_only',
			handler
		};
	}

	return {
		version: buildRegistryVersion(registryVersion, Object.keys(ops).sort()),
		ops
	};
}

export async function executeGatewayOp(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
	registryOps: Record<string, RegistryOp>;
	registryVersion: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
}): Promise<Record<string, unknown>> {
	const registry = buildExternalGatewayRegistry(
		params.scope,
		params.registryOps,
		params.registryVersion
	);
	const input = params.arguments ?? {};
	const requestedOp = typeof input.op === 'string' ? input.op.trim() : '';

	if (!requestedOp) {
		return buildExecError('', 'VALIDATION_ERROR', 'Missing op', 'root');
	}

	const opAlias = resolveGatewayOpAlias(requestedOp);
	const canonicalOp = opAlias.canonicalOp;
	const allowedOps = params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode);
	if (opAlias.usedAlias) {
		await logGatewayCompatibilityAliasUsage({
			admin: params.admin,
			userId: params.userId,
			callerId: params.callerId,
			callSessionId: params.callSessionId,
			scope: params.scope,
			requestedOp,
			canonicalOp,
			opAliasUsed: true,
			securityEventOptions: params.securityEventOptions
		});
		return buildExecError(requestedOp, 'NOT_FOUND', `Unknown op: ${requestedOp}`, 'root', {
			canonical_op: canonicalOp,
			reason: 'legacy_op_alias_removed'
		});
	}
	const entry = registry.ops[canonicalOp];
	if (!entry) {
		await logGatewayCompatibilityAliasUsage({
			admin: params.admin,
			userId: params.userId,
			callerId: params.callerId,
			callSessionId: params.callSessionId,
			scope: params.scope,
			requestedOp,
			canonicalOp,
			opAliasUsed: opAlias.usedAlias,
			securityEventOptions: params.securityEventOptions
		});

		if (isSupportedOp(canonicalOp)) {
			await logSecurityEvent(
				{
					eventType: 'agent.tool.denied',
					category: 'agent',
					outcome: 'denied',
					severity: 'medium',
					actorType: 'external_agent',
					actorUserId: params.userId,
					externalAgentCallerId: params.callerId ?? null,
					sessionId: params.callSessionId ?? null,
					reason: 'op_outside_granted_scope',
					metadata: {
						requestedOp,
						canonicalOp,
						grantedScopeMode: params.scope.mode,
						requiredScopeMode: requiredScopeModeForOp(canonicalOp),
						allowedOps
					}
				},
				{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
			);
			return buildExecError(
				requestedOp,
				'FORBIDDEN',
				`Op ${canonicalOp} is outside the granted BuildOS call scope`,
				canonicalOp,
				{
					granted_scope_mode: params.scope.mode,
					required_scope_mode: requiredScopeModeForOp(canonicalOp),
					allowed_ops: allowedOps
				}
			);
		}

		return buildExecError(requestedOp, 'NOT_FOUND', `Unknown op: ${requestedOp}`, 'root');
	}

	const preparedArgs = normalizeAndValidateGatewayArgs({
		op: canonicalOp as BuildosAgentAllowedOp,
		args: input.args,
		schema: entry.parameters_schema,
		allowLegacyAliases: false
	});
	await logGatewayCompatibilityAliasUsage({
		admin: params.admin,
		userId: params.userId,
		callerId: params.callerId,
		callSessionId: params.callSessionId,
		scope: params.scope,
		requestedOp,
		canonicalOp,
		opAliasUsed: opAlias.usedAlias,
		argAliasesUsed: preparedArgs.legacyAliasesUsed,
		securityEventOptions: params.securityEventOptions
	});
	if (!preparedArgs.ok) {
		return buildExecError(
			requestedOp,
			preparedArgs.error.code,
			preparedArgs.error.message,
			canonicalOp
		);
	}
	const opArgs = preparedArgs.args;

	const warnings: string[] = [];
	if (canonicalOp !== requestedOp) {
		warnings.push(`Normalized legacy op "${requestedOp}" to "${canonicalOp}".`);
	}
	if (input.dry_run === true && !isWriteOp(canonicalOp)) {
		warnings.push('dry_run ignored for external read operations.');
	}
	if (
		typeof input.idempotency_key === 'string' &&
		input.idempotency_key.trim() &&
		!isWriteOp(canonicalOp)
	) {
		warnings.push('idempotency_key ignored for external read operations.');
	}

	if (input.dry_run === true && isWriteOp(canonicalOp)) {
		return buildGatewaySuccessResponse({
			requestedOp,
			canonicalOp,
			result: {
				dry_run: true,
				op: canonicalOp,
				args: opArgs
			},
			warnings
		});
	}

	let executionContext: { callerId: string; callSessionId: string } | null = null;
	if (isWriteOp(canonicalOp)) {
		try {
			executionContext = ensureWriteExecutionContext(
				{
					admin: params.admin,
					userId: params.userId,
					callerId: params.callerId,
					callSessionId: params.callSessionId,
					scope: params.scope
				},
				canonicalOp
			);
		} catch (error) {
			const normalized = normalizeGatewayError(error);
			return buildExecError(
				requestedOp,
				normalized.code,
				normalized.message,
				canonicalOp,
				normalized.details
			);
		}
	}
	const rawIdempotencyKey =
		typeof input.idempotency_key === 'string' ? input.idempotency_key.trim() : '';
	const idempotencyKey = rawIdempotencyKey.length > 0 ? rawIdempotencyKey : undefined;
	let executionId: string | null = null;

	if (isWriteOp(canonicalOp) && executionContext) {
		try {
			const reservation = await reserveWriteExecution({
				admin: params.admin,
				callSessionId: executionContext.callSessionId,
				callerId: executionContext.callerId,
				userId: params.userId,
				op: canonicalOp,
				args: opArgs,
				idempotencyKey,
				securityEventOptions: params.securityEventOptions
			});
			executionId = reservation.executionId;
		} catch (error) {
			if (error instanceof AgentCallWriteReplayError) {
				const replayedResponse = error.responsePayload;
				const replayedMeta =
					replayedResponse.meta &&
					typeof replayedResponse.meta === 'object' &&
					!Array.isArray(replayedResponse.meta)
						? (replayedResponse.meta as Record<string, unknown>)
						: {};

				return {
					...replayedResponse,
					meta: {
						...replayedMeta,
						replayed: true
					}
				};
			}

			if (error instanceof AgentCallWritePendingError) {
				return buildExecError(
					requestedOp,
					'CONFLICT',
					error.message,
					canonicalOp,
					idempotencyKey ? { idempotency_key: idempotencyKey } : undefined
				);
			}

			const normalized = normalizeGatewayError(error);
			return buildExecError(
				requestedOp,
				normalized.code,
				normalized.message,
				canonicalOp,
				normalized.details
			);
		}
	}

	const executionStartedAt = new Date().toISOString();

	try {
		const result = await entry.handler(
			{
				admin: params.admin,
				userId: params.userId,
				callerId: params.callerId,
				callSessionId: params.callSessionId,
				scope: params.scope,
				calendar: params.calendar,
				taskSync: params.taskSync
			},
			opArgs
		);
		const response = buildGatewaySuccessResponse({
			requestedOp,
			canonicalOp,
			result,
			warnings
		});

		if (isWriteOp(canonicalOp) && executionContext) {
			const entityMeta = extractWriteEntityMeta({ op: canonicalOp, result });
			try {
				await recordWriteExecutionSuccess({
					admin: params.admin,
					executionId,
					callSessionId: executionContext.callSessionId,
					callerId: executionContext.callerId,
					userId: params.userId,
					op: canonicalOp,
					idempotencyKey,
					args: opArgs,
					responsePayload: response,
					entityKind: entityMeta.entityKind,
					entityId: entityMeta.entityId,
					startedAt: executionStartedAt,
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write success:',
					auditError
				);
			}
		} else if (!isWriteOp(canonicalOp)) {
			const auditPayload = buildToolExecutionAuditPayload({
				response,
				canonicalOp: canonicalOp as BuildosAgentAllowedOp,
				result
			});
			try {
				await recordToolExecutionSuccess({
					admin: params.admin,
					callSessionId: params.callSessionId,
					callerId: params.callerId,
					userId: params.userId,
					op: canonicalOp,
					args: opArgs,
					responsePayload: auditPayload.responsePayload,
					entityKind: auditPayload.entityKind,
					entityId: auditPayload.entityId,
					startedAt: executionStartedAt
				});
			} catch (auditError) {
				console.error('[External Tool Gateway] Failed to record tool success:', auditError);
			}
		}

		return response;
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		if (normalized.code === 'FORBIDDEN') {
			await logSecurityEvent(
				{
					eventType: 'agent.tool.denied',
					category: 'agent',
					outcome: 'denied',
					severity: 'medium',
					actorType: 'external_agent',
					actorUserId: params.userId,
					externalAgentCallerId: params.callerId ?? null,
					sessionId: params.callSessionId ?? null,
					reason: normalized.message,
					metadata: {
						requestedOp,
						canonicalOp,
						grantedScopeMode: params.scope.mode,
						errorCode: normalized.code,
						details: normalized.details ?? null
					}
				},
				{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
			);
		}
		const response = buildExecError(
			requestedOp,
			normalized.code,
			normalized.message,
			canonicalOp,
			normalized.details
		);

		if (isWriteOp(canonicalOp) && executionContext) {
			try {
				await recordWriteExecutionFailure({
					admin: params.admin,
					executionId,
					callSessionId: executionContext.callSessionId,
					callerId: executionContext.callerId,
					userId: params.userId,
					op: canonicalOp,
					idempotencyKey,
					args: opArgs,
					errorPayload: response.error,
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write failure:',
					auditError
				);
			}
		} else if (!isWriteOp(canonicalOp)) {
			try {
				await recordToolExecutionFailure({
					admin: params.admin,
					callSessionId: params.callSessionId,
					callerId: params.callerId,
					userId: params.userId,
					op: canonicalOp,
					args: opArgs,
					errorPayload: response.error,
					entityKind: entityKindFromGatewayOp(canonicalOp) ?? undefined,
					startedAt: executionStartedAt
				});
			} catch (auditError) {
				console.error('[External Tool Gateway] Failed to record tool failure:', auditError);
			}
		}

		return response;
	}
}

export async function loadStageBeforeSnapshot(params: {
	admin: any;
	userId: string;
	scope: AgentCallScope;
	entityKind: string;
	args: Record<string, unknown>;
}): Promise<{ entityId?: string; before?: Record<string, unknown> }> {
	const cfg = (
		CORE_ENTITY_CONFIG as Record<string, { table: string; idArg: string; select: string }>
	)[params.entityKind];
	if (!cfg) {
		return {};
	}

	const idVal = params.args[cfg.idArg];
	if (typeof idVal !== 'string' || !idVal) {
		return {};
	}

	const entityId = assertValidId(idVal, cfg.idArg);
	const visible = await loadVisibleProjects({
		admin: params.admin,
		userId: params.userId,
		scope: params.scope
	});
	const projectIds = getProjectIdsForVisibleContext(visible);
	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${params.entityKind} not found`);
	}

	let query = params.admin.from(cfg.table).select(cfg.select).eq('id', entityId);
	query =
		params.entityKind === 'project'
			? query.in('id', projectIds)
			: query.in('project_id', projectIds);
	if (ARCHIVABLE_ENTITY_KINDS.has(params.entityKind as ExternalLinkEntityKind)) {
		const archivedAtUpdate = normalizeArchivedUpdate(params.args.archived);
		if (archivedAtUpdate !== null) {
			query = query.is('archived_at', null);
		}
	}

	const { data, error } = await query.maybeSingle();
	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || `Failed to load ${params.entityKind}`
		);
	}
	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${params.entityKind} not found`);
	}

	const before = data as Record<string, unknown>;
	const projectId = params.entityKind === 'project' ? entityId : before.project_id;
	if (typeof projectId !== 'string') {
		throw new ExternalToolGatewayError('INTERNAL', 'Entity project_id is invalid');
	}
	const project = visible.projects.find((candidate) => candidate.id === projectId);
	if (!project) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${params.entityKind} not found`);
	}
	assertProjectWriteAccess(project);

	return { entityId, before };
}
