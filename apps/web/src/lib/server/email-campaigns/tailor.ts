// apps/web/src/lib/server/email-campaigns/tailor.ts
// "Tailor each person": an AI rewrite of the campaign email per person, from the
// facts we hold about them. DJ triggers it from the campaign page (paid model
// call, ~$0.001 per person); it never runs on its own.
// Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md (Server → tailor.ts)

import sanitizeHtml from 'sanitize-html';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

import { SmartLLMService } from '$lib/services/smart-llm-service';
import { extractLinks, htmlToPlainText, renderCampaignEmail } from '$lib/email-campaigns/render';
import {
	AUDIENCE_SEGMENTS,
	type AudienceSegment,
	type CampaignRecipientView,
	type OverrideSource,
	type RecipientContext,
	type RecipientSegment,
	type RecipientStatus,
	type TailorStatus
} from '$lib/email-campaigns/types';

type Client = SupabaseClient<Database>;
type RecipientRow = Database['public']['Tables']['email_campaign_recipients']['Row'];
type CampaignRowDb = Database['public']['Tables']['email_campaigns']['Row'];

export const TAILOR_OPERATION_TYPE = 'email_campaign_tailor';
export const MAX_TAILORED_SUBJECT_LENGTH = 120;

/** Statuses whose content can still change (never touch what is sending or sent). */
export const TAILORABLE_STATUSES: RecipientStatus[] = ['draft', 'queued', 'failed', 'canceled'];

export interface TailorLlm {
	getJSONResponse<T>(options: {
		systemPrompt: string;
		userPrompt: string;
		userId: string;
		profile: 'balanced';
		operationType: string;
		temperature?: number;
		maxTokens?: number;
		metadata?: Record<string, unknown>;
		validation?: { retryOnParseError?: boolean; maxRetries?: number };
	}): Promise<T>;
}

export type TailorCampaign = Pick<
	CampaignRowDb,
	'id' | 'name' | 'subject_template' | 'body_template' | 'from_name'
>;

export type TailorRecipient = Pick<
	RecipientRow,
	'id' | 'first_name' | 'segment' | 'context' | 'subject_override' | 'body_override'
>;

export type TailorOutcome =
	| { id: string; ok: true; subject: string; body_html: string }
	| { id: string; ok: false; error: string };

const ALLOWED_TAGS = ['p', 'br', 'a', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i'];

function asContext(value: unknown): RecipientContext {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as RecipientContext)
		: {};
}

export function buildTailorSystemPrompt(): string {
	return `You rewrite one short email from DJ, the solo founder of BuildOS, for one specific person.

BuildOS is a thinking environment for people making complex things: you type or say what is in your head, messy, and it turns into organized projects that keep their context. Lead with relief, not AI. Never pitch features or hype.

Voice:
- Plain, warm, direct, short. Sounds like DJ typed it himself. No marketing language, no exclamation marks, no emoji.
- Keep DJ's message, offer, and call to action. Change only what makes it land for this person.
- Sign off as "DJ".
- Subjects may be lowercase and natural ("your synapse server", "about your buildos signup").

Facts and privacy:
- Use only the facts given about this person. Never invent details, usage, numbers, or history.
- If the facts are thin, keep the email general instead of faking personalization.
- When you use something they wrote on their signup form, say so plainly ("you told me when you signed up that…"). Never imply we watched what they did.
- Project titles may be mentioned; nothing else about their projects.

Format:
- Return JSON: {"subject": string, "body_html": string}.
- body_html uses only <p>, <br>, <a href>, <ul>, <ol>, <li>, <strong>, <em>.
- Keep every link from the original email, with the exact same URL.
- No {{merge fields}}, no placeholders, no brackets to fill in.`;
}

