// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/tool-policies.ts
import {
	AGENT_WORKSPACE_PROP,
	applyProjectCreationProfileDefaults,
	validateProjectCreationProfileGrounding
} from '../../project-domain-profiles';
import { normalizeProjectCreateArgs } from '@buildos/agentic-chat-runtime/loop';
import type { ServiceContext, ToolExecutionResult } from '../../shared/types';
import { resolveProjectIdFromContext } from './argument-pipeline';
import type { ToolArguments } from './argument-values';
import {
	normalizeDocumentTitleIdentity,
	type SameTurnDocumentRegistry
} from './same-turn-document-registry';

const PROJECT_CREATE_FROM_PROJECT_CONTEXT_WARNING =
	"You're already in this project. Are you sure you want to create a new project?";
const PROJECT_CREATE_CONFIRMATION_MARKER =
	'already in this project. are you sure you want to create a new project';

export const DOMAIN_PREFLIGHT_POLICY_ORDER = {
	preAuthorization: ['strip_server_owned_workspace_props'],
	postAuthorization: [
		'duplicate_document_create',
		'project_creation_profile_and_grounding',
		'project_creation_context_confirmation',
		'document_description_requirements'
	]
} as const;

export type PreflightPolicyResult =
	| { ok: true; args: ToolArguments }
	| { ok: false; result: ToolExecutionResult };

export function stripServerOwnedWorkspaceProps(
	toolName: string,
	args: ToolArguments
): ToolArguments {
	if (
		toolName !== 'update_onto_project' &&
		toolName !== 'update_onto_document' &&
		toolName !== 'create_onto_document'
	) {
		return args;
	}

	let next = args;
	const stripAt = (containerKey: string | null): void => {
		const container = containerKey ? next[containerKey] : next;
		if (!isRecord(container)) return;
		const props = container.props;
		if (!isRecord(props) || !(AGENT_WORKSPACE_PROP in props)) return;
		const { [AGENT_WORKSPACE_PROP]: _discarded, ...safeProps } = props;
		if (containerKey) {
			next = { ...next, [containerKey]: { ...container, props: safeProps } };
		} else {
			next = { ...next, props: safeProps };
		}
	};

	stripAt(null);
	stripAt('document');
	stripAt('project');
	stripAt('updates');
	return next;
}

export function runPostAuthorizationPreflight(params: {
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	toolCallId: string;
	sameTurnDocuments: SameTurnDocumentRegistry;
}): PreflightPolicyResult {
	const { toolName, context, toolCallId, sameTurnDocuments } = params;
	let args = params.args;

	const duplicateResult = guardDuplicateDocumentCreate({
		toolName,
		args,
		context,
		toolCallId,
		sameTurnDocuments
	});
	if (duplicateResult) return { ok: false, result: duplicateResult };

	const projectProfile = applyProjectCreationProfilePolicy({
		toolName,
		args,
		context,
		toolCallId
	});
	if (!projectProfile.ok) return projectProfile;
	args = projectProfile.args;

	const projectContextResult = guardProjectCreateFromProjectContext({
		toolName,
		args,
		context,
		toolCallId
	});
	if (projectContextResult) return { ok: false, result: projectContextResult };

	return applyDocumentDescriptionPolicy(toolName, args, toolCallId);
}

function applyProjectCreationProfilePolicy(params: {
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	toolCallId: string;
}): PreflightPolicyResult {
	const { toolName, context, toolCallId } = params;
	if (toolName !== 'create_onto_project') return { ok: true, args: params.args };

	const sourceMessage = getRecentUserMessageEvidence(context);
	let args = applyProjectCreationProfileDefaults(params.args, sourceMessage);
	args = normalizeProjectCreateArgs(args);
	const groundingErrors = validateProjectCreationProfileGrounding(args, sourceMessage);
	if (groundingErrors.length > 0) {
		return {
			ok: false,
			result: validationError(toolName, toolCallId, groundingErrors.join('; '))
		};
	}
	return { ok: true, args };
}

