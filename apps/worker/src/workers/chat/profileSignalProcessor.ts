// apps/worker/src/workers/chat/profileSignalProcessor.ts
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

type ExtractedSignal = {
	content: string;
	category: string;
	confidence: number;
	is_update?: boolean;
	sensitivity?: 'standard' | 'sensitive';
	suggested_chapter_title?: string;
};

type ExtractSignalResponse = {
	signals: ExtractedSignal[];
};

type ProfileSignalResult = {
	skipped: boolean;
	reason?: string;
	extractedCount: number;
	insertedCount: number;
	mergedCount: number;
	needsReviewCount: number;
};

type ProfileRow = {
	id: string;
	user_id: string;
	actor_id: string | null;
	doc_structure: Record<string, unknown> | null;
	summary: string | null;
	safe_summary: string | null;
	extraction_enabled: boolean;
};

type ProfileDocumentRow = {
	id: string;
	profile_id: string;
	title: string;
	type_key: string;
	content: string | null;
};

type ProfileFragmentRow = {
	id: string;
	profile_id: string;
	source_type: string;
	source_id: string | null;
	content: string;
	category: string;
	sensitivity: 'standard' | 'sensitive';
	confidence: number;
	status: 'pending' | 'accepted' | 'dismissed' | 'needs_review';
	suggested_chapter_id: string | null;
	suggested_chapter_title: string | null;
};

type ProfileDocTreeNode = {
	id: string;
	order?: number;
	type?: 'doc' | 'folder';
	title?: string | null;
	children?: ProfileDocTreeNode[];
};

type ProfileDocStructure = {
	version: number;
	root: ProfileDocTreeNode[];
};

const PROFILE_SIGNAL_TIMEOUT_MS = 2500;
const PROFILE_SUMMARY_TIMEOUT_MS = 3500;
const PROFILE_SIGNAL_MAX_MESSAGES = 40;
const PROFILE_SUMMARY_MAX_CHAPTERS = 12;
const PROFILE_SUMMARY_CHAPTER_CONTENT_CHARS = 450;

const SENSITIVE_CATEGORIES = new Set(['health', 'finances', 'relationships']);
const NEEDS_REVIEW_PHRASES = [
	'no longer',
	'used to',
	'changed',
	'former',
	'left',
	'quit',
	'stopped',
	'now'
];

const CATEGORY_TO_TYPE_KEY: Record<string, string> = {
	career: 'chapter.career',
	relationships: 'chapter.relationships',
	interests: 'chapter.interests',
	skills: 'chapter.skills',
	values: 'chapter.values',
	background: 'chapter.background',
	health: 'chapter.health',
	schedule: 'chapter.schedule',
	goals_personal: 'chapter.goals_personal',
	challenges: 'chapter.challenges',
	decision_style: 'chapter.decision_style',
	finances: 'chapter.finances',
	learning: 'chapter.learning',
	personality: 'chapter.personality',
	general: 'chapter.general'
};

const TYPE_KEY_TO_TITLE: Record<string, string> = {
	'chapter.career': 'Career',
	'chapter.relationships': 'Relationships',
	'chapter.interests': 'Interests',
	'chapter.skills': 'Skills & Expertise',
	'chapter.values': 'Values & Motivations',
	'chapter.background': 'Background',
	'chapter.health': 'Health & Wellbeing',
	'chapter.schedule': 'Schedule & Work Style',
	'chapter.goals_personal': 'Personal Goals',
	'chapter.challenges': 'Current Challenges',
	'chapter.decision_style': 'Decision Style',
	'chapter.finances': 'Financial Context',
	'chapter.learning': 'Learning Style',
	'chapter.personality': 'Personality Tendencies',
	'chapter.general': 'General Profile'
};

