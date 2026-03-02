// apps/web/src/lib/server/user-contact.service.ts
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';
import type {
	ContactImportCommitResult,
	ContactImportNormalizedInput,
	ContactImportPreviewResult,
	ContactImportPreviewRow
} from '$lib/types/profile-contacts';

const logger = createLogger('UserContactService');

type AnySupabase = SupabaseClient<Database>;

export type ContactMethodInput = {
	method_type: string;
	label?: string | null;
	value: string;
	is_primary?: boolean;
	is_verified?: boolean;
	verification_source?: 'inferred' | 'user_confirmed' | 'import';
	confidence?: number;
	sensitivity?: 'standard' | 'sensitive';
	usage_scope?: 'all_agents' | 'profile_only' | 'never_prompt';
};

export type ContactUpsertInput = {
	display_name: string;
	given_name?: string | null;
	family_name?: string | null;
	nickname?: string | null;
	organization?: string | null;
	title?: string | null;
	notes?: string | null;
	relationship_label?: string | null;
	linked_user_id?: string | null;
	linked_actor_id?: string | null;
	confidence?: number;
	sensitivity?: 'standard' | 'sensitive';
	usage_scope?: 'all_agents' | 'profile_only' | 'never_prompt';
	methods?: ContactMethodInput[];
};

type NormalizedMethod = {
	methodType: string;
	label: string | null;
	valueRaw: string;
	valueNormalized: string;
	valueHash: string;
	isPrimary: boolean;
	isVerified: boolean;
	verificationSource: 'inferred' | 'user_confirmed' | 'import';
	confidence: number;
	sensitivity: 'standard' | 'sensitive';
	usageScope: 'all_agents' | 'profile_only' | 'never_prompt';
};

const CONTACT_METHOD_TYPES = new Set([
	'phone',
	'email',
	'sms',
	'whatsapp',
	'telegram',
	'website',
	'address',
	'other'
]);
const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const CSV_IMPORT_MAX_ROWS = 500;

export function resolveSensitiveContactExposure(args: {
	includeSensitiveValues?: boolean;
	userConfirmedSensitive?: boolean;
	reason?: string | null;
}): { exposeSensitive: boolean; warning?: string } {
	if (args.includeSensitiveValues !== true) {
		return { exposeSensitive: false };
	}
	if (args.userConfirmedSensitive === true) {
		const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
		if (reason.length >= 4) {
			return { exposeSensitive: true };
		}
	}
	return {
		exposeSensitive: false,
		warning:
			'Sensitive values remain redacted. To expose raw values, provide expose_sensitive=true (or include_sensitive_values=true), user_confirmed_sensitive=true, and a short reason.'
	};
}

