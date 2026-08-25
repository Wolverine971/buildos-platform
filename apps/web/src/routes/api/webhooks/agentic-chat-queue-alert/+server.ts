import { createHash } from 'node:crypto';
import { PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { EmailService } from '$lib/services/email-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const OPERATIONS_RECIPIENT = 'dj@build-os.com';
const STALE_CLAIM_MS = 5 * 60 * 1000;

export const config = { maxDuration: 60 };

const requestSchema = z
	.object({
		incidentId: z.string().regex(/^agentic_chat_scale_threshold:\d+$/),
		observedAt: z.string().datetime(),
		alert: z
			.object({
				code: z.literal('agentic_chat_scale_threshold'),
				severity: z.enum(['warning', 'critical']),
				message: z.string().min(1).max(500),
				details: z
					.object({
						pendingCount: z.number().int().nonnegative(),
						runningCount: z.number().int().nonnegative(),
						oldestPendingAgeSeconds: z.number().int().nonnegative(),
						oldestScheduledFor: z.string().datetime().nullable(),
						activeCapacity: z.number().int().positive(),
						pendingThreshold: z.number().int().positive(),
						oldestPendingThresholdSeconds: z.number().int().positive()
					})
					.strict()
			})
			.strict()
	})
	.strict();

type EmailRow = { id: string; status: string | null };

export const POST: RequestHandler = async ({ request }) => {
	if (!PRIVATE_BUILDOS_WEBHOOK_SECRET) {
		console.error('[AgenticChatQueueAlert] Webhook secret is not configured');
		return ApiResponse.internalError(null, 'Webhook not configured');
	}
	if (request.headers.get('authorization') !== `Bearer ${PRIVATE_BUILDOS_WEBHOOK_SECRET}`) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const parsed = await parseJsonRequest(request, requestSchema);
	if (!parsed.ok) return parsed.response;

	const { incidentId, observedAt, alert } = parsed.data;
	const details = alert.details;
	const emailId = deterministicUuid(incidentId);
	const subject = `[BuildOS] Agentic chat queue needs scaling: ${details.pendingCount} waiting`;
	const text = [
		'Agentic Chat reached its scaling threshold.',
		'',
		`Observed: ${observedAt}`,
		`Running: ${details.runningCount} / ${details.activeCapacity}`,
		`Waiting: ${details.pendingCount}`,
		`Oldest wait: ${details.oldestPendingAgeSeconds} seconds`,
		`Pending threshold: ${details.pendingThreshold}`,
		`Oldest-wait threshold: ${details.oldestPendingThresholdSeconds} seconds`,
		'',
		'This is a scaling alert; queued user turns continue waiting for a worker.'
	].join('\n');
	const html = `<h2>Agentic Chat reached its scaling threshold</h2>
		<p>Queued turns are still safe and waiting for a worker.</p>
		<ul>
			<li><strong>Observed:</strong> ${observedAt}</li>
			<li><strong>Running:</strong> ${details.runningCount} / ${details.activeCapacity}</li>
			<li><strong>Waiting:</strong> ${details.pendingCount}</li>
			<li><strong>Oldest wait:</strong> ${details.oldestPendingAgeSeconds} seconds</li>
			<li><strong>Pending threshold:</strong> ${details.pendingThreshold}</li>
			<li><strong>Oldest-wait threshold:</strong> ${details.oldestPendingThresholdSeconds} seconds</li>
		</ul>`;

	const supabase = createAdminSupabaseClient();
	const { data: operator, error: operatorError } = await supabase
		.from('users')
		.select('id')
		.eq('email', OPERATIONS_RECIPIENT)
		.maybeSingle();
	if (operatorError || !operator?.id) {
		console.error('[AgenticChatQueueAlert] Operations recipient account is unavailable', {
			error: operatorError?.message
		});
		return ApiResponse.internalError(null, 'Alert recipient is unavailable');
	}
	let row = await loadEmail(supabase, emailId);
	if (row?.status === 'sent') {
		return ApiResponse.success({ success: true, skipped: 'already_sent', emailId });
	}

	if (!row) {
		const { error } = await supabase.from('emails').insert({
			id: emailId,
			subject,
			content: html,
			created_by: operator.id,
			category: 'operations_alert',
			status: 'scheduled',
			tracking_enabled: false,
			template_data: {
				operations_alert_id: incidentId,
				operations_alert_code: alert.code,
				observed_at: observedAt,
				...details
			}
		});
		if (error && error.code !== '23505') {
			console.error('[AgenticChatQueueAlert] Failed to create email claim row', error);
			return ApiResponse.internalError(null, 'Alert email temporarily unavailable');
		}
		row = await loadEmail(supabase, emailId);
	}

	if (!row) return ApiResponse.internalError(null, 'Alert email claim row is missing');
	if (!(await claimEmail(supabase, emailId))) {
		const current = await loadEmail(supabase, emailId);
		return ApiResponse.success({
			success: true,
			skipped: current?.status === 'sent' ? 'already_sent' : 'already_claimed',
			emailId
		});
	}

	const result = await new EmailService(supabase).sendEmail({
		to: OPERATIONS_RECIPIENT,
		subject,
		body: text,
		html,
		from: 'dj',
		userId: operator.id,
		createdBy: operator.id,
		emailId,
		trackingEnabled: false,
		metadata: {
			category: 'operations_alert',
			operations_alert_id: incidentId,
			operations_alert_code: alert.code,
			observed_at: observedAt,
			...details
		}
	});
	if (!result.success) {
		await supabase
			.from('emails')
			.update({ status: 'failed', updated_at: new Date().toISOString() })
			.eq('id', emailId)
			.eq('status', 'sending');
		return ApiResponse.internalError(null, 'Alert email delivery failed');
	}

	return ApiResponse.success({ success: true, emailId, messageId: result.messageId ?? null });
};

async function loadEmail(
	supabase: ReturnType<typeof createAdminSupabaseClient>,
	emailId: string
): Promise<EmailRow | null> {
	const { data, error } = await supabase
		.from('emails')
		.select('id, status')
		.eq('id', emailId)
		.maybeSingle();
	if (error) throw new Error(`Failed to inspect operations alert email: ${error.message}`);
	return data;
}

async function claimEmail(
	supabase: ReturnType<typeof createAdminSupabaseClient>,
	emailId: string
): Promise<boolean> {
	const claimedAt = new Date().toISOString();
	const available = await supabase
		.from('emails')
		.update({ status: 'sending', updated_at: claimedAt })
		.eq('id', emailId)
		.in('status', ['draft', 'scheduled', 'failed'])
		.select('id')
		.maybeSingle();
	if (available.error)
		throw new Error(`Failed to claim operations alert: ${available.error.message}`);
	if (available.data) return true;

	const stale = await supabase
		.from('emails')
		.update({ status: 'sending', updated_at: claimedAt })
		.eq('id', emailId)
		.eq('status', 'sending')
		.lt('updated_at', new Date(Date.now() - STALE_CLAIM_MS).toISOString())
		.select('id')
		.maybeSingle();
	if (stale.error) throw new Error(`Failed to reclaim operations alert: ${stale.error.message}`);
	return !!stale.data;
}

function deterministicUuid(value: string): string {
	const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16));
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
