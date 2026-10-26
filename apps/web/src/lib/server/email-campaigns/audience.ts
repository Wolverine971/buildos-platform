// apps/web/src/lib/server/email-campaigns/audience.ts
//
// Who a campaign goes to. Resolves the one-click segments and hand-added people
// into one deduped list of people with the facts used for merge fields and AI
// tailoring, plus the people left out and why.
//
// Everything is read in a handful of batched queries (users, actors, projects,
// beta signups, suppressions) and joined in memory: no per-person round trips.
// The admin's own client reads users, projects and beta signups (admin RLS);
// suppressions are service-role-only, so they come through a separate reader.
//
// Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { firstNameFrom, formatSignupMonth } from '$lib/email-campaigns/render';
import {
	AUDIENCE_SEGMENTS,
	WENT_QUIET_DAYS,
	type AudienceExclusion,
	type AudienceSegment,
	type CampaignAudience,
	type ExclusionReason,
	type ManualPerson,
	type PersonSearchResult,
	type RecipientContext,
	type RecipientSegment,
	type SegmentCount
} from '$lib/email-campaigns/types';

type Client = SupabaseClient<Database>;

export interface ResolvedPerson {
	email: string;
	name: string | null;
	first_name: string | null;
	user_id: string | null;
	beta_signup_id: string | null;
	segment: RecipientSegment;
	context: RecipientContext;
}

export interface AudienceResolution {
	people: ResolvedPerson[];
	exclusions: AudienceExclusion[];
}

export interface SuppressionRecord {
	email: string;
	scope: string;
	reason: string;
}

/** Reads email_suppressions (service-role-only table). Injected in tests. */
export type SuppressionReader = () => Promise<SuppressionRecord[]>;

export interface AudienceOptions {
	now?: Date;
	readSuppressions?: SuppressionReader;
}

// Hand-added people win, then the most specific segment.
const SEGMENT_PRIORITY: Record<RecipientSegment, number> = {
	manual: 0,
	imported: 0,
	went_quiet: 1,
	no_project: 2,
	beta_no_account: 3
};

const SEGMENT_ORDER: AudienceSegment[] = ['went_quiet', 'no_project', 'beta_no_account'];
const PAGE_SIZE = 1000;
// Structural address check (a structured format, not language).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value);
}

export function emptyAudience(): CampaignAudience {
	return { segments: [], people: [], removed_emails: [] };
}

/** Coerces stored jsonb into a well-formed audience (unknown segments and bad entries dropped). */
export function normalizeAudience(raw: unknown): CampaignAudience {
	const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as any) : {};
	const segments = Array.isArray(value.segments)
		? (value.segments as unknown[]).filter(
				(segment): segment is AudienceSegment =>
					typeof segment === 'string' && segment in AUDIENCE_SEGMENTS
			)
		: [];
	const seenPeople = new Set<string>();
	const people: ManualPerson[] = [];
	for (const entry of Array.isArray(value.people) ? value.people : []) {
		if (!entry || typeof entry !== 'object') continue;
		const email = normalizeEmail(typeof entry.email === 'string' ? entry.email : '');
		if (!email || seenPeople.has(email)) continue;
		seenPeople.add(email);
		people.push({
			email,
			name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null,
			user_id: typeof entry.user_id === 'string' ? entry.user_id : null,
			beta_signup_id: typeof entry.beta_signup_id === 'string' ? entry.beta_signup_id : null
		});
	}
	const removed = Array.isArray(value.removed_emails)
		? [
				...new Set(
					(value.removed_emails as unknown[])
						.filter((email): email is string => typeof email === 'string')
						.map(normalizeEmail)
						.filter(Boolean)
				)
			]
		: [];
	return { segments: [...new Set(segments)], people, removed_emails: removed };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface UserRow {
	id: string;
	email: string;
	name: string | null;
	created_at: string;
	last_visit: string | null;
	is_admin: boolean;
	deletion_status: string | null;
	onboarding_intent: string | null;
}

interface BetaSignupRow {
	id: string;
	email: string;
	full_name: string | null;
	job_title: string | null;
	company_name: string | null;
	why_interested: string | null;
	biggest_challenge: string | null;
	productivity_tools: string[] | null;
	signup_status: string | null;
	created_at: string | null;
}

interface ProjectSummary {
	count: number;
	lastTitle: string | null;
	lastUpdatedAt: string | null;
}

