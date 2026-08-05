// apps/web/src/lib/services/agentic-chat/execution/tool-execution/same-turn-ontology-ownership.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createLogger } from '$lib/utils/logger';
import type { ServiceContext } from '../../shared/types';
import { extractAffectedEntitiesFromToolExecution } from '../../tools/core/affected-entities';
import { resolveProjectIdFromContext } from './argument-pipeline';
import type { ToolArguments } from './argument-values';
import {
	extractOntologyScopeEvidence,
	type ProjectScopedOntologyKind
} from './ontology-scope-evidence';
import { normalizeProjectScopedEntityKind } from './scope-guards';

const logger = createLogger('ToolExecutionService');

export class SameTurnOntologyOwnershipRegistry {
	private readonly projectIds = new Map<string, string | null>();

	asReadonlyMap(): ReadonlyMap<string, string | null> {
		return this.projectIds;
	}

	rememberCreated(
		toolName: string,
		args: ToolArguments,
		result: unknown,
		context: ServiceContext
	): void {
		const createdEntities = extractAffectedEntitiesFromToolExecution({
			tool_name: toolName,
			arguments: args,
			result,
			success: true
		});
		const argsProjectId = readUuid(args.project_id);
		const contextProjectId = readUuid(resolveProjectIdFromContext(context));

		for (const entity of createdEntities) {
			if (entity.operation !== 'created') continue;
			const kind = normalizeProjectScopedEntityKind(entity.kind);
			const entityId = readUuid(entity.id);
			if (!kind || !entityId) continue;

			let projectId: string | undefined;
			if (kind === 'project') {
				projectId = entityId;
			} else {
				const resultProjectId = readUuid(entity.projectId);
				const projectIds = new Set(
					[resultProjectId, argsProjectId, contextProjectId].filter(
						(value): value is string => Boolean(value)
					)
				);
				if (projectIds.size > 1) {
					logger.warn('Skipped inconsistent same-turn ontology entity registration', {
						toolName,
						kind,
						entityId,
						resultProjectId,
						argsProjectId,
						contextProjectId
					});
					continue;
				}
				projectId = projectIds.values().next().value;
			}

			if (projectId) this.remember(kind, entityId, projectId, toolName);
		}

		this.rememberProjectInstantiation(toolName, result);
	}

	rememberLoaded(toolName: string, args: ToolArguments, result: unknown): void {
		const evidence = extractOntologyScopeEvidence({ toolName, args, result });
		for (const entity of evidence) {
			this.remember(entity.kind, entity.entityId, entity.projectId, toolName);
		}
	}

	applyMutation(toolName: string, args: ToolArguments, result: unknown): void {
		if (toolName === 'move_onto_task') {
			const resultRecord = asRecord(result);
			const status = typeof resultRecord?.status === 'string' ? resultRecord.status : '';
			if (status !== 'moved' && status !== 'already_moved') return;
			const taskId = readUuid(args.task_id);
			const destinationProjectId = readUuid(args.destination_project_id);
			if (taskId && destinationProjectId) {
				this.projectIds.set(`task:${taskId}`, destinationProjectId);
			}
			return;
		}

		if (!toolName.startsWith('delete_onto_')) return;
		const kind = normalizeProjectScopedEntityKind(toolName.slice('delete_onto_'.length));
		if (!kind) return;
		const entityId = readUuid(args[`${kind}_id`]);
		if (entityId) this.projectIds.set(`${kind}:${entityId}`, null);
	}

	private rememberProjectInstantiation(toolName: string, result: unknown): void {
		if (toolName !== 'create_onto_project') return;
		const resultRecord = asRecord(result);
		const projectId = readUuid(resultRecord?.project_id);
		if (!projectId || !Array.isArray(resultRecord?.created_entities)) return;

		for (const value of resultRecord.created_entities) {
			const entity = asRecord(value);
			const kind = normalizeProjectScopedEntityKind(entity?.kind);
			const entityId = readUuid(entity?.id);
			if (!entity || !kind || !entityId) continue;

			const expectedProjectId = kind === 'project' ? entityId : projectId;
			const claimedProjectId = readUuid(entity.project_id);
			if (
				(kind === 'project' && entityId !== projectId) ||
				(claimedProjectId && claimedProjectId !== expectedProjectId)
			) {
				logger.warn('Skipped inconsistent project-instantiation entity registration', {
					toolName,
					kind,
					entityId,
					projectId,
					claimedProjectId
				});
				continue;
			}

			this.remember(kind, entityId, expectedProjectId, toolName);
		}
	}

	private remember(
		kind: ProjectScopedOntologyKind,
		entityId: string,
		projectId: string,
		sourceTool: string
	): void {
		const key = `${kind}:${entityId}`;
		if (!this.projectIds.has(key)) {
			this.projectIds.set(key, projectId);
			return;
		}

		const existingProjectId = this.projectIds.get(key);
		if (existingProjectId === null || existingProjectId === projectId) return;

		this.projectIds.set(key, null);
		logger.warn('Conflicting same-turn ontology entity ownership evidence', {
			sourceTool,
			kind,
			entityId,
			existingProjectId,
			projectId
		});
	}
}

function readUuid(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return isValidUUID(trimmed) ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
