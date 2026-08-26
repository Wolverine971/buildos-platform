// packages/shared-agent-ops/src/proposal-context/verify-operations.ts
import { createHash } from 'node:crypto';
import type { LoopOperation, ProjectSuggestionPreview } from '@buildos/shared-types';
import { buildProjectLoopParentMap } from '../project-loops';
import {
	formatLoopOperationValue,
	humanizeLoopOperationKey,
	type DecodedLoopOperation,
	type DecodedLoopOperationFieldChange
} from './decode-operations';

type AnySupabase = any;

type ResolvedEntityKind = 'document' | 'task';

type ResolvedEntity = {
	id: string;
	project_id: string;
	title: string;
	state_key: string | null;
	deleted_at: string | null;
	archived_at: string | null;
};

export type ProjectSuggestionIntegrityCode =
	| 'INVALID_PROJECT'
	| 'INVALID_OPERATION'
	| 'UNSUPPORTED_OPERATION'
	| 'OPERATION_PROJECT_MISMATCH'
	| 'ENTITY_NOT_FOUND'
	| 'ENTITY_PROJECT_MISMATCH'
	| 'ENTITY_INACTIVE'
	| 'INVALID_DESTINATION'
	| 'NO_OP_OPERATION'
	| 'MODEL_ENTITY_MISMATCH'
	| 'PREVIEW_OPERATION_COUNT_MISMATCH'
	| 'EXPECTED_STATE_CHANGED'
	| 'RESOLUTION_FAILED';

export type ProjectSuggestionIntegrityDiagnostic = {
	code: ProjectSuggestionIntegrityCode;
	message: string;
	operation_index?: number;
	tool?: string;
	entity_kind?: ResolvedEntityKind;
	entity_id?: string;
	expected_project_id?: string;
	actual_project_id?: string;
	resolved_entity_title?: string;
	resolved_destination_title?: string;
	expected_operation_count?: number;
	preview_operation_count?: number;
};

export type VerifiedProjectSuggestionChangeSummary = {
	headline: string;
	operation_count: number;
	operations: Array<DecodedLoopOperation & { key: string }>;
	structural_fingerprint: string;
	verified_at: string;
};

export type ProjectSuggestionIntegrityResult =
	| { ok: true; summary: VerifiedProjectSuggestionChangeSummary }
	| { ok: false; diagnostic: ProjectSuggestionIntegrityDiagnostic };

export type ProjectSuggestionIntegrityInput = {
	projectId: string;
	operations: LoopOperation[];
	title?: string | null;
	preview?: ProjectSuggestionPreview | Record<string, unknown> | null;
	checkModelAlignment?: boolean;
	expectedStructuralFingerprint?: string | null;
};

const SUPPORTED_TOOLS = new Set([
	'move_document_in_tree',
	'update_onto_document',
	'update_onto_task'
]);

const NAME_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'by',
	'for',
	'from',
	'in',
	'into',
	'of',
	'on',
	'or',
	'the',
	'to',
	'under',
	'with'
]);

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function previewText(preview: ProjectSuggestionIntegrityInput['preview']): string {
	const record = asRecord(preview);
	if (!record) return '';
	return [
		record.summary,
		record.impact,
		...(Array.isArray(record.before) ? record.before : []),
		...(Array.isArray(record.after) ? record.after : [])
	]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
}

function normalizedTokens(value: string): string[] {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter((token) => token.length >= 2 && !NAME_STOP_WORDS.has(token));
}

/**
 * Entity titles often carry a descriptive suffix while model labels use the
 * concise prefix (for example, "Instagram Saves Engine — Architecture"). A
 * normalized containment check handles that case; token coverage is the
 * fallback for punctuation and small wording differences.
 */