export interface AudienceData {
	users: UserRow[];
	betaSignups: BetaSignupRow[];
	/** user id → their real projects (kind = 'project', not deleted). */
	projectsByUser: Map<string, ProjectSummary>;
	suppressions: SuppressionRecord[];
}

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

function defaultSuppressionReader(): SuppressionReader {
	return async () => {
		const admin = createAdminSupabaseClient();
		return fetchAllRows<SuppressionRecord>((from, to) =>
			admin
				.from('email_suppressions')
				.select('email, scope, reason')
				.order('email')
				.range(from, to)
		);
	};
}

export async function loadAudienceData(
	supabase: Client,
	options: AudienceOptions = {}
): Promise<AudienceData> {
	const readSuppressions = options.readSuppressions ?? defaultSuppressionReader();

	const [users, actors, projects, betaSignups, suppressions] = await Promise.all([
		fetchAllRows<UserRow>((from, to) =>
			supabase
				.from('users')
				.select(
					'id, email, name, created_at, last_visit, is_admin, deletion_status, onboarding_intent'
				)
				.order('created_at')
				.range(from, to)
		),
		fetchAllRows<{ id: string; user_id: string | null }>((from, to) =>
			supabase
				.from('onto_actors')
				.select('id, user_id')
				.not('user_id', 'is', null)
				.order('id')
				.range(from, to)
		),
		fetchAllRows<{ created_by: string; name: string | null; updated_at: string | null }>(
			(from, to) =>
				supabase
					.from('onto_projects')
					.select('created_by, name, updated_at')
					.eq('kind', 'project')
					.is('deleted_at', null)
					.order('id')
					.range(from, to)
		),
		fetchAllRows<BetaSignupRow>((from, to) =>
			supabase
				.from('beta_signups')
				.select(
					'id, email, full_name, job_title, company_name, why_interested, biggest_challenge, productivity_tools, signup_status, created_at'
				)
				.order('created_at')
				.range(from, to)
		),
		readSuppressions()
	]);

	const userByActor = new Map<string, string>();
	for (const actor of actors) {
		if (actor.user_id) userByActor.set(actor.id, actor.user_id);
	}

	const projectsByUser = new Map<string, ProjectSummary>();
	for (const project of projects) {
		const userId = userByActor.get(project.created_by);
		if (!userId) continue;
		const summary = projectsByUser.get(userId) ?? {
			count: 0,
			lastTitle: null,
			lastUpdatedAt: null
		};
		summary.count += 1;
		const updatedAt = project.updated_at ?? '';
		if (!summary.lastUpdatedAt || updatedAt > summary.lastUpdatedAt) {
			summary.lastUpdatedAt = updatedAt || summary.lastUpdatedAt;
			summary.lastTitle = project.name?.trim() || summary.lastTitle;
		}
		projectsByUser.set(userId, summary);
	}

	return { users, betaSignups, projectsByUser, suppressions };
}

// ---------------------------------------------------------------------------
// Resolution (pure over AudienceData)
// ---------------------------------------------------------------------------

interface Indexes {
	userByEmail: Map<string, UserRow>;
	userById: Map<string, UserRow>;
	betaByEmail: Map<string, BetaSignupRow>;
	betaById: Map<string, BetaSignupRow>;
	suppressionByEmail: Map<string, SuppressionRecord[]>;
}

function buildIndexes(data: AudienceData): Indexes {
	const userByEmail = new Map<string, UserRow>();
	const userById = new Map<string, UserRow>();
	for (const user of data.users) {
		userById.set(user.id, user);
		const email = normalizeEmail(user.email);
		if (email) userByEmail.set(email, user);
	}
	const betaByEmail = new Map<string, BetaSignupRow>();
	const betaById = new Map<string, BetaSignupRow>();
	for (const signup of data.betaSignups) {
		betaById.set(signup.id, signup);
		const email = normalizeEmail(signup.email);
		// Keep the earliest signup per address (rows are loaded oldest first).
		if (email && !betaByEmail.has(email)) betaByEmail.set(email, signup);
	}
	const suppressionByEmail = new Map<string, SuppressionRecord[]>();
	for (const record of data.suppressions) {
		const email = normalizeEmail(record.email);
		if (!email) continue;
		suppressionByEmail.set(email, [...(suppressionByEmail.get(email) ?? []), record]);
	}
	return { userByEmail, userById, betaByEmail, betaById, suppressionByEmail };
}

