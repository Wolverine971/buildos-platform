// packages/agentic-chat-runtime/src/catalog/definitions/tables.ts
/**
 * Table tool definitions (BuildOS Tables, docs/specs/tables/CONTRACT.md).
 *
 * A table is a project document whose type_key is `document.table`; its id is
 * the document id. Rows are addressed by handle (`r12`, the first column of
 * every read), columns by name. Filters, sorts, groups, and aggregates are
 * structured arguments, never a query string, and every count or total comes
 * from read_table_rows so the model never does arithmetic itself.
 *
 * Schemas avoid `oneOf` and array-in-union types: cell values ride free-form
 * `values` objects (the server coerces them by column type), and list filters
 * use a separate `values` array.
 *
 * The catalog stays free of runtime imports (the browser and the catalog
 * smoke scripts load it), so the contract enums are copied here and
 * `tables.test.ts` pins them to `@buildos/shared-agent-ops/tables`.
 */

import type { ChatToolDefinition, ToolJsonSchema } from '@buildos/shared-types';

export const TABLE_TOOL_COLUMN_TYPES = [
	'text',
	'long_text',
	'number',
	'date',
	'select',
	'multi_select',
	'checkbox',
	'url',
	'email',
	'link'
] as const;
export const TABLE_TOOL_FILTER_OPS = [
	'eq',
	'neq',
	'contains',
	'not_contains',
	'gt',
	'gte',
	'lt',
	'lte',
	'in',
	'not_in',
	'is_empty',
	'is_not_empty'
] as const;
export const TABLE_TOOL_AGGREGATE_FNS = [
	'count',
	'count_empty',
	'count_filled',
	'sum',
	'avg',
	'min',
	'max',
	'distinct'
] as const;
export const TABLE_TOOL_LIMITS = {
	maxColumns: 50,
	maxAgentRowsPerCall: 200,
	maxAgentReadRows: 100,
	defaultAgentReadRows: 25
} as const;
const TABLE_COLUMN_TYPES = TABLE_TOOL_COLUMN_TYPES;
const TABLE_FILTER_OPS = TABLE_TOOL_FILTER_OPS;
const TABLE_AGGREGATE_FNS = TABLE_TOOL_AGGREGATE_FNS;
const TABLE_LIMITS = TABLE_TOOL_LIMITS;

/** Every table tool, for surfaces, policy, and the presenter. */
export const TABLE_TOOL_NAMES = [
	'get_onto_table_details',
	'read_table_rows',
	'create_onto_table',
	'update_onto_table',
	'update_onto_table_rows'
] as const;

const TABLE_ID: ToolJsonSchema = {
	type: 'string',
	description: 'Table UUID (the table document id).'
};

const CELL_VALUES: ToolJsonSchema = {
	type: 'object',
	description:
		'Column name → value as given (text, number, true/false, YYYY-MM-DD, list for multi_select); null clears.'
};

const CELL_SOURCES: ToolJsonSchema = {
	type: 'object',
	description: 'Researched values: column name → { urls: [...], note, confidence }.'
};

const COLUMN_OPTIONS: ToolJsonSchema = {
	type: 'object',
	properties: {
		choices: {
			type: 'array',
			items: { type: 'string' },
			description: 'Allowed values for select / multi_select.'
		},
		format: { type: 'string', enum: ['number', 'currency', 'percent', 'hours'] }
	}
};

const COLUMN_AI: ToolJsonSchema = {
	type: 'object',
	description: 'Makes a question column that is filled once per row.',
	properties: {
		prompt: { type: 'string', description: 'What to find for each row.' },
		research: { type: 'boolean', description: 'true = may search the web per row.' }
	},
	required: ['prompt', 'research']
};

const COLUMN_TYPE: ToolJsonSchema = { type: 'string', enum: [...TABLE_COLUMN_TYPES] };

