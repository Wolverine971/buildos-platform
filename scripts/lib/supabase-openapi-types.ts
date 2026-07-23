// scripts/lib/supabase-openapi-types.ts
type OpenApiSchema = {
	$ref?: string;
	default?: unknown;
	description?: string;
	enum?: unknown[];
	format?: string;
	items?: OpenApiSchema;
	properties?: Record<string, OpenApiSchema>;
	required?: string[];
	type?: string;
};

type OpenApiParameter = {
	in?: string;
	name?: string;
	required?: boolean;
	schema?: OpenApiSchema;
};

type OpenApiOperation = {
	parameters?: OpenApiParameter[];
};

type OpenApiPath = {
	delete?: OpenApiOperation;
	get?: OpenApiOperation;
	patch?: OpenApiOperation;
	post?: OpenApiOperation;
};

export type SupabaseOpenApiDocument = {
	definitions?: Record<string, OpenApiSchema>;
	paths?: Record<string, OpenApiPath>;
	swagger?: string;
};

type Relationship = {
	columns: string[];
	foreignKeyName: string;
	isOneToOne: boolean;
	referencedColumns: string[];
	referencedRelation: string;
};

export type RenderedDatabaseTypes = {
	addedFunctions: string[];
	content: string;
	tableCount: number;
	viewCount: number;
};

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function renderKey(key: string): string {
	return IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function findSectionInner(source: string, sectionName: string, nextSectionName: string): string {
	const startMarker = `    ${sectionName}: {\n`;
	const endMarker = `    }\n    ${nextSectionName}: {`;
	const start = source.indexOf(startMarker);
	if (start === -1) return '';

	const innerStart = start + startMarker.length;
	const end = source.indexOf(endMarker, innerStart);
	return end === -1 ? '' : source.slice(innerStart, end);
}

function extractIndentedEntries(sectionInner: string): Map<string, string> {
	const matches = [
		...sectionInner.matchAll(/^      (?:"([^"]+)"|([A-Za-z_$][A-Za-z0-9_$]*)):/gm)
	];
	const entries = new Map<string, string>();

	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		const name = match[1] ?? match[2];
		const start = match.index ?? 0;
		const end = matches[index + 1]?.index ?? sectionInner.length;
		entries.set(name, sectionInner.slice(start, end).trimEnd());
	}

	return entries;
}

function existingSectionEntries(
	existingTypes: string,
	sectionName: string,
	nextSectionName: string
): Map<string, string> {
	return extractIndentedEntries(findSectionInner(existingTypes, sectionName, nextSectionName));
}

function parseStringArray(source: string): string[] {
	return [...source.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => JSON.parse(`"${match[1]}"`));
}

function parseExistingEnums(existingTypes: string): Map<string, string[]> {
	const entries = existingSectionEntries(existingTypes, 'Enums', 'CompositeTypes');
	return new Map([...entries].map(([name, entry]) => [name, parseStringArray(entry)]));
}

function parseExistingRelationships(entry: string | undefined): Relationship[] {
	if (!entry) return [];

	const relationships: Relationship[] = [];
	const pattern =
		/\{\s*foreignKeyName:\s*"([^"]+)"\s*columns:\s*\[([^\]]*)\]\s*isOneToOne:\s*(true|false)\s*referencedRelation:\s*"([^"]+)"\s*referencedColumns:\s*\[([^\]]*)\]\s*\}/g;

	for (const match of entry.matchAll(pattern)) {
		relationships.push({
			foreignKeyName: match[1],
			columns: parseStringArray(match[2]),
			isOneToOne: match[3] === 'true',
			referencedRelation: match[4],
			referencedColumns: parseStringArray(match[5])
		});
	}

	return relationships;
}

function parseExistingInsertOptionalNames(entry: string | undefined): Set<string> {
	if (!entry) return new Set();

	const insertStart = entry.indexOf('        Insert: {');
	const updateStart = entry.indexOf('        Update: {', insertStart);
	if (insertStart === -1 || updateStart === -1) return new Set();

	const insertBlock = entry.slice(insertStart, updateStart);
	return new Set(
		[...insertBlock.matchAll(/^          (?:"([^"]+)"|([A-Za-z_$][A-Za-z0-9_$]*))\?:/gm)].map(
			(match) => match[1] ?? match[2]
		)
	);
}

function enumNameForSchema(schema: OpenApiSchema): string | undefined {
	const format = schema.format ?? schema.items?.format;
	if (!format?.startsWith('public.')) return undefined;

	const name = format.slice('public.'.length).replace(/\[\]$/, '');
	return schema.enum || schema.items?.enum ? name : undefined;
}