function guardProjectCreateFromProjectContext(params: {
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	toolCallId: string;
}): ToolExecutionResult | null {
	const { toolName, args, context, toolCallId } = params;
	const original = context.originalTurnContext;
	const originalProjectId =
		original?.contextType === 'project' && typeof original.entityId === 'string'
			? original.entityId.trim()
			: '';
	if (!originalProjectId) return null;
	const originalProjectName = readTrimmedString(original?.entityName) || 'Project';

	const isCreateProject = toolName === 'create_onto_project';
	const isProjectCreationZoomOut =
		toolName === 'change_chat_context' &&
		isGlobalContextTarget(args.target) &&
		isLikelyNewProjectRequest(args, context);
	if (!isCreateProject && !isProjectCreationZoomOut) return null;
	if (hasConfirmedNewProjectFromProjectContext(context)) return null;

	return {
		success: false,
		error: PROJECT_CREATE_FROM_PROJECT_CONTEXT_WARNING,
		errorType: 'validation_error',
		toolName,
		toolCallId,
		data: {
			type: 'project_creation_confirmation_required',
			message: PROJECT_CREATE_FROM_PROJECT_CONTEXT_WARNING,
			context_shift: {
				new_context: 'project',
				entity_id: originalProjectId,
				entity_name: originalProjectName,
				entity_type: 'project',
				message: PROJECT_CREATE_FROM_PROJECT_CONTEXT_WARNING
			}
		}
	};
}

function guardDuplicateDocumentCreate(params: {
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	toolCallId: string;
	sameTurnDocuments: SameTurnDocumentRegistry;
}): ToolExecutionResult | null {
	const { toolName, args, context, toolCallId, sameTurnDocuments } = params;
	if (toolName !== 'create_onto_document' || hasExplicitDuplicateDocumentIntent(context)) {
		return null;
	}

	const requestedTitle = normalizeDocumentTitleIdentity(args.title);
	if (!requestedTitle) return null;
	const requestedProjectId = readTrimmedString(args.project_id);
	const contextProjectId = resolveProjectIdFromContext(context);
	const candidates = new Map<string, { id: string; title: string }>();
	const addCandidate = (value: unknown): void => {
		if (!isRecord(value)) return;
		const id = readTrimmedString(value.id);
		const title = readTrimmedString(value.title);
		if (!id || !title) return;
		const projectId =
			typeof value.project_id === 'string'
				? value.project_id.trim()
				: typeof value.projectId === 'string'
					? value.projectId.trim()
					: contextProjectId;
		if (requestedProjectId && projectId && projectId !== requestedProjectId) return;
		candidates.set(id, { id, title });
	};

	const entities = context.ontologyContext?.entities;
	addCandidate(entities?.document);
	if (Array.isArray(entities?.documents)) {
		for (const document of entities.documents) addCandidate(document);
	}
	const addTreeCandidates = (nodes: unknown): void => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			addCandidate(node);
			if (isRecord(node)) addTreeCandidates(node.children);
		}
	};
	addTreeCandidates(context.ontologyContext?.metadata?.document_tree?.root);

	const sameTurnCreated = sameTurnDocuments.findByTitle(args.title);
	if (sameTurnCreated) {
		return validationError(
			toolName,
			toolCallId,
			`A document titled "${sameTurnCreated.title}" was already created earlier in this turn` +
				(sameTurnCreated.id ? ` (document_id: ${sameTurnCreated.id})` : '') +
				`. Do not create it again. Use update_onto_document${sameTurnCreated.id ? ` with document_id "${sameTurnCreated.id}"` : ' with that document ID from the earlier create result'} to add the remaining content.`
		);
	}

	const duplicate = [...candidates.values()].find(
		(document) => normalizeDocumentTitleIdentity(document.title) === requestedTitle
	);
	if (!duplicate) return null;
	return validationError(
		toolName,
		toolCallId,
		`A document titled "${duplicate.title}" already exists in the current project ` +
			`(document_id: ${duplicate.id}). Do not create a duplicate. Read that document if needed, ` +
			`then use update_onto_document with document_id "${duplicate.id}" to merge the new content ` +
			`while preserving existing content. Create another copy only when the user explicitly requests a duplicate or separate version.`
	);
}

function applyDocumentDescriptionPolicy(
	toolName: string,
	args: ToolArguments,
	toolCallId: string
): PreflightPolicyResult {
	if (toolName === 'create_onto_document') {
		const description = readTrimmedString(args.description);
		if (!description) {
			return {
				ok: false,
				result: validationError(
					toolName,
					toolCallId,
					'create_onto_document requires a non-empty description'
				)
			};
		}
		return { ok: true, args: { ...args, description } };
	}

	if (toolName === 'create_task_document' && !readTrimmedString(args.document_id)) {
		const description = readTrimmedString(args.description);
		if (!description) {
			return {
				ok: false,
				result: validationError(
					toolName,
					toolCallId,
					'create_task_document requires a non-empty description when creating a document'
				)
			};
		}
		return { ok: true, args: { ...args, description } };
	}

	return { ok: true, args };
}

