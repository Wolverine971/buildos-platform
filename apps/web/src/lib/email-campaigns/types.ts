// apps/web/src/lib/email-campaigns/types.ts
// Shared shapes for admin email campaigns (server services, API routes, and UI).
// Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md

export type CampaignStatus = 'draft' | 'sending' | 'paused' | 'completed' | 'canceled';

export type RecipientStatus =
	| 'draft'
	| 'queued'
	| 'sending'
	| 'sent'
	| 'skipped'
	| 'failed'
	| 'canceled';

export type AudienceSegment = 'no_project' | 'went_quiet' | 'beta_no_account';
export type RecipientSegment = AudienceSegment | 'manual' | 'imported';
export type OverrideSource = 'tailored' | 'edited' | 'imported';
export type TailorStatus = 'none' | 'done' | 'failed';

export const AUDIENCE_SEGMENTS: Record<AudienceSegment, { label: string; description: string }> = {
	no_project: {
		label: 'Signed up, no project',
		description: 'Has an account but never made a project.'
	},
	went_quiet: {
		label: 'Used it, went quiet',
		description: 'Made a project, then no visit in 3+ weeks.'
	},
	beta_no_account: {
		label: 'Beta signups, no account',
		description: 'Filled out the beta form but never created an account.'
	}
};

/** Days without a visit before a user with a project counts as "went quiet". */
export const WENT_QUIET_DAYS = 21;

export interface ManualPerson {
	email: string;
	name?: string | null;
	user_id?: string | null;
	beta_signup_id?: string | null;
}

/** Stored in email_campaigns.audience. */
export interface CampaignAudience {
	segments: AudienceSegment[];
	/** People added by hand (search or pasted addresses). */
	people: ManualPerson[];
	/** Lowercased addresses DJ removed from the list; they stay out on every refresh. */
	removed_emails: string[];
}

/** Facts about one person, used for merge fields and AI tailoring. Stored in recipient.context. */
export interface RecipientContext {
	has_account?: boolean;
	signed_up_at?: string | null;
	/** e.g. "July 2025" — from the account or the beta form, whichever is earlier. */
	signup_month?: string | null;
	last_visit_at?: string | null;
	project_count?: number | null;
	/** Title of their most recently updated project (titles only, never contents). */
	last_project?: string | null;
	why_interested?: string | null;
	biggest_challenge?: string | null;
	productivity_tools?: string[] | null;
	job_title?: string | null;
	company_name?: string | null;
	onboarding_intent?: string | null;
}

export type ExclusionReason =
	| 'unsubscribed'
	| 'bounced'
	| 'admin'
	| 'deleting_account'
	| 'invalid_email'
	| 'removed';

export interface AudienceExclusion {
	email: string;
	name: string | null;
	segment: RecipientSegment;
	reason: ExclusionReason;
}

export interface SegmentCount {
	segment: AudienceSegment;
	label: string;
	description: string;
	/** People in the segment after exclusions (unsubscribed, admins, deleting). */
	count: number;
}

export interface PersonSearchResult {
	email: string;
	name: string | null;
	user_id: string | null;
	beta_signup_id: string | null;
	kind: 'user' | 'beta_signup';
	signed_up_at: string | null;
}

export interface CampaignCounts {
	total: number;
	included: number;
	draft: number;
	queued: number;
	sending: number;
	sent: number;
	failed: number;
	skipped: number;
	canceled: number;
	opened: number;
	clicked: number;
	replied: number;
	unsubscribed: number;
	bounced: number;
	tailored: number;
	edited: number;
}

export interface CampaignRow {
	id: string;
	name: string;
	status: CampaignStatus;
	subject_template: string;
	body_template: string;
	from_name: string;
	audience: CampaignAudience;
	tailoring_instructions: string | null;
	wave_size: number;
	wave_interval_minutes: number;
	starts_at: string | null;
	queued_at: string | null;
	completed_at: string | null;
	canceled_at: string | null;
	source: string;
	created_at: string;
	updated_at: string;
}

export interface CampaignSummary {
	id: string;
	name: string;
	status: CampaignStatus;
	subject_template: string;
	from_name: string;
	source: string;
	starts_at: string | null;
	queued_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
	/** Earliest scheduled_for among queued recipients (null when nothing is waiting). */
	next_send_at: string | null;
	counts: CampaignCounts;
}

export interface CampaignRecipientView {
	id: string;
	email: string;
	name: string | null;
	first_name: string | null;
	user_id: string | null;
	beta_signup_id: string | null;
	segment: RecipientSegment;
	context: RecipientContext;
	subject_override: string | null;
	body_override: string | null;
	override_source: OverrideSource | null;
	tailor_status: TailorStatus;
	tailor_error: string | null;
	included: boolean;
	status: RecipientStatus;
	skip_reason: string | null;
	scheduled_for: string | null;
	sent_at: string | null;
	replied_at: string | null;
	bounced_at: string | null;
	error_message: string | null;
	opened_at: string | null;
	open_count: number;
	first_clicked_at: string | null;
	click_count: number;
	unsubscribed_at: string | null;
	/** Last time this address got any campaign email (any campaign), for "emailed 3 days ago" warnings. */
	last_contacted_at: string | null;
}

export interface CampaignDetail {
	campaign: CampaignRow;
	recipients: CampaignRecipientView[];
	counts: CampaignCounts;
	exclusions: AudienceExclusion[];
}

/** Sending plan limits (UI validation mirrors the DB CHECKs). */
export const WAVE_SIZE_RANGE = { min: 1, max: 200, default: 20 } as const;
export const WAVE_INTERVAL_RANGE = { min: 1, max: 10080, default: 60 } as const;
/** Max recipients per tailoring request (the client loops in chunks and shows progress). */
export const TAILOR_BATCH_SIZE = 4;