function describeFacts(recipient: TailorRecipient): string {
	const context = asContext(recipient.context);
	const segment = recipient.segment as RecipientSegment;
	const lines: string[] = [];
	lines.push(`First name: ${recipient.first_name?.trim() || 'unknown (use no name)'}`);
	if (segment in AUDIENCE_SEGMENTS) {
		lines.push(`Group: ${AUDIENCE_SEGMENTS[segment as AudienceSegment].description}`);
	}
	if (context.has_account !== undefined) {
		lines.push(`Has a BuildOS account: ${context.has_account ? 'yes' : 'no'}`);
	}
	if (context.signup_month) lines.push(`Signed up: ${context.signup_month}`);
	if (typeof context.project_count === 'number') {
		lines.push(`Projects they made: ${context.project_count}`);
	}
	if (context.last_project) lines.push(`Most recent project title: ${context.last_project}`);
	if (context.last_visit_at) lines.push(`Last visit: ${context.last_visit_at.slice(0, 10)}`);
	if (context.why_interested) {
		lines.push(`Signup form, why they were interested: ${context.why_interested}`);
	}
	if (context.biggest_challenge) {
		lines.push(`Signup form, biggest challenge: ${context.biggest_challenge}`);
	}
	if (context.productivity_tools?.length) {
		lines.push(`Signup form, tools they use: ${context.productivity_tools.join(', ')}`);
	}
	if (context.job_title) lines.push(`Job title: ${context.job_title}`);
	if (context.company_name) lines.push(`Company: ${context.company_name}`);
	if (context.onboarding_intent) {
		lines.push(`What they said they wanted to use BuildOS for: ${context.onboarding_intent}`);
	}
	return lines.join('\n');
}

/** The email this person would get today (their own version or the merged template). */
export function baseEmailFor(campaign: TailorCampaign, recipient: TailorRecipient) {
	return renderCampaignEmail(campaign, {
		first_name: recipient.first_name,
		context: asContext(recipient.context),
		subject_override: recipient.subject_override,
		body_override: recipient.body_override
	});
}

export function buildTailorUserPrompt({
	campaign,
	recipient,
	instructions
}: {
	campaign: TailorCampaign;
	recipient: TailorRecipient;
	instructions: string | null | undefined;
}): string {
	const base = baseEmailFor(campaign, recipient);
	const trimmed = instructions?.trim();
	return `DJ's instructions for tailoring:
${trimmed || '(none — tailor using what they told us, and keep it short)'}

The email to tailor:
Subject: ${base.subject}
Body (HTML):
${base.bodyHtml}

About this person:
${describeFacts(recipient)}

Return the JSON now.`;
}

