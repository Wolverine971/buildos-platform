// packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.schemas.ts
//
// External contract for the Tables ops (docs/specs/tables/CONTRACT.md, "Chat
// tools"). Every table op is registered as a gateway custom op so MCP and
// agent-call callers get exactly these schemas whether or not the chat
// catalog mounts its own tools for the same ops; the write schemas also
// validate chat-worker writes through runGatewayWriteOp.
//
// Spread into EXTERNAL_CUSTOM_OPS / EXTERNAL_WRITE_OP_SCHEMAS by
// op-execution-gateway.config.ts. No imports from config (avoids a cycle).
import type {
	BuildosAgentAllowedOp,
	RegistryOp,
	ToolJsonObjectSchema,
	ToolJsonSchema
} from '@buildos/shared-types';
import {
	TABLE_AGGREGATE_FNS,
	TABLE_COLUMN_TYPES,
	TABLE_FILTER_OPS,
	TABLE_LIMITS
} from '../tables/table-types';

const TABLE_ID: ToolJsonSchema = {
	type: 'string',
	format: 'uuid',
	description: 'Table id (the table document UUID).'
};

const COLUMN_OPTIONS: ToolJsonSchema = {
	type: 'object',
	description:
		'Optional column options: choices for select/multi_select ([{value}] or strings), format for number (number, currency, percent, hours), currency (ISO code, e.g. USD), decimals.',
	properties: {
		choices: {
			type: 'array',
			items: { type: ['string', 'object'] },
			description: 'Allowed options for select / multi_select columns.'
		},
		format: { type: 'string', enum: ['number', 'currency', 'percent', 'hours'] },
		currency: { type: 'string', description: 'ISO 4217 code for currency columns, e.g. USD.' },
		decimals: { type: 'number', minimum: 0, maximum: 10 },
		link_kinds: { type: 'array', items: { type: 'string' } }
	}
};

const COLUMN_AI: ToolJsonSchema = {
	type: ['object', 'null'],
	description:
		'Makes this a question column: one question answered for every row, e.g. {prompt: "Who is the hiring manager?", research: true}. null removes the question.',
	properties: {
		prompt: { type: 'string', description: 'The question to answer for each row.' },
		research: {
			type: 'boolean',
			description: 'true lets each answer search the web; false answers from the row alone.'
		}
	},
	required: ['prompt']
};

const COLUMN_INPUT: ToolJsonSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', description: 'Column name, unique in the table.' },
		type: {
			type: 'string',
			enum: [...TABLE_COLUMN_TYPES],
			description: `Column type (default text): ${TABLE_COLUMN_TYPES.join(', ')}.`
		},
		description: { type: 'string', description: 'What belongs in this column.' },
		options: COLUMN_OPTIONS,
		ai: COLUMN_AI
	},
	required: ['name']
};

const CELL_SOURCES: ToolJsonSchema = {
	type: 'object',
	description:
		'Where values came from, keyed by column name: {"Hiring manager": {urls: ["https://…"], note: "From the job post", confidence: "high"}}. Only for cells written in the same entry.'
};

const ROW_VALUES: ToolJsonSchema = {
	type: 'object',
	description:
		'Cell values keyed by column name, e.g. {"Company": "Acme", "Salary": 150000, "Stage": "Applied"}. null clears a cell. Write values as given; never compute totals or other math into cells.'
};

export const TABLE_EXTERNAL_WRITE_OP_SCHEMAS: Partial<
	Record<BuildosAgentAllowedOp, ToolJsonObjectSchema>
