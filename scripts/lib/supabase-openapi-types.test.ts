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