const PROFILE_SIGNAL_SYSTEM_PROMPT = `You analyze chat messages and extract personal profile signals about the user.

Return strict JSON with this shape:
{
  "signals": [
    {
      "content": "1-2 sentence fact about the user",
      "category": "career|relationships|interests|skills|values|background|health|schedule|goals_personal|challenges|decision_style|finances|learning|personality|general",
      "confidence": 0.0,
      "is_update": false,
      "sensitivity": "standard|sensitive",
      "suggested_chapter_title": "optional chapter title"
    }
  ]
}

Rules:
- Only extract user-person facts/signals, not project implementation details.
- Use "sensitive" for health, finances, explicit family/relationship personal details.
- If nothing relevant exists, return {"signals": []}.
- Keep content concise and factual; avoid repetition.`;

const PROFILE_SUMMARY_SYSTEM_PROMPT = `You generate a profile summary from chapter notes.

Return strict JSON:
{
  "summary": "2-3 paragraph internal summary (may include sensitive context).",
  "safe_summary": "2-3 paragraph prompt-safe summary (exclude highly private details and never include direct health/finance/family specifics)."
}

Rules:
- Keep each summary under 1200 characters.
- safe_summary must remain useful while privacy-preserving.
- If context is sparse, still return concise summaries.`;

function parseDocStructure(value: unknown): ProfileDocStructure {
	if (!value || typeof value !== 'object') {
		return { version: 1, root: [] };
	}
	const raw = value as Record<string, unknown>;
	const version =
		typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1;
	const root = normalizeNodes(raw.root);
	return { version, root };
}

function normalizeNodes(value: unknown): ProfileDocTreeNode[] {
	if (!Array.isArray(value)) return [];
	const nodes: ProfileDocTreeNode[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id : null;
		if (!id) continue;
		const order =
			typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : 0;
		const type = record.type === 'folder' ? 'folder' : 'doc';
		const title = typeof record.title === 'string' ? record.title : null;
		const children = normalizeNodes(record.children);
		nodes.push({
			id,
			order,
			type,
			...(title ? { title } : {}),
			...(children.length > 0 ? { children } : {})
		});
	}
	return reorderNodes(nodes);
}

function reorderNodes(nodes: ProfileDocTreeNode[]): ProfileDocTreeNode[] {
	return nodes.map((node, index) => ({
		...node,
		order: index,
		...(node.children?.length ? { children: reorderNodes(node.children) } : {})
	}));
}