export function projectSuggestionTextNamesEntity(text: string, entityTitle: string): boolean {
	const normalizedText = normalizedTokens(text).join(' ');
	const normalizedTitle = normalizedTokens(entityTitle).join(' ');
	if (!normalizedText || !normalizedTitle) return false;
	if (normalizedText.includes(normalizedTitle) || normalizedTitle.includes(normalizedText)) {
		return true;
	}

	const textTokens = new Set(normalizedTokens(text));
	const titleTokens = normalizedTokens(entityTitle);
	const overlap = titleTokens.filter((token) => textTokens.has(token)).length;
	const required = Math.min(3, Math.max(2, Math.ceil(titleTokens.length * 0.5)));
	return overlap >= required;
}

function readPreviewOperationCount(
	preview: ProjectSuggestionIntegrityInput['preview']
): number | null {
	const text = previewText(preview);
	if (!text) return null;
	const explicit = text.match(/\b(\d+)\s+(?:document\s+)?(?:moves?|changes?|operations?)\b/i);
	const count = explicit?.[1];
	return count ? Number.parseInt(count, 10) : null;
}

function readTreeState(docStructure: unknown): {
	parentById: Map<string, string | null>;
	positionById: Map<string, number>;
} {
	const parentById = buildProjectLoopParentMap(docStructure);
	const positionById = new Map<string, number>();
	const root =
		docStructure && typeof docStructure === 'object' && 'root' in (docStructure as object)
			? (docStructure as { root?: unknown }).root
			: docStructure;
	const visit = (nodes: unknown) => {
		if (!Array.isArray(nodes)) return;
		for (let index = 0; index < nodes.length; index += 1) {
			const node = asRecord(nodes[index]);
			const id = asString(node?.id);
			if (!id) continue;
			positionById.set(id, index);
			visit(node?.children);
		}
	};
	visit(root);
	return { parentById, positionById };
}

function isInactive(entity: ResolvedEntity): boolean {
	return (
		Boolean(entity.deleted_at) || Boolean(entity.archived_at) || entity.state_key === 'archived'
	);
}

function entityDiagnostic(params: {
	entity: ResolvedEntity | undefined;
	entityId: string;
	entityKind: ResolvedEntityKind;
	projectId: string;
	operationIndex: number;
	tool: string;
}): ProjectSuggestionIntegrityDiagnostic | null {
	if (!params.entity) {
		return {
			code: 'ENTITY_NOT_FOUND',
			message: `${params.entityKind} ${params.entityId} no longer exists`,
			operation_index: params.operationIndex,
			tool: params.tool,
			entity_kind: params.entityKind,
			entity_id: params.entityId,
			expected_project_id: params.projectId
		};
	}
	if (params.entity.project_id !== params.projectId) {
		return {
			code: 'ENTITY_PROJECT_MISMATCH',
			message: `${params.entityKind} ${params.entityId} belongs to another project`,
			operation_index: params.operationIndex,
			tool: params.tool,
			entity_kind: params.entityKind,
			entity_id: params.entityId,
			expected_project_id: params.projectId,
			actual_project_id: params.entity.project_id
		};
	}
	if (isInactive(params.entity)) {
		return {
			code: 'ENTITY_INACTIVE',
			message: `${params.entityKind} "${params.entity.title}" is archived or deleted`,
			operation_index: params.operationIndex,
			tool: params.tool,
			entity_kind: params.entityKind,
			entity_id: params.entityId,
			expected_project_id: params.projectId,
			actual_project_id: params.entity.project_id
		};
	}
	return null;
}

function modelTextForOperation(
	operation: LoopOperation,
	input: ProjectSuggestionIntegrityInput
): string {
	return [operation.label, input.title, previewText(input.preview)]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
}

function targetTextForOperation(
	operation: LoopOperation,
	input: ProjectSuggestionIntegrityInput
): string {
	const args = asRecord(operation.args);
	const operationSpecificText = [operation.label, args?.title, args?.name]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
	// A multi-operation proposal must identify each operation's own target. Using
	// the aggregate preview here would let swapped IDs pass whenever both entity
	// names happened to appear somewhere in the proposal.
	return input.operations.length > 1
		? operationSpecificText
		: modelTextForOperation(operation, input);
}

function updateChanges(args: Record<string, unknown>): DecodedLoopOperationFieldChange[] {
	const props = asRecord(args.props);
	if (!props) return [];
	return Object.entries(props).map(([key, value]) => ({
		label: humanizeLoopOperationKey(key),
		value: formatLoopOperationValue(value)
	}));
}

