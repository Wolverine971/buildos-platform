// packages/agentic-chat-runtime/src/loop/project-create-args.ts
type JsonRecord = Record<string, any>;
import { normalizeAgenticChatProjectStateV1 } from './project-semantics';

type ProjectCreateRef = {
	temp_id: string;
	kind: string;
};

const PROJECT_CREATE_COLLECTION_KEYS = ['entities', 'relationships'] as const;

const FACET_STAGE_VALUES = new Set([
	'discovery',
	'planning',
	'execution',
	'launch',
	'maintenance',
	'complete'
]);
const RISK_IMPACT_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const PROJECT_STATE_TO_FALLBACK_STAGE: Record<string, string> = {
	planning: 'planning',
	active: 'planning',
	paused: 'planning',
	completed: 'complete',
	cancelled: 'complete'
};

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function areJsonValuesEquivalent(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;

	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
			return false;
		}
		return left.every((entry, index) => areJsonValuesEquivalent(entry, right[index]));
	}

	if (!isRecord(left) || !isRecord(right)) return false;

	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	if (
		leftKeys.length !== rightKeys.length ||
		leftKeys.some((key, index) => key !== rightKeys[index])
	) {
		return false;
	}

	return leftKeys.every((key) => areJsonValuesEquivalent(left[key], right[key]));
}

/**
 * Repair the common model mistake where project graph collections are nested
 * under `project` instead of being siblings of it. A collection is only moved
 * when there is a single unambiguous value. Conflicting non-empty collections
 * stay in place so validation can reject the payload instead of dropping data.
 */