function splitCsvRecord(recordText: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < recordText.length; i += 1) {
		const char = recordText[i];
		if (char === '"') {
			const next = recordText[i + 1];
			if (inQuotes && next === '"') {
				current += '"';
				i += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (char === ',' && !inQuotes) {
			values.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}

	if (inQuotes) {
		throw new Error('CSV contains unclosed quoted field');
	}

	values.push(current.trim());
	return values;
}

function parseCsvRows(csvText: string): string[][] {
	const rows: string[][] = [];
	let currentRecord = '';
	let inQuotes = false;

	for (let i = 0; i < csvText.length; i += 1) {
		const char = csvText[i];
		if (char === '"') {
			const next = csvText[i + 1];
			if (inQuotes && next === '"') {
				currentRecord += '""';
				i += 1;
				continue;
			}
			inQuotes = !inQuotes;
			currentRecord += char;
			continue;
		}

		if (!inQuotes && (char === '\n' || char === '\r')) {
			if (char === '\r' && csvText[i + 1] === '\n') {
				i += 1;
			}
			if (currentRecord.trim().length > 0) {
				rows.push(splitCsvRecord(currentRecord));
			}
			currentRecord = '';
			continue;
		}

		currentRecord += char;
	}

	if (currentRecord.trim().length > 0) {
		rows.push(splitCsvRecord(currentRecord));
	}

	if (inQuotes) {
		throw new Error('CSV contains unclosed quoted field');
	}

	return rows;
}

function toFiniteConfidence(value: unknown, fallback = 0.7): number {
	const num = Number(value);
	if (!Number.isFinite(num)) return fallback;
	return Math.max(0, Math.min(num, 1));
}

function clampText(value: unknown, max = 2000): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function normalizeName(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeEmail(value: string): string | null {
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailPattern.test(normalized) ? normalized : null;
}

function normalizePhone(value: string): string | null {
	const raw = value.trim();
	if (!raw) return null;

	const plusPrefixed = raw.startsWith('+');
	const digits = raw.replace(/\D/g, '');
	if (digits.length < 8 || digits.length > 15) return null;

	if (plusPrefixed) {
		return `+${digits}`;
	}
	if (digits.length === 11 && digits.startsWith('1')) {
		return `+${digits}`;
	}
	if (digits.length === 10) {
		return `+1${digits}`;
	}
	if (raw.startsWith('00')) {
		return `+${digits.slice(2)}`;
	}

	return `+${digits}`;
}

function hashNormalizedValue(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeMethodInput(input: ContactMethodInput): NormalizedMethod {
	const rawType =
		typeof input.method_type === 'string' ? input.method_type.trim().toLowerCase() : '';
	if (!rawType) {
		throw new Error('method_type is required for each method');
	}
	if (!CONTACT_METHOD_TYPES.has(rawType)) {
		throw new Error(`Unsupported method_type: ${rawType}`);
	}

	const valueRaw = clampText(input.value, 500);
	if (!valueRaw) {
		throw new Error('Method value is required');
	}

	let valueNormalized: string | null = null;
	if (rawType === 'email') {
		valueNormalized = normalizeEmail(valueRaw);
	} else if (
		rawType === 'phone' ||
		rawType === 'sms' ||
		rawType === 'whatsapp' ||
		rawType === 'telegram'
	) {
		valueNormalized = normalizePhone(valueRaw);
	} else {
		valueNormalized = valueRaw.trim().toLowerCase();
	}

	if (!valueNormalized) {
		throw new Error(`Could not normalize method value for type ${rawType}`);
	}

	return {
		methodType: rawType,
		label: clampText(input.label, 80),
		valueRaw,
		valueNormalized,
		valueHash: hashNormalizedValue(valueNormalized),
		isPrimary: input.is_primary === true,
		isVerified: input.is_verified === true,
		verificationSource:
			input.verification_source === 'user_confirmed' || input.verification_source === 'import'
				? input.verification_source
				: 'inferred',
		confidence: toFiniteConfidence(input.confidence, 0.7),
		sensitivity: input.sensitivity === 'standard' ? 'standard' : 'sensitive',
		usageScope:
			input.usage_scope === 'all_agents' || input.usage_scope === 'never_prompt'
				? input.usage_scope
				: 'profile_only'
	};
}

function redactMethodValue(methodType: string, rawValue: string): string {
	if (methodType === 'email') {
		const [local = '', domain = ''] = rawValue.split('@');
		if (!domain) return '***';
		const safeLocal = local.length <= 1 ? '*' : `${local[0]}***`;
		return `${safeLocal}@${domain}`;
	}
	if (
		methodType === 'phone' ||
		methodType === 'sms' ||
		methodType === 'whatsapp' ||
		methodType === 'telegram'
	) {
		const digits = rawValue.replace(/\D/g, '');
		if (digits.length <= 4) return '***';
		return `***${digits.slice(-4)}`;
	}
	if (rawValue.length <= 6) return '***';
	return `${rawValue.slice(0, 2)}***${rawValue.slice(-2)}`;
}

function sanitizeMethodColumns(
	row: Record<string, any>,
	exposeSensitive: boolean
): Record<string, any> {
	if (exposeSensitive) return row;
	return {
		...row,
		value_raw: null,
		value_normalized: null,
		value_hash: null
	};
}

async function getProfileIdForUser(supabase: AnySupabase, userId: string): Promise<string | null> {
	const supabaseAny = supabase as any;
	const { data, error } = await supabaseAny
		.from('user_profiles')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		logger.warn('Failed to load profile id for contacts', { userId, error });
		return null;
	}
	return typeof data?.id === 'string' ? data.id : null;
}

async function assertOwnedContact(params: {
	supabase: AnySupabase;
	userId: string;
	contactId: string;
}): Promise<Record<string, any>> {
	const { supabase, userId, contactId } = params;
	const supabaseAny = supabase as any;
	const { data, error } = await supabaseAny
		.from('user_contacts')
		.select('*')
		.eq('id', contactId)
		.eq('user_id', userId)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) throw new Error(`Failed to load contact: ${error.message}`);
	if (!data) throw new Error('Contact not found');
	return data;
}

async function upsertContactMethods(params: {
	supabase: AnySupabase;
	userId: string;
	contactId: string;
	methods: ContactMethodInput[];
}): Promise<void> {
	const { supabase, userId, contactId, methods } = params;
	const supabaseAny = supabase as any;

	for (const methodInput of methods) {
		const method = normalizeMethodInput(methodInput);

		const { data: existing, error: existingError } = await supabaseAny
			.from('user_contact_methods')
			.select('*')
			.eq('contact_id', contactId)
			.eq('method_type', method.methodType)
			.eq('value_hash', method.valueHash)
			.is('deleted_at', null)
			.maybeSingle();

		if (existingError) {
			throw new Error(`Failed to query contact method: ${existingError.message}`);
		}

		const payload = {
			user_id: userId,
			contact_id: contactId,
			method_type: method.methodType,
			label: method.label,
			value_raw: method.valueRaw,
			value_normalized: method.valueNormalized,
			value_hash: method.valueHash,
			is_primary: method.isPrimary,
			is_verified: method.isVerified,
			verification_source: method.verificationSource,
			confidence: method.confidence,
			sensitivity: method.sensitivity,
			usage_scope: method.usageScope,
			updated_at: new Date().toISOString()
		};

		if (existing?.id) {
			const { error: updateError } = await supabaseAny
				.from('user_contact_methods')
				.update(payload)
				.eq('id', existing.id)
				.eq('user_id', userId);
			if (updateError) {
				throw new Error(`Failed to update contact method: ${updateError.message}`);
			}
		} else {
			const { error: insertError } = await supabaseAny
				.from('user_contact_methods')
				.insert(payload);
			if (insertError) {
				throw new Error(`Failed to insert contact method: ${insertError.message}`);
			}
		}

		if (method.isPrimary) {
			const { error: demoteError } = await supabaseAny
				.from('user_contact_methods')
				.update({ is_primary: false, updated_at: new Date().toISOString() })
				.eq('user_id', userId)
				.eq('contact_id', contactId)
				.eq('method_type', method.methodType)
				.neq('value_hash', method.valueHash)
				.is('deleted_at', null);
			if (demoteError) {
				logger.warn('Failed to demote other primary methods', {
					userId,
					contactId,
					methodType: method.methodType,
					error: demoteError
				});
			}
		}
	}
}

async function getMethodsForContacts(params: {
	supabase: AnySupabase;
	userId: string;
	contactIds: string[];
	exposeSensitive: boolean;
	includeSensitiveColumns?: boolean;
}): Promise<Map<string, Record<string, any>[]>> {
	const {
		supabase,
		userId,
		contactIds,
		exposeSensitive,
		includeSensitiveColumns = exposeSensitive
	} = params;
	if (!contactIds.length) return new Map();
	const supabaseAny = supabase as any;

	const { data, error } = await supabaseAny
		.from('user_contact_methods')
		.select('*')
		.eq('user_id', userId)
		.in('contact_id', contactIds)
		.is('deleted_at', null)
		.order('is_primary', { ascending: false })
		.order('updated_at', { ascending: false });

	if (error) throw new Error(`Failed to load contact methods: ${error.message}`);

	const grouped = new Map<string, Record<string, any>[]>();
	for (const row of data ?? []) {
		const contactId = String(row.contact_id);
		const existing = grouped.get(contactId) ?? [];
		const methodPayload = {
			...row,
			value_display: exposeSensitive
				? row.value_raw
				: redactMethodValue(String(row.method_type ?? 'other'), String(row.value_raw ?? ''))
		};
		existing.push(
			includeSensitiveColumns
				? methodPayload
				: sanitizeMethodColumns(methodPayload, exposeSensitive)
		);
		grouped.set(contactId, existing);
	}

	return grouped;
}

async function chooseContactByStrongMethod(params: {
	supabase: AnySupabase;
	userId: string;
	methods: ContactMethodInput[];
}): Promise<string | null> {
	const { supabase, userId, methods } = params;
	const supabaseAny = supabase as any;
	const matches = new Set<string>();

	for (const methodInput of methods) {
		const method = normalizeMethodInput(methodInput);
		const { data, error } = await supabaseAny
			.from('user_contact_methods')
			.select('contact_id')
			.eq('user_id', userId)
			.eq('method_type', method.methodType)
			.eq('value_hash', method.valueHash)
			.is('deleted_at', null);

		if (error) {
			throw new Error(`Failed to query existing methods: ${error.message}`);
		}
		for (const row of data ?? []) {
			matches.add(String(row.contact_id));
		}
	}

	if (matches.size > 1) {
		throw new Error(
			'Multiple contacts match these method values. Resolve merge candidates first.'
		);
	}
	return matches.values().next().value ?? null;
}

async function getContactWithMethods(params: {
	supabase: AnySupabase;
	userId: string;
	contactId: string;
	exposeSensitive: boolean;
}): Promise<Record<string, any>> {
	const { supabase, userId, contactId, exposeSensitive } = params;
	const contact = await assertOwnedContact({ supabase, userId, contactId });
	const methods = await getMethodsForContacts({
		supabase,
		userId,
		contactIds: [contactId],
		exposeSensitive
	});
	return {
		...contact,
		methods: methods.get(contactId) ?? []
	};
}

function readCsvField(row: Record<string, string>, aliases: string[]): string | undefined {
	for (const alias of aliases) {
		const value = row[alias];
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return undefined;
}

function normalizeCsvImportRow(row: Record<string, string>): {
	normalized?: ContactImportNormalizedInput;
	error?: string;
} {
	const displayNameField = readCsvField(row, ['display_name', 'name', 'full_name']);
	const givenName = readCsvField(row, ['given_name', 'first_name']);
	const familyName = readCsvField(row, ['family_name', 'last_name', 'surname']);
	const displayName =
		displayNameField ?? [givenName, familyName].filter(Boolean).join(' ').trim();

	if (!displayName) {
		return {
			error: 'display_name is required (or provide given_name and family_name).'
		};
	}

	const phone = readCsvField(row, ['phone', 'phone_number', 'mobile']);
	const phoneLabel = readCsvField(row, ['phone_label', 'mobile_label']);
	const email = readCsvField(row, ['email', 'email_address']);
	const emailLabel = readCsvField(row, ['email_label']);

	const methods: ContactMethodInput[] = [];
	if (phone) {
		methods.push({
			method_type: 'phone',
			value: phone,
			label: phoneLabel ?? null
		});
	}
	if (email) {
		methods.push({
			method_type: 'email',
			value: email,
			label: emailLabel ?? null
		});
	}

	try {
		for (const method of methods) {
			normalizeMethodInput(method);
		}
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Invalid method value'
		};
	}

	return {
		normalized: {
			display_name: displayName,
			...(givenName ? { given_name: givenName } : {}),
			...(familyName ? { family_name: familyName } : {}),
			...(readCsvField(row, ['nickname'])
				? { nickname: readCsvField(row, ['nickname']) }
				: {}),
			...(readCsvField(row, ['relationship_label', 'relationship'])
				? {
						relationship_label: readCsvField(row, [
							'relationship_label',
							'relationship'
						])
					}
				: {}),
			...(readCsvField(row, ['organization', 'company'])
				? { organization: readCsvField(row, ['organization', 'company']) }
				: {}),
			...(readCsvField(row, ['title', 'job_title'])
				? { title: readCsvField(row, ['title', 'job_title']) }
				: {}),
			...(readCsvField(row, ['notes', 'note'])
				? { notes: readCsvField(row, ['notes', 'note']) }
				: {}),
			methods: methods.map((method) => ({
				method_type: method.method_type as 'phone' | 'email',
				value: method.value,
				...(method.label ? { label: method.label } : {})
			}))
		}
	};
}

async function matchContactIdsByStrongMethods(params: {
	supabase: AnySupabase;
	userId: string;
	methods: ContactMethodInput[];
}): Promise<{ ids: string[]; ambiguous: boolean }> {
	const { supabase, userId, methods } = params;
	const supabaseAny = supabase as any;
	const strongMethods = methods.filter(
		(method) => method.method_type === 'phone' || method.method_type === 'email'
	);
	if (strongMethods.length === 0) {
		return { ids: [], ambiguous: false };
	}

	const matchedIds = new Set<string>();
	let ambiguous = false;

	for (const methodInput of strongMethods) {
		const method = normalizeMethodInput(methodInput);
		const { data, error } = await supabaseAny
			.from('user_contact_methods')
			.select('contact_id')
			.eq('user_id', userId)
			.eq('method_type', method.methodType)
			.eq('value_hash', method.valueHash)
			.is('deleted_at', null);

		if (error) {
			throw new Error(`Failed to query contact methods during import: ${error.message}`);
		}

		const idsForMethod: string[] = Array.from(
			new Set<string>(
				(data ?? [])
					.map((item: Record<string, unknown>) => item.contact_id)
					.filter((value: unknown): value is string => typeof value === 'string')
			)
		);
		if (idsForMethod.length > 1) {
			ambiguous = true;
		}
		for (const id of idsForMethod) {
			matchedIds.add(id);
		}
	}

	if (matchedIds.size > 1) {
		ambiguous = true;
	}

	return {
		ids: Array.from(matchedIds),
		ambiguous
	};
}

async function getContactNamesById(params: {
	supabase: AnySupabase;
	userId: string;
	contactIds: string[];
}): Promise<Map<string, string>> {
	const { supabase, userId, contactIds } = params;
	if (contactIds.length === 0) return new Map();

	const supabaseAny = supabase as any;
	const { data, error } = await supabaseAny
		.from('user_contacts')
		.select('id, display_name')
		.eq('user_id', userId)
		.in('id', contactIds);

	if (error) {
		throw new Error(`Failed to load matched contact names: ${error.message}`);
	}

	const names = new Map<string, string>();
	for (const row of data ?? []) {
		const id = typeof row?.id === 'string' ? row.id : '';
		const displayName =
			typeof row?.display_name === 'string' && row.display_name.trim().length > 0
				? row.display_name.trim()
				: 'Contact';
		if (id) names.set(id, displayName);
	}
	return names;
}

export async function previewUserContactCsvImport(params: {
	supabase: AnySupabase;
	userId: string;
	csvText: string;
}): Promise<ContactImportPreviewResult> {
	const { supabase, userId, csvText } = params;
	if (typeof csvText !== 'string' || csvText.trim().length === 0) {
		throw new Error('CSV file is required');
	}
	if (Buffer.byteLength(csvText, 'utf8') > CSV_IMPORT_MAX_BYTES) {
		throw new Error('CSV file exceeds 2 MB limit');
	}

	const rawRows = parseCsvRows(csvText);
	if (rawRows.length === 0) {
		throw new Error('CSV has no rows');
	}

	const rawHeaders = rawRows[0] ?? [];
	const headers = rawHeaders.map((header) =>
		header
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
	);
	if (headers.length === 0 || headers.every((header) => header.length === 0)) {
		throw new Error('CSV header row is required');
	}

	const dataRows = rawRows.slice(1);
	if (dataRows.length > CSV_IMPORT_MAX_ROWS) {
		throw new Error(`CSV row count exceeds ${CSV_IMPORT_MAX_ROWS}`);
	}

	const rows: ContactImportPreviewRow[] = [];
	const matchedContactIds = new Set<string>();

	for (let index = 0; index < dataRows.length; index += 1) {
		const record = dataRows[index] ?? [];
		const rowNumber = index + 2;
		const rowObject: Record<string, string> = {};
		for (let i = 0; i < headers.length; i += 1) {
			const header = headers[i];
			if (!header) continue;
			rowObject[header] = String(record[i] ?? '');
		}

		const hasAnyValue = Object.values(rowObject).some((value) => value.trim().length > 0);
		if (!hasAnyValue) {
			rows.push({
				row_number: rowNumber,
				status: 'skipped',
				action: 'none',
				reason: 'Row is empty.'
			});
			continue;
		}

		const normalizedResult = normalizeCsvImportRow(rowObject);
		if (!normalizedResult.normalized) {
			rows.push({
				row_number: rowNumber,
				status: 'error',
				action: 'none',
				reason: normalizedResult.error ?? 'Invalid row'
			});
			continue;
		}

		const methods = normalizedResult.normalized.methods.map((method) => ({
			method_type: method.method_type,
			value: method.value,
			label: method.label ?? null
		}));
		const matchResult = await matchContactIdsByStrongMethods({
			supabase,
			userId,
			methods
		});

		if (matchResult.ambiguous) {
			rows.push({
				row_number: rowNumber,
				status: 'skipped',
				action: 'none',
				reason: 'Multiple strong method matches found. Resolve manually.',
				normalized_input: normalizedResult.normalized
			});
			continue;
		}

		if (matchResult.ids.length === 1) {
			const matchedId = matchResult.ids[0]!;
			matchedContactIds.add(matchedId);
			rows.push({
				row_number: rowNumber,
				status: 'ready',
				action: 'upsert_existing',
				normalized_input: normalizedResult.normalized,
				matched_contact_id: matchedId
			});
			continue;
		}

		rows.push({
			row_number: rowNumber,
			status: 'ready',
			action: 'create_new',
			normalized_input: normalizedResult.normalized
		});
	}

	if (matchedContactIds.size > 0) {
		const namesById = await getContactNamesById({
			supabase,
			userId,
			contactIds: Array.from(matchedContactIds)
		});
		for (const row of rows) {
			if (row.matched_contact_id) {
				row.matched_contact_name =
					namesById.get(row.matched_contact_id) ?? 'Existing contact';
			}
		}
	}

	const summary = {
		total: rows.length,
		ready: rows.filter((row) => row.status === 'ready').length,
		skipped: rows.filter((row) => row.status === 'skipped').length,
		errors: rows.filter((row) => row.status === 'error').length
	};

	return { summary, rows };
}

type ContactUpsertDedupeMode = 'default' | 'strong_method_only';

function toContactUpsertInput(normalized: ContactImportNormalizedInput): ContactUpsertInput {
	return {
		display_name: normalized.display_name,
		given_name: normalized.given_name ?? null,
		family_name: normalized.family_name ?? null,
		nickname: normalized.nickname ?? null,
		organization: normalized.organization ?? null,
		title: normalized.title ?? null,
		notes: normalized.notes ?? null,
		relationship_label: normalized.relationship_label ?? null,
		methods: (normalized.methods ?? []).map((method) => ({
			method_type: method.method_type,
			value: method.value,
			label: method.label ?? null
		}))
	};
}

export async function commitUserContactCsvImport(params: {
	supabase: AnySupabase;
	userId: string;
	rows: Array<{
		row_number: number;
		action: 'create_new' | 'upsert_existing';
		normalized_input: ContactImportNormalizedInput;
		matched_contact_id?: string;
	}>;
	handlers?: {
		updateUserContact?: typeof updateUserContact;
		createOrUpsertUserContact?: typeof createOrUpsertUserContact;
	};
}): Promise<ContactImportCommitResult> {
	const { supabase, userId, rows } = params;
	const updateContactHandler = params.handlers?.updateUserContact ?? updateUserContact;
	const createContactHandler =
		params.handlers?.createOrUpsertUserContact ?? createOrUpsertUserContact;
	const requestedRows = Array.isArray(rows) ? rows : [];
	if (requestedRows.length === 0) {
		throw new Error('At least one import row is required');
	}
	if (requestedRows.length > CSV_IMPORT_MAX_ROWS) {
		throw new Error(`Import row count exceeds ${CSV_IMPORT_MAX_ROWS}`);
	}

	const results: ContactImportCommitResult['results'] = [];
	let importedCount = 0;

	for (const row of requestedRows) {
		const rowNumber = Number(row?.row_number ?? 0);
		const action = row?.action;
		const normalizedInput = row?.normalized_input;

		if (!Number.isFinite(rowNumber) || rowNumber <= 0) {
			results.push({
				row_number: 0,
				success: false,
				error: 'Invalid row_number'
			});
			continue;
		}
		if (action !== 'create_new' && action !== 'upsert_existing') {
			results.push({
				row_number: rowNumber,
				success: false,
				error: 'Invalid action'
			});
			continue;
		}
		if (!normalizedInput || typeof normalizedInput !== 'object') {
			results.push({
				row_number: rowNumber,
				success: false,
				error: 'normalized_input is required'
			});
			continue;
		}

		try {
			if (action === 'upsert_existing') {
				const contactId =
					typeof row.matched_contact_id === 'string' ? row.matched_contact_id : '';
				if (!contactId) {
					throw new Error('matched_contact_id is required for upsert_existing');
				}

				const { contact } = await updateContactHandler({
					supabase,
					userId,
					contactId,
					input: toContactUpsertInput(normalizedInput),
					exposeSensitive: false
				});
				importedCount += 1;
				results.push({
					row_number: rowNumber,
					success: true,
					contact_id: String(contact.id ?? contactId)
				});
				continue;
			}

			const { contact } = await createContactHandler({
				supabase,
				userId,
				input: toContactUpsertInput(normalizedInput),
				exposeSensitive: false,
				dedupeMode: 'strong_method_only'
			});
			importedCount += 1;
			results.push({
				row_number: rowNumber,
				success: true,
				contact_id: String(contact.id ?? '')
			});
		} catch (error) {
			results.push({
				row_number: rowNumber,
				success: false,
				error: error instanceof Error ? error.message : 'Failed to import row'
			});
		}
	}

	return {
		summary: {
			requested: requestedRows.length,
			imported: importedCount,
			failed: requestedRows.length - importedCount
		},
		results
	};
}

export async function listUserContacts(params: {
	supabase: AnySupabase;
	userId: string;
	includeArchived?: boolean;
	includeMethods?: boolean;
	exposeSensitive?: boolean;
	limit?: number;
}): Promise<{ contacts: Record<string, any>[] }> {
	const {
		supabase,
		userId,
		includeArchived = false,
		includeMethods = true,
		exposeSensitive = false,
		limit = 200
	} = params;
	const supabaseAny = supabase as any;

	let query = supabaseAny
		.from('user_contacts')
		.select('*')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false })
		.limit(Math.max(1, Math.min(limit, 500)));

	if (!includeArchived) {
		query = query.eq('status', 'active').is('deleted_at', null);
	}

	const { data, error } = await query;
	if (error) throw new Error(`Failed to list contacts: ${error.message}`);

	const contacts = (data ?? []) as Record<string, any>[];
	if (!includeMethods || contacts.length === 0) {
		return { contacts };
	}

	const contactIds = contacts.map((contact) => String(contact.id));
	const methodMap = await getMethodsForContacts({
		supabase,
		userId,
		contactIds,
		exposeSensitive,
		includeSensitiveColumns: true
	});

	return {
		contacts: contacts.map((contact) => ({
			...contact,
			methods: methodMap.get(String(contact.id)) ?? []
		}))
	};
}

