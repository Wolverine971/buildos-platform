export const POSTHOG_CAPTURE_RECEIPT_DOM_EVENT = 'buildos:posthog-capture-receipt';
export const AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT = 'agentic_chat_admission_completed';

export type PostHogCaptureDelivery = 'batched' | 'immediate_beacon';
export type PostHogCaptureReceiptStatus = 'skipped' | 'accepted' | 'dropped' | 'error';
export type PostHogCaptureReceiptReason =
	| 'not_configured'
	| 'analytics_consent_disabled'
	| 'initialization_unavailable'
	| 'sdk_rejected'
	| 'capture_exception'
	| null;

export type PostHogCaptureReceipt = {
	event: typeof AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT;
	status: PostHogCaptureReceiptStatus;
	delivery: PostHogCaptureDelivery;
	reason: PostHogCaptureReceiptReason;
};

export function isPostHogCaptureReceiptEvent(
	event: string
): event is typeof AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT {
	return event === AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT;
}
