// apps/web/src/lib/server/email-sequence-copy-overrides.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';

type TypedSupabaseClient = SupabaseClient<Database>;

export interface EmailSequenceCopyOverride {
	id: string;
	sequence_key: string;
	step_key: string;
	variant_key: string;
	subject: string;
	body: string;
	metadata: Record<string, unknown> | null;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface EmailContentWithCopy {
	subject: string;
	body: string;
	html: string;
	ctaLabel?: string | null;
	ctaUrl?: string | null;
}

export interface EmailCopyOverrideInput {
	sequenceKey: string;
	stepKey: string;
	variantKey: string;
	subject: string;
	body: string;
	adminUserId: string;
	metadata?: Record<string, unknown>;
}

export type EmailCopyTokens = Record<string, string | number | boolean | null | undefined>;

const OVERRIDES_TABLE = 'email_sequence_copy_overrides';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function firstName(name: string | null | undefined): string | null {
	const trimmed = name?.trim();
	return trimmed ? (trimmed.split(/\s+/)[0] ?? null) : null;
}

function renderTemplate(template: string, tokens: EmailCopyTokens): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
		if (!(key in tokens)) {
			return match;
		}

		const value = tokens[key];
		return value == null ? '' : String(value);
	});
}

function plainTextToHtml(body: string): string {
	const blocks = body
		.trim()
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean);

	return blocks
		.map((block) => {
			const lines = block.split('\n');
			const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line.trim()));
			if (bulletLines.length === lines.length) {
				return `<ul>${bulletLines
					.map((line) => `<li>${escapeHtml(line.trim().replace(/^[-*]\s+/, ''))}</li>`)
					.join('')}</ul>`;
			}

			return `<p>${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`;
		})
		.join('');
}

function renderButton(label: string, url: string): string {
	return `<div style="margin: 28px 0;"><a href="${escapeHtml(
		url
	)}" style="display: inline-block; background-color: #D96C1E; color: #FAF9F7; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">${escapeHtml(
		label
	)}</a></div>`;
}

export function buildEmailCopyTokens(input: {
	name?: string | null;
	email?: string | null;
	baseUrl?: string | null;
	ctaLabel?: string | null;
	ctaUrl?: string | null;
	appUrl?: string | null;
	demoUrl?: string | null;
	extra?: EmailCopyTokens;
}): EmailCopyTokens {
	const resolvedFirstName = firstName(input.name);
	return {
		name: input.name ?? '',
		first_name: resolvedFirstName ?? '',
		email: input.email ?? '',
		greeting: resolvedFirstName ? `Hi ${resolvedFirstName},` : 'Hi,',
		base_url: input.baseUrl ?? '',
		cta_label: input.ctaLabel ?? '',
		cta_url: input.ctaUrl ?? '',
		app_url: input.appUrl ?? input.ctaUrl ?? '',
		demo_url: input.demoUrl ?? '',
		...(input.extra ?? {})
	};
}

export function renderEmailCopyOverride(
	content: EmailContentWithCopy,
	override: Pick<EmailSequenceCopyOverride, 'subject' | 'body'>,
	tokens: EmailCopyTokens
): EmailContentWithCopy {
	const subject = renderTemplate(override.subject, tokens).trim();
	const body = renderTemplate(override.body, tokens).trim();
	const bodyHtml = plainTextToHtml(body);
	const ctaLabel = content.ctaLabel ?? null;
	const ctaUrl = content.ctaUrl ?? null;
	const ctaHtml = ctaLabel && ctaUrl ? renderButton(ctaLabel, ctaUrl) : '';
	const html = generateMinimalEmailHTML({
		subject,
		content: `${bodyHtml}${ctaHtml}`
	});

	return {
		...content,
		subject,
		body,
		html
	};
}

export async function listEmailCopyOverrides(
	supabase: TypedSupabaseClient,
	sequenceKey: string
): Promise<EmailSequenceCopyOverride[]> {
	const { data, error } = await (supabase as any)
		.from(OVERRIDES_TABLE)
		.select('*')
		.eq('sequence_key', sequenceKey);

	if (error) {
		throw new Error(`Failed to load email copy overrides: ${error.message}`);
	}

	return ((data as EmailSequenceCopyOverride[] | null) || []).map((row) => ({
		...row,
		metadata: isRecord(row.metadata) ? row.metadata : {}
	}));
}

export async function getEmailCopyOverride(
	supabase: TypedSupabaseClient,
	input: {
		sequenceKey: string;
		stepKey: string;
		variantKey: string;
	}
): Promise<EmailSequenceCopyOverride | null> {
	const { data, error } = await (supabase as any)
		.from(OVERRIDES_TABLE)
		.select('*')
		.eq('sequence_key', input.sequenceKey)
		.eq('step_key', input.stepKey)
		.eq('variant_key', input.variantKey)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to load email copy override: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return {
		...(data as EmailSequenceCopyOverride),
		metadata: isRecord((data as EmailSequenceCopyOverride).metadata)
			? (data as EmailSequenceCopyOverride).metadata
			: {}
	};
}

export async function applyEmailCopyOverride(
	supabase: TypedSupabaseClient,
	input: {
		sequenceKey: string;
		stepKey: string;
		variantKey: string;
		content: EmailContentWithCopy;
		tokens: EmailCopyTokens;
	}
): Promise<EmailContentWithCopy> {
	const override = await getEmailCopyOverride(supabase, input);
	if (!override) {
		return input.content;
	}

	return renderEmailCopyOverride(input.content, override, input.tokens);
}

export async function upsertEmailCopyOverride(
	supabase: TypedSupabaseClient,
	input: EmailCopyOverrideInput
): Promise<EmailSequenceCopyOverride> {
	const sequenceKey = input.sequenceKey.trim();
	const stepKey = input.stepKey.trim();
	const variantKey = input.variantKey.trim() || 'default';
	const subject = input.subject.trim();
	const body = input.body.trim();

	if (!sequenceKey || !stepKey || !variantKey || !subject || !body) {
		throw new Error('sequence_key, step_key, variant_key, subject, and body are required');
	}

	const { data, error } = await (supabase as any)
		.from(OVERRIDES_TABLE)
		.upsert(
			{
				sequence_key: sequenceKey,
				step_key: stepKey,
				variant_key: variantKey,
				subject,
				body,
				metadata: input.metadata ?? {},
				created_by: input.adminUserId,
				updated_by: input.adminUserId
			},
			{ onConflict: 'sequence_key,step_key,variant_key' }
		)
		.select('*')
		.single();

	if (error) {
		throw new Error(`Failed to save email copy override: ${error.message}`);
	}

	return data as EmailSequenceCopyOverride;
}

export async function deleteEmailCopyOverride(
	supabase: TypedSupabaseClient,
	input: {
		sequenceKey: string;
		stepKey: string;
		variantKey: string;
	}
): Promise<void> {
	const { error } = await (supabase as any)
		.from(OVERRIDES_TABLE)
		.delete()
		.eq('sequence_key', input.sequenceKey)
		.eq('step_key', input.stepKey)
		.eq('variant_key', input.variantKey);

	if (error) {
		throw new Error(`Failed to clear email copy override: ${error.message}`);
	}
}