function collectEnums(
	document: SupabaseOpenApiDocument,
	existingTypes: string
): Map<string, string[]> {
	const enums = parseExistingEnums(existingTypes);

	const visitSchema = (schema: OpenApiSchema | undefined) => {
		if (!schema) return;

		const enumName = enumNameForSchema(schema);
		const values = schema.enum ?? schema.items?.enum;
		if (enumName && values?.every((value) => typeof value === 'string')) {
			enums.set(enumName, values as string[]);
		}

		for (const property of Object.values(schema.properties ?? {})) visitSchema(property);
	};

	for (const definition of Object.values(document.definitions ?? {})) visitSchema(definition);
	for (const [path, pathDefinition] of Object.entries(document.paths ?? {})) {
		if (!path.startsWith('/rpc/')) continue;
		const body = pathDefinition.post?.parameters?.find((parameter) => parameter.in === 'body');
		visitSchema(body?.schema);
	}

	return new Map([...enums].sort(([left], [right]) => left.localeCompare(right)));
}

function scalarType(schema: OpenApiSchema, enums: Map<string, string[]>): string {
	const enumName = enumNameForSchema(schema);
	if (enumName && enums.has(enumName)) {
		return `Database["public"]["Enums"][${JSON.stringify(enumName)}]`;
	}

	const format = schema.format?.replace(/\[\]$/, '');
	if (format === 'json' || format === 'jsonb') return 'Json';
	if (format === 'inet' || format === 'tsvector') return 'unknown';

	switch (schema.type) {
		case 'boolean':
			return 'boolean';
		case 'integer':
		case 'number':
			return 'number';
		case 'object':
			return 'Json';
		case 'string':
			return 'string';
		default:
			return format === 'void' ? 'undefined' : 'unknown';
	}
}

export function schemaToTypescript(
	schema: OpenApiSchema,
	enums: Map<string, string[]> = new Map()
): string {
	const isArray = schema.type === 'array' || schema.format?.endsWith('[]');
	if (!isArray) return scalarType(schema, enums);

	const itemSchema = schema.items ?? {
		format: schema.format?.replace(/\[\]$/, ''),
		type: schema.type === 'array' ? undefined : schema.type
	};
	const itemType = scalarType(itemSchema, enums);
	return itemType.includes(' | ') ? `(${itemType})[]` : `${itemType}[]`;
}

function hasDefault(schema: OpenApiSchema): boolean {
	return Object.prototype.hasOwnProperty.call(schema, 'default');
}

function renderProperties(
	definition: OpenApiSchema,
	mode: 'insert' | 'row' | 'update',
	enums: Map<string, string[]>,
	existingEntries: Array<string | undefined> = []
): string[] {
	const required = new Set(definition.required ?? []);
	const existingOptionalNames = new Set(
		existingEntries.flatMap((entry) => [...parseExistingInsertOptionalNames(entry)])
	);
	const properties = Object.entries(definition.properties ?? {}).sort(([left], [right]) =>
		left.localeCompare(right)
	);

	return properties.flatMap(([name, schema]) => {
		const nullable = !required.has(name);
		const optional =
			mode === 'update' ||
			(mode === 'insert' &&
				(nullable || hasDefault(schema) || existingOptionalNames.has(name)));
		const baseType = schemaToTypescript(schema, enums);
		const valueType = `${baseType}${nullable && baseType !== 'unknown' ? ' | null' : ''}`;
		const key = `${renderKey(name)}${optional ? '?' : ''}`;
		const line = `          ${key}: ${valueType}`;
		if (line.length <= 80 || !valueType.includes(' | ')) return [line];

		return [
			`          ${key}:`,
			...valueType.split(' | ').map((part) => `            | ${part}`)
		];
	});
}

function relationshipPairKey(
	column: string,
	referencedRelation: string,
	referencedColumn: string
): string {
	return `${column}\u0000${referencedRelation}\u0000${referencedColumn}`;
}

function relationshipPairs(relationship: Relationship): string[] {
	return relationship.columns.map((column, index) =>
		relationshipPairKey(
			column,
			relationship.referencedRelation,
			relationship.referencedColumns[index] ?? relationship.referencedColumns[0] ?? ''
		)
	);
}