export async function searchUserContacts(params: {
	supabase: AnySupabase;
	userId: string;
	query?: string | null;
	methodType?: string | null;
	relationshipLabel?: string | null;
	includeArchived?: boolean;
	includeMethods?: boolean;
	exposeSensitive?: boolean;
	limit?: number;
}): Promise<{ contacts: Record<string, any>[]; total_considered: number }> {
	const {
		supabase,
		userId,
		query,
		methodType,
		relationshipLabel,
		includeArchived = false,
		includeMethods = true,
		exposeSensitive = false,
		limit = 20
	} = params;
	const supabaseAny = supabase as any;

	const normalizedQuery = clampText(query, 240)?.toLowerCase() ?? null;
	const normalizedRelationship = clampText(relationshipLabel, 120)?.toLowerCase() ?? null;
	const normalizedMethodType =
		typeof methodType === 'string' && CONTACT_METHOD_TYPES.has(methodType.trim().toLowerCase())
			? methodType.trim().toLowerCase()
			: null;

	const requestedLimit = Math.max(1, Math.min(limit, 200));
	const poolLimit = Math.max(50, Math.min(requestedLimit * 5, 500));

	let contactQuery = supabaseAny
		.from('user_contacts')
		.select('*')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false })
		.limit(poolLimit);

	if (!includeArchived) {
		contactQuery = contactQuery.eq('status', 'active').is('deleted_at', null);
	}

	const { data, error } = await contactQuery;
	if (error) throw new Error(`Failed to search contacts: ${error.message}`);

	const contacts = (data ?? []) as Record<string, any>[];
	if (contacts.length === 0) {
		return { contacts: [], total_considered: 0 };
	}

	const contactIds = contacts.map((contact) => String(contact.id));
	const methodMap = await getMethodsForContacts({
		supabase,
		userId,
		contactIds,
		exposeSensitive
	});

	const filtered = contacts.filter((contact) => {
		const methods = methodMap.get(String(contact.id)) ?? [];
		if (
			normalizedMethodType &&
			!methods.some((method) => method.method_type === normalizedMethodType)
		) {
			return false;
		}

		if (normalizedRelationship) {
			const relationship = String(contact.relationship_label ?? '').toLowerCase();
			if (!relationship.includes(normalizedRelationship)) return false;
		}

		if (!normalizedQuery) return true;

		const searchableFields = [
			contact.display_name,
			contact.given_name,
			contact.family_name,
			contact.nickname,
			contact.organization,
			contact.title,
			contact.relationship_label,
			contact.notes
		]
			.filter((value): value is string => typeof value === 'string')
			.map((value) => value.toLowerCase());

		const contactMatch = searchableFields.some((value) => value.includes(normalizedQuery));
		if (contactMatch) return true;

		return methods.some((method) => {
			const haystack = [
				typeof method.label === 'string' ? method.label : '',
				typeof method.method_type === 'string' ? method.method_type : '',
				typeof method.value_normalized === 'string' ? method.value_normalized : '',
				typeof method.value_raw === 'string' ? method.value_raw : ''
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(normalizedQuery);
		});
	});

	const selected = filtered.slice(0, requestedLimit);
	if (!includeMethods) {
		return {
			contacts: selected,
			total_considered: contacts.length
		};
	}

	return {
		contacts: selected.map((contact) => {
			const methods = methodMap.get(String(contact.id)) ?? [];
			return {
				...contact,
				methods: methods.map((method) => sanitizeMethodColumns(method, exposeSensitive))
			};
		}),
		total_considered: contacts.length
	};
}

