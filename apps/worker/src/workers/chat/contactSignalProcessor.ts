// apps/worker/src/workers/chat/contactSignalProcessor.ts
import crypto from 'node:crypto';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase } from '../../lib/supabase';

type ChatMessage = {
	id: string;
	role: string;
	content: string;
	created_at: string | null;
};

type SessionClassification = {
	title?: string;
	topics?: string[];
	summary?: string;
};

type ExtractedContactSignal = {
	display_name: string;
	method_type?:
		| 'phone'
		| 'email'
		| 'sms'
		| 'whatsapp'
		| 'telegram'
		| 'website'
		| 'address'
		| 'other';
	method_value?: string;
	relationship_label?: string;
	confidence?: number;
};

type ExtractedContactResponse = {
	contacts: ExtractedContactSignal[];
};

type ContactSignalResult = {
	skipped: boolean;
	reason?: string;
	extractedCount: number;
	insertedCount: number;
	appliedCount: number;
	createdCount: number;
	needsConfirmationCount: number;
	mergeCandidateCount: number;
};

type ContactObservationRow = {
	id: string;
	user_id: string;
	proposed_display_name: string | null;
	proposed_method_type: string | null;
	proposed_method_value: string | null;
	proposed_method_normalized: string | null;
	proposed_method_hash: string | null;
	relationship_label: string | null;
	confidence: number;
	status: 'pending' | 'applied' | 'needs_confirmation' | 'dismissed';
};

const CONTACT_SIGNAL_TIMEOUT_MS = 2500;
const CONTACT_SIGNAL_MAX_MESSAGES = 40;

const CONTACT_SIGNAL_SYSTEM_PROMPT = `You analyze chat messages and extract user-owned contact details mentioned in the conversation.

Return strict JSON:
{
  "contacts": [
    {
      "display_name": "string",
      "method_type": "phone|email|sms|whatsapp|telegram|website|address|other",
      "method_value": "string",
      "relationship_label": "optional short relationship label",
      "confidence": 0.0
    }
  ]
}

Rules:
- Only extract contacts that are likely useful future references for the user.
- If no useful contacts are present, return {"contacts": []}.
- Keep display_name concise and human-readable.
- confidence must be 0.0-1.0.
- Do not invent values.
`;

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function normalizeName(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const normalized = trimmed
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return normalized || null;
}

function normalizeEmail(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailPattern.test(normalized) ? normalized : null;
}