function relationshipsFromOpenApi(
	name: string,
	definition: OpenApiSchema,
	existingEntries: Array<string | undefined>
): Relationship[] {
	const discovered: Array<{
		column: string;
		referencedColumn: string;
		referencedRelation: string;
	}> = [];

	for (const [column, schema] of Object.entries(definition.properties ?? {})) {
		const description = schema.description ?? '';
		const pattern = /<fk table='([^']+)' column='([^']+)'\s*\/>/g;
		for (const match of description.matchAll(pattern)) {
			discovered.push({
				column,
				referencedRelation: match[1],
				referencedColumn: match[2]
			});
		}
	}

	const existingRelationships = existingEntries
		.flatMap(parseExistingRelationships)
		.filter(
			(relationship, index, relationships) =>
				relationships.findIndex(
					(candidate) =>
						candidate.foreignKeyName === relationship.foreignKeyName &&
						candidate.referencedRelation === relationship.referencedRelation &&
						candidate.columns.join('\u0000') === relationship.columns.join('\u0000') &&
						candidate.referencedColumns.join('\u0000') ===
							relationship.referencedColumns.join('\u0000')
				) === index
		);
	const coveredKeys = new Set(existingRelationships.flatMap(relationshipPairs));
	const primaryKeyColumns = Object.entries(definition.properties ?? {})
		.filter(([, schema]) => schema.description?.includes('<pk/>'))
		.map(([column]) => column);
	const usedNames = new Set(existingRelationships.map(({ foreignKeyName }) => foreignKeyName));

	for (const relationship of discovered) {
		const key = relationshipPairKey(
			relationship.column,
			relationship.referencedRelation,
			relationship.referencedColumn
		);
		if (coveredKeys.has(key)) continue;

		const nameBase = `${name}_${relationship.column}_fkey`;
		let foreignKeyName = nameBase;
		let suffix = 2;
		while (usedNames.has(foreignKeyName)) {
			foreignKeyName = `${nameBase}_${suffix}`;
			suffix += 1;
		}
		usedNames.add(foreignKeyName);

		existingRelationships.push({
			foreignKeyName,
			columns: [relationship.column],
			isOneToOne:
				primaryKeyColumns.length === 1 && primaryKeyColumns[0] === relationship.column,
			referencedRelation: relationship.referencedRelation,
			referencedColumns: [relationship.referencedColumn]
		});
	}

	return existingRelationships.sort((left, right) => {
		const byName = left.foreignKeyName.localeCompare(right.foreignKeyName);
		return byName || left.referencedRelation.localeCompare(right.referencedRelation);
	});
}

function renderRelationships(relationships: Relationship[]): string[] {
	if (relationships.length === 0) return ['        Relationships: []'];

	const lines = ['        Relationships: ['];
	for (const relationship of relationships) {
		lines.push(
			'          {',
			`            foreignKeyName: ${JSON.stringify(relationship.foreignKeyName)}`,
			`            columns: [${relationship.columns.map((column) => JSON.stringify(column)).join(', ')}]`,
			`            isOneToOne: ${relationship.isOneToOne}`,
			`            referencedRelation: ${JSON.stringify(relationship.referencedRelation)}`,
			`            referencedColumns: [${relationship.referencedColumns.map((column) => JSON.stringify(column)).join(', ')}]`,
			'          },'
		);
	}
	lines.push('        ]');
	return lines;
}

function renderDefinition(
	name: string,
	definition: OpenApiSchema,
	kind: 'table' | 'view',
	existingEntries: Array<string | undefined>,
	enums: Map<string, string[]>
): string {
	const lines = [`      ${renderKey(name)}: {`, '        Row: {'];
	lines.push(...renderProperties(definition, 'row', enums), '        }');

	if (kind === 'table') {
		lines.push(
			'        Insert: {',
			...renderProperties(definition, 'insert', enums, existingEntries),
			'        }'
		);
		lines.push(
			'        Update: {',
			...renderProperties(definition, 'update', enums),
			'        }'
		);
	}

	lines.push(
		...renderRelationships(relationshipsFromOpenApi(name, definition, existingEntries)),
		'      }'
	);
	return lines.join('\n');
}

function rpcArgumentSchema(pathDefinition: OpenApiPath): OpenApiSchema | undefined {
	return pathDefinition.post?.parameters?.find((parameter) => parameter.in === 'body')?.schema;
}