export async function createOrUpsertUserContact(params: {
	supabase: AnySupabase;
	userId: string;
	input: ContactUpsertInput;
	exposeSensitive?: boolean;
	dedupeMode?: ContactUpsertDedupeMode;
}): Promise<{ contact: Record<string, any>; created: boolean }> {
	const { supabase, userId, input, exposeSensitive = false, dedupeMode = 'default' } = params;
	const supabaseAny = supabase as any;

	const displayName = clampText(input.display_name, 240);
	if (!displayName) throw new Error('display_name is required');
	const normalizedDisplayName = normalizeName(displayName);
	const methods = Array.isArray(input.methods) ? input.methods : [];

	let contactId: string | null = null;
	if (methods.length > 0) {
		contactId = await chooseContactByStrongMethod({ supabase, userId, methods });
	}

	if (!contactId && dedupeMode !== 'strong_method_only') {
		const { data: byName, error: byNameError } = await supabaseAny
			.from('user_contacts')
			.select('id')
			.eq('user_id', userId)
			.eq('normalized_name', normalizedDisplayName)
			.eq('status', 'active')
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(2);

		if (byNameError) {
			throw new Error(`Failed to check existing contact by name: ${byNameError.message}`);
		}
		if ((byName ?? []).length > 1) {
			throw new Error('Multiple contacts match this name. Use contact id to disambiguate.');
		}
		contactId = byName?.[0]?.id ?? null;
	}

	const nowIso = new Date().toISOString();
	let created = false;
	if (!contactId) {
		const profileId = await getProfileIdForUser(supabase, userId);
		const payload = {
			user_id: userId,
			profile_id: profileId,
			display_name: displayName,
			given_name: clampText(input.given_name, 120),
			family_name: clampText(input.family_name, 120),
			nickname: clampText(input.nickname, 120),
			organization: clampText(input.organization, 240),
			title: clampText(input.title, 180),
			notes: clampText(input.notes, 4000),
			relationship_label: clampText(input.relationship_label, 120),
			linked_user_id: input.linked_user_id ?? null,
			linked_actor_id: input.linked_actor_id ?? null,
			confidence: toFiniteConfidence(input.confidence, 0.7),
			sensitivity: input.sensitivity === 'standard' ? 'standard' : 'sensitive',
			usage_scope:
				input.usage_scope === 'all_agents' || input.usage_scope === 'never_prompt'
					? input.usage_scope
					: 'profile_only',
			normalized_name: normalizedDisplayName,
			first_seen_source: 'manual',
			first_seen_at: nowIso,
			last_seen_at: nowIso
		};

		const { data: inserted, error: insertError } = await supabaseAny
			.from('user_contacts')
			.insert(payload)
			.select('id')
			.single();
		if (insertError || !inserted?.id) {
			throw new Error(`Failed to create contact: ${insertError?.message ?? 'unknown'}`);
		}
		contactId = inserted.id as string;
		created = true;
	} else {
		const updatePayload: Record<string, unknown> = {
			display_name: displayName,
			normalized_name: normalizedDisplayName,
			last_seen_at: nowIso,
			updated_at: nowIso
		};
		if (input.given_name !== undefined)
			updatePayload.given_name = clampText(input.given_name, 120);
		if (input.family_name !== undefined)
			updatePayload.family_name = clampText(input.family_name, 120);
		if (input.nickname !== undefined) updatePayload.nickname = clampText(input.nickname, 120);
		if (input.organization !== undefined)
			updatePayload.organization = clampText(input.organization, 240);
		if (input.title !== undefined) updatePayload.title = clampText(input.title, 180);
		if (input.notes !== undefined) updatePayload.notes = clampText(input.notes, 4000);
		if (input.relationship_label !== undefined)
			updatePayload.relationship_label = clampText(input.relationship_label, 120);
		if (input.linked_user_id !== undefined) updatePayload.linked_user_id = input.linked_user_id;
		if (input.linked_actor_id !== undefined)
			updatePayload.linked_actor_id = input.linked_actor_id;
		if (input.confidence !== undefined)
			updatePayload.confidence = toFiniteConfidence(input.confidence, 0.7);
		if (input.sensitivity !== undefined)
			updatePayload.sensitivity = input.sensitivity === 'standard' ? 'standard' : 'sensitive';
		if (input.usage_scope !== undefined) {
			updatePayload.usage_scope =
				input.usage_scope === 'all_agents' || input.usage_scope === 'never_prompt'
					? input.usage_scope
					: 'profile_only';
		}

		const { error: updateError } = await supabaseAny
			.from('user_contacts')
			.update(updatePayload)
			.eq('id', contactId)
			.eq('user_id', userId);
		if (updateError) {
			throw new Error(`Failed to update contact: ${updateError.message}`);
		}
	}

	if (methods.length > 0) {
		await upsertContactMethods({
			supabase,
			userId,
			contactId,
			methods
		});
	}

	const contact = await getContactWithMethods({
		supabase,
		userId,
		contactId,
		exposeSensitive
	});
	return { contact, created };
}

