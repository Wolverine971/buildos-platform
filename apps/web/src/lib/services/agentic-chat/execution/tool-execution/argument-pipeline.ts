// apps/web/src/lib/services/agentic-chat/execution/tool-execution/argument-pipeline.ts
import type { ChatMessage, ChatToolDefinition } from '@buildos/shared-types';
import type { ServiceContext } from '../../shared/types';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	cloneToolArguments,
	cloneToolArgumentValue,
	isToolArgumentRecord,
	type ToolArguments
} from './argument-values';
import { getToolParameterSchema, type SupportedToolSchema } from './schema-validator';
import { applySemanticAliases, hasNonEmptyString, readAliasValue } from './tool-argument-adapters';

export interface ArgumentAliasDiagnostics {
	addedSearch: boolean;
	addedQuery: boolean;
	addedSemanticAliases: number;
	addedIdAliases: number;
}

export interface ArgumentPipelineResult {
	args: ToolArguments;
	aliasDiagnostics?: ArgumentAliasDiagnostics;
}

export function runArgumentPipeline({
	toolName,
	args,
	context,
	toolDefinition
}: {
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	toolDefinition?: ChatToolDefinition;
}): ArgumentPipelineResult {
	const parameterSchema = getToolParameterSchema(toolDefinition);
	let resolved = applySchemaDefaults(cloneToolArguments(args), parameterSchema);
	resolved = applyContextDefaults(toolName, resolved, context, parameterSchema);
	const aliases = applyArgumentAliases(toolName, resolved, parameterSchema);
	resolved = normalizeIdFields(aliases.args);

	return {
		args: resolved,
		aliasDiagnostics: aliases.diagnostics
	};
}

export function resolveProjectIdFromContext(context: ServiceContext): string | undefined {
	const scoped = context.contextScope?.projectId;
	if (typeof scoped === 'string' && isValidUUID(scoped)) {
		return scoped;
	}

	if (context.contextType?.startsWith('project') && typeof context.entityId === 'string') {
		if (isValidUUID(context.entityId)) {
			return context.entityId;
		}
	}

	const focusProjectId = context.projectFocus?.projectId;
	if (typeof focusProjectId === 'string' && isValidUUID(focusProjectId)) {
		return focusProjectId;
	}

	return undefined;
}

function applySchemaDefaults(
	args: ToolArguments,
	parameterSchema: SupportedToolSchema | undefined
): ToolArguments {
	if (!parameterSchema) {
		return args;
	}

	const properties = isToolArgumentRecord(parameterSchema.properties)
		? parameterSchema.properties
		: {};
	const resolved: ToolArguments = { ...args };

	for (const [key, definition] of Object.entries(properties)) {
		if (resolved[key] !== undefined && resolved[key] !== null) continue;
		if (!isToolArgumentRecord(definition) || !('default' in definition)) continue;
		if (definition.default !== undefined) {
			resolved[key] = cloneToolArgumentValue(definition.default);
		}
	}

	return resolved;
}

function applyContextDefaults(
	toolName: string,
	args: ToolArguments,
	context: ServiceContext,
	parameterSchema: SupportedToolSchema | undefined
): ToolArguments {
	const resolved: ToolArguments = { ...args };

	if (parameterSchemaSupportsProjectId(parameterSchema)) {
		let shouldInjectProjectId =
			!Object.prototype.hasOwnProperty.call(resolved, 'project_id') ||
			resolved.project_id === undefined;

		if (typeof resolved.project_id === 'string') {
			const trimmed = resolved.project_id.trim();
			if (trimmed) {
				resolved.project_id = trimmed;
				shouldInjectProjectId = false;
			} else {
				delete resolved.project_id;
				shouldInjectProjectId = true;
			}
		} else if (Object.prototype.hasOwnProperty.call(resolved, 'project_id')) {
			shouldInjectProjectId = false;
		}

		if (shouldInjectProjectId) {
			const projectId = resolveProjectIdFromContext(context);
			if (projectId) {
				resolved.project_id = projectId;
			}
		}
	}

	if (
		toolName === 'get_document_tree' &&
		resolved.include_documents === true &&
		resolved.include_content === undefined
	) {
		resolved.include_content = false;
	}

	if (toolName === 'create_onto_document') {
		applyDocumentDefaults(resolved, context.conversationHistory);
	}

	return resolved;
}

