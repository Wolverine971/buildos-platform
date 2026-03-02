// apps/web/src/lib/types/profile-contacts.ts

export type ContactMethodType =
	| 'phone'
	| 'email'
	| 'sms'
	| 'whatsapp'
	| 'telegram'
	| 'website'
	| 'address'
	| 'other';

export interface ContactMethodDraft {
	method_type: ContactMethodType;
	value: string;
	label?: string;
}

export interface ContactImportNormalizedInput {
	display_name: string;
	given_name?: string;
	family_name?: string;
	nickname?: string;
	relationship_label?: string;
	organization?: string;
	title?: string;
	notes?: string;
	methods: ContactMethodDraft[];
}

export interface ContactImportPreviewRow {
	row_number: number;
	status: 'ready' | 'skipped' | 'error';
	action: 'create_new' | 'upsert_existing' | 'none';
	reason?: string;
	normalized_input?: ContactImportNormalizedInput;
	matched_contact_id?: string;
	matched_contact_name?: string;
}

export interface ContactImportPreviewSummary {
	total: number;
	ready: number;
	skipped: number;
	errors: number;
}

export interface ContactImportPreviewResult {
	summary: ContactImportPreviewSummary;
	rows: ContactImportPreviewRow[];
}

export interface ContactImportCommitRowInput {
	row_number: number;
	action: 'create_new' | 'upsert_existing';
	normalized_input: ContactImportNormalizedInput;
	matched_contact_id?: string;
}

export interface ContactImportCommitRowResult {
	row_number: number;
	success: boolean;
	contact_id?: string;
	error?: string;
}

export interface ContactImportCommitResult {
	summary: {
		requested: number;
		imported: number;
		failed: number;
	};
	results: ContactImportCommitRowResult[];
}
