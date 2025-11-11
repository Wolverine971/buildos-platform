// apps/web/src/lib/services/ontology/legacy-mapping.service.ts
import { createHash } from 'crypto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';

export type LegacyMappingRow = Database['public']['Tables']['legacy_entity_mappings']['Row'];

export interface UpsertLegacyMappingInput {
	legacyTable: string;
	legacyId: string;
	ontoTable: string;
	ontoId: string;
	record?: unknown;
	metadata?: Json;
}

export async function getLegacyMapping(
	client: TypedSupabaseClient,
	legacyTable: string,
	legacyId: string
): Promise<LegacyMappingRow | null> {
	const { data, error } = await client
		.from('legacy_entity_mappings')
		.select('*')
		.eq('legacy_table', legacyTable)
		.eq('legacy_id', legacyId)
		.maybeSingle();

	if (error && error.code !== 'PGRST116') {
		throw new Error(
			`[LegacyMapping] Failed to fetch mapping for ${legacyTable}:${legacyId} - ${error.message}`
		);
	}

	return (data as LegacyMappingRow) ?? null;
}

export async function upsertLegacyMapping(
	client: TypedSupabaseClient,
	input: UpsertLegacyMappingInput
): Promise<void> {
	const checksum = input.record ? computeChecksum(input.record) : null;
	const { error } = await client.from('legacy_entity_mappings').upsert(
		{
			legacy_table: input.legacyTable,
			legacy_id: input.legacyId,
			onto_table: input.ontoTable,
			onto_id: input.ontoId,
			checksum,
			metadata: input.metadata ?? {}
		},
		{ onConflict: 'legacy_table,legacy_id' }
	);

	if (error) {
		throw new Error(
			`[LegacyMapping] Failed to upsert mapping for ${input.legacyTable}:${input.legacyId} - ${error.message}`
		);
	}
}

function computeChecksum(value: unknown): string {
	const hash = createHash('sha256');
	hash.update(JSON.stringify(value));
	return hash.digest('hex');
}