export async function updateUserContact(params: {
	supabase: AnySupabase;
	userId: string;
	contactId: string;
	input: Partial<ContactUpsertInput> & { status?: 'active' | 'archived' };
	exposeSensitive?: boolean;
}): Promise<{ contact: Record<string, any>; updated: boolean }> {
	const { supabase, userId, contactId, input, exposeSensitive = false } = params;
	const supabaseAny = supabase as any;
	await assertOwnedContact({ supabase, userId, contactId });

	const updatePayload: Record<string, unknown> = {};
	if (input.display_name !== undefined) {
		const displayName = clampText(input.display_name, 240);
		if (!displayName) throw new Error('display_name cannot be empty');
		updatePayload.display_name = displayName;
		updatePayload.normalized_name = normalizeName(displayName);
	}
	if (input.given_name !== undefined) updatePayload.given_name = clampText(input.given_name, 120);
	if (input.family_name !== undefined)
		updatePayload.family_name = clampText(input.family_name, 120);
	if (input.nickname !== undefined) updatePayload.nickname = clampText(input.nickname, 120);
	if (input.organization !== undefined)
		updatePayload.organization = clampText(input.organization, 240);
	if (input.title !== undefined) updatePayload.title = clampText(input.title, 180);
	if (input.notes !== undefined) updatePayload.notes = clampText(input.notes, 4000);
	if (input.relationship_label !== undefined)
		updatePayload.relationship_label = clampText(input.relationship_label, 120);
	if (input.linked_user_id !== undefined) updatePayload.linked_user_id = input.linked_user_id;
	if (input.linked_actor_id !== undefined) updatePayload.linked_actor_id = input.linked_actor_id;
	if (input.confidence !== undefined)
		updatePayload.confidence = toFiniteConfidence(input.confidence, 0.7);
	if (input.sensitivity !== undefined)
		updatePayload.sensitivity = input.sensitivity === 'standard' ? 'standard' : 'sensitive';
	if (input.usage_scope !== undefined) {
		updatePayload.usage_scope =
			input.usage_scope === 'all_agents' || input.usage_scope === 'never_prompt'
				? input.usage_scope
				: 'profile_only';
	}
	if (input.status !== undefined) updatePayload.status = input.status;

	const nowIso = new Date().toISOString();
	let updated = false;
	if (Object.keys(updatePayload).length > 0) {
		updatePayload.updated_at = nowIso;
		updatePayload.last_seen_at = nowIso;
		const { error: updateError } = await supabaseAny
			.from('user_contacts')
			.update(updatePayload)
			.eq('id', contactId)
			.eq('user_id', userId);
		if (updateError) throw new Error(`Failed to update contact: ${updateError.message}`);
		updated = true;
	}

	const methods = Array.isArray(input.methods) ? input.methods : [];
	if (methods.length > 0) {
		await upsertContactMethods({ supabase, userId, contactId, methods });
		updated = true;
	}

	const contact = await getContactWithMethods({
		supabase,
		userId,
		contactId,
		exposeSensitive
	});
	return { contact, updated };
}