function findContextDocument(
	context: ServiceContext,
	documentId: string
): Record<string, unknown> | null {
	const entities = context.ontologyContext?.entities;
	const directCandidates = [
		entities?.document,
		...(Array.isArray(entities?.documents) ? entities.documents : [])
	];
	for (const candidate of directCandidates) {
		if (isRecord(candidate) && candidate.id === documentId) return candidate;
	}

	const findInTree = (nodes: unknown): Record<string, unknown> | null => {
		if (!Array.isArray(nodes)) return null;
		for (const node of nodes) {
			if (!isRecord(node)) continue;
			if (node.id === documentId) return node;
			const childMatch = findInTree(node.children);
			if (childMatch) return childMatch;
		}
		return null;
	};
	return findInTree(context.ontologyContext?.metadata?.document_tree?.root);
}

function hasExplicitDuplicateDocumentIntent(context: ServiceContext): boolean {
	const message = getLatestUserMessageText(context);
	if (
		/\b(?:don'?t|do\s+not|never|avoid|without|no|shouldn'?t|should\s+not|won'?t|not)\s+(?:\w+\s+){0,3}(?:duplicate|duplicating|clone|cloning|copies|copy)\b/i.test(
			message
		)
	) {
		return false;
	}
	return (
		/\b(?:duplicate|clone)\b[\s\S]{0,60}\b(?:document|doc|page|version|sheet|note)\b|\b(?:document|doc|page|version|sheet|note)\b[\s\S]{0,60}\b(?:duplicate|clone)\b/i.test(
			message
		) ||
		/\b(?:another|second|separate|extra)\s+(?:copy|version|document|doc|page)\b/i.test(
			message
		) ||
		/\b(?:a|one|the)\s+copy\s+of\s+(?:this|that|the|my)\b/i.test(message) ||
		/\bmake\s+(?:a\s+)?cop(?:y|ies)\b/i.test(message)
	);
}

function isGlobalContextTarget(value: unknown): boolean {
	const normalized = readTrimmedString(value).toLowerCase();
	return normalized === 'global' || normalized === 'workspace' || normalized === 'general';
}

function isLikelyNewProjectRequest(args: ToolArguments, context: ServiceContext): boolean {
	const values =
		`${getLatestUserMessageText(context)} ${readTrimmedString(args.reason)}`.toLowerCase();
	return values.includes('project') && /\b(create|start|new|another|separate)\b/.test(values);
}

function hasConfirmedNewProjectFromProjectContext(context: ServiceContext): boolean {
	const latestUserMessage = getLatestUserMessageText(context).trim().toLowerCase();
	if (!latestUserMessage || !isAffirmativeProjectCreateConfirmation(latestUserMessage)) {
		return false;
	}
	return getPreviousAssistantMessageText(context)
		.toLowerCase()
		.includes(PROJECT_CREATE_CONFIRMATION_MARKER);
}

function isAffirmativeProjectCreateConfirmation(message: string): boolean {
	if (/\b(no|don't|do not|cancel|stop|never mind|nevermind)\b/.test(message)) return false;
	return /\b(yes|yeah|yep|sure|confirm|confirmed|correct|go ahead|do it|create it|make it|new project)\b/.test(
		message
	);
}

function getLatestUserMessageText(context: ServiceContext): string {
	for (let index = context.conversationHistory.length - 1; index >= 0; index -= 1) {
		const message = context.conversationHistory[index];
		if (message?.role === 'user') {
			return typeof message.content === 'string' ? message.content : '';
		}
	}
	return '';
}

function getRecentUserMessageEvidence(context: ServiceContext): string {
	return context.conversationHistory
		.filter(
			(message): message is typeof message & { content: string } =>
				message?.role === 'user' && typeof message.content === 'string'
		)
		.slice(-6)
		.map((message) => message.content.trim())
		.filter(Boolean)
		.join('\n\n')
		.slice(-12_000);
}

function getPreviousAssistantMessageText(context: ServiceContext): string {
	let seenLatestUser = false;
	for (let index = context.conversationHistory.length - 1; index >= 0; index -= 1) {
		const message = context.conversationHistory[index];
		if (!seenLatestUser) {
			if (message?.role === 'user') seenLatestUser = true;
			continue;
		}
		if (message?.role === 'assistant') {
			return typeof message.content === 'string' ? message.content : '';
		}
	}
	return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function validationError(toolName: string, toolCallId: string, error: string): ToolExecutionResult {
	return { success: false, error, errorType: 'validation_error', toolName, toolCallId };
}