function applyDocumentDefaults(resolved: ToolArguments, history: ChatMessage[]): void {
	const nestedDocument = isToolArgumentRecord(resolved.document) ? resolved.document : undefined;

	for (const key of [
		'title',
		'description',
		'type_key',
		'state_key',
		'content',
		'body_markdown',
		'props',
		'parent_id',
		'position'
	]) {
		if (resolved[key] === undefined && nestedDocument?.[key] !== undefined) {
			resolved[key] = nestedDocument[key];
		}
	}

	if (resolved.parent_id === undefined || resolved.parent_id === null) {
		const parentId = [
			resolved.parent_document_id,
			resolved.parentDocumentId,
			nestedDocument?.parent_document_id,
			nestedDocument?.parentDocumentId
		].find((value): value is string => typeof value === 'string');
		if (parentId !== undefined) {
			resolved.parent_id = parentId;
		}
	}

	const resolvedContent = [
		resolved.content,
		resolved.body_markdown,
		resolved.body,
		resolved.text,
		resolved.markdown,
		nestedDocument?.content,
		nestedDocument?.body_markdown,
		nestedDocument?.body,
		nestedDocument?.text,
		nestedDocument?.markdown
	].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
	if (
		(typeof resolved.content !== 'string' || resolved.content.trim().length === 0) &&
		resolvedContent
	) {
		resolved.content = resolvedContent;
	}

	const resolvedDescription = [
		resolved.description,
		resolved.summary,
		resolved.doc_description,
		resolved.document_description,
		nestedDocument?.description,
		nestedDocument?.summary,
		nestedDocument?.doc_description,
		nestedDocument?.document_description
	].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
	if (
		(typeof resolved.description !== 'string' || resolved.description.trim().length === 0) &&
		resolvedDescription
	) {
		resolved.description = resolvedDescription;
	}

	const fallbackTitle = [
		resolved.title,
		resolved.name,
		resolved.document_title,
		resolved.document_name,
		nestedDocument?.title,
		nestedDocument?.name,
		nestedDocument?.document_title,
		nestedDocument?.document_name
	].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
	if (
		(typeof resolved.title !== 'string' || resolved.title.trim().length === 0) &&
		fallbackTitle
	) {
		resolved.title = fallbackTitle.trim();
	}

	const trimmedTypeKey = typeof resolved.type_key === 'string' ? resolved.type_key.trim() : '';
	resolved.type_key = trimmedTypeKey || 'document.default';

	const trimmedTitle = typeof resolved.title === 'string' ? resolved.title.trim() : '';
	if (trimmedTitle) {
		resolved.title = trimmedTitle;
	} else {
		const inferred = inferDocumentTitle(history);
		resolved.title = inferred?.trim() || 'Untitled Document';
	}

	const trimmedDescription =
		typeof resolved.description === 'string' ? resolved.description.trim() : '';
	if (trimmedDescription) {
		resolved.description = trimmedDescription;
	}
}

function applyArgumentAliases(
	toolName: string,
	args: ToolArguments,
	parameterSchema: SupportedToolSchema | undefined
): { args: ToolArguments; diagnostics?: ArgumentAliasDiagnostics } {
	if (!parameterSchema) {
		return { args };
	}

	const properties = isToolArgumentRecord(parameterSchema.properties)
		? parameterSchema.properties
		: {};
	let resolved: ToolArguments = { ...args };
	let mutated = false;
	const supportsSearch = isToolArgumentRecord(properties.search);
	const supportsQuery = isToolArgumentRecord(properties.query);
	const normalizedSearch = typeof resolved.search === 'string' ? resolved.search.trim() : '';
	const normalizedQuery = typeof resolved.query === 'string' ? resolved.query.trim() : '';
	const addedSearch = supportsSearch && !normalizedSearch && Boolean(normalizedQuery);
	const addedQuery = supportsQuery && !normalizedQuery && Boolean(normalizedSearch);

	if (addedSearch) {
		resolved.search = normalizedQuery;
		mutated = true;
	}
	if (addedQuery) {
		resolved.query = normalizedSearch;
		mutated = true;
	}

	const semanticAliasResult = applySemanticAliases(toolName, resolved);
	if (semanticAliasResult.mutated) {
		resolved = semanticAliasResult.args;
		mutated = true;
	}

	const idAliasResult = applyIdAliases(resolved, parameterSchema);
	if (idAliasResult.mutated) {
		resolved = idAliasResult.args;
		mutated = true;
	}

	if (!mutated) {
		return { args };
	}

	return {
		args: resolved,
		diagnostics: {
			addedSearch,
			addedQuery,
			addedSemanticAliases: semanticAliasResult.addedCount,
			addedIdAliases: idAliasResult.addedCount
		}
	};
}