function insertNodeAtRoot(
	nodes: ProfileDocTreeNode[],
	node: ProfileDocTreeNode,
	position?: number
): ProfileDocTreeNode[] {
	const root = [...nodes];
	const safePos =
		typeof position === 'number' && Number.isFinite(position)
			? Math.max(0, Math.min(position, root.length))
			: root.length;
	root.splice(safePos, 0, node);
	return reorderNodes(root);
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function normalizeSignalCategory(category: string | undefined | null): string {
	if (!category || typeof category !== 'string') return 'general';
	const normalized = category.trim().toLowerCase();
	return CATEGORY_TO_TYPE_KEY[normalized] ? normalized : 'general';
}

function inferSensitivity(category: string, explicit?: string | null): 'standard' | 'sensitive' {
	if (explicit === 'sensitive') return 'sensitive';
	if (SENSITIVE_CATEGORIES.has(category)) return 'sensitive';
	return 'standard';
}

function stableFingerprint(input: string): string {
	return crypto.createHash('sha256').update(input).digest('hex');
}

function shouldMarkNeedsReview(signal: ProfileFragmentRow): boolean {
	if (signal.sensitivity === 'sensitive') return true;
	const text = signal.content.toLowerCase();
	return NEEDS_REVIEW_PHRASES.some((phrase) => text.includes(phrase));
}

function buildSignalPrompt(params: {
	safeSummary: string | null;
	classification: SessionClassification;
	messages: ChatMessage[];
}): string {
	const summaryLine = params.safeSummary?.trim()
		? truncate(params.safeSummary.trim(), 1200)
		: 'none';
	const topicsLine = Array.isArray(params.classification.topics)
		? params.classification.topics.slice(0, 10).join(', ')
		: 'none';
	const sessionSummary =
		typeof params.classification.summary === 'string' && params.classification.summary.trim()
			? params.classification.summary.trim()
			: 'none';

	const conversation = params.messages
		.slice(-PROFILE_SIGNAL_MAX_MESSAGES)
		.map((message) => {
			const role = message.role === 'assistant' ? 'Assistant' : 'User';
			const content = truncate(message.content.trim(), 800);
			return `${role}: ${content}`;
		})
		.join('\n\n');

	return [
		`Current safe profile summary: ${summaryLine}`,
		`Session classifier topics: ${topicsLine}`,
		`Session classifier summary: ${sessionSummary}`,
		'',
		'Conversation:',
		conversation
	].join('\n');
}

function buildSummaryPrompt(chapters: ProfileDocumentRow[]): string {
	const chapterText = chapters
		.map((chapter) => {
			const content = chapter.content
				? truncate(chapter.content.trim(), PROFILE_SUMMARY_CHAPTER_CONTENT_CHARS)
				: 'No content';
			return `- ${chapter.title} (${chapter.type_key}): ${content}`;
		})
		.join('\n');

	return `Generate profile summary from these chapters:\n\n${chapterText}`;
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

function normalizeExtractedSignals(raw: unknown): ExtractedSignal[] {
	const asArray =
		raw && typeof raw === 'object' && Array.isArray((raw as { signals?: unknown[] }).signals)
			? (raw as { signals: unknown[] }).signals
			: [];

	const normalized: ExtractedSignal[] = [];
	for (const entry of asArray) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const content = typeof record.content === 'string' ? record.content.trim() : '';
		if (!content) continue;
		const category = normalizeSignalCategory(
			typeof record.category === 'string' ? record.category : null
		);
		const confidenceRaw = Number(record.confidence);
		const confidence = Number.isFinite(confidenceRaw)
			? Math.max(0, Math.min(confidenceRaw, 1))
			: 0.5;
		const sensitivity = inferSensitivity(
			category,
			typeof record.sensitivity === 'string' ? record.sensitivity : null
		);
		const suggestedChapterTitle =
			typeof record.suggested_chapter_title === 'string'
				? record.suggested_chapter_title.trim()
				: '';

		normalized.push({
			content,
			category,
			confidence,
			is_update: record.is_update === true,
			sensitivity,
			suggested_chapter_title: suggestedChapterTitle || undefined
		});
	}

	return normalized;
}

async function ensureChapterForCategory(params: {
	profile: ProfileRow;
	category: string;
	suggestedTitle?: string | null;
}): Promise<ProfileDocumentRow> {
	const supabaseAny = supabase as any;
	const typeKey = CATEGORY_TO_TYPE_KEY[params.category] ?? 'chapter.general';
	const { data: existing, error: existingError } = await supabaseAny
		.from('profile_documents')
		.select('id, profile_id, title, type_key, content')
		.eq('profile_id', params.profile.id)
		.eq('type_key', typeKey)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (existingError) {
		throw new Error(`Failed to query profile chapter: ${existingError.message}`);
	}
	if (existing) return existing as ProfileDocumentRow;

	const title =
		(params.suggestedTitle && params.suggestedTitle.trim()) ||
		TYPE_KEY_TO_TITLE[typeKey] ||
		'General Profile';

	const { data: created, error: createError } = await supabaseAny
		.from('profile_documents')
		.insert({
			profile_id: params.profile.id,
			title,
			type_key: typeKey,
			content: null,
			sensitivity: SENSITIVE_CATEGORIES.has(params.category) ? 'sensitive' : 'standard',
			usage_scope: SENSITIVE_CATEGORIES.has(params.category) ? 'profile_only' : 'all_agents'
		})
		.select('id, profile_id, title, type_key, content')
		.single();

	if (createError || !created) {
		throw new Error(`Failed to create profile chapter: ${createError?.message ?? 'unknown'}`);
	}

	const structure = parseDocStructure(params.profile.doc_structure);
	const nextRoot = insertNodeAtRoot(structure.root, {
		id: created.id,
		type: 'doc',
		title
	});
	const { error: structureError } = await supabaseAny
		.from('user_profiles')
		.update({ doc_structure: { ...structure, root: nextRoot }, summary_updated_at: null })
		.eq('id', params.profile.id);
	if (structureError) {
		console.warn(
			`⚠️ Failed to update profile doc_structure for chapter ${created.id}:`,
			structureError.message
		);
	}

	return created as ProfileDocumentRow;
}

async function nextDocumentVersionNumber(documentId: string): Promise<number> {
	const supabaseAny = supabase as any;
	const { data, error } = await supabaseAny
		.from('profile_document_versions')
		.select('number')
		.eq('document_id', documentId)
		.order('number', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) {
		throw new Error(`Failed to read chapter version: ${error.message}`);
	}
	return (data?.number ?? 0) + 1;
}

async function regenerateProfileSummary(params: {
	profile: ProfileRow;
	userId: string;
	llmService: SmartLLMService;
}): Promise<void> {
	const supabaseAny = supabase as any;
	const { data: chapters, error: chapterError } = await supabaseAny
		.from('profile_documents')
		.select('id, profile_id, title, type_key, content')
		.eq('profile_id', params.profile.id)
		.is('deleted_at', null)
		.not('content', 'is', null)
		.order('updated_at', { ascending: false })
		.limit(PROFILE_SUMMARY_MAX_CHAPTERS);

	if (chapterError) {
		console.warn(
			'⚠️ Failed to load chapters for profile summary regeneration:',
			chapterError.message
		);
		return;
	}

	const chapterRows = (chapters ?? []) as ProfileDocumentRow[];
	if (chapterRows.length === 0) {
		await supabaseAny
			.from('user_profiles')
			.update({
				summary: null,
				safe_summary: null,
				summary_updated_at: new Date().toISOString()
			})
			.eq('id', params.profile.id);
		return;
	}

	try {
		const summaryResponse = await withTimeout(
			params.llmService.getJSONResponse<{ summary: string; safe_summary: string }>({
				systemPrompt: PROFILE_SUMMARY_SYSTEM_PROMPT,
				userPrompt: buildSummaryPrompt(chapterRows),
				userId: params.userId,
				profile: 'fast',
				temperature: 0.2,
				validation: {
					retryOnParseError: true,
					maxRetries: 1
				}
			}),
			PROFILE_SUMMARY_TIMEOUT_MS,
			'profile_summary_regeneration'
		);

		const summary =
			typeof summaryResponse.summary === 'string' ? summaryResponse.summary.trim() : null;
		const safeSummary =
			typeof summaryResponse.safe_summary === 'string'
				? summaryResponse.safe_summary.trim()
				: null;

		const { error: updateError } = await supabaseAny
			.from('user_profiles')
			.update({
				summary: summary || null,
				safe_summary: safeSummary || null,
				summary_updated_at: new Date().toISOString()
			})
			.eq('id', params.profile.id);
		if (updateError) {
			console.warn('⚠️ Failed to persist profile summary:', updateError.message);
		}
	} catch (error: any) {
		console.warn(`⚠️ Profile summary regeneration failed: ${error?.message ?? error}`);
	}
}

async function mergePendingFragments(params: {
	profile: ProfileRow;
	userId: string;
	llmService: SmartLLMService;
}): Promise<{ mergedCount: number; needsReviewCount: number }> {
	const supabaseAny = supabase as any;
	const { data: pending, error: pendingError } = await supabaseAny
		.from('profile_fragments')
		.select('*')
		.eq('profile_id', params.profile.id)
		.eq('status', 'pending')
		.order('confidence', { ascending: false })
		.limit(30);

	if (pendingError) {
		throw new Error(`Failed to load pending profile fragments: ${pendingError.message}`);
	}

	const pendingFragments = (pending ?? []) as ProfileFragmentRow[];
	if (pendingFragments.length === 0) {
		return { mergedCount: 0, needsReviewCount: 0 };
	}

	let mergedCount = 0;
	let needsReviewCount = 0;
	const mergeRunId = crypto.randomUUID();

	for (const fragment of pendingFragments) {
		if (fragment.confidence < 0.85) {
			continue;
		}

		if (shouldMarkNeedsReview(fragment)) {
			const { error: reviewError } = await supabaseAny
				.from('profile_fragments')
				.update({ status: 'needs_review' })
				.eq('id', fragment.id);
			if (!reviewError) needsReviewCount += 1;
			continue;
		}

		const chapter = await ensureChapterForCategory({
			profile: params.profile,
			category: fragment.category,
			suggestedTitle: fragment.suggested_chapter_title
		});
		const bullet = `- ${fragment.content.trim()}`;
		const existingContent = chapter.content?.trim() ?? '';
		const alreadyPresent = existingContent.includes(bullet);
		const nextContent = alreadyPresent
			? existingContent
			: existingContent
				? `${existingContent}\n${bullet}`
				: bullet;

		let versionId: string | null = null;
		if (!alreadyPresent) {
			const { error: docUpdateError } = await supabaseAny
				.from('profile_documents')
				.update({
					content: nextContent,
					updated_at: new Date().toISOString()
				})
				.eq('id', chapter.id);
			if (docUpdateError) {
				console.warn(
					`⚠️ Failed to update profile chapter ${chapter.id}:`,
					docUpdateError.message
				);
				continue;
			}

			const nextVersion = await nextDocumentVersionNumber(chapter.id);
			const { data: versionRow, error: versionError } = await supabaseAny
				.from('profile_document_versions')
				.insert({
					document_id: chapter.id,
					number: nextVersion,
					content: nextContent,
					created_by: params.profile.actor_id,
					change_type: 'merge_apply',
					merge_run_id: mergeRunId
				})
				.select('id')
				.single();
			if (versionError || !versionRow) {
				console.warn(
					`⚠️ Failed to create profile chapter version for ${chapter.id}:`,
					versionError?.message ?? 'unknown'
				);
				continue;
			}
			versionId = versionRow.id as string;
		}

		if (versionId) {
			const { error: sourceError } = await supabaseAny
				.from('profile_document_sources')
				.insert({
					document_version_id: versionId,
					fragment_id: fragment.id,
					source_type: fragment.source_type ?? 'chat',
					source_id: fragment.source_id
				});
			if (sourceError) {
				console.warn(
					`⚠️ Failed to store profile source mapping for fragment ${fragment.id}:`,
					sourceError.message
				);
			}
		}

		const { error: fragmentUpdateError } = await supabaseAny
			.from('profile_fragments')
			.update({
				status: 'accepted',
				suggested_chapter_id: chapter.id
			})
			.eq('id', fragment.id);
		if (fragmentUpdateError) {
			console.warn(
				`⚠️ Failed to mark fragment ${fragment.id} as accepted:`,
				fragmentUpdateError.message
			);
		} else {
			mergedCount += 1;
		}
	}

	if (mergedCount > 0) {
		await regenerateProfileSummary({
			profile: params.profile,
			userId: params.userId,
			llmService: params.llmService
		});
	}

	return { mergedCount, needsReviewCount };
}

export async function processProfileSignals(params: {
	sessionId: string;
	userId: string;
	messages: ChatMessage[];
	classification: SessionClassification;
}): Promise<ProfileSignalResult> {
	const supabaseAny = supabase as any;
	const { sessionId, userId } = params;

	const { data: profileData, error: profileError } = await supabaseAny
		.from('user_profiles')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	if (profileError) {
		throw new Error(`Failed to load user profile: ${profileError.message}`);
	}
	if (!profileData) {
		return {
			skipped: true,
			reason: 'profile_not_initialized',
			extractedCount: 0,
			insertedCount: 0,
			mergedCount: 0,
			needsReviewCount: 0
		};
	}

	const profile = profileData as ProfileRow;
	if (!profile.extraction_enabled) {
		return {
			skipped: true,
			reason: 'extraction_disabled',
			extractedCount: 0,
			insertedCount: 0,
			mergedCount: 0,
			needsReviewCount: 0
		};
	}

	const relevantMessages = params.messages
		.filter((message) => {
			if (message.role !== 'user' && message.role !== 'assistant') return false;
			return typeof message.content === 'string' && message.content.trim().length > 0;
		})
		.slice(-PROFILE_SIGNAL_MAX_MESSAGES);

	if (relevantMessages.length === 0) {
		return {
			skipped: true,
			reason: 'no_relevant_messages',
			extractedCount: 0,
			insertedCount: 0,
			mergedCount: 0,
			needsReviewCount: 0
		};
	}

	const llmService = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Profile Signal Processor'
	});

	let extractedSignals: ExtractedSignal[] = [];
	try {
		const extractionResponse = await withTimeout(
			llmService.getJSONResponse<ExtractSignalResponse>({
				systemPrompt: PROFILE_SIGNAL_SYSTEM_PROMPT,
				userPrompt: buildSignalPrompt({
					safeSummary: profile.safe_summary,
					classification: params.classification,
					messages: relevantMessages
				}),
				userId,
				profile: 'fast',
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					maxRetries: 1
				}
			}),
			PROFILE_SIGNAL_TIMEOUT_MS,
			'profile_signal_extraction'
		);
		extractedSignals = normalizeExtractedSignals(extractionResponse);
	} catch (error: any) {
		console.warn(
			`⚠️ Profile signal extraction failed for session ${sessionId}:`,
			error?.message ?? error
		);
		return {
			skipped: true,
			reason: 'extraction_failed',
			extractedCount: 0,
			insertedCount: 0,
			mergedCount: 0,
			needsReviewCount: 0
		};
	}

	if (extractedSignals.length === 0) {
		return {
			skipped: true,
			reason: 'no_signals',
			extractedCount: 0,
			insertedCount: 0,
			mergedCount: 0,
			needsReviewCount: 0
		};
	}

	const sourceMessageIds = relevantMessages
		.filter((message) => message.role === 'user')
		.map((message) => message.id)
		.slice(-20);

	const nowIso = new Date().toISOString();
	const rows = extractedSignals.map((signal) => {
		const canonical = `${normalizeSignalCategory(signal.category)}|${signal.content
			.trim()
			.toLowerCase()}`;
		const fingerprintHash = stableFingerprint(canonical);
		return {
			profile_id: profile.id,
			source_type: 'chat',
			source_id: sessionId,
			content: signal.content.trim(),
			category: normalizeSignalCategory(signal.category),
			sensitivity: inferSensitivity(
				normalizeSignalCategory(signal.category),
				signal.sensitivity ?? null
			),
			extracted_from_message_ids: sourceMessageIds,
			fingerprint_hash: fingerprintHash,
			idempotency_key: `chat:${sessionId}:${fingerprintHash}`,
			suggested_chapter_title:
				signal.suggested_chapter_title ||
				TYPE_KEY_TO_TITLE[
					CATEGORY_TO_TYPE_KEY[normalizeSignalCategory(signal.category)] ??
						'chapter.general'
				],
			confidence: signal.confidence,
			status: 'pending',
			created_at: nowIso
		};
	});

	const { data: inserted, error: insertError } = await supabaseAny
		.from('profile_fragments')
		.upsert(rows, {
			onConflict: 'profile_id,idempotency_key',
			ignoreDuplicates: true
		})
		.select('id');

	if (insertError) {
		throw new Error(`Failed to insert profile fragments: ${insertError.message}`);
	}

	const insertedCount = Array.isArray(inserted) ? inserted.length : 0;
	let mergedCount = 0;
	let needsReviewCount = 0;

	try {
		const mergeResult = await mergePendingFragments({
			profile,
			userId,
			llmService
		});
		mergedCount = mergeResult.mergedCount;
		needsReviewCount = mergeResult.needsReviewCount;
	} catch (mergeError: any) {
		console.warn(`⚠️ Profile merge processing failed: ${mergeError?.message ?? mergeError}`);
	}

	if (insertedCount > 0 && mergedCount === 0) {
		const { error: staleError } = await supabaseAny
			.from('user_profiles')
			.update({ summary_updated_at: null })
			.eq('id', profile.id);
		if (staleError) {
			console.warn(`⚠️ Failed to mark profile summary stale: ${staleError.message}`);
		}
	}

	return {
		skipped: false,
		extractedCount: extractedSignals.length,
		insertedCount,
		mergedCount,
		needsReviewCount
	};
}
