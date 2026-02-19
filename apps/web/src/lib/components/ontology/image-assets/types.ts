// apps/web/src/lib/components/ontology/image-assets/types.ts

export type AssetLinkRole = 'attachment' | 'inline' | 'gallery' | 'cover';

export interface OntologyImageAsset {
	id: string;
	project_id: string;
	ocr_status: string;
	alt_text: string | null;
	caption: string | null;
	original_filename?: string | null;
	extracted_text: string | null;
	extraction_summary: string | null;
	extracted_text_source?: string | null;
	created_at: string;
	updated_at?: string;
}

export interface OntologyAssetLink {
	id: string;
	asset_id: string;
	project_id: string;
	entity_kind: string;
	entity_id: string;
	role: AssetLinkRole;
	created_at: string;
}