function structuralFingerprint(parts: unknown[]): string {
	const canonicalize = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(canonicalize);
		const record = asRecord(value);
		if (!record) return value;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, canonicalize(record[key])])
		);
	};
	return createHash('sha256')
		.update(JSON.stringify(canonicalize(parts)))
		.digest('hex');
}

function listWithAnd(values: string[]): string {
	if (values.length <= 1) return values[0] ?? '';
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function verifiedHeadline(operations: DecodedLoopOperation[]): string {
	if (operations.length === 1) return operations[0]?.summary ?? 'Apply 1 verified change.';
	const moves = operations.filter((operation) => operation.action === 'move');
	const destinations = new Set(
		moves.map(
			(operation) =>
				operation.changes.find((change) => change.label === 'New location')?.value
		)
	);
	if (moves.length === operations.length && destinations.size === 1) {
		const destination = [...destinations][0] ?? 'the verified destination';
		return `Move ${listWithAnd(moves.map((operation) => `"${operation.target}"`))} under "${destination}".`;
	}
	return `Apply ${operations.length} verified changes.`;
}

function normalizeEntityRows(rows: unknown): Map<string, ResolvedEntity> {
	const byId = new Map<string, ResolvedEntity>();
	for (const value of Array.isArray(rows) ? rows : []) {
		const row = asRecord(value);
		const id = asString(row?.id);
		const projectId = asString(row?.project_id);
		const title = asString(row?.title) ?? asString(row?.name);
		if (!id || !projectId || !title) continue;
		byId.set(id, {
			id,
			project_id: projectId,
			title,
			state_key: asString(row?.state_key),
			deleted_at: asString(row?.deleted_at),
			archived_at: asString(row?.archived_at)
		});
	}
	return byId;
}

function idsForOperations(operations: LoopOperation[]): {
	documentIds: Set<string>;
	taskIds: Set<string>;
} {
	const documentIds = new Set<string>();
	const taskIds = new Set<string>();
	for (const operation of operations) {
		const args = asRecord(operation.args) ?? {};
		const documentId = asString(args.document_id);
		const parentId = asString(args.new_parent_id);
		const taskId = asString(args.task_id);
		const conflictTaskId = asString(asRecord(args.props)?.loop_conflict_with_task_id);
		if (documentId) documentIds.add(documentId);
		if (parentId) documentIds.add(parentId);
		if (taskId) taskIds.add(taskId);
		if (conflictTaskId) taskIds.add(conflictTaskId);
	}
	return { documentIds, taskIds };
}

function isDescendant(
	parentById: Map<string, string | null>,
	candidateId: string,
	ancestorId: string
): boolean {
	let current: string | null | undefined = candidateId;
	const visited = new Set<string>();
	while (current && !visited.has(current)) {
		if (current === ancestorId) return true;
		visited.add(current);
		current = parentById.get(current);
	}
	return false;
}

export async function verifyProjectSuggestionIntegrity(
	supabase: AnySupabase,
	input: ProjectSuggestionIntegrityInput
): Promise<ProjectSuggestionIntegrityResult> {
	if (!input.projectId || !Array.isArray(input.operations) || input.operations.length === 0) {
		return {
			ok: false,
			diagnostic: {
				code: 'INVALID_OPERATION',
				message: 'Executable proposals require a project and at least one operation'
			}
		};
	}

	try {
		for (let index = 0; index < input.operations.length; index += 1) {
			const operation = input.operations[index];
			if (!operation || !SUPPORTED_TOOLS.has(operation.tool)) {
				return {
					ok: false,
					diagnostic: {
						code: 'UNSUPPORTED_OPERATION',
						message: `Project Review cannot safely resolve operation ${operation?.tool ?? '(missing)'}`,
						operation_index: index,
						tool: operation?.tool
					}
				};
			}
			const args = asRecord(operation.args);
			if (!args) {
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `Operation ${index + 1} has no arguments`,
						operation_index: index,
						tool: operation.tool
					}
				};
			}
			const operationProjectId = asString(args.project_id);
			if (operationProjectId !== input.projectId) {
				return {
					ok: false,
					diagnostic: {
						code: 'OPERATION_PROJECT_MISMATCH',
						message: `Operation ${index + 1} is not scoped to the suggestion project`,
						operation_index: index,
						tool: operation.tool,
						expected_project_id: input.projectId,
						actual_project_id: operationProjectId ?? undefined
					}
				};
			}
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, doc_structure, deleted_at, archived_at')
			.eq('id', input.projectId)
			.maybeSingle();
		if (projectError) throw projectError;
		if (!project || project.deleted_at || project.archived_at) {
			return {
				ok: false,
				diagnostic: {
					code: 'INVALID_PROJECT',
					message: 'The proposal project is missing, archived, or deleted',
					expected_project_id: input.projectId
				}
			};
		}

		const tree = readTreeState(project.doc_structure);
		const ids = idsForOperations(input.operations);
		for (const documentId of [...ids.documentIds]) {
			const parentId = tree.parentById.get(documentId);
			if (parentId) ids.documentIds.add(parentId);
		}

		const [documentResult, taskResult] = await Promise.all([
			ids.documentIds.size
				? supabase
						.from('onto_documents')
						.select('id, project_id, title, state_key, deleted_at, archived_at')
						.in('id', [...ids.documentIds])
				: Promise.resolve({ data: [], error: null }),
			ids.taskIds.size
				? supabase
						.from('onto_tasks')
						.select('id, project_id, title, state_key, deleted_at, archived_at')
						.in('id', [...ids.taskIds])
				: Promise.resolve({ data: [], error: null })
		]);
		if (documentResult.error) throw documentResult.error;
		if (taskResult.error) throw taskResult.error;
		const documents = normalizeEntityRows(documentResult.data);
		const tasks = normalizeEntityRows(taskResult.data);

		const decoded: Array<DecodedLoopOperation & { key: string }> = [];
		const structuralParts: unknown[] = [];
		for (const [index, operation] of input.operations.entries()) {
			const args = asRecord(operation.args) ?? {};
			const modelText = modelTextForOperation(operation, input);
			const targetText = targetTextForOperation(operation, input);

			if (operation.tool === 'move_document_in_tree') {
				const documentId = asString(args.document_id);
				if (!documentId) {
					return {
						ok: false,
						diagnostic: {
							code: 'INVALID_OPERATION',
							message: 'move_document_in_tree requires document_id',
							operation_index: index,
							tool: operation.tool
						}
					};
				}
				const target = documents.get(documentId);
				const targetError = entityDiagnostic({
					entity: target,
					entityId: documentId,
					entityKind: 'document',
					projectId: input.projectId,
					operationIndex: index,
					tool: operation.tool
				});
				if (targetError) return { ok: false, diagnostic: targetError };

				const rawParent = args.new_parent_id;
				if (
					rawParent !== null &&
					rawParent !== undefined &&
					typeof rawParent !== 'string'
				) {
					return {
						ok: false,
						diagnostic: {
							code: 'INVALID_DESTINATION',
							message: 'Move destination must be a document ID or top level',
							operation_index: index,
							tool: operation.tool
						}
					};
				}
				const parentId = asString(rawParent);
				const destination = parentId ? documents.get(parentId) : undefined;
				if (parentId) {
					const destinationError = entityDiagnostic({
						entity: destination,
						entityId: parentId,
						entityKind: 'document',
						projectId: input.projectId,
						operationIndex: index,
						tool: operation.tool
					});
					if (destinationError) return { ok: false, diagnostic: destinationError };
					if (
						parentId === documentId ||
						isDescendant(tree.parentById, parentId, documentId)
					) {
						return {
							ok: false,
							diagnostic: {
								code: 'INVALID_DESTINATION',
								message: `Document "${target!.title}" cannot move under itself or a descendant`,
								operation_index: index,
								tool: operation.tool,
								entity_kind: 'document',
								entity_id: parentId
							}
						};
					}
				}

				const currentParentId = tree.parentById.get(documentId) ?? null;
				const currentPosition = tree.positionById.get(documentId) ?? null;
				const nextPosition =
					typeof args.new_position === 'number' && Number.isInteger(args.new_position)
						? args.new_position
						: 0;
				if (currentParentId === parentId && currentPosition === nextPosition) {
					return {
						ok: false,
						diagnostic: {
							code: 'NO_OP_OPERATION',
							message: `Document "${target!.title}" is already at the proposed destination and position`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: 'document',
							entity_id: documentId,
							resolved_entity_title: target!.title,
							resolved_destination_title: destination?.title
						}
					};
				}

				if (
					input.checkModelAlignment !== false &&
					(!projectSuggestionTextNamesEntity(targetText, target!.title) ||
						(destination &&
							!projectSuggestionTextNamesEntity(modelText, destination.title)))
				) {
					return {
						ok: false,
						diagnostic: {
							code: 'MODEL_ENTITY_MISMATCH',
							message: `Model-authored proposal text does not name the resolved move target or destination`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: 'document',
							entity_id: documentId,
							resolved_entity_title: target!.title,
							resolved_destination_title: destination?.title
						}
					};
				}

				const currentParent = currentParentId ? documents.get(currentParentId) : undefined;
				const destinationName = destination?.title ?? 'Top level';
				const changes: DecodedLoopOperationFieldChange[] = [
					{ label: 'Current location', value: currentParent?.title ?? 'Top level' },
					{ label: 'New location', value: destinationName },
					{ label: 'Position', value: String(nextPosition) }
				];
				decoded.push({
					key: `${operation.tool}:${documentId}:${index}`,
					action: 'move',
					actionLabel: 'Move',
					entityLabel: 'document',
					target: target!.title,
					summary: `Move "${target!.title}" ${destination ? `under "${destination.title}"` : 'to the top level'}.`,
					changes
				});
				structuralParts.push({
					tool: operation.tool,
					target_id: documentId,
					target_project_id: target!.project_id,
					target_state: target!.state_key,
					current_parent_id: currentParentId,
					current_position: currentPosition,
					destination_id: parentId,
					destination_project_id: destination?.project_id ?? null,
					destination_state: destination?.state_key ?? null,
					new_position: nextPosition
				});
				continue;
			}

			const entityKind: ResolvedEntityKind =
				operation.tool === 'update_onto_task' ? 'task' : 'document';
			const entityId = asString(entityKind === 'task' ? args.task_id : args.document_id);
			if (!entityId) {
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `${operation.tool} requires ${entityKind}_id`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind
					}
				};
			}
			const entity = entityKind === 'task' ? tasks.get(entityId) : documents.get(entityId);
			const targetError = entityDiagnostic({
				entity,
				entityId,
				entityKind,
				projectId: input.projectId,
				operationIndex: index,
				tool: operation.tool
			});
			if (targetError) return { ok: false, diagnostic: targetError };

			const conflictId = asString(asRecord(args.props)?.loop_conflict_with_task_id);
			const conflictTask = conflictId ? tasks.get(conflictId) : undefined;
			if (conflictId) {
				const conflictError = entityDiagnostic({
					entity: conflictTask,
					entityId: conflictId,
					entityKind: 'task',
					projectId: input.projectId,
					operationIndex: index,
					tool: operation.tool
				});
				if (conflictError) return { ok: false, diagnostic: conflictError };
			}

			if (
				input.checkModelAlignment !== false &&
				(!projectSuggestionTextNamesEntity(targetText, entity!.title) ||
					(conflictTask &&
						!projectSuggestionTextNamesEntity(modelText, conflictTask.title)))
			) {
				return {
					ok: false,
					diagnostic: {
						code: 'MODEL_ENTITY_MISMATCH',
						message: `Model-authored proposal text does not name the resolved ${entityKind} target`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind,
						entity_id: entityId,
						resolved_entity_title: entity!.title,
						resolved_destination_title: conflictTask?.title
					}
				};
			}

			const changes = updateChanges(args);
			if (changes.length === 0) {
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `${operation.tool} has no property changes`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind,
						entity_id: entityId
					}
				};
			}
			const isOutdatedFlag =
				entityKind === 'document' && asRecord(args.props)?.loop_flagged_outdated === true;
			const summary = isOutdatedFlag
				? `Mark "${entity!.title}" as outdated.`
				: conflictTask
					? `Flag "${entity!.title}" for review against "${conflictTask.title}".`
					: `Update ${entityKind} "${entity!.title}".`;
			decoded.push({
				key: `${operation.tool}:${entityId}:${index}`,
				action: 'update',
				actionLabel: 'Update',
				entityLabel: entityKind,
				target: entity!.title,
				summary,
				changes
			});
			structuralParts.push({
				tool: operation.tool,
				target_id: entityId,
				target_project_id: entity!.project_id,
				target_state: entity!.state_key,
				target_parent_id:
					entityKind === 'document' ? (tree.parentById.get(entityId) ?? null) : null,
				target_position:
					entityKind === 'document' ? (tree.positionById.get(entityId) ?? null) : null,
				proposed_props: asRecord(args.props),
				referenced_task_id: conflictId,
				referenced_task_project_id: conflictTask?.project_id ?? null,
				referenced_task_state: conflictTask?.state_key ?? null
			});
		}

		if (input.checkModelAlignment !== false) {
			const previewCount = readPreviewOperationCount(input.preview);
			if (previewCount !== null && previewCount !== input.operations.length) {
				return {
					ok: false,
					diagnostic: {
						code: 'PREVIEW_OPERATION_COUNT_MISMATCH',
						message: `Preview describes ${previewCount} changes but ${input.operations.length} operations would execute`,
						expected_operation_count: input.operations.length,
						preview_operation_count: previewCount
					}
				};
			}
		}

		const fingerprint = structuralFingerprint(structuralParts);
		if (
			input.expectedStructuralFingerprint &&
			input.expectedStructuralFingerprint !== fingerprint
		) {
			return {
				ok: false,
				diagnostic: {
					code: 'EXPECTED_STATE_CHANGED',
					message:
						'The proposal structure or resolved entity state changed after verification'
				}
			};
		}

		return {
			ok: true,
			summary: {
				headline: verifiedHeadline(decoded),
				operation_count: decoded.length,
				operations: decoded,
				structural_fingerprint: fingerprint,
				verified_at: new Date().toISOString()
			}
		};
	} catch (error) {
		return {
			ok: false,
			diagnostic: {
				code: 'RESOLUTION_FAILED',
				message:
					error instanceof Error
						? `Failed to resolve proposal operations: ${error.message}`
						: 'Failed to resolve proposal operations'
			}
		};
	}
}

export const PROJECT_SUGGESTION_VERIFIED_PREFIX = 'proposal_verified:';
export const PROJECT_SUGGESTION_QUARANTINED_PREFIX = 'proposal_quarantined:';

export function projectSuggestionVerifiedSourceStatus(structuralFingerprint: string): string {
	return `${PROJECT_SUGGESTION_VERIFIED_PREFIX}${structuralFingerprint}`;
}

export function readProjectSuggestionStructuralFingerprint(sourceStatus: unknown): string | null {
	const value = asString(sourceStatus);
	return value?.startsWith(PROJECT_SUGGESTION_VERIFIED_PREFIX)
		? value.slice(PROJECT_SUGGESTION_VERIFIED_PREFIX.length) || null
		: null;
}

export function projectSuggestionQuarantinedSourceStatus(
	diagnostic: ProjectSuggestionIntegrityDiagnostic
): string {
	return `${PROJECT_SUGGESTION_QUARANTINED_PREFIX}${diagnostic.code.toLowerCase()}`;
}

export function serializeProjectSuggestionIntegrityDiagnostic(
	diagnostic: ProjectSuggestionIntegrityDiagnostic
): string {
	return JSON.stringify({
		type: 'project_suggestion_integrity',
		...diagnostic
	});
}