export async function archiveUserContact(params: {
	supabase: AnySupabase;
	userId: string;
	contactId: string;
}): Promise<{ archived: boolean }> {
	const { supabase, userId, contactId } = params;
	const supabaseAny = supabase as any;
	await assertOwnedContact({ supabase, userId, contactId });

	const nowIso = new Date().toISOString();
	const { error } = await supabaseAny
		.from('user_contacts')
		.update({
			status: 'archived',
			deleted_at: nowIso,
			updated_at: nowIso
		})
		.eq('id', contactId)
		.eq('user_id', userId);

	if (error) throw new Error(`Failed to archive contact: ${error.message}`);
	return { archived: true };
}

export async function listUserContactMergeCandidates(params: {
	supabase: AnySupabase;
	userId: string;
	limit?: number;
	status?: 'pending' | 'confirmed_merge' | 'rejected' | 'snoozed';
	exposeSensitive?: boolean;
}): Promise<{ candidates: Record<string, any>[] }> {
	const { supabase, userId, limit = 100, status = 'pending', exposeSensitive = false } = params;
	const supabaseAny = supabase as any;

	const { data, error } = await supabaseAny
		.from('user_contact_merge_candidates')
		.select('*')
		.eq('user_id', userId)
		.eq('status', status)
		.order('created_at', { ascending: false })
		.limit(Math.max(1, Math.min(limit, 500)));

	if (error) throw new Error(`Failed to list merge candidates: ${error.message}`);
	const candidates = (data ?? []) as Record<string, any>[];

	const contactIds = Array.from(
		new Set(
			candidates
				.flatMap((candidate) => [
					candidate.primary_contact_id,
					candidate.secondary_contact_id
				])
				.filter((value): value is string => typeof value === 'string')
		)
	);

	const { contacts } = await listUserContacts({
		supabase,
		userId,
		includeArchived: true,
		includeMethods: true,
		exposeSensitive,
		limit: Math.max(500, contactIds.length + 20)
	});
	const contactsById = new Map(contacts.map((contact) => [String(contact.id), contact]));

	return {
		candidates: candidates.map((candidate) => ({
			...candidate,
			primary_contact: contactsById.get(String(candidate.primary_contact_id)) ?? null,
			secondary_contact: contactsById.get(String(candidate.secondary_contact_id)) ?? null
		}))
	};
}