function renderNewFunction(
	name: string,
	pathDefinition: OpenApiPath,
	enums: Map<string, string[]>
): string {
	const argsSchema = rpcArgumentSchema(pathDefinition);
	const properties = Object.entries(argsSchema?.properties ?? {}).sort(([left], [right]) =>
		left.localeCompare(right)
	);
	const required = new Set(argsSchema?.required ?? []);
	const lines = [`      ${renderKey(name)}: {`];

	if (properties.length === 0) {
		lines.push('        Args: never');
	} else {
		lines.push('        Args: {');
		for (const [argumentName, schema] of properties) {
			lines.push(
				`          ${renderKey(argumentName)}${required.has(argumentName) ? '' : '?'}: ${schemaToTypescript(schema, enums)}`
			);
		}
		lines.push('        }');
	}

	// PostgREST intentionally omits SQL return signatures from its OpenAPI document.
	// Json is the safe type until a later CLI-authenticated generation enriches it.
	lines.push('        Returns: Json', '      }');
	return lines.join('\n');
}

function existingInternalBlock(existingTypes: string): string {
	const start = existingTypes.indexOf('  __InternalSupabase:');
	const end = existingTypes.indexOf('  public:', start);
	if (start !== -1 && end !== -1) {
		return `  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
${existingTypes.slice(start, end)}`;
	}

	return '  __InternalSupabase: {\n    PostgrestVersion: "unknown"\n  }\n';
}

function existingCompositeTypesInner(existingTypes: string): string {
	const startMarker = '    CompositeTypes: {\n';
	const start = existingTypes.indexOf(startMarker);
	if (start === -1) return '      [_ in never]: never\n';

	const innerStart = start + startMarker.length;
	const end = existingTypes.indexOf('    }\n  }\n}', innerStart);
	return end === -1 ? '      [_ in never]: never\n' : existingTypes.slice(innerStart, end);
}

function sameIgnoringWhitespace(left: string, right: string): boolean {
	const normalize = (source: string) => source.replace(/[;\s]+/g, '').replace(/:\|/g, ':');
	return normalize(left) === normalize(right);
}

function helperTypes(existingTypes: string, compatibilityTypes: string): string {
	const start = existingTypes.indexOf('\ntype DatabaseWithoutInternals');
	const end = existingTypes.indexOf('\nexport const Constants', start);
	const current = start !== -1 && end !== -1 ? existingTypes.slice(start, end) : '';

	const compatibilityStart = compatibilityTypes.indexOf('\ntype DatabaseWithoutInternals');
	const compatibilityEnd = compatibilityTypes.indexOf(
		'\nexport const Constants',
		compatibilityStart
	);
	const compatibility =
		compatibilityStart !== -1 && compatibilityEnd !== -1
			? compatibilityTypes.slice(compatibilityStart, compatibilityEnd)
			: '';
	if (current && compatibility && sameIgnoringWhitespace(current, compatibility)) {
		return compatibility;
	}
	if (current) return current;

	return `
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> =
  (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends { Row: infer R }
    ? R
    : never

export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never

export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never

export type Enums<EnumName extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][EnumName]

export type CompositeTypes<CompositeTypeName extends keyof DefaultSchema["CompositeTypes"]> =
  DefaultSchema["CompositeTypes"][CompositeTypeName]
`;
}

function equalStringArrays(left: string[] | undefined, right: string[]): boolean {
	return Boolean(
		left && left.length === right.length && left.every((value, index) => value === right[index])
	);
}

function renderEnums(
	enums: Map<string, string[]>,
	existingTypes: string,
	compatibilityTypes: string
): string {
	if (enums.size === 0) return '      [_ in never]: never';
	const existingEntries = existingSectionEntries(existingTypes, 'Enums', 'CompositeTypes');
	const compatibilityEntries = existingSectionEntries(
		compatibilityTypes,
		'Enums',
		'CompositeTypes'
	);

	return [...enums]
		.map(([name, values]) => {
			const compatibility = compatibilityEntries.get(name);
			if (compatibility && equalStringArrays(parseStringArray(compatibility), values)) {
				return compatibility;
			}
			const existing = existingEntries.get(name);
			if (existing && equalStringArrays(parseStringArray(existing), values)) return existing;

			const key = `      ${renderKey(name)}:`;
			const inline = `${key} ${values.map((value) => JSON.stringify(value)).join(' | ')}`;
			if (inline.length <= 80) return inline;
			return `${key}\n${values.map((value) => `        | ${JSON.stringify(value)}`).join('\n')}`;
		})
		.join('\n');
}

function existingConstantsBlock(source: string): string {
	const start = source.indexOf('export const Constants =');
	return start === -1 ? '' : `${source.slice(start).trimEnd()}\n`;
}

function parseConstantsEnums(source: string): Map<string, string[]> {
	const constants = existingConstantsBlock(source);
	const marker = '    Enums: {\n';
	const start = constants.indexOf(marker);
	const end = constants.indexOf('    },\n  },\n} as const', start);
	if (start === -1 || end === -1) return new Map();
	return new Map(
		[...extractIndentedEntries(constants.slice(start + marker.length, end))].map(
			([name, entry]) => [name, parseStringArray(entry)]
		)
	);
}