function applyIdAliases(
	args: ToolArguments,
	parameterSchema: SupportedToolSchema
): { args: ToolArguments; mutated: boolean; addedCount: number } {
	const properties = isToolArgumentRecord(parameterSchema.properties)
		? parameterSchema.properties
		: {};
	const required = Array.isArray(parameterSchema.required)
		? parameterSchema.required.filter((value): value is string => typeof value === 'string')
		: [];
	const idKeys = Object.keys(properties).filter((key) => key.endsWith('_id'));
	if (idKeys.length === 0) {
		return { args, mutated: false, addedCount: 0 };
	}

	const resolved: ToolArguments = { ...args };
	let addedCount = 0;
	const requiredIdKeys = idKeys.filter((key) => required.includes(key));
	const missingRequiredIdKeys = requiredIdKeys.filter((key) => !hasNonEmptyString(resolved[key]));
	const canUseGenericId =
		missingRequiredIdKeys.length === 1 &&
		missingRequiredIdKeys[0] !== 'project_id' &&
		hasNonEmptyString(resolved.id) &&
		idKeys.length <= 2;

	for (const idKey of idKeys) {
		if (hasNonEmptyString(resolved[idKey])) continue;
		const alias = findAliasValueForIdKey(idKey, resolved, canUseGenericId);
		if (!alias) continue;
		resolved[idKey] = alias;
		addedCount += 1;
	}

	return {
		args: addedCount > 0 ? resolved : args,
		mutated: addedCount > 0,
		addedCount
	};
}

function findAliasValueForIdKey(
	idKey: string,
	args: ToolArguments,
	allowGenericId: boolean
): string | null {
	const base = idKey.slice(0, -3);
	for (const aliasKey of buildIdAliasKeys(idKey, base, allowGenericId)) {
		const value = readAliasValue(args, aliasKey);
		if (hasNonEmptyString(value)) {
			return value.trim();
		}
	}

	const nestedEntity = args[base];
	if (isToolArgumentRecord(nestedEntity)) {
		const nestedValue = readAliasValue(nestedEntity, 'id');
		if (hasNonEmptyString(nestedValue)) {
			return nestedValue.trim();
		}
	}

	return null;
}

function buildIdAliasKeys(idKey: string, base: string, allowGenericId: boolean): string[] {
	const baseCamel = base.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
	const aliases = new Set<string>([
		idKey,
		`${base}_id`,
		`${base}Id`,
		`${baseCamel}Id`,
		`${baseCamel}_id`,
		`${base}.id`
	]);

	if (idKey === 'document_id') {
		aliases.add('doc_id');
		aliases.add('docId');
		aliases.add('documentId');
		aliases.add('document.id');
	}
	if (idKey === 'event_id') {
		aliases.add('external_event_id');
		aliases.add('externalEventId');
		aliases.add('external_event.id');
		aliases.add('external.id');
	}
	if (idKey === 'new_parent_id') {
		aliases.add('parent_id');
		aliases.add('parentId');
		aliases.add('parent_document_id');
		aliases.add('parentDocumentId');
		aliases.add('parent.id');
	}
	if (allowGenericId) {
		aliases.add('id');
	}

	return Array.from(aliases);
}

function normalizeIdFields(args: ToolArguments): ToolArguments {
	let mutated = false;
	const normalized: ToolArguments = { ...args };
	for (const [key, value] of Object.entries(args)) {
		if (!key.endsWith('_id') || typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed !== value) {
			normalized[key] = trimmed;
			mutated = true;
		}
		if (!trimmed) {
			delete normalized[key];
			mutated = true;
		}
	}
	return mutated ? normalized : args;
}

function parameterSchemaSupportsProjectId(
	parameterSchema: SupportedToolSchema | undefined
): boolean {
	if (!parameterSchema) return false;
	const required = Array.isArray(parameterSchema.required)
		? parameterSchema.required.filter((value): value is string => typeof value === 'string')
		: [];
	const properties = isToolArgumentRecord(parameterSchema.properties)
		? parameterSchema.properties
		: {};
	return 'project_id' in properties || required.includes('project_id');
}

function inferDocumentTitle(history: ChatMessage[]): string | undefined {
	if (!Array.isArray(history) || history.length === 0) return undefined;
	const lastUser = [...history].reverse().find((message) => message.role === 'user');
	if (!lastUser || typeof lastUser.content !== 'string') return undefined;

	for (const pattern of [
		/document\s+(?:named|called|titled)?\s*['"]([^'"]+)['"]/i,
		/['"]([^'"]+)['"]\s+document/i,
		/doc\s+(?:named|called|titled)?\s*['"]([^'"]+)['"]/i
	]) {
		const match = lastUser.content.match(pattern);
		if (match?.[1]) {
			const title = match[1].trim();
			if (title) {
				return title.length > 160 ? `${title.slice(0, 157)}...` : title;
			}
		}
	}

	return undefined;
}
