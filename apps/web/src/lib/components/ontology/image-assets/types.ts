// apps/web/src/lib/components/ontology/image-assets/types.ts
import type { AssetOcrStatus, AssetExtractedTextSource } from '@buildos/shared-types';
import type { Json } from '@buildos/shared-types';

export type AssetLinkRole = 'attachment' | 'inline' | 'gallery' | 'cover';

export type AssetEntityKind =
	| 'project'
	| 'task'
	| 'document'
	| 'plan'
	| 'goal'
	| 'risk'
	| 'milestone';

export interface OntologyImageAsset {
	id: string;
	project_id: string;
	kind: string;
	storage_bucket: string;
	storage_path: string;
	original_filename: string | null;
	content_type: string;
	file_size_bytes: number;
	checksum_sha256: string | null;
	width: number | null;
	height: number | null;
	alt_text: string | null;
	caption: string | null;
	metadata: Json;
	ocr_status: AssetOcrStatus;
	ocr_error: string | null;
	ocr_model: string | null;
	ocr_version: number;
	ocr_started_at: string | null;
	ocr_completed_at: string | null;
	extracted_text: string | null;
	extracted_text_source: AssetExtractedTextSource | string;
	extracted_text_updated_at: string | null;
	extracted_text_updated_by: string | null;
	extraction_summary: string | null;
	extraction_metadata: Json;
	created_by: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	search_vector?: unknown;
}

export interface OntologyAssetLink {
	id: string;
	asset_id: string;
	project_id: string;
	entity_kind: AssetEntityKind | string;
	entity_id: string;
	role: AssetLinkRole;
	props: Json;
	created_by: string;
	created_at: string;
}