function constantsMatch(source: string, enums: Map<string, string[]>): boolean {
	const parsed = parseConstantsEnums(source);
	return (
		parsed.size === enums.size &&
		[...enums].every(([name, values]) => equalStringArrays(parsed.get(name), values))
	);
}

function renderConstants(
	enums: Map<string, string[]>,
	existingTypes: string,
	compatibilityTypes: string
): string {
	if (constantsMatch(compatibilityTypes, enums))
		return existingConstantsBlock(compatibilityTypes);
	if (constantsMatch(existingTypes, enums)) return existingConstantsBlock(existingTypes);

	const enumLines =
		enums.size === 0
			? ''
			: `${[...enums]
					.map(([name, values]) => {
						const key = `      ${renderKey(name)}:`;
						const inline = `${key} [${values.map((value) => JSON.stringify(value)).join(', ')}],`;
						if (inline.length <= 80) return inline;
						return `${key} [\n${values.map((value) => `        ${JSON.stringify(value)},`).join('\n')}\n      ],`;
					})
					.join('\n')}\n`;

	return `export const Constants = {
  public: {
    Enums: {
${enumLines}    },
  },
} as const
`;
}

export function renderDatabaseTypesFromOpenApi(
	document: SupabaseOpenApiDocument,
	existingTypes: string,
	compatibilityTypes = existingTypes
): RenderedDatabaseTypes {
	if (document.swagger !== '2.0' || !document.definitions || !document.paths) {
		throw new Error('Supabase REST API returned an unsupported OpenAPI document.');
	}

	const existingTables = existingSectionEntries(existingTypes, 'Tables', 'Views');
	const existingViews = existingSectionEntries(existingTypes, 'Views', 'Functions');
	const compatibilityTables = existingSectionEntries(compatibilityTypes, 'Tables', 'Views');
	const compatibilityViews = existingSectionEntries(compatibilityTypes, 'Views', 'Functions');
	const existingFunctions = existingSectionEntries(existingTypes, 'Functions', 'Enums');
	const compatibilityFunctions = existingSectionEntries(compatibilityTypes, 'Functions', 'Enums');
	const enums = collectEnums(document, existingTypes);
	const tableNames: string[] = [];
	const viewNames: string[] = [];

	for (const name of Object.keys(document.definitions).sort()) {
		if (existingViews.has(name)) {
			viewNames.push(name);
		} else if (existingTables.has(name) || document.paths[`/${name}`]?.post) {
			tableNames.push(name);
		} else {
			viewNames.push(name);
		}
	}

	const tables = tableNames.map((name) =>
		renderDefinition(
			name,
			document.definitions?.[name] ?? {},
			'table',
			[existingTables.get(name), compatibilityTables.get(name)],
			enums
		)
	);
	const views = viewNames.map((name) =>
		renderDefinition(
			name,
			document.definitions?.[name] ?? {},
			'view',
			[existingViews.get(name), compatibilityViews.get(name)],
			enums
		)
	);
	const liveFunctionPaths = Object.entries(document.paths)
		.filter(([path]) => path.startsWith('/rpc/'))
		.map(([path, definition]) => [path.slice('/rpc/'.length), definition] as const)
		.sort(([left], [right]) => left.localeCompare(right));
	const addedFunctions: string[] = [];
	const functions = liveFunctionPaths.map(([name, pathDefinition]) => {
		const existing = existingFunctions.get(name);
		const compatibility = compatibilityFunctions.get(name);
		if (existing && compatibility && sameIgnoringWhitespace(existing, compatibility)) {
			return compatibility;
		}
		if (existing) return existing;
		addedFunctions.push(name);
		return renderNewFunction(name, pathDefinition, enums);
	});

	const content = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
${existingInternalBlock(existingTypes)}  public: {
    Tables: {
${tables.join('\n')}
    }
    Views: {
${views.join('\n')}
    }
    Functions: {
${functions.join('\n')}
    }
    Enums: {
${renderEnums(enums, existingTypes, compatibilityTypes)}
    }
    CompositeTypes: {
${existingCompositeTypesInner(existingTypes)}    }
  }
}
${helperTypes(existingTypes, compatibilityTypes)}
${renderConstants(enums, existingTypes, compatibilityTypes)}`;

	return {
		addedFunctions,
		content,
		tableCount: tableNames.length,
		viewCount: viewNames.length
	};
}