> = {
	'onto.table.create': {
		type: 'object',
		additionalProperties: false,
		properties: {
			project_id: {
				type: 'string',
				format: 'uuid',
				description: 'Project UUID the table belongs to.'
			},
			title: { type: 'string', description: 'Table title, e.g. "Job applications".' },
			description: { type: ['string', 'null'], description: 'Optional short description.' },
			columns: {
				type: 'array',
				maxItems: TABLE_LIMITS.maxColumns,
				items: COLUMN_INPUT,
				description:
					'Columns in order. Required unless csv is given (with csv, columns are optional hints that override the inferred column types by name).'
			},
			rows: {
				type: 'array',
				maxItems: TABLE_LIMITS.maxAgentRowsPerCall,
				items: { type: 'object' },
				description: `Optional initial rows (at most ${TABLE_LIMITS.maxAgentRowsPerCall}), each keyed by column name: [{"Company": "Acme", "Stage": "Applied"}].`
			},
			csv: {
				type: 'string',
				description:
					'Optional CSV or tab-separated text with a header row, copied verbatim. Column types are inferred from the values. Do not combine with rows.'
			},
			parent_id: {
				type: ['string', 'null'],
				format: 'uuid',
				description: 'Optional parent document UUID to file the table under.'
			}
		},
		required: ['project_id', 'title']
	},
	'onto.table.update': {
		type: 'object',
		additionalProperties: false,
		properties: {
			table_id: TABLE_ID,
			title: { type: 'string', description: 'Optional new title.' },
			description: {
				type: ['string', 'null'],
				description: 'Optional new description; null clears it.'
			},
			column_changes: {
				type: 'array',
				description:
					'Column changes applied in order. Actions: add {name, type, description, options, ai, after}, rename {column, name}, retype {column, type, options}, update {column, description, options, ai, hidden}, delete {column}, move {column, after}. after: column name to place after, null for first, omit for last.',
				items: {
					type: 'object',
					properties: {
						action: {
							type: 'string',
							enum: ['add', 'rename', 'retype', 'update', 'delete', 'move']
						},
						column: {
							type: 'string',
							description: 'Existing column name (all actions except add).'
						},
						name: {
							type: 'string',
							description: 'add: new column name. rename: the new name.'
						},
						type: { type: 'string', enum: [...TABLE_COLUMN_TYPES] },
						description: { type: 'string' },
						options: COLUMN_OPTIONS,
						ai: COLUMN_AI,
						after: { type: ['string', 'null'] },
						width: { type: 'number' },
						hidden: { type: 'boolean' }
					},
					required: ['action']
				}
			},
			fill_ai_columns: {
				type: 'array',
				items: { type: 'string' },
				description:
					'Question columns (by name) to fill now: each empty cell gets an answer with sources. Runs in the background and costs model usage per row.'
			},
			archived: {
				type: 'boolean',
				description: 'true archives the table; false restores it.'
			}
		},
		required: ['table_id']
	},
	'onto.table.rows.update': {
		type: 'object',
		additionalProperties: false,
		properties: {
			table_id: TABLE_ID,
			add: {
				type: 'array',
				description: 'Rows to add: [{values: {<column>: value}, sources?}].',
				items: {
					type: 'object',
					properties: { values: ROW_VALUES, sources: CELL_SOURCES },
					required: ['values']
				}
			},
			update: {
				type: 'array',
				description:
					'Rows to change by handle: [{row: "r12", values: {<column>: value}, sources?}]. Only the named cells change.',
				items: {
					type: 'object',
					properties: {
						row: {
							type: ['string', 'number'],
							description: 'Row handle from a read, e.g. "r12".'
						},
						values: ROW_VALUES,
						sources: CELL_SOURCES
					},
					required: ['row', 'values']
				}
			},
			delete: {
				type: 'array',
				items: { type: ['string', 'number'] },
				description:
					'Row handles to delete, e.g. ["r4", "r9"]. Deleted rows can be restored with Undo.'
			},
			allow_large_deletion: {
				type: 'boolean',
				description:
					'Set true only when the user asked for it: deleting more than 30% of a table with more than 10 rows is otherwise refused.'
			}
		},
		required: ['table_id']
	}
};

