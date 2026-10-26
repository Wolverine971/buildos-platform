// apps/web/src/lib/server/email-campaigns/campaigns.ts
//
// Campaign lifecycle for the admin email campaigns: create and edit drafts,
// keep the recipient list in step with the audience, queue paced waves, pause /
// resume / cancel, retry a failed person, per-person edits, and follow-ups.
// Sending itself is the cron's job (sender.ts); this module only moves rows
// between draft and queued and reads results.
//
// Every function takes the caller's Supabase client. Admin routes pass the
// signed-in admin's client (RLS allows admins on the campaign tables).
//
// Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { findUnknownMergeFields, renderCampaignEmail } from '$lib/email-campaigns/render';
import {
	WAVE_INTERVAL_RANGE,
	WAVE_SIZE_RANGE,
	type AudienceExclusion,
	type CampaignAudience,
	type CampaignCounts,
	type CampaignDetail,
	type CampaignRecipientView,
	type CampaignRow,
	type CampaignStatus,
	type CampaignSummary,
	type ManualPerson,
	type OverrideSource,
	type RecipientContext,
	type RecipientSegment,
	type RecipientStatus,
	type TailorStatus
} from '$lib/email-campaigns/types';
import {
	emptyAudience,
	normalizeAudience,
	normalizeEmail,
	resolveAudience,
	type AudienceOptions,
	type ResolvedPerson
} from './audience';

type Client = SupabaseClient<Database>;
type CampaignDbRow = Database['public']['Tables']['email_campaigns']['Row'];
type RecipientDbRow = Database['public']['Tables']['email_campaign_recipients']['Row'];
type RecipientInsert = Database['public']['Tables']['email_campaign_recipients']['Insert'];

/** A failure the admin can act on; `status` maps to the HTTP response. */
export class CampaignError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 404 | 409 = 400
	) {
		super(message);
		this.name = 'CampaignError';
	}
}

export interface RecipientEngagement {
	opened_at: string | null;
	open_count: number;
	first_clicked_at: string | null;
	click_count: number;
	unsubscribed_at: string | null;
}