function normalizeMisplacedProjectCollections<T extends JsonRecord>(args: T): T {
	const project = isRecord(args.project) ? args.project : null;
	if (!project) return args;

	let resolvedArgs: JsonRecord = args;
	let resolvedProject: JsonRecord = project;
	let mutated = false;

	for (const key of PROJECT_CREATE_COLLECTION_KEYS) {
		if (!(key in project)) continue;

		const nestedValue = project[key];
		const topLevelValue = args[key];
		if (!Array.isArray(nestedValue)) continue;

		let resolvedValue: unknown[] | null = null;
		if (topLevelValue === undefined || topLevelValue === null) {
			resolvedValue = nestedValue;
		} else if (Array.isArray(topLevelValue)) {
			if (topLevelValue.length === 0 && nestedValue.length > 0) {
				resolvedValue = nestedValue;
			} else if (
				nestedValue.length === 0 ||
				areJsonValuesEquivalent(topLevelValue, nestedValue)
			) {
				resolvedValue = topLevelValue;
			}
		}

		if (!resolvedValue) continue;
		if (!mutated) {
			resolvedArgs = { ...args };
			resolvedProject = { ...project };
			resolvedArgs.project = resolvedProject;
			mutated = true;
		}

		resolvedArgs[key] = [...resolvedValue];
		delete resolvedProject[key];
	}

	return (mutated ? resolvedArgs : args) as T;
}

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeEnumToken(value: unknown): string | null {
	const trimmed = toNonEmptyString(value);
	if (!trimmed) return null;
	return trimmed.toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeProjectState(value: unknown): string | null {
	return normalizeAgenticChatProjectStateV1(value);
}

function normalizeMisplacedProjectStage(
	value: unknown
): { stateKey: string; stage: string } | null {
	const normalized = normalizeEnumToken(value);
	if (!normalized || FACET_STAGE_VALUES.has(normalized)) return null;

	const stateKey = normalizeProjectState(normalized);
	if (!stateKey) return null;

	return {
		stateKey,
		stage: PROJECT_STATE_TO_FALLBACK_STAGE[stateKey] ?? 'planning'
	};
}

function buildEntityKindIndex(entities: unknown): Map<string, string> {
	const index = new Map<string, string>();
	if (!Array.isArray(entities)) return index;

	for (const entity of entities) {
		if (!isRecord(entity)) continue;
		const tempId = toNonEmptyString(entity.temp_id);
		const kind = toNonEmptyString(entity.kind);
		if (!tempId || !kind) continue;
		index.set(tempId, kind);
	}

	return index;
}

function normalizeRelationshipRef(
	value: unknown,
	entityKindIndex: Map<string, string>
): ProjectCreateRef | null {
	if (typeof value === 'string') {
		const tempId = toNonEmptyString(value);
		if (!tempId) return null;
		const kind = entityKindIndex.get(tempId);
		return kind ? { temp_id: tempId, kind } : null;
	}

	if (!isRecord(value)) return null;

	const tempId = toNonEmptyString(value.temp_id) ?? toNonEmptyString(value.id);
	if (!tempId) return null;
	const kind = toNonEmptyString(value.kind) ?? entityKindIndex.get(tempId) ?? null;
	if (!kind) return null;

	return { temp_id: tempId, kind };
}

function normalizeRelationshipEntry(value: unknown, entityKindIndex: Map<string, string>): unknown {
	if (Array.isArray(value) && value.length === 2) {
		const from = normalizeRelationshipRef(value[0], entityKindIndex);
		const to = normalizeRelationshipRef(value[1], entityKindIndex);
		if (from && to) {
			return [from, to];
		}
		return value;
	}

	if (!isRecord(value)) return value;

	const from = normalizeRelationshipRef(value.from, entityKindIndex);
	const to = normalizeRelationshipRef(value.to, entityKindIndex);
	if (from && to) {
		return {
			...value,
			from,
			to
		};
	}

	return value;
}

function normalizeProjectFacets<T extends JsonRecord>(args: T): T {
	const project = isRecord(args.project) ? args.project : null;
	if (!project) return args;

	const props = isRecord(project.props) ? project.props : null;
	const facets = isRecord(props?.facets) ? props.facets : null;
	if (!facets) return args;

	const misplacedStage = normalizeMisplacedProjectStage(facets.stage);
	if (!misplacedStage) return args;

	const nextProject: JsonRecord = { ...project };
	if (!normalizeProjectState(nextProject.state_key)) {
		nextProject.state_key = misplacedStage.stateKey;
	}

	return {
		...args,
		project: {
			...nextProject,
			props: {
				...props,
				facets: {
					...facets,
					stage: misplacedStage.stage
				}
			}
		}
	} as T;
}

function normalizeRiskImpact(value: unknown): { impact: string; narrative: string | null } | null {
	const raw = toNonEmptyString(value);
	if (!raw) return null;

	const normalized = normalizeEnumToken(raw);
	if (normalized && RISK_IMPACT_VALUES.has(normalized)) {
		return { impact: normalized, narrative: null };
	}

	// Models occasionally put the risk explanation in the enum field, prefixed
	// by the intended severity (for example, "high compliance penalties can …").
	// Recover the enum without discarding the explanation.
	const leadingSeverity = raw.toLowerCase().match(/^(low|medium|high|critical)\b/);
	return leadingSeverity ? { impact: leadingSeverity[1] as string, narrative: raw } : null;
}

function normalizeEntityEnums(entity: unknown): unknown {
	if (!isRecord(entity) || entity.kind !== 'risk' || entity.impact === undefined) {
		return entity;
	}

	const normalizedImpact = normalizeRiskImpact(entity.impact);
	if (!normalizedImpact) return entity;

	const existingContent = toNonEmptyString(entity.content);
	const shouldPreserveNarrative =
		normalizedImpact.narrative !== null &&
		(!existingContent || !existingContent.includes(normalizedImpact.narrative));

	return {
		...entity,
		impact: normalizedImpact.impact,
		...(shouldPreserveNarrative
			? {
					content: existingContent
						? `${existingContent}\n\n${normalizedImpact.narrative}`
						: normalizedImpact.narrative
				}
			: {})
	};
}

function normalizeProjectEntities<T extends JsonRecord>(args: T): T {
	if (!Array.isArray(args.entities)) return args;

	return {
		...args,
		entities: args.entities.map(normalizeEntityEnums)
	} as T;
}

function validateRelationshipRef(
	value: unknown,
	entityKindIndex: Map<string, string>,
	label: string,
	errors: string[]
): void {
	if (typeof value === 'string') {
		const tempId = toNonEmptyString(value);
		if (!tempId) {
			errors.push(`Invalid ${label}: temp_id string cannot be empty.`);
			return;
		}
		if (!entityKindIndex.has(tempId)) {
			errors.push(
				`Invalid ${label}: raw temp_id "${tempId}" must match an entity in args.entities so kind can be resolved.`
			);
		}
		return;
	}

	if (!isRecord(value)) {
		errors.push(`Invalid ${label}: expected an object with temp_id and kind.`);
		return;
	}

	const tempId = toNonEmptyString(value.temp_id) ?? toNonEmptyString(value.id);
	if (!tempId) {
		errors.push(`Invalid ${label}: missing temp_id.`);
		return;
	}

	const kind = toNonEmptyString(value.kind) ?? entityKindIndex.get(tempId) ?? null;
	if (!kind) {
		errors.push(
			`Invalid ${label}: missing kind for temp_id "${tempId}". Include kind explicitly or ensure the temp_id exists in args.entities.`
		);
	}
}

export function normalizeProjectCreateArgs<T extends JsonRecord>(args: T): T {
	const normalizedArgs = normalizeProjectEntities(
		normalizeProjectFacets(normalizeMisplacedProjectCollections(args))
	);

	if (!Array.isArray(normalizedArgs.relationships)) {
		return normalizedArgs;
	}

	const entityKindIndex = buildEntityKindIndex(normalizedArgs.entities);
	const normalizedRelationships = normalizedArgs.relationships.map((entry: unknown) =>
		normalizeRelationshipEntry(entry, entityKindIndex)
	);

	return {
		...normalizedArgs,
		relationships: normalizedRelationships
	};
}

export function validateProjectCreateArgs(args: JsonRecord): string[] {
	const errors: string[] = [];
	const normalizedArgs = normalizeProjectCreateArgs(args);
	const project = isRecord(normalizedArgs.project) ? normalizedArgs.project : null;

	if (!project) {
		errors.push('Missing required parameter: project');
	} else {
		if (!toNonEmptyString(project.name)) {
			errors.push('Missing required parameter: project.name');
		}
		if (!toNonEmptyString(project.type_key)) {
			errors.push('Missing required parameter: project.type_key');
		}
		const facets = isRecord(project.props) ? project.props.facets : null;
		if (isRecord(facets)) {
			const stage = normalizeEnumToken(facets.stage);
			if (stage && !FACET_STAGE_VALUES.has(stage)) {
				errors.push(
					`Invalid project.props.facets.stage: must be one of ${Array.from(
						FACET_STAGE_VALUES
					).join(', ')}. Use project.state_key for status values like active or paused.`
				);
			}
		}

		for (const key of PROJECT_CREATE_COLLECTION_KEYS) {
			if (!(key in project)) continue;

			const nestedValue = project[key];
			if (!Array.isArray(nestedValue)) {
				errors.push(
					`Invalid misplaced parameter project.${key}: expected an array. Remove it and use top-level ${key}.`
				);
				continue;
			}

			const topLevelValue = normalizedArgs[key];
			if (Array.isArray(topLevelValue)) {
				errors.push(
					`Conflicting parameters: ${key} and project.${key} contain different non-empty arrays. Keep the intended value only at top-level ${key}.`
				);
			} else {
				errors.push(
					`Misplaced parameter project.${key}: move this array to top-level ${key}.`
				);
			}
		}
	}

	if (!Array.isArray(normalizedArgs.entities)) {
		errors.push(
			normalizedArgs.entities === undefined || normalizedArgs.entities === null
				? 'Missing required parameter: entities'
				: 'Invalid parameter entities: expected an array.'
		);
	}

	if (!Array.isArray(normalizedArgs.relationships)) {
		errors.push(
			normalizedArgs.relationships === undefined || normalizedArgs.relationships === null
				? 'Missing required parameter: relationships'
				: 'Invalid parameter relationships: expected an array.'
		);
		return errors;
	}

	const entityKindIndex = buildEntityKindIndex(normalizedArgs.entities);
	for (let index = 0; index < normalizedArgs.relationships.length; index += 1) {
		const relationship = normalizedArgs.relationships[index];
		const label = `relationships[${index}]`;

		if (Array.isArray(relationship)) {
			if (relationship.length !== 2) {
				errors.push(
					`Invalid ${label}: expected { from: { temp_id, kind }, to: { temp_id, kind }, rel?, intent? }.`
				);
				continue;
			}

			validateRelationshipRef(relationship[0], entityKindIndex, `${label}[0]`, errors);
			validateRelationshipRef(relationship[1], entityKindIndex, `${label}[1]`, errors);
			continue;
		}

		if (!isRecord(relationship)) {
			errors.push(
				`Invalid ${label}: expected { from: { temp_id, kind }, to: { temp_id, kind }, rel?, intent? }.`
			);
			continue;
		}

		if (!('from' in relationship) || !('to' in relationship)) {
			errors.push(
				`Invalid ${label}: expected { from: { temp_id, kind }, to: { temp_id, kind }, rel?, intent? }.`
			);
			continue;
		}

		validateRelationshipRef(relationship.from, entityKindIndex, `${label}.from`, errors);
		validateRelationshipRef(relationship.to, entityKindIndex, `${label}.to`, errors);
	}

	return errors;
}