async function mergeContacts(params: {
	supabase: AnySupabase;
	userId: string;
	primaryContactId: string;
	secondaryContactId: string;
}): Promise<void> {
	const { supabase, userId, primaryContactId, secondaryContactId } = params;
	const supabaseAny = supabase as any;
	const nowIso = new Date().toISOString();

	const { data: secondaryMethods, error: methodsError } = await supabaseAny
		.from('user_contact_methods')
		.select('*')
		.eq('user_id', userId)
		.eq('contact_id', secondaryContactId)
		.is('deleted_at', null);

	if (methodsError) {
		throw new Error(`Failed to load secondary contact methods: ${methodsError.message}`);
	}

	for (const method of secondaryMethods ?? []) {
		const { data: existing, error: existingError } = await supabaseAny
			.from('user_contact_methods')
			.select('id')
			.eq('user_id', userId)
			.eq('contact_id', primaryContactId)
			.eq('method_type', method.method_type)
			.eq('value_hash', method.value_hash)
			.is('deleted_at', null)
			.maybeSingle();

		if (existingError) {
			throw new Error(`Failed to query primary contact methods: ${existingError.message}`);
		}

		if (existing?.id) {
			const { error: softDeleteError } = await supabaseAny
				.from('user_contact_methods')
				.update({
					deleted_at: nowIso,
					updated_at: nowIso
				})
				.eq('id', method.id)
				.eq('user_id', userId);
			if (softDeleteError) {
				throw new Error(`Failed to dedupe merged method: ${softDeleteError.message}`);
			}
		} else {
			const { error: moveError } = await supabaseAny
				.from('user_contact_methods')
				.update({
					contact_id: primaryContactId,
					updated_at: nowIso
				})
				.eq('id', method.id)
				.eq('user_id', userId);
			if (moveError) {
				throw new Error(`Failed to move merged method: ${moveError.message}`);
			}
		}
	}

	const { error: archiveSecondaryError } = await supabaseAny
		.from('user_contacts')
		.update({
			status: 'merged',
			merged_into_contact_id: primaryContactId,
			deleted_at: nowIso,
			updated_at: nowIso
		})
		.eq('id', secondaryContactId)
		.eq('user_id', userId)
		.is('deleted_at', null);

	if (archiveSecondaryError) {
		throw new Error(`Failed to archive merged contact: ${archiveSecondaryError.message}`);
	}

	const { error: primaryUpdateError } = await supabaseAny
		.from('user_contacts')
		.update({
			last_confirmed_at: nowIso,
			last_seen_at: nowIso,
			updated_at: nowIso
		})
		.eq('id', primaryContactId)
		.eq('user_id', userId);

	if (primaryUpdateError) {
		logger.warn('Failed to update primary contact after merge', {
			userId,
			primaryContactId,
			error: primaryUpdateError
		});
	}
}