const EDITABLE_STATUSES: CampaignStatus[] = ['draft', 'paused'];
const IN_CHUNK = 150;
const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toCampaignRow(row: CampaignDbRow): CampaignRow {
	return {
		id: row.id,
		name: row.name,
		status: row.status as CampaignStatus,
		subject_template: row.subject_template ?? '',
		body_template: row.body_template ?? '',
		from_name: row.from_name ?? 'DJ',
		audience: normalizeAudience(row.audience),
		tailoring_instructions: row.tailoring_instructions ?? null,
		wave_size: row.wave_size,
		wave_interval_minutes: row.wave_interval_minutes,
		starts_at: row.starts_at ?? null,
		queued_at: row.queued_at ?? null,
		completed_at: row.completed_at ?? null,
		canceled_at: row.canceled_at ?? null,
		source: row.source ?? 'admin',
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

function asContext(value: Json | null | undefined): RecipientContext {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as RecipientContext)
		: {};
}

export function toRecipientView(
	row: RecipientDbRow,
	engagement?: Partial<RecipientEngagement> | null,
	lastContactedAt: string | null = null
): CampaignRecipientView {
	return {
		id: row.id,
		email: row.email,
		name: row.name ?? null,
		first_name: row.first_name ?? null,
		user_id: row.user_id ?? null,
		beta_signup_id: row.beta_signup_id ?? null,
		segment: row.segment as RecipientSegment,
		context: asContext(row.context),
		subject_override: row.subject_override ?? null,
		body_override: row.body_override ?? null,
		override_source: (row.override_source as OverrideSource | null) ?? null,
		tailor_status: (row.tailor_status as TailorStatus) ?? 'none',
		tailor_error: row.tailor_error ?? null,
		included: row.included,
		status: row.status as RecipientStatus,
		skip_reason: row.skip_reason ?? null,
		scheduled_for: row.scheduled_for ?? null,
		sent_at: row.sent_at ?? null,
		replied_at: row.replied_at ?? null,
		bounced_at: row.bounced_at ?? null,
		error_message: row.error_message ?? null,
		opened_at: engagement?.opened_at ?? null,
		open_count: Number(engagement?.open_count ?? 0),
		first_clicked_at: engagement?.first_clicked_at ?? null,
		click_count: Number(engagement?.click_count ?? 0),
		unsubscribed_at: engagement?.unsubscribed_at ?? null,
		last_contacted_at: lastContactedAt
	};
}

export function emptyCounts(): CampaignCounts {
	return {
		total: 0,
		included: 0,
		draft: 0,
		queued: 0,
		sending: 0,
		sent: 0,
		failed: 0,
		skipped: 0,
		canceled: 0,
		opened: 0,
		clicked: 0,
		replied: 0,
		unsubscribed: 0,
		bounced: 0,
		tailored: 0,
		edited: 0
	};
}

type CountableRecipient = Pick<
	CampaignRecipientView,
	| 'status'
	| 'included'
	| 'override_source'
	| 'replied_at'
	| 'bounced_at'
	| 'opened_at'
	| 'first_clicked_at'
	| 'unsubscribed_at'
>;

export function computeCounts(recipients: CountableRecipient[]): CampaignCounts {
	const counts = emptyCounts();
	for (const recipient of recipients) {
		counts.total += 1;
		if (recipient.included) counts.included += 1;
		if (recipient.status in counts) counts[recipient.status as keyof CampaignCounts] += 1;
		if (recipient.opened_at) counts.opened += 1;
		if (recipient.first_clicked_at) counts.clicked += 1;
		if (recipient.replied_at) counts.replied += 1;
		if (recipient.unsubscribed_at) counts.unsubscribed += 1;
		if (recipient.bounced_at) counts.bounced += 1;
		if (recipient.override_source === 'tailored') counts.tailored += 1;
		if (recipient.override_source === 'edited') counts.edited += 1;
	}
	return counts;
}

// ---------------------------------------------------------------------------
// Wave math (shared by the UI plan preview and queue/resume)
// ---------------------------------------------------------------------------

/** Send time for each of `count` people: wave i goes out at start + i × interval. */
export function computeWaveSchedule(
	count: number,
	startsAt: Date,
	waveSize: number,
	intervalMinutes: number
): Date[] {
	const size = Math.max(1, Math.floor(waveSize));
	const intervalMs = Math.max(0, intervalMinutes) * 60_000;
	return Array.from(
		{ length: Math.max(0, count) },
		(_value, index) => new Date(startsAt.getTime() + Math.floor(index / size) * intervalMs)
	);
}

function clampWave(value: number, range: { min: number; max: number }): number {
	return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function fetchAllRows<T>(
	page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await page(from, from + PAGE_SIZE - 1);
		if (error) throw error;
		const batch = data ?? [];
		rows.push(...batch);
		if (batch.length < PAGE_SIZE) return rows;
	}
}

function chunk<T>(values: T[], size = IN_CHUNK): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

async function loadCampaignRow(supabase: Client, campaignId: string): Promise<CampaignDbRow> {
	const { data, error } = await supabase
		.from('email_campaigns')
		.select('*')
		.eq('id', campaignId)
		.maybeSingle();
	if (error) throw error;
	if (!data) throw new CampaignError('Campaign not found.', 404);
	return data;
}

export async function getCampaign(supabase: Client, campaignId: string): Promise<CampaignRow> {
	return toCampaignRow(await loadCampaignRow(supabase, campaignId));
}

async function loadRecipients(supabase: Client, campaignId: string): Promise<RecipientDbRow[]> {
	return fetchAllRows<RecipientDbRow>((from, to) =>
		supabase
			.from('email_campaign_recipients')
			.select('*')
			.eq('campaign_id', campaignId)
			.order('created_at')
			.order('email')
			.range(from, to)
	);
}

async function loadEngagement(
	supabase: Client,
	campaignIds: string[]
): Promise<Map<string, RecipientEngagement>> {
	const engagement = new Map<string, RecipientEngagement>();
	if (campaignIds.length === 0) return engagement;
	const { data, error } = await supabase.rpc('get_email_campaign_engagement', {
		p_campaign_ids: campaignIds
	});
	if (error) throw error;
	for (const row of data ?? []) {
		engagement.set(row.campaign_recipient_id, {
			opened_at: row.opened_at ?? null,
			open_count: Number(row.open_count ?? 0),
			first_clicked_at: row.first_clicked_at ?? null,
			click_count: Number(row.click_count ?? 0),
			unsubscribed_at: row.unsubscribed_at ?? null
		});
	}
	return engagement;
}

/** Latest send to each address from any other campaign. */
async function loadLastContacted(
	supabase: Client,
	emails: string[],
	excludeCampaignId: string | null
): Promise<Map<string, string>> {
	const latest = new Map<string, string>();
	const unique = [...new Set(emails)];
	const results = await Promise.all(
		chunk(unique).map(async (batch) => {
			let query = supabase
				.from('email_campaign_recipients')
				.select('email, sent_at')
				.in('email', batch)
				.not('sent_at', 'is', null);
			if (excludeCampaignId) query = query.neq('campaign_id', excludeCampaignId);
			const { data, error } = await query;
			if (error) throw error;
			return data ?? [];
		})
	);
	for (const row of results.flat()) {
		if (!row.sent_at) continue;
		const current = latest.get(row.email);
		if (!current || row.sent_at > current) latest.set(row.email, row.sent_at);
	}
	return latest;
}

export interface DetailOptions extends AudienceOptions {
	/** Exclusions the caller just computed (skips resolving the audience again). */
	exclusions?: AudienceExclusion[];
}

export async function getCampaignDetail(
	supabase: Client,
	campaignId: string,
	options: DetailOptions = {}
): Promise<CampaignDetail> {
	const campaignRow = await loadCampaignRow(supabase, campaignId);
	const campaign = toCampaignRow(campaignRow);
	// Who was left out only matters while the list can still change.
	const wantsExclusions = EDITABLE_STATUSES.includes(campaign.status);

	const recipientsPromise = loadRecipients(supabase, campaignId);
	const [rows, engagement, exclusions] = await Promise.all([
		recipientsPromise,
		loadEngagement(supabase, [campaignId]),
		!wantsExclusions
			? Promise.resolve<AudienceExclusion[]>([])
			: options.exclusions
				? Promise.resolve(options.exclusions)
				: resolveAudience(supabase, campaign.audience, options).then(
						(resolution) => resolution.exclusions
					)
	]);
	const lastContacted = await loadLastContacted(
		supabase,
		rows.map((row) => row.email),
		campaignId
	);

	const recipients = rows.map((row) =>
		toRecipientView(row, engagement.get(row.id), lastContacted.get(row.email) ?? null)
	);

	return { campaign, recipients, counts: computeCounts(recipients), exclusions };
}

export async function listCampaigns(supabase: Client): Promise<CampaignSummary[]> {
	const { data: campaigns, error } = await supabase
		.from('email_campaigns')
		.select('*')
		.order('updated_at', { ascending: false });
	if (error) throw error;
	const ids = (campaigns ?? []).map((campaign) => campaign.id);
	if (ids.length === 0) return [];

	const [recipientRows, engagement] = await Promise.all([
		fetchAllRows<
			Pick<
				RecipientDbRow,
				| 'id'
				| 'campaign_id'
				| 'status'
				| 'included'
				| 'override_source'
				| 'replied_at'
				| 'bounced_at'
				| 'scheduled_for'
			>
		>((from, to) =>
			supabase
				.from('email_campaign_recipients')
				.select(
					'id, campaign_id, status, included, override_source, replied_at, bounced_at, scheduled_for'
				)
				.in('campaign_id', ids)
				.order('id')
				.range(from, to)
		),
		loadEngagement(supabase, ids)
	]);

	const byCampaign = new Map<string, CountableRecipient[]>();
	const nextSend = new Map<string, string>();
	for (const row of recipientRows) {
		const metrics = engagement.get(row.id);
		const list = byCampaign.get(row.campaign_id) ?? [];
		list.push({
			status: row.status as RecipientStatus,
			included: row.included,
			override_source: (row.override_source as OverrideSource | null) ?? null,
			replied_at: row.replied_at,
			bounced_at: row.bounced_at,
			opened_at: metrics?.opened_at ?? null,
			first_clicked_at: metrics?.first_clicked_at ?? null,
			unsubscribed_at: metrics?.unsubscribed_at ?? null
		});
		byCampaign.set(row.campaign_id, list);
		if (row.status === 'queued' && row.scheduled_for) {
			const current = nextSend.get(row.campaign_id);
			if (!current || row.scheduled_for < current) {
				nextSend.set(row.campaign_id, row.scheduled_for);
			}
		}
	}

	return (campaigns ?? []).map((row) => {
		const campaign = toCampaignRow(row);
		return {
			id: campaign.id,
			name: campaign.name,
			status: campaign.status,
			subject_template: campaign.subject_template,
			from_name: campaign.from_name,
			source: campaign.source,
			starts_at: campaign.starts_at,
			queued_at: campaign.queued_at,
			completed_at: campaign.completed_at,
			created_at: campaign.created_at,
			updated_at: campaign.updated_at,
			next_send_at: nextSend.get(campaign.id) ?? null,
			counts: computeCounts(byCampaign.get(campaign.id) ?? [])
		};
	});
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
	name?: string | null;
	createdBy: string | null;
	subject_template?: string;
	body_template?: string;
	from_name?: string;
	audience?: CampaignAudience;
	metadata?: Record<string, unknown>;
}

export async function createCampaign(
	supabase: Client,
	input: CreateCampaignInput
): Promise<CampaignRow> {
	const { data, error } = await supabase
		.from('email_campaigns')
		.insert({
			name: input.name?.trim() || 'Untitled campaign',
			created_by: input.createdBy,
			subject_template: input.subject_template ?? '',
			body_template: input.body_template ?? '',
			from_name: input.from_name?.trim() || 'DJ',
			audience: (input.audience ?? emptyAudience()) as unknown as Json,
			metadata: (input.metadata ?? {}) as Json
		})
		.select('*')
		.single();
	if (error) throw error;
	return toCampaignRow(data);
}

export interface CampaignPatch {
	name?: string;
	subject_template?: string;
	body_template?: string;
	from_name?: string;
	tailoring_instructions?: string | null;
	wave_size?: number;
	wave_interval_minutes?: number;
	starts_at?: string | null;
}

function assertEditable(campaign: { status: string }, action = 'edit this campaign'): void {
	if (!EDITABLE_STATUSES.includes(campaign.status as CampaignStatus)) {
		throw new CampaignError(
			campaign.status === 'sending'
				? `Pause the campaign before you ${action}.`
				: `This campaign is ${campaign.status}, so you can't ${action}.`,
			409
		);
	}
}

export async function updateCampaign(
	supabase: Client,
	campaignId: string,
	patch: CampaignPatch
): Promise<CampaignRow> {
	const current = await loadCampaignRow(supabase, campaignId);
	assertEditable(current);

	const update: Database['public']['Tables']['email_campaigns']['Update'] = {};
	if (patch.name !== undefined) update.name = patch.name.trim() || 'Untitled campaign';
	if (patch.subject_template !== undefined) update.subject_template = patch.subject_template;
	if (patch.body_template !== undefined) update.body_template = patch.body_template;
	if (patch.from_name !== undefined) update.from_name = patch.from_name.trim() || 'DJ';
	if (patch.tailoring_instructions !== undefined) {
		update.tailoring_instructions = patch.tailoring_instructions?.trim() || null;
	}
	if (patch.wave_size !== undefined)
		update.wave_size = clampWave(patch.wave_size, WAVE_SIZE_RANGE);
	if (patch.wave_interval_minutes !== undefined) {
		update.wave_interval_minutes = clampWave(patch.wave_interval_minutes, WAVE_INTERVAL_RANGE);
	}
	if (patch.starts_at !== undefined) update.starts_at = patch.starts_at;
	if (Object.keys(update).length === 0) return toCampaignRow(current);

	const { data, error } = await supabase
		.from('email_campaigns')
		.update(update)
		.eq('id', campaignId)
		.select('*')
		.single();
	if (error) throw error;
	return toCampaignRow(data);
}

export async function deleteCampaign(supabase: Client, campaignId: string): Promise<void> {
	const current = await loadCampaignRow(supabase, campaignId);
	if (current.status !== 'draft') {
		throw new CampaignError('Only drafts can be deleted. Cancel the campaign instead.', 409);
	}
	const { error } = await supabase.from('email_campaigns').delete().eq('id', campaignId);
	if (error) throw error;
}

// ---------------------------------------------------------------------------
// Audience → recipients
// ---------------------------------------------------------------------------

export interface SyncResult {
	inserted: number;
	updated: number;
	removed: number;
	exclusions: AudienceExclusion[];
}

/** Computed facts refresh the stored context; extra keys (e.g. import notes) are kept. */
function mergeContext(existing: Json | null, fresh: RecipientContext): Json {
	return { ...asContext(existing), ...fresh } as Json;
}

/**
 * Rebuilds the recipient list from the campaign's audience (draft or paused only).
 * People still present keep their row, version, include flag and segment label;
 * new people are added; people no longer in the audience are removed unless
 * they were already sent to.
 */
export async function syncRecipients(
	supabase: Client,
	campaignId: string,
	options: AudienceOptions = {}
): Promise<SyncResult> {
	const campaignRow = await loadCampaignRow(supabase, campaignId);
	assertEditable(campaignRow, 'change who gets it');
	const audience = normalizeAudience(campaignRow.audience);

	const [resolution, existingRows] = await Promise.all([
		resolveAudience(supabase, audience, options),
		loadRecipients(supabase, campaignId)
	]);

	const existingByEmail = new Map(existingRows.map((row) => [row.email, row]));
	const wanted = new Map<string, ResolvedPerson>(
		resolution.people.map((person) => [person.email, person])
	);
	const isPaused = campaignRow.status === 'paused';

	const inserts: RecipientInsert[] = [];
	const updates: RecipientInsert[] = [];
	for (const person of resolution.people) {
		const existing = existingByEmail.get(person.email);
		if (!existing) {
			inserts.push({
				campaign_id: campaignId,
				email: person.email,
				name: person.name,
				first_name: person.first_name,
				user_id: person.user_id,
				beta_signup_id: person.beta_signup_id,
				segment: person.segment,
				context: person.context as Json,
				// A paused campaign is mid-flight: new people wait in line for resume.
				status: isPaused ? 'queued' : 'draft',
				scheduled_for: null
			});
			continue;
		}
		updates.push({
			id: existing.id,
			campaign_id: campaignId,
			email: existing.email,
			name: existing.name ?? person.name,
			first_name: existing.first_name ?? person.first_name,
			user_id: person.user_id ?? existing.user_id,
			beta_signup_id: person.beta_signup_id ?? existing.beta_signup_id,
			// Keep labels DJ already saw (imported rows, or how they first came in).
			segment: existing.segment,
			context: mergeContext(existing.context, person.context)
		});
	}

	const removable = existingRows.filter(
		(row) => !wanted.has(row.email) && !row.sent_at && ['draft', 'queued'].includes(row.status)
	);

	if (inserts.length > 0) {
		const { error } = await supabase.from('email_campaign_recipients').insert(inserts);
		if (error) throw error;
	}
	if (updates.length > 0) {
		const { error } = await supabase
			.from('email_campaign_recipients')
			.upsert(updates, { onConflict: 'id' });
		if (error) throw error;
	}
	for (const batch of chunk(removable.map((row) => row.id))) {
		const { error } = await supabase.from('email_campaign_recipients').delete().in('id', batch);
		if (error) throw error;
	}

	return {
		inserted: inserts.length,
		updated: updates.length,
		removed: removable.length,
		exclusions: resolution.exclusions
	};
}

/** Saves the audience, rebuilds the list, and returns the fresh detail. */
export async function setAudience(
	supabase: Client,
	campaignId: string,
	audience: CampaignAudience,
	options: AudienceOptions = {}
): Promise<CampaignDetail> {
	const current = await loadCampaignRow(supabase, campaignId);
	assertEditable(current, 'change who gets it');
	const normalized = normalizeAudience(audience);
	const { error } = await supabase
		.from('email_campaigns')
		.update({ audience: normalized as unknown as Json })
		.eq('id', campaignId);
	if (error) throw error;
	const { exclusions } = await syncRecipients(supabase, campaignId, options);
	return getCampaignDetail(supabase, campaignId, { ...options, exclusions });
}

// ---------------------------------------------------------------------------
// Queue / pause / resume / cancel / retry
// ---------------------------------------------------------------------------

export interface QueueInput {
	starts_at?: string | null;
	wave_size: number;
	wave_interval_minutes: number;
}

/** Problems that block sending, as sentences DJ can act on. Empty when ready. */
export function validateForSending(
	campaign: Pick<CampaignRow, 'subject_template' | 'body_template'>,
	recipients: Array<
		Pick<
			RecipientDbRow,
			'email' | 'first_name' | 'context' | 'subject_override' | 'body_override'
		>
	>
): string[] {
	const problems: string[] = [];
	if (recipients.length === 0) {
		return ['Add at least one person before sending.'];
	}

	const unknown = new Set<string>();
	let missingSubject = 0;
	let missingBody = 0;
	for (const recipient of recipients) {
		const subjectSource = recipient.subject_override?.trim()
			? recipient.subject_override
			: campaign.subject_template;
		const bodySource = recipient.body_override?.trim()
			? recipient.body_override
			: campaign.body_template;
		for (const key of findUnknownMergeFields(`${subjectSource ?? ''} ${bodySource ?? ''}`)) {
			unknown.add(key);
		}
		const rendered = renderCampaignEmail(campaign, {
			first_name: recipient.first_name,
			context: asContext(recipient.context),
			subject_override: recipient.subject_override,
			body_override: recipient.body_override
		});
		if (!rendered.subject) missingSubject += 1;
		if (!rendered.text) missingBody += 1;
	}

	if (missingSubject > 0) {
		problems.push(
			missingSubject === recipients.length
				? 'Add a subject line before sending.'
				: `${missingSubject} ${missingSubject === 1 ? 'person has' : 'people have'} no subject line.`
		);
	}
	if (missingBody > 0) {
		problems.push(
			missingBody === recipients.length
				? 'Write the email before sending.'
				: `${missingBody} ${missingBody === 1 ? 'person has' : 'people have'} an empty email.`
		);
	}
	if (unknown.size > 0) {
		const list = [...unknown].map((key) => `{{${key}}}`).join(', ');
		problems.push(`Fix the unknown fill-in ${list} before sending.`);
	}
	return problems;
}

/**
 * Gives rows their wave times. One guarded update per wave (rows in a wave share
 * a time), and only rows still in `fromStatus` move — a row the cron already
 * claimed or sent is never pulled back into the queue.
 */
async function respaceQueued(
	supabase: Client,
	rows: Array<Pick<RecipientDbRow, 'id'>>,
	startsAt: Date,
	waveSize: number,
	intervalMinutes: number,
	options: { fromStatus: 'draft' | 'queued'; extra?: Partial<RecipientInsert> }
): Promise<number> {
	if (rows.length === 0) return 0;
	const schedule = computeWaveSchedule(rows.length, startsAt, waveSize, intervalMinutes);
	const waves = new Map<string, string[]>();
	rows.forEach((row, index) => {
		const at = (schedule[index] ?? startsAt).toISOString();
		const ids = waves.get(at) ?? [];
		ids.push(row.id);
		waves.set(at, ids);
	});

	let moved = 0;
	for (const [at, ids] of waves) {
		for (const batch of chunk(ids)) {
			const { data, error } = await supabase
				.from('email_campaign_recipients')
				.update({ ...(options.extra ?? {}), scheduled_for: at })
				.in('id', batch)
				.eq('status', options.fromStatus)
				.select('id');
			if (error) throw error;
			moved += data?.length ?? 0;
		}
	}
	return moved;
}

export async function queueCampaign(
	supabase: Client,
	campaignId: string,
	input: QueueInput,
	now: Date = new Date()
): Promise<CampaignDetail> {
	const campaignRow = await loadCampaignRow(supabase, campaignId);
	if (campaignRow.status !== 'draft') {
		throw new CampaignError(
			campaignRow.status === 'paused'
				? 'This campaign is paused. Resume it instead.'
				: 'This campaign has already been sent.',
			409
		);
	}

	const rows = await loadRecipients(supabase, campaignId);
	const ready = rows.filter((row) => row.included && row.status === 'draft');
	const campaign = toCampaignRow(campaignRow);
	const problems = validateForSending(campaign, ready);
	if (problems.length > 0) throw new CampaignError(problems.join(' '));

	const waveSize = clampWave(input.wave_size, WAVE_SIZE_RANGE);
	const intervalMinutes = clampWave(input.wave_interval_minutes, WAVE_INTERVAL_RANGE);
	let startsAt = now;
	if (input.starts_at) {
		const requested = new Date(input.starts_at);
		if (Number.isNaN(requested.getTime())) {
			throw new CampaignError('Pick a valid start time.');
		}
		if (requested > now) startsAt = requested;
	}

	// Claim the campaign first (draft → paused) so a double click or a second tab
	// gets a 409 instead of queueing twice. Paused, not sending: the cron would
	// call a sending campaign with nothing queued yet "completed".
	const { data: claimed, error: claimError } = await supabase
		.from('email_campaigns')
		.update({
			status: 'paused',
			queued_at: now.toISOString(),
			starts_at: startsAt.toISOString(),
			wave_size: waveSize,
			wave_interval_minutes: intervalMinutes,
			completed_at: null,
			canceled_at: null
		})
		.eq('id', campaignId)
		.eq('status', 'draft')
		.select('id');
	if (claimError) throw claimError;
	if (!claimed || claimed.length === 0) {
		throw new CampaignError('This campaign was already queued.', 409);
	}

	try {
		await respaceQueued(supabase, ready, startsAt, waveSize, intervalMinutes, {
			fromStatus: 'draft',
			extra: { status: 'queued', error_message: null, skip_reason: null }
		});
	} catch (error) {
		// Put everything back so DJ can try again from a clean draft.
		await supabase
			.from('email_campaign_recipients')
			.update({ status: 'draft', scheduled_for: null })
			.eq('campaign_id', campaignId)
			.eq('status', 'queued');
		await supabase
			.from('email_campaigns')
			.update({ status: 'draft', queued_at: null })
			.eq('id', campaignId);
		throw error;
	}

	const { error } = await supabase
		.from('email_campaigns')
		.update({ status: 'sending' })
		.eq('id', campaignId)
		.eq('status', 'paused');
	if (error) throw error;

	return getCampaignDetail(supabase, campaignId);
}

export async function pauseCampaign(supabase: Client, campaignId: string): Promise<CampaignDetail> {
	const current = await loadCampaignRow(supabase, campaignId);
	if (current.status !== 'sending') {
		throw new CampaignError('Only a campaign that is sending can be paused.', 409);
	}
	const { error } = await supabase
		.from('email_campaigns')
		.update({ status: 'paused' })
		.eq('id', campaignId);
	if (error) throw error;
	return getCampaignDetail(supabase, campaignId);
}

export async function resumeCampaign(
	supabase: Client,
	campaignId: string,
	now: Date = new Date()
): Promise<CampaignDetail> {
	const current = await loadCampaignRow(supabase, campaignId);
	if (current.status !== 'paused') {
		throw new CampaignError('Only a paused campaign can be resumed.', 409);
	}
	const rows = await loadRecipients(supabase, campaignId);
	const waiting = rows
		.filter((row) => row.status === 'queued' && row.included)
		.sort(
			(a, b) =>
				(a.scheduled_for ?? '9999').localeCompare(b.scheduled_for ?? '9999') ||
				a.created_at.localeCompare(b.created_at)
		);
	const inFlight = rows.some((row) => row.status === 'sending');

	// Pick up the plan where it left off: the next wave goes out now, or at its
	// original time if that's still ahead (pausing a scheduled campaign to fix a
	// typo must not send it early).
	const nextPlanned = waiting[0]?.scheduled_for ? new Date(waiting[0].scheduled_for) : null;
	const resumeAt = nextPlanned && nextPlanned > now ? nextPlanned : now;
	await respaceQueued(
		supabase,
		waiting,
		resumeAt,
		current.wave_size,
		current.wave_interval_minutes,
		{ fromStatus: 'queued' }
	);

	const finished = waiting.length === 0 && !inFlight;
	const { error } = await supabase
		.from('email_campaigns')
		.update(
			finished
				? { status: 'completed', completed_at: now.toISOString() }
				: { status: 'sending', completed_at: null }
		)
		.eq('id', campaignId);
	if (error) throw error;
	return getCampaignDetail(supabase, campaignId);
}

export async function cancelCampaign(
	supabase: Client,
	campaignId: string,
	now: Date = new Date()
): Promise<CampaignDetail> {
	const current = await loadCampaignRow(supabase, campaignId);
	if (!['sending', 'paused'].includes(current.status)) {
		throw new CampaignError(
			current.status === 'draft'
				? 'This campaign hasn’t been sent. Delete the draft instead.'
				: `This campaign is already ${current.status}.`,
			409
		);
	}
	// Stop the campaign first so the cron claims nothing more, then drop the queue.
	const { error: campaignError } = await supabase
		.from('email_campaigns')
		.update({ status: 'canceled', canceled_at: now.toISOString() })
		.eq('id', campaignId);
	if (campaignError) throw campaignError;
	const { error } = await supabase
		.from('email_campaign_recipients')
		.update({ status: 'canceled', scheduled_for: null })
		.eq('campaign_id', campaignId)
		.eq('status', 'queued');
	if (error) throw error;
	return getCampaignDetail(supabase, campaignId);
}

async function loadRecipientRow(
	supabase: Client,
	campaignId: string,
	recipientId: string
): Promise<RecipientDbRow> {
	const { data, error } = await supabase
		.from('email_campaign_recipients')
		.select('*')
		.eq('id', recipientId)
		.eq('campaign_id', campaignId)
		.maybeSingle();
	if (error) throw error;
	if (!data) throw new CampaignError('That person isn’t in this campaign.', 404);
	return data;
}

async function recipientView(
	supabase: Client,
	row: RecipientDbRow
): Promise<CampaignRecipientView> {
	const [engagement, lastContacted] = await Promise.all([
		row.email_id ? loadEngagement(supabase, [row.campaign_id]) : Promise.resolve(null),
		loadLastContacted(supabase, [row.email], row.campaign_id)
	]);
	return toRecipientView(
		row,
		engagement?.get(row.id) ?? null,
		lastContacted.get(row.email) ?? null
	);
}

export async function retryRecipient(
	supabase: Client,
	campaignId: string,
	recipientId: string,
	now: Date = new Date()
): Promise<CampaignRecipientView> {
	const campaign = await loadCampaignRow(supabase, campaignId);
	if (campaign.status === 'canceled' || campaign.status === 'draft') {
		throw new CampaignError(
			campaign.status === 'canceled'
				? 'This campaign was canceled.'
				: 'This campaign hasn’t been sent yet.',
			409
		);
	}
	const row = await loadRecipientRow(supabase, campaignId, recipientId);
	if (row.status !== 'failed') {
		throw new CampaignError('Only failed emails can be retried.', 409);
	}

	const { data, error } = await supabase
		.from('email_campaign_recipients')
		.update({
			status: 'queued',
			included: true,
			scheduled_for: now.toISOString(),
			lease_expires_at: null,
			error_message: null
		})
		.eq('id', recipientId)
		.eq('status', 'failed')
		.select('*')
		.single();
	if (error) throw error;

	if (campaign.status === 'completed') {
		const { error: campaignError } = await supabase
			.from('email_campaigns')
			.update({ status: 'sending', completed_at: null })
			.eq('id', campaignId);
		if (campaignError) throw campaignError;
	}
	return recipientView(supabase, data);
}

export interface RecipientPatch {
	subject_override?: string | null;
	body_override?: string | null;
	included?: boolean;
	reset?: boolean;
}

export async function updateRecipient(
	supabase: Client,
	campaignId: string,
	recipientId: string,
	patch: RecipientPatch
): Promise<CampaignRecipientView> {
	const campaign = await loadCampaignRow(supabase, campaignId);
	assertEditable(campaign, 'change this person’s email');
	const row = await loadRecipientRow(supabase, campaignId, recipientId);
	if (!['draft', 'queued'].includes(row.status)) {
		throw new CampaignError('This email has already gone out.', 409);
	}

	const update: Database['public']['Tables']['email_campaign_recipients']['Update'] = {};
	if (patch.reset) {
		update.subject_override = null;
		update.body_override = null;
		update.override_source = null;
		update.tailor_status = 'none';
		update.tailor_error = null;
		update.tailored_at = null;
	} else {
		const touchesVersion =
			patch.subject_override !== undefined || patch.body_override !== undefined;
		if (patch.subject_override !== undefined) {
			update.subject_override = patch.subject_override?.trim()
				? patch.subject_override
				: null;
		}
		if (patch.body_override !== undefined) {
			update.body_override = patch.body_override?.trim() ? patch.body_override : null;
		}
		if (touchesVersion) {
			const subject =
				update.subject_override !== undefined
					? update.subject_override
					: row.subject_override;
			const body =
				update.body_override !== undefined ? update.body_override : row.body_override;
			update.override_source = subject || body ? 'edited' : null;
		}
	}

	if (patch.included !== undefined) {
		update.included = patch.included;
		// In a paused campaign, leaving the list means leaving the queue (and back).
		if (campaign.status === 'paused') {
			if (!patch.included && row.status === 'queued') {
				update.status = 'draft';
				update.scheduled_for = null;
			}
			if (patch.included && row.status === 'draft') {
				update.status = 'queued';
				update.scheduled_for = null;
			}
		}
	}

	if (Object.keys(update).length === 0) return recipientView(supabase, row);

	const { data, error } = await supabase
		.from('email_campaign_recipients')
		.update(update)
		.eq('id', recipientId)
		.select('*')
		.single();
	if (error) throw error;
	return recipientView(supabase, data);
}

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

export async function createFollowUp(
	supabase: Client,
	campaignId: string,
	createdBy: string | null,
	options: AudienceOptions = {}
): Promise<CampaignRow> {
	const source = await loadCampaignRow(supabase, campaignId);
	const [rows, engagement] = await Promise.all([
		loadRecipients(supabase, campaignId),
		loadEngagement(supabase, [campaignId])
	]);

	const people: ManualPerson[] = rows
		.filter(
			(row) =>
				row.status === 'sent' &&
				!row.replied_at &&
				!row.bounced_at &&
				!engagement.get(row.id)?.unsubscribed_at
		)
		.map((row) => ({
			email: normalizeEmail(row.email),
			name: row.name,
			user_id: row.user_id,
			beta_signup_id: row.beta_signup_id
		}));

	if (people.length === 0) {
		throw new CampaignError(
			'Everyone who got this campaign replied, unsubscribed, or bounced. No one to follow up with.',
			409
		);
	}

	const campaign = await createCampaign(supabase, {
		name: `Follow-up: ${source.name}`,
		createdBy,
		from_name: source.from_name,
		audience: { segments: [], people, removed_emails: [] },
		metadata: { follow_up_of: campaignId }
	});
	await syncRecipients(supabase, campaign.id, options);
	return getCampaign(supabase, campaign.id);
}