function normalizePhone(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const raw = value.trim();
	if (!raw) return null;
	const plusPrefixed = raw.startsWith('+');
	const digits = raw.replace(/\D/g, '');
	if (digits.length < 8 || digits.length > 15) return null;

	if (plusPrefixed) return `+${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	if (digits.length === 10) return `+1${digits}`;
	if (raw.startsWith('00')) return `+${digits.slice(2)}`;
	return `+${digits}`;
}

function normalizeMethodType(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	const allowed = new Set([
		'phone',
		'email',
		'sms',
		'whatsapp',
		'telegram',
		'website',
		'address',
		'other'
	]);
	return allowed.has(normalized) ? normalized : null;
}

function normalizeMethodValue(
	methodType: string | null,
	value: string | null | undefined
): string | null {
	if (!methodType || typeof value !== 'string') return null;
	if (methodType === 'email') return normalizeEmail(value);
	if (
		methodType === 'phone' ||
		methodType === 'sms' ||
		methodType === 'whatsapp' ||
		methodType === 'telegram'
	) {
		return normalizePhone(value);
	}
	const trimmed = value.trim().toLowerCase();
	return trimmed || null;
}

function hashNormalizedValue(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function stableFingerprint(input: string): string {
	return crypto.createHash('sha256').update(input).digest('hex');
}

function buildSignalPrompt(params: {
	messages: ChatMessage[];
	classification: SessionClassification;
}): string {
	const topicsLine = Array.isArray(params.classification.topics)
		? params.classification.topics.slice(0, 10).join(', ')
		: 'none';
	const summary =
		typeof params.classification.summary === 'string' && params.classification.summary.trim()
			? params.classification.summary.trim()
			: 'none';

	const conversation = params.messages
		.slice(-CONTACT_SIGNAL_MAX_MESSAGES)
		.map((message) => {
			const role = message.role === 'assistant' ? 'Assistant' : 'User';
			return `${role}: ${truncate(message.content.trim(), 800)}`;
		})
		.join('\n\n');

	return [
		`Session classifier topics: ${topicsLine}`,
		`Session classifier summary: ${summary}`,
		'',
		'Conversation:',
		conversation
	].join('\n');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout | null = null;
	try {
		const timeoutPromise = new Promise<T>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
		});
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function normalizeExtractedContacts(raw: unknown): ExtractedContactSignal[] {
	const asArray =
		raw && typeof raw === 'object' && Array.isArray((raw as { contacts?: unknown[] }).contacts)
			? (raw as { contacts: unknown[] }).contacts
			: [];

	const normalized: ExtractedContactSignal[] = [];
	for (const entry of asArray) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const displayName =
			typeof record.display_name === 'string' ? record.display_name.trim() : '';
		if (!displayName) continue;
		const methodType = normalizeMethodType(
			typeof record.method_type === 'string' ? record.method_type : null
		);
		const methodValue =
			typeof record.method_value === 'string' ? record.method_value.trim() : undefined;
		const relationshipLabel =
			typeof record.relationship_label === 'string'
				? record.relationship_label.trim()
				: undefined;
		const confidenceRaw = Number(record.confidence);
		const confidence = Number.isFinite(confidenceRaw)
			? Math.max(0, Math.min(confidenceRaw, 1))
			: 0.5;

		normalized.push({
			display_name: displayName,
			method_type: (methodType as any) ?? undefined,
			method_value: methodValue && methodValue.length > 0 ? methodValue : undefined,
			relationship_label:
				relationshipLabel && relationshipLabel.length > 0 ? relationshipLabel : undefined,
			confidence
		});
	}
	return normalized;
}

async function getProfileIdForUser(userId: string): Promise<string | null> {
	const supabaseAny = supabase as any;
	const { data, error } = await supabaseAny
		.from('user_profiles')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		console.warn(`⚠️ Failed to load profile id for user ${userId}:`, error.message);
		return null;
	}
	return typeof data?.id === 'string' ? data.id : null;
}

async function createMergeCandidate(params: {
	userId: string;
	observationId: string;
	primaryContactId: string;
	secondaryContactId: string;
	reason: string;
	score: number;
}): Promise<void> {
	const { userId, observationId, primaryContactId, secondaryContactId, reason, score } = params;
	if (!primaryContactId || !secondaryContactId || primaryContactId === secondaryContactId) return;

	const supabaseAny = supabase as any;
	const { data: existing } = await supabaseAny
		.from('user_contact_merge_candidates')
		.select('id')
		.eq('user_id', userId)
		.eq('status', 'pending')
		.eq('primary_contact_id', primaryContactId)
		.eq('secondary_contact_id', secondaryContactId)
		.limit(1);

	if (Array.isArray(existing) && existing.length > 0) return;

	const { error } = await supabaseAny.from('user_contact_merge_candidates').insert({
		user_id: userId,
		observation_id: observationId,
		primary_contact_id: primaryContactId,
		secondary_contact_id: secondaryContactId,
		reason,
		score: Math.max(0, Math.min(score, 1)),
		status: 'pending'
	});

	if (error) {
		console.warn(
			`⚠️ Failed to create merge candidate for observation ${observationId}:`,
			error.message
		);
	}
}

async function attachMethodIfMissing(params: {
	userId: string;
	contactId: string;
	methodType: string | null;
	methodRaw: string | null;
	methodNormalized: string | null;
	methodHash: string | null;
	confidence: number;
}): Promise<void> {
	const { userId, contactId, methodType, methodRaw, methodNormalized, methodHash, confidence } =
		params;
	if (!methodType || !methodRaw || !methodNormalized || !methodHash) return;
	const supabaseAny = supabase as any;

	const { data: existing, error: existingError } = await supabaseAny
		.from('user_contact_methods')
		.select('id')
		.eq('user_id', userId)
		.eq('contact_id', contactId)
		.eq('method_type', methodType)
		.eq('value_hash', methodHash)
		.is('deleted_at', null)
		.maybeSingle();

	if (existingError) {
		console.warn(`⚠️ Failed checking existing contact method:`, existingError.message);
		return;
	}
	if (existing?.id) return;

	const { error: insertError } = await supabaseAny.from('user_contact_methods').insert({
		user_id: userId,
		contact_id: contactId,
		method_type: methodType,
		value_raw: methodRaw,
		value_normalized: methodNormalized,
		value_hash: methodHash,
		confidence: Math.max(0, Math.min(confidence, 1)),
		sensitivity: 'sensitive',
		usage_scope: 'profile_only',
		verification_source: 'inferred'
	});

	if (insertError) {
		console.warn(`⚠️ Failed inserting contact method:`, insertError.message);
	}
}

async function createContactFromObservation(params: {
	userId: string;
	profileId: string | null;
	observation: ContactObservationRow;
	normalizedName: string;
}): Promise<string | null> {
	const { userId, profileId, observation, normalizedName } = params;
	if (!observation.proposed_display_name) return null;
	const supabaseAny = supabase as any;
	const nowIso = new Date().toISOString();

	const { data, error } = await supabaseAny
		.from('user_contacts')
		.insert({
			user_id: userId,
			profile_id: profileId,
			display_name: observation.proposed_display_name,
			relationship_label: observation.relationship_label,
			confidence: Math.max(0, Math.min(observation.confidence ?? 0.5, 1)),
			sensitivity: 'sensitive',
			usage_scope: 'profile_only',
			first_seen_source: 'chat',
			first_seen_at: nowIso,
			last_seen_at: nowIso,
			normalized_name: normalizedName
		})
		.select('id')
		.single();

	if (error || !data?.id) {
		console.warn(
			`⚠️ Failed creating contact from observation ${observation.id}:`,
			error?.message
		);
		return null;
	}

	await attachMethodIfMissing({
		userId,
		contactId: data.id,
		methodType: observation.proposed_method_type,
		methodRaw: observation.proposed_method_value,
		methodNormalized: observation.proposed_method_normalized,
		methodHash: observation.proposed_method_hash,
		confidence: observation.confidence ?? 0.5
	});

	return data.id as string;
}

async function markObservationStatus(params: {
	observationId: string;
	status: 'pending' | 'applied' | 'needs_confirmation' | 'dismissed';
	resolvedContactId?: string | null;
}): Promise<void> {
	const supabaseAny = supabase as any;
	const payload: Record<string, unknown> = {
		status: params.status,
		resolved_at:
			params.status === 'applied' || params.status === 'dismissed'
				? new Date().toISOString()
				: null,
		resolved_contact_id: params.resolvedContactId ?? null
	};

	const { error } = await supabaseAny
		.from('user_contact_observations')
		.update(payload)
		.eq('id', params.observationId);

	if (error) {
		console.warn(
			`⚠️ Failed to mark contact observation ${params.observationId}:`,
			error.message
		);
	}
}

async function resolveObservation(params: {
	userId: string;
	profileId: string | null;
	observation: ContactObservationRow;
}): Promise<{
	applied: boolean;
	created: boolean;
	needsConfirmation: boolean;
	mergeCandidateCreated: number;
}> {
	const { userId, profileId, observation } = params;
	const supabaseAny = supabase as any;

	const normalizedName = normalizeName(observation.proposed_display_name);
	if (!normalizedName) {
		await markObservationStatus({
			observationId: observation.id,
			status: 'dismissed'
		});
		return {
			applied: false,
			created: false,
			needsConfirmation: false,
			mergeCandidateCreated: 0
		};
	}

	const methodType = normalizeMethodType(observation.proposed_method_type);
	const methodNormalized = normalizeMethodValue(methodType, observation.proposed_method_value);
	const methodHash = methodNormalized ? hashNormalizedValue(methodNormalized) : null;

	let mergeCandidateCreated = 0;

	if (methodType && methodHash) {
		const { data: methodMatches, error: methodMatchError } = await supabaseAny
			.from('user_contact_methods')
			.select('contact_id')
			.eq('user_id', userId)
			.eq('method_type', methodType)
			.eq('value_hash', methodHash)
			.is('deleted_at', null);

		if (methodMatchError) {
			throw new Error(`Failed to query method matches: ${methodMatchError.message}`);
		}

		const uniqueMethodContacts = Array.from(
			new Set(
				(methodMatches ?? [])
					.map((row: Record<string, unknown>) => String(row.contact_id))
					.filter((value: string) => value.length > 0)
			)
		);

		if (uniqueMethodContacts.length === 1) {
			const contactId = uniqueMethodContacts[0] as string;
			const { error: touchError } = await supabaseAny
				.from('user_contacts')
				.update({
					last_seen_at: new Date().toISOString(),
					last_confirmed_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', contactId)
				.eq('user_id', userId)
				.is('deleted_at', null);
			if (touchError) {
				console.warn(`⚠️ Failed touching contact ${contactId}:`, touchError.message);
			}

			await attachMethodIfMissing({
				userId,
				contactId,
				methodType,
				methodRaw: observation.proposed_method_value,
				methodNormalized,
				methodHash,
				confidence: observation.confidence
			});
			await markObservationStatus({
				observationId: observation.id,
				status: 'applied',
				resolvedContactId: contactId
			});
			return {
				applied: true,
				created: false,
				needsConfirmation: false,
				mergeCandidateCreated
			};
		}

		if (uniqueMethodContacts.length > 1) {
			await createMergeCandidate({
				userId,
				observationId: observation.id,
				primaryContactId: uniqueMethodContacts[0] as string,
				secondaryContactId: uniqueMethodContacts[1] as string,
				reason: 'method_hash_collision',
				score: 0.98
			});
			mergeCandidateCreated += 1;
			await markObservationStatus({
				observationId: observation.id,
				status: 'needs_confirmation'
			});
			return {
				applied: false,
				created: false,
				needsConfirmation: true,
				mergeCandidateCreated
			};
		}
	}

	const { data: nameMatches, error: nameMatchError } = await supabaseAny
		.from('user_contacts')
		.select('id')
		.eq('user_id', userId)
		.eq('normalized_name', normalizedName)
		.eq('status', 'active')
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(5);

	if (nameMatchError) {
		throw new Error(`Failed to query name matches: ${nameMatchError.message}`);
	}

	const matchedContactIds = (nameMatches ?? [])
		.map((row: Record<string, unknown>) => String(row.id))
		.filter((value: string) => value.length > 0);

	if (matchedContactIds.length === 0) {
		const createdContactId = await createContactFromObservation({
			userId,
			profileId,
			observation,
			normalizedName
		});
		if (!createdContactId) {
			await markObservationStatus({
				observationId: observation.id,
				status: 'dismissed'
			});
			return {
				applied: false,
				created: false,
				needsConfirmation: false,
				mergeCandidateCreated
			};
		}
		await markObservationStatus({
			observationId: observation.id,
			status: 'applied',
			resolvedContactId: createdContactId
		});
		return {
			applied: true,
			created: true,
			needsConfirmation: false,
			mergeCandidateCreated
		};
	}

	if (matchedContactIds.length === 1 && observation.confidence >= 0.9) {
		const contactId = matchedContactIds[0] as string;
		const { error: touchError } = await supabaseAny
			.from('user_contacts')
			.update({
				last_seen_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', contactId)
			.eq('user_id', userId)
			.is('deleted_at', null);
		if (touchError) {
			console.warn(
				`⚠️ Failed touching name-matched contact ${contactId}:`,
				touchError.message
			);
		}

		await attachMethodIfMissing({
			userId,
			contactId,
			methodType,
			methodRaw: observation.proposed_method_value,
			methodNormalized,
			methodHash,
			confidence: observation.confidence
		});
		await markObservationStatus({
			observationId: observation.id,
			status: 'applied',
			resolvedContactId: contactId
		});
		return {
			applied: true,
			created: false,
			needsConfirmation: false,
			mergeCandidateCreated
		};
	}

	const newContactId = await createContactFromObservation({
		userId,
		profileId,
		observation,
		normalizedName
	});
	if (!newContactId) {
		await markObservationStatus({
			observationId: observation.id,
			status: 'needs_confirmation'
		});
		return {
			applied: false,
			created: false,
			needsConfirmation: true,
			mergeCandidateCreated
		};
	}

	await createMergeCandidate({
		userId,
		observationId: observation.id,
		primaryContactId: matchedContactIds[0] as string,
		secondaryContactId: newContactId,
		reason:
			matchedContactIds.length > 1
				? 'ambiguous_name_multiple_matches'
				: 'name_match_needs_confirmation',
		score: Math.max(0.65, Math.min(observation.confidence, 0.89))
	});
	mergeCandidateCreated += 1;
	await markObservationStatus({
		observationId: observation.id,
		status: 'needs_confirmation'
	});
	return {
		applied: false,
		created: true,
		needsConfirmation: true,
		mergeCandidateCreated
	};
}

export async function processContactSignals(params: {
	sessionId: string;
	userId: string;
	messages: ChatMessage[];
	classification: SessionClassification;
}): Promise<ContactSignalResult> {
	const supabaseAny = supabase as any;
	const { sessionId, userId } = params;

	const { data: profile, error: profileError } = await supabaseAny
		.from('user_profiles')
		.select('id, extraction_enabled')
		.eq('user_id', userId)
		.maybeSingle();

	if (profileError) {
		throw new Error(`Failed to load profile for contact extraction: ${profileError.message}`);
	}
	if (!profile) {
		return {
			skipped: true,
			reason: 'profile_not_initialized',
			extractedCount: 0,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
	}
	if (!profile.extraction_enabled) {
		return {
			skipped: true,
			reason: 'extraction_disabled',
			extractedCount: 0,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
	}

	const relevantMessages = params.messages
		.filter((message) => {
			if (message.role !== 'user' && message.role !== 'assistant') return false;
			return typeof message.content === 'string' && message.content.trim().length > 0;
		})
		.slice(-CONTACT_SIGNAL_MAX_MESSAGES);

	if (relevantMessages.length === 0) {
		return {
			skipped: true,
			reason: 'no_relevant_messages',
			extractedCount: 0,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
	}

	const llmService = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Contact Signal Processor'
	});

	let extractedContacts: ExtractedContactSignal[] = [];
	try {
		const extractionResponse = await withTimeout(
			llmService.getJSONResponse<ExtractedContactResponse>({
				systemPrompt: CONTACT_SIGNAL_SYSTEM_PROMPT,
				userPrompt: buildSignalPrompt({
					messages: relevantMessages,
					classification: params.classification
				}),
				userId,
				profile: 'fast',
				temperature: 0.2,
				validation: {
					retryOnParseError: true,
					maxRetries: 1
				}
			}),
			CONTACT_SIGNAL_TIMEOUT_MS,
			'contact_signal_extraction'
		);
		extractedContacts = normalizeExtractedContacts(extractionResponse);
	} catch (error: any) {
		console.warn(
			`⚠️ Contact signal extraction failed for session ${sessionId}:`,
			error?.message ?? error
		);
		return {
			skipped: true,
			reason: 'extraction_failed',
			extractedCount: 0,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
	}

	if (extractedContacts.length === 0) {
		return {
			skipped: true,
			reason: 'no_signals',
			extractedCount: 0,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
	}

	const nowIso = new Date().toISOString();
	const rows = extractedContacts
		.map((contact) => {
			const methodType = normalizeMethodType(contact.method_type ?? null);
			const methodNormalized = normalizeMethodValue(methodType, contact.method_value ?? null);
			const methodHash = methodNormalized ? hashNormalizedValue(methodNormalized) : null;
			const name =
				typeof contact.display_name === 'string' ? contact.display_name.trim() : '';
			if (!name) return null;
			const fingerprintCanonical = `${normalizeName(name) ?? name.toLowerCase()}|${methodType ?? 'none'}|${methodHash ?? 'none'}`;
			const fingerprint = stableFingerprint(fingerprintCanonical);
			return {
				user_id: userId,
				source_type: 'chat',
				source_id: sessionId,
				session_id: sessionId,
				proposed_display_name: name,
				proposed_method_type: methodType,
				proposed_method_value: contact.method_value ?? null,
				proposed_method_normalized: methodNormalized,
				proposed_method_hash: methodHash,
				relationship_label: contact.relationship_label ?? null,
				confidence: Number.isFinite(contact.confidence)
					? Math.max(0, Math.min(contact.confidence ?? 0.5, 1))
					: 0.5,
				inference_flags: {
					from_classifier_topics: Array.isArray(params.classification.topics),
					contains_method: Boolean(methodType && methodNormalized)
				},
				idempotency_key: `chat:${sessionId}:${fingerprint}`,
				status: 'pending',
				created_at: nowIso
			};
		})
		.filter((row): row is NonNullable<typeof row> => row !== null);

	if (rows.length === 0) {
		return {
			skipped: true,
			reason: 'no_valid_signals',
			extractedCount: extractedContacts.length,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
	}

	const { data: insertedRows, error: insertError } = await supabaseAny
		.from('user_contact_observations')
		.upsert(rows, {
			onConflict: 'user_id,idempotency_key',
			ignoreDuplicates: true
		})
		.select('*');

	if (insertError) {
		throw new Error(`Failed to insert contact observations: ${insertError.message}`);
	}

	const profileId = await getProfileIdForUser(userId);
	const inserted = (insertedRows ?? []) as ContactObservationRow[];
	let appliedCount = 0;
	let createdCount = 0;
	let needsConfirmationCount = 0;
	let mergeCandidateCount = 0;

	for (const observation of inserted) {
		try {
			const resolution = await resolveObservation({
				userId,
				profileId,
				observation
			});
			if (resolution.applied) appliedCount += 1;
			if (resolution.created) createdCount += 1;
			if (resolution.needsConfirmation) needsConfirmationCount += 1;
			mergeCandidateCount += resolution.mergeCandidateCreated;
		} catch (resolutionError: any) {
			console.warn(
				`⚠️ Failed to resolve contact observation ${observation.id}:`,
				resolutionError?.message ?? resolutionError
			);
		}
	}

	return {
		skipped: false,
		extractedCount: extractedContacts.length,
		insertedCount: inserted.length,
		appliedCount,
		createdCount,
		needsConfirmationCount,
		mergeCandidateCount
	};
}