function earliest(...values: Array<string | null | undefined>): string | null {
	const present = values.filter((value): value is string => Boolean(value));
	if (present.length === 0) return null;
	return present.reduce((min, value) => (value < min ? value : min));
}

function buildPerson(
	email: string,
	segment: RecipientSegment,
	indexes: Indexes,
	data: AudienceData,
	fallbackName: string | null = null
): ResolvedPerson {
	const user = indexes.userByEmail.get(email) ?? null;
	const beta = indexes.betaByEmail.get(email) ?? null;
	const projects = user ? data.projectsByUser.get(user.id) : undefined;
	const name = user?.name?.trim() || beta?.full_name?.trim() || fallbackName?.trim() || null;
	const signedUpAt = earliest(user?.created_at, beta?.created_at);

	const context: RecipientContext = {
		has_account: Boolean(user),
		signed_up_at: signedUpAt,
		signup_month: formatSignupMonth(signedUpAt),
		last_visit_at: user?.last_visit ?? null,
		project_count: user ? (projects?.count ?? 0) : null,
		last_project: projects?.lastTitle ?? null,
		why_interested: beta?.why_interested?.trim() || null,
		biggest_challenge: beta?.biggest_challenge?.trim() || null,
		productivity_tools: beta?.productivity_tools?.length ? beta.productivity_tools : null,
		job_title: beta?.job_title?.trim() || null,
		company_name: beta?.company_name?.trim() || null,
		onboarding_intent: user?.onboarding_intent?.trim() || null
	};

	return {
		email,
		name,
		first_name: firstNameFrom(name),
		user_id: user?.id ?? null,
		beta_signup_id: beta?.id ?? null,
		segment,
		context
	};
}

function exclusionReason(
	person: ResolvedPerson,
	indexes: Indexes,
	removed: Set<string>
): ExclusionReason | null {
	if (!isValidEmail(person.email)) return 'invalid_email';
	if (removed.has(person.email)) return 'removed';
	const suppressions = indexes.suppressionByEmail.get(person.email) ?? [];
	if (suppressions.some((row) => row.reason === 'hard_bounce' || row.reason === 'complaint')) {
		return 'bounced';
	}
	// A daily-brief-only opt-out is not an opt-out from DJ's emails; anything else is.
	if (suppressions.some((row) => row.scope !== 'daily_brief')) return 'unsubscribed';
	const user = person.user_id ? indexes.userById.get(person.user_id) : undefined;
	// Admins drop out of segments, but DJ can still add himself by hand on purpose.
	if (user?.is_admin && person.segment !== 'manual') return 'admin';
	if (user?.deletion_status) return 'deleting_account';
	return null;
}

