// scripts/lib/supabase-openapi-types.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
	renderDatabaseTypesFromOpenApi,
	type SupabaseOpenApiDocument
} from './supabase-openapi-types.js';

const existingTypes = `export type Database = {
  public: {
    Tables: {
      widgets: {
        Row: { id: string; status: Database["public"]["Enums"]["widget_status"] }
        Insert: { id: string; status: Database["public"]["Enums"]["widget_status"] }
        Update: { id?: string; status?: Database["public"]["Enums"]["widget_status"] }
        Relationships: []
      }
    }
    Views: {
    }
    Functions: {
      live_rpc: { Args: never; Returns: boolean }
      stale_rpc: { Args: never; Returns: boolean }
    }
    Enums: {
      stale_enum: "retired"
      widget_status: "active" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
export const Constants = {
  public: {
    Enums: {
      stale_enum: ["retired"],
      widget_status: ["active", "archived"],
    },
  },
} as const
`;

test('REST type generation prunes retired RPCs and unreferenced enums', () => {
	const document: SupabaseOpenApiDocument = {
		swagger: '2.0',
		definitions: {
			widgets: {
				type: 'object',
				required: ['id', 'status'],
				properties: {
					id: { type: 'string' },
					status: {
						type: 'string',
						format: 'public.widget_status'
					}
				}
			}
		},
		paths: {
			'/widgets': { post: {} },
			'/rpc/live_rpc': { post: { parameters: [] } }
		}
	};

	const rendered = renderDatabaseTypesFromOpenApi(document, existingTypes).content;

	assert.match(rendered, /live_rpc:/);
	assert.match(rendered, /widget_status:/);
	assert.doesNotMatch(rendered, /stale_rpc:/);
	assert.doesNotMatch(rendered, /stale_enum:/);
});

test('REST type generation refreshes a changed RPC argument set while preserving return types', () => {
	const document: SupabaseOpenApiDocument = {
		swagger: '2.0',
		definitions: {
			widgets: {
				type: 'object',
				required: ['id', 'status'],
				properties: {
					id: { type: 'string' },
					status: { type: 'string', format: 'public.widget_status' }
				}
			}
		},
		paths: {
			'/widgets': { post: {} },
			'/rpc/live_rpc': {
				post: {
					parameters: [
						{
							in: 'body',
							schema: {
								type: 'object',
								required: ['p_include_job_types'],
								properties: {
									p_stall_timeout: { type: 'string' },
									p_include_job_types: {
										type: 'array',
										items: { type: 'string' }
									},
									p_exclude_job_types: {
										type: 'array',
										items: { type: 'string' }
									}
								}
							}
						}
					]
				}
			}
		}
	};

	const rendered = renderDatabaseTypesFromOpenApi(document, existingTypes).content;

	assert.match(rendered, /p_include_job_types: string\[\]/);
	assert.match(rendered, /p_exclude_job_types\?: string\[\]/);
	assert.match(rendered, /p_stall_timeout\?: string/);
	assert.match(rendered, /Returns: boolean/);
});

test('REST type generation preserves enriched overload and unnamed-argument contracts', () => {
	const overloadedTypes = existingTypes.replace(
		'live_rpc: { Args: never; Returns: boolean }',
		`live_rpc:
		| { Args: never; Returns: boolean }
		| { Args: { id: string; mode?: string }; Returns: boolean }
      unnamed_rpc: { Args: { "": string }; Returns: string }`
	);
	const document: SupabaseOpenApiDocument = {
		swagger: '2.0',
		definitions: {
			widgets: {
				type: 'object',
				required: ['id', 'status'],
				properties: {
					id: { type: 'string' },
					status: { type: 'string', format: 'public.widget_status' }
				}
			}
		},
		paths: {
			'/widgets': { post: {} },
			'/rpc/live_rpc': {
				post: {
					parameters: [
						{
							in: 'body',
							schema: {
								type: 'object',
								required: ['id'],
								properties: { id: { type: 'string' }, mode: { type: 'string' } }
							}
						}
					]
				}
			},
			'/rpc/unnamed_rpc': {
				post: {
					parameters: [
						{
							in: 'body',
							schema: {
								type: 'object',
								required: [''],
								properties: { '': { type: 'string' } }
							}
						}
					]
				}
			}
		}
	};

	const rendered = renderDatabaseTypesFromOpenApi(document, overloadedTypes).content;

	assert.match(rendered, /live_rpc:\s*\| \{ Args: never; Returns: boolean \}/);
	assert.match(rendered, /\| \{ Args: \{ id: string; mode\?: string \}; Returns: boolean \}/);
	assert.match(rendered, /unnamed_rpc: \{ Args: \{ "": string \}; Returns: string \}/);
});