export async function resolveUserContactMergeCandidate(params: {
	supabase: AnySupabase;
	userId: string;
	candidateId: string;
	action: 'confirmed_merge' | 'rejected' | 'snoozed';
	actorId?: string | null;
	exposeSensitive?: boolean;
}): Promise<{ candidate: Record<string, any> }> {
	const {
		supabase,
		userId,
		candidateId,
		action,
		actorId = null,
		exposeSensitive = false
	} = params;
	const supabaseAny = supabase as any;

	const { data: candidate, error: candidateError } = await supabaseAny
		.from('user_contact_merge_candidates')
		.select('*')
		.eq('id', candidateId)
		.eq('user_id', userId)
		.maybeSingle();

	if (candidateError) {
		throw new Error(`Failed to load merge candidate: ${candidateError.message}`);
	}
	if (!candidate) {
		throw new Error('Merge candidate not found');
	}
	if (candidate.status !== 'pending') {
		throw new Error('Merge candidate is already resolved');
	}

	if (action === 'confirmed_merge') {
		await mergeContacts({
			supabase,
			userId,
			primaryContactId: String(candidate.primary_contact_id),
			secondaryContactId: String(candidate.secondary_contact_id)
		});
	}

	const nowIso = new Date().toISOString();
	const { data: updated, error: updateError } = await supabaseAny
		.from('user_contact_merge_candidates')
		.update({
			status: action,
			resolved_at: nowIso,
			resolved_by_actor_id: actorId
		})
		.eq('id', candidateId)
		.eq('user_id', userId)
		.select('*')
		.single();

	if (updateError || !updated) {
		throw new Error(`Failed to resolve merge candidate: ${updateError?.message ?? 'unknown'}`);
	}

	const { candidates } = await listUserContactMergeCandidates({
		supabase,
		userId,
		status: updated.status,
		limit: 1,
		exposeSensitive
	});

	const resolved = candidates.find((item) => String(item.id) === String(updated.id)) ?? updated;
	return { candidate: resolved };
}

export async function createUserContactLink(params: {
	supabase: AnySupabase;
	userId: string;
	contactId: string;
	linkType: 'profile_document' | 'profile_fragment' | 'onto_actor' | 'onto_entity';
	profileDocumentId?: string | null;
	profileFragmentId?: string | null;
	actorId?: string | null;
	projectId?: string | null;
	entityType?: string | null;
	entityId?: string | null;
	props?: Record<string, Json | undefined>;
	createdByActorId?: string | null;
}): Promise<{ link: Record<string, any> }> {
	const {
		supabase,
		userId,
		contactId,
		linkType,
		profileDocumentId,
		profileFragmentId,
		actorId,
		projectId,
		entityType,
		entityId,
		props,
		createdByActorId
	} = params;

	await assertOwnedContact({ supabase, userId, contactId });
	const supabaseAny = supabase as any;

	const payload = {
		user_id: userId,
		contact_id: contactId,
		link_type: linkType,
		profile_document_id: profileDocumentId ?? null,
		profile_fragment_id: profileFragmentId ?? null,
		actor_id: actorId ?? null,
		project_id: projectId ?? null,
		entity_type: entityType ?? null,
		entity_id: entityId ?? null,
		props: props ?? {},
		created_by_actor_id: createdByActorId ?? null
	};

	const { data, error } = await supabaseAny
		.from('user_contact_links')
		.insert(payload)
		.select('*')
		.single();

	if (error || !data) {
		throw new Error(`Failed to create contact link: ${error?.message ?? 'unknown'}`);
	}

	return { link: data };
}

export async function insertUserContactAuditEvent(params: {
	supabase: AnySupabase;
	userId: string;
	contactId?: string | null;
	actorId?: string | null;
	accessType:
		| 'search'
		| 'method_read'
		| 'method_write'
		| 'merge'
		| 'link'
		| 'prompt_injection'
		| 'action_prepare';
	contextType?: string | null;
	reason?: string | null;
	metadata?: Record<string, Json | undefined>;
}): Promise<void> {
	const { supabase, userId, contactId, actorId, accessType, contextType, reason, metadata } =
		params;
	const supabaseAny = supabase as any;

	const { error } = await supabaseAny.from('user_contact_access_audit').insert({
		user_id: userId,
		contact_id: contactId ?? null,
		actor_id: actorId ?? null,
		access_type: accessType,
		context_type: contextType ?? null,
		reason: reason ?? null,
		metadata: metadata ?? {}
	});

	if (error) {
		logger.warn('Failed to insert user contact access audit', {
			userId,
			contactId,
			accessType,
			error
		});
	}
}