function cutoffIso(now: Date): string {
	return new Date(now.getTime() - WENT_QUIET_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Raw segment membership (before exclusions), as lowercased emails. */
export function segmentMembers(
	segment: AudienceSegment,
	data: AudienceData,
	now: Date = new Date()
): string[] {
	if (segment === 'beta_no_account') {
		const userEmails = new Set(data.users.map((user) => normalizeEmail(user.email)));
		const members = new Set<string>();
		for (const signup of data.betaSignups) {
			if ((signup.signup_status ?? '').toLowerCase() === 'rejected') continue;
			const email = normalizeEmail(signup.email);
			if (email && !userEmails.has(email)) members.add(email);
		}
		return [...members];
	}

	const quietBefore = cutoffIso(now);
	const members: string[] = [];
	for (const user of data.users) {
		const email = normalizeEmail(user.email);
		if (!email) continue;
		const projectCount = data.projectsByUser.get(user.id)?.count ?? 0;
		if (segment === 'no_project' && projectCount === 0) members.push(email);
		if (
			segment === 'went_quiet' &&
			projectCount > 0 &&
			(!user.last_visit || user.last_visit < quietBefore)
		) {
			members.push(email);
		}
	}
	return members;
}

/** Turns an audience into the deduped people list plus who was left out and why. */
export function resolveAudienceFromData(
	audience: CampaignAudience,
	data: AudienceData,
	now: Date = new Date()
): AudienceResolution {
	const indexes = buildIndexes(data);
	const removed = new Set(audience.removed_emails.map(normalizeEmail));
	const chosen = new Map<string, ResolvedPerson>();

	const consider = (candidate: ResolvedPerson) => {
		const existing = chosen.get(candidate.email);
		if (!existing || SEGMENT_PRIORITY[candidate.segment] < SEGMENT_PRIORITY[existing.segment]) {
			chosen.set(candidate.email, candidate);
		}
	};

	for (const person of audience.people) {
		const email = normalizeEmail(person.email);
		if (!email) continue;
		consider(buildPerson(email, 'manual', indexes, data, person.name ?? null));
	}

	const selected = SEGMENT_ORDER.filter((segment) => audience.segments.includes(segment));
	for (const segment of selected) {
		for (const email of segmentMembers(segment, data, now)) {
			consider(buildPerson(email, segment, indexes, data));
		}
	}

	const people: ResolvedPerson[] = [];
	const exclusions: AudienceExclusion[] = [];
	for (const person of chosen.values()) {
		const reason = exclusionReason(person, indexes, removed);
		if (reason) {
			exclusions.push({
				email: person.email,
				name: person.name,
				segment: person.segment,
				reason
			});
		} else {
			people.push(person);
		}
	}

	return { people, exclusions };
}

export async function resolveAudience(
	supabase: Client,
	audience: CampaignAudience,
	options: AudienceOptions = {}
): Promise<AudienceResolution> {
	const data = await loadAudienceData(supabase, options);
	return resolveAudienceFromData(audience, data, options.now ?? new Date());
}

/** Live counts for the segment cards (after exclusions, each segment on its own). */
export function segmentCountsFromData(data: AudienceData, now: Date = new Date()): SegmentCount[] {
	return SEGMENT_ORDER.map((segment) => {
		const { people } = resolveAudienceFromData(
			{ segments: [segment], people: [], removed_emails: [] },
			data,
			now
		);
		return {
			segment,
			label: AUDIENCE_SEGMENTS[segment].label,
			description: AUDIENCE_SEGMENTS[segment].description,
			count: people.length
		};
	});
}

export async function getSegmentCounts(
	supabase: Client,
	options: AudienceOptions = {}
): Promise<SegmentCount[]> {
	const data = await loadAudienceData(supabase, options);
	return segmentCountsFromData(data, options.now ?? new Date());
}

// ---------------------------------------------------------------------------
// People search (manual add)
// ---------------------------------------------------------------------------

function escapePostgrestSearch(value: string): string {
	return value.replace(/[\\%_,().*]/g, ' ').trim();
}

export async function searchPeople(
	supabase: Client,
	search: string,
	limit = 20
): Promise<PersonSearchResult[]> {
	const term = escapePostgrestSearch(search);
	if (term.length < 2) return [];
	const perSource = Math.max(1, Math.min(limit, 20));

	const [usersResult, betaResult] = await Promise.all([
		supabase
			.from('users')
			.select('id, email, name, created_at')
			.or(`name.ilike.%${term}%,email.ilike.%${term}%`)
			.order('created_at', { ascending: false })
			.limit(perSource),
		supabase
			.from('beta_signups')
			.select('id, email, full_name, created_at')
			.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
			.order('created_at', { ascending: false })
			.limit(perSource)
	]);
	if (usersResult.error) throw usersResult.error;
	if (betaResult.error) throw betaResult.error;

	const results = new Map<string, PersonSearchResult>();
	for (const user of usersResult.data ?? []) {
		const email = normalizeEmail(user.email);
		if (!email) continue;
		results.set(email, {
			email,
			name: user.name?.trim() || null,
			user_id: user.id,
			beta_signup_id: null,
			kind: 'user',
			signed_up_at: user.created_at ?? null
		});
	}
	for (const signup of betaResult.data ?? []) {
		const email = normalizeEmail(signup.email);
		if (!email) continue;
		const existing = results.get(email);
		if (existing) {
			existing.beta_signup_id = existing.beta_signup_id ?? signup.id;
			existing.name = existing.name ?? (signup.full_name?.trim() || null);
			continue;
		}
		results.set(email, {
			email,
			name: signup.full_name?.trim() || null,
			user_id: null,
			beta_signup_id: signup.id,
			kind: 'beta_signup',
			signed_up_at: signup.created_at ?? null
		});
	}
	return [...results.values()].slice(0, limit);
}