const READ_SCHEMAS: Record<'get' | 'query' | 'list', ToolJsonObjectSchema> = {
	get: {
		type: 'object',
		additionalProperties: false,
		properties: {
			table_id: TABLE_ID,
			row_limit: {
				type: 'number',
				minimum: 0,
				maximum: 50,
				description: 'First rows to include (default 15, max 50).'
			},
			format: {
				type: 'string',
				enum: ['markdown', 'csv'],
				description: 'csv also returns the whole table as CSV text in table.content.'
			}
		},
		required: ['table_id']
	},
	query: {
		type: 'object',
		additionalProperties: false,
		properties: {
			table_id: TABLE_ID,
			filters: {
				type: 'array',
				description: `Structured filters: [{column, op, value}]. Ops: ${TABLE_FILTER_OPS.join(', ')}. in/not_in take a list; is_empty/is_not_empty take no value. Numbers compare as numbers, dates as YYYY-MM-DD, text ignores case.`,
				items: {
					type: 'object',
					properties: {
						column: {
							type: 'string',
							description: 'Column name, or "row" for row handles.'
						},
						op: { type: 'string', enum: [...TABLE_FILTER_OPS] },
						value: { description: 'Value to compare (a list for in / not_in).' }
					},
					required: ['column', 'op']
				}
			},
			match: {
				type: 'string',
				enum: ['all', 'any'],
				description: 'all (default): every filter must match. any: at least one.'
			},
			search: { type: 'string', description: 'Text to find in any visible cell.' },
			sort: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						column: { type: 'string' },
						direction: { type: 'string', enum: ['asc', 'desc'] }
					},
					required: ['column']
				},
				description: 'Sort keys in order; empty cells sort last.'
			},
			columns: {
				type: 'array',
				items: { type: 'string' },
				description:
					'Columns to return (default: all visible). Fewer columns fit more rows.'
			},
			group_by: {
				type: 'string',
				description: 'Column to group by; each group returns its count and aggregates.'
			},
			aggregates: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						fn: { type: 'string', enum: [...TABLE_AGGREGATE_FNS] },
						column: { type: 'string' }
					},
					required: ['fn']
				},
				description:
					'Computed over every matching row, e.g. [{fn: "count"}, {fn: "sum", column: "Salary"}]. Use these for counts and totals instead of doing math yourself.'
			},
			limit: {
				type: 'number',
				minimum: 1,
				maximum: TABLE_LIMITS.maxAgentReadRows,
				description: `Rows per page (default ${TABLE_LIMITS.defaultAgentReadRows}, max ${TABLE_LIMITS.maxAgentReadRows}).`
			},
			offset: { type: 'number', minimum: 0, description: 'Rows to skip (use next_offset).' }
		},
		required: ['table_id']
	},
	list: {
		type: 'object',
		additionalProperties: false,
		properties: {
			project_id: {
				type: 'string',
				format: 'uuid',
				description:
					'Optional project UUID; omit to list tables across the granted projects.'
			},
			limit: { type: 'number', minimum: 1, maximum: 50, description: 'Default 20.' },
			offset: { type: 'number', minimum: 0 }
		}
	}
};

function tableOp(
	op: BuildosAgentAllowedOp,
	toolName: string,
	kind: 'read' | 'write',
	action: string,
	description: string,
	parameters: ToolJsonObjectSchema
): RegistryOp {
	return {
		op,
		tool_name: toolName,
		description,
		parameters_schema: parameters,
		group: 'onto',
		kind,
		entity: 'table',
		action,
		chat_discoverable: false
	};
}

export const TABLE_EXTERNAL_CUSTOM_OPS: Partial<Record<BuildosAgentAllowedOp, RegistryOp>> = {
	'onto.table.get': tableOp(
		'onto.table.get',
		'get_onto_table_details',
		'read',
		'get',
		'Get a table: its columns (name, type, options, question columns), row count, column totals, and the first rows with handles (r1, r2, …). Read this before changing a table.',
		READ_SCHEMAS.get
	),
	'onto.table.rows.query': tableOp(
		'onto.table.rows.query',
		'read_table_rows',
		'read',
		'rows.query',
		'Read table rows with structured filters, search, sort, column selection, group_by, and aggregates (count, sum, avg, min, max, distinct). Returns rows with handles, plus next_offset for paging.',
		READ_SCHEMAS.query
	),
	'onto.table.list': tableOp(
		'onto.table.list',
		'list_onto_tables',
		'read',
		'list',
		'List tables (live spreadsheets inside projects) with their row counts and column names.',
		READ_SCHEMAS.list
	),
	'onto.table.create': tableOp(
		'onto.table.create',
		'create_onto_table',
		'write',
		'create',
		'Create a table in a project from columns plus optional rows (up to 200), or from pasted CSV text. The table is filed in the project documents.',
		TABLE_EXTERNAL_WRITE_OP_SCHEMAS['onto.table.create']!
	),
	'onto.table.update': tableOp(
		'onto.table.update',
		'update_onto_table',
		'write',
		'update',
		"Change a table's title, description, or columns (add, rename, retype, update, delete, move), start filling question columns, or archive/restore it.",
		TABLE_EXTERNAL_WRITE_OP_SCHEMAS['onto.table.update']!
	),
	'onto.table.rows.update': tableOp(
		'onto.table.rows.update',
		'update_onto_table_rows',
		'write',
		'rows.update',
		'Add, change, or delete table rows in one call (up to 200 rows). Rows are addressed by handle (r12) and cells by column name; sources record where a value came from. Every change can be undone.',
		TABLE_EXTERNAL_WRITE_OP_SCHEMAS['onto.table.rows.update']!
	)
};