function toParagraphHtml(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.map((paragraph) => `<p>${sanitizeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
		.join('\n');
}

/**
 * Validates the model's structured output. Pass → cleaned subject + body.
 * Checks: non-empty subject (one line, ≤ 120 chars) and body, every link from
 * the base email kept, no leftover {{merge fields}}.
 */
export function validateTailoredEmail(
	output: unknown,
	baseBodyHtml: string
): { ok: true; subject: string; body_html: string } | { ok: false; error: string } {
	if (!output || typeof output !== 'object') {
		return { ok: false, error: 'The AI returned no email.' };
	}
	const record = output as Record<string, unknown>;
	const subject =
		typeof record.subject === 'string' ? record.subject.replace(/\s+/g, ' ').trim() : '';
	const rawBody = typeof record.body_html === 'string' ? record.body_html.trim() : '';

	if (!subject) return { ok: false, error: 'The AI returned an empty subject.' };
	if (subject.length > MAX_TAILORED_SUBJECT_LENGTH) {
		return { ok: false, error: 'The AI returned a subject that is too long.' };
	}
	if (!rawBody) return { ok: false, error: 'The AI returned an empty body.' };

	const bodySource = /<[a-z][\s\S]*>/i.test(rawBody) ? rawBody : toParagraphHtml(rawBody);
	const body_html = sanitizeHtml(bodySource, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: { a: ['href'] },
		allowedSchemes: ['http', 'https', 'mailto']
	}).trim();

	if (!htmlToPlainText(body_html)) return { ok: false, error: 'The AI returned an empty body.' };
	if (subject.includes('{{') || body_html.includes('{{')) {
		return { ok: false, error: 'The AI left a {{merge field}} in the email.' };
	}

	const keptLinks = new Set(extractLinks(body_html));
	const missing = [...new Set(extractLinks(baseBodyHtml))].filter((link) => !keptLinks.has(link));
	if (missing.length > 0) {
		return {
			ok: false,
			error: `The AI dropped or changed a link: ${missing.join(', ')}`
		};
	}

	return { ok: true, subject, body_html };
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await worker(items[index]!);
		}
	});
	await Promise.all(runners);
	return results;
}

export async function tailorRecipients({
	supabase,
	campaign,
	recipients,
	instructions,
	adminUserId,
	llm,
	concurrency = 2,
	now = () => new Date()
}: {
	supabase: Client;
	campaign: TailorCampaign;
	recipients: TailorRecipient[];
	instructions: string | null | undefined;
	adminUserId: string;
	llm?: TailorLlm;
	concurrency?: number;
	now?: () => Date;
}): Promise<TailorOutcome[]> {
	const model: TailorLlm =
		llm ??
		(new SmartLLMService({
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Email Campaigns',
			supabase
		}) as unknown as TailorLlm);
	const systemPrompt = buildTailorSystemPrompt();

	return mapWithConcurrency(recipients, concurrency, async (recipient) => {
		const base = baseEmailFor(campaign, recipient);
		let outcome: TailorOutcome;
		try {
			const output = await model.getJSONResponse<unknown>({
				systemPrompt,
				userPrompt: buildTailorUserPrompt({ campaign, recipient, instructions }),
				userId: adminUserId,
				profile: 'balanced',
				operationType: TAILOR_OPERATION_TYPE,
				temperature: 0.6,
				maxTokens: 1200,
				metadata: { campaign_id: campaign.id, campaign_recipient_id: recipient.id },
				validation: { retryOnParseError: true, maxRetries: 1 }
			});
			const checked = validateTailoredEmail(output, base.bodyHtml);
			outcome = checked.ok
				? {
						id: recipient.id,
						ok: true,
						subject: checked.subject,
						body_html: checked.body_html
					}
				: { id: recipient.id, ok: false, error: checked.error };
		} catch (error) {
			outcome = {
				id: recipient.id,
				ok: false,
				error: `Tailoring failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}

		const patch: Database['public']['Tables']['email_campaign_recipients']['Update'] =
			outcome.ok
				? {
						subject_override: outcome.subject,
						body_override: outcome.body_html,
						override_source: 'tailored',
						tailor_status: 'done',
						tailored_at: now().toISOString(),
						tailor_error: null
					}
				: { tailor_status: 'failed', tailor_error: outcome.error };

		const { error: updateError } = await supabase
			.from('email_campaign_recipients')
			.update(patch)
			.eq('id', recipient.id)
			.in('status', TAILORABLE_STATUSES);
		if (updateError && outcome.ok) {
			outcome = {
				id: recipient.id,
				ok: false,
				error: `Tailored, but saving failed: ${updateError.message}`
			};
		}
		return outcome;
	});
}

/** Maps a recipient row to the view shape without engagement data (tailor route response). */
export function toBasicRecipientView(row: RecipientRow): CampaignRecipientView {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		first_name: row.first_name,
		user_id: row.user_id,
		beta_signup_id: row.beta_signup_id,
		segment: row.segment as RecipientSegment,
		context: asContext(row.context),
		subject_override: row.subject_override,
		body_override: row.body_override,
		override_source: row.override_source as OverrideSource | null,
		tailor_status: row.tailor_status as TailorStatus,
		tailor_error: row.tailor_error,
		included: row.included,
		status: row.status as RecipientStatus,
		skip_reason: row.skip_reason,
		scheduled_for: row.scheduled_for,
		sent_at: row.sent_at,
		replied_at: row.replied_at,
		bounced_at: row.bounced_at,
		error_message: row.error_message,
		opened_at: null,
		open_count: 0,
		first_clicked_at: null,
		click_count: 0,
		unsubscribed_at: null,
		last_contacted_at: null
	};
}
