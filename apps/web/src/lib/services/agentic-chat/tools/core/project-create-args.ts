type JsonRecord = Record<string, any>;

type ProjectCreateRef = {
	temp_id: string;
	kind: string;
};

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
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

function normalizeRelationshipEntry(
	value: unknown,
	entityKindIndex: Map<string, string>
): unknown {
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
	if (!Array.isArray(args.relationships)) {
		return args;
	}

	const entityKindIndex = buildEntityKindIndex(args.entities);
	const normalizedRelationships = args.relationships.map((entry: unknown) =>
		normalizeRelationshipEntry(entry, entityKindIndex)
	);

	return {
		...args,
		relationships: normalizedRelationships
	};
}

export function validateProjectCreateArgs(args: JsonRecord): string[] {
	const errors: string[] = [];

	if (!isRecord(args.project)) {
		errors.push('Missing required parameter: project');
	} else {
		if (!toNonEmptyString(args.project.name)) {
			errors.push('Missing required parameter: project.name');
		}
		if (!toNonEmptyString(args.project.type_key)) {
			errors.push('Missing required parameter: project.type_key');
		}
	}

	if (!Array.isArray(args.entities)) {
		errors.push('Missing required parameter: entities');
	}

	if (!Array.isArray(args.relationships)) {
		errors.push('Missing required parameter: relationships');
		return errors;
	}

	const entityKindIndex = buildEntityKindIndex(args.entities);
	for (let index = 0; index < args.relationships.length; index += 1) {
		const relationship = args.relationships[index];
		const label = `relationships[${index}]`;

		if (Array.isArray(relationship)) {
			if (relationship.length !== 2) {
				errors.push(
					`Invalid ${label}: expected a two-item relationship pair with from/to entity refs.`
				);
				continue;
			}

			validateRelationshipRef(relationship[0], entityKindIndex, `${label}[0]`, errors);
			validateRelationshipRef(relationship[1], entityKindIndex, `${label}[1]`, errors);
			continue;
		}

		if (!isRecord(relationship)) {
			errors.push(
				`Invalid ${label}: expected [ { temp_id, kind }, { temp_id, kind } ] or { from, to, rel?, intent? }.`
			);
			continue;
		}

		if (!('from' in relationship) || !('to' in relationship)) {
			errors.push(
				`Invalid ${label}: expected [ { temp_id, kind }, { temp_id, kind } ] or { from, to, rel?, intent? }.`
			);
			continue;
		}

		validateRelationshipRef(relationship.from, entityKindIndex, `${label}.from`, errors);
		validateRelationshipRef(relationship.to, entityKindIndex, `${label}.to`, errors);
	}

	return errors;
}