export const TABLE_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'get_onto_table_details',
			description:
				'Open a table: its columns (type, choices, descriptions), row count, column totals, and the first rows. Read it before any other table call. The first column of the rows is the row handle (r12) used to address a row.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					table_id: TABLE_ID,
					row_limit: {
						type: 'integer',
						minimum: 0,
						maximum: 50,
						default: 15,
						description: 'First rows to include; 0 returns the columns only.'
					}
				},
				required: ['table_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'read_table_rows',
			description:
				'Find, sort, page, group, and total a table’s rows. Use it for every "which rows", count, or total question; never add up rows yourself. Returns rows with their handles plus groups and aggregates; pass next_offset to page on.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					table_id: TABLE_ID,
					filters: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								column: { type: 'string', description: 'Column name.' },
								op: { type: 'string', enum: [...TABLE_FILTER_OPS] },
								value: {
									type: ['string', 'number', 'boolean'],
									description: 'Dates as YYYY-MM-DD.'
								},
								values: {
									type: 'array',
									items: { type: ['string', 'number'] },
									description: 'List for in / not_in.'
								}
							},
							required: ['column', 'op']
						}
					},
					match: { type: 'string', enum: ['all', 'any'], default: 'all' },
					search: { type: 'string', description: 'Text to find in any cell.' },
					sort: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								column: { type: 'string' },
								direction: { type: 'string', enum: ['asc', 'desc'] }
							},
							required: ['column', 'direction']
						}
					},
					columns: {
						type: 'array',
						items: { type: 'string' },
						description: 'Columns to return; default all.'
					},
					group_by: { type: 'string', description: 'Column to group by.' },
					aggregates: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								fn: { type: 'string', enum: [...TABLE_AGGREGATE_FNS] },
								column: { type: 'string', description: 'Not needed for count.' }
							},
							required: ['fn']
						}
					},
					limit: {
						type: 'integer',
						minimum: 0,
						maximum: TABLE_LIMITS.maxAgentReadRows,
						default: TABLE_LIMITS.defaultAgentReadRows,
						description: 'Rows to return; 0 for groups/aggregates only.'
					},
					offset: { type: 'integer', minimum: 0 }
				},
				required: ['table_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_onto_table',
			description:
				'Create a table in a project with typed columns and up to 200 starting rows, or from pasted CSV text. Use it when the user wants to track rows of things (applications, leads, expenses) or asks to save findings as a table.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					project_id: { type: 'string', description: 'Project UUID' },
					title: { type: 'string' },
					description: { type: 'string' },
					columns: {
						type: 'array',
						maxItems: TABLE_LIMITS.maxColumns,
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								type: COLUMN_TYPE,
								description: { type: 'string' },
								options: COLUMN_OPTIONS,
								ai: COLUMN_AI
							},
							required: ['name']
						},
						description: 'Columns in order; the first is the row title. Omit with csv.'
					},
					rows: {
						type: 'array',
						maxItems: TABLE_LIMITS.maxAgentRowsPerCall,
						items: { type: 'object' },
						description: 'Rows as { "<column name>": value }.'
					},
					csv: {
						type: 'string',
						description: 'CSV or tab-separated text with a header row, stored verbatim.'
					},
					parent_id: {
						type: ['string', 'null'],
						description: 'Parent document UUID from a read, for tree placement.'
					}
				},
				required: ['project_id', 'title']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_table',
			description:
				'Change a table’s title, description, or columns (add, rename, retype, update choices or description, delete, move), start filling question columns, or archive it. Row values change with update_onto_table_rows.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					table_id: TABLE_ID,
					title: { type: 'string' },
					description: { type: 'string' },
					column_changes: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								action: {
									type: 'string',
									enum: ['add', 'rename', 'retype', 'update', 'delete', 'move']
								},
								column: {
									type: 'string',
									description: 'Existing column name (all actions but add).'
								},
								name: { type: 'string', description: 'New name (add, rename).' },
								type: COLUMN_TYPE,
								description: { type: 'string' },
								options: COLUMN_OPTIONS,
								ai: COLUMN_AI,
								after: {
									type: ['string', 'null'],
									description: 'Place after this column (add, move).'
								}
							},
							required: ['action']
						}
					},
					fill_ai_columns: {
						type: 'array',
						items: { type: 'string' },
						description: 'Question columns to fill for every row.'
					},
					archived: { type: 'boolean' }
				},
				required: ['table_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_table_rows',
			description:
				'Add, change, or delete table rows in one call (up to 200 rows). Address rows by handle (r12) from a read and columns by name. Pass sources for researched values. Ask before deleting rows the user did not name.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					table_id: TABLE_ID,
					add: {
						type: 'array',
						maxItems: TABLE_LIMITS.maxAgentRowsPerCall,
						items: {
							type: 'object',
							properties: { values: CELL_VALUES, sources: CELL_SOURCES },
							required: ['values']
						}
					},
					update: {
						type: 'array',
						maxItems: TABLE_LIMITS.maxAgentRowsPerCall,
						items: {
							type: 'object',
							properties: {
								row: { type: 'string', description: 'Row handle, e.g. r12.' },
								values: CELL_VALUES,
								sources: CELL_SOURCES
							},
							required: ['row', 'values']
						}
					},
					delete: {
						type: 'array',
						maxItems: TABLE_LIMITS.maxAgentRowsPerCall,
						items: { type: 'string' },
						description: 'Row handles to delete.'
					},
					allow_large_deletion: {
						type: 'boolean',
						description: 'Only when the user asked to delete over 30% of the rows.'
					}
				},
				required: ['table_id']
			}
		}
	}
];
