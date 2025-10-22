// apps/worker/src/lib/services/webhook-email-service.ts
import { createHmac } from 'crypto';

interface WebhookEmailConfig {
	webhookUrl: string;
	webhookSecret: string;
	timeout?: number;
}

interface EmailWebhookPayload {
	userId: string;
	briefId: string;
	briefDate: string;
	recipientEmail: string;
	timestamp: string;
	metadata?: Record<string, any>;
}

export class WebhookEmailService {
	private config: WebhookEmailConfig;

	constructor() {
		const webhookUrl = (
			process.env.BUILDOS_WEBHOOK_URL || 'https://build-os.com/webhooks/daily-brief-email'
		).trim();
		const webhookSecret = process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET;

		if (!webhookSecret) {
			throw new Error('PRIVATE_BUILDOS_WEBHOOK_SECRET environment variable is required');
		}

		this.config = {
			webhookUrl,
			webhookSecret,
			timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000', 10)
		};
	}

	/**
	 * Generate HMAC signature for webhook security
	 */
	private generateSignature(payload: string): string {
		return createHmac('sha256', this.config.webhookSecret).update(payload).digest('hex');
	}

	/**
	 * Send email via BuildOS webhook
	 */
	async sendDailyBriefEmail(
		userId: string,
		briefId: string,
		briefDate: string,
		recipientEmail: string,
		metadata?: Record<string, any>
	): Promise<{ success: boolean; error?: string }> {
		const payload: EmailWebhookPayload = {
			userId,
			briefId,
			briefDate,
			recipientEmail,
			timestamp: new Date().toISOString(),
			metadata
		};

		const jsonPayload = JSON.stringify(payload);
		const signature = this.generateSignature(jsonPayload);

		try {
			let hasTimedOut = false;
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				hasTimedOut = true;
				controller.abort();
			}, this.config.timeout!);

			try {
				const response = await fetch(this.config.webhookUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Webhook-Signature': signature,
						'X-Webhook-Timestamp': payload.timestamp,
						'X-Source': 'daily-brief-worker'
					},
					body: jsonPayload,
					signal: controller.signal
				});

				clearTimeout(timeoutId);

				// Check if timeout occurred even though fetch completed
				if (hasTimedOut) {
					return {
						success: false,
						error: 'Request timed out'
					};
				}

				if (!response.ok) {
					const errorText = await response.text().catch(() => 'Unknown error');
					console.error(`❌ Webhook email failed: ${response.status} - ${errorText}`);
					return {
						success: false,
						error: `HTTP ${response.status}: ${errorText}`
					};
				}

				const result = await response.json();
				console.log('✅ Email sent via BuildOS webhook:', result);
				return { success: true };
			} finally {
				clearTimeout(timeoutId);
			}
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					console.error('❌ Webhook timeout after', this.config.timeout, 'ms');
					return { success: false, error: 'Webhook request timeout' };
				}
				console.error('❌ Webhook error:', error.message);
				return { success: false, error: error.message };
			}
			return { success: false, error: 'Unknown webhook error' };
		}
	}

	/**
	 * Verify incoming webhook signature (for testing/validation)
	 */
	verifySignature(payload: string, signature: string): boolean {
		const expectedSignature = this.generateSignature(payload);
		return signature === expectedSignature;
	}

	/**
	 * Health check for webhook endpoint
	 */
	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.webhookUrl}/health`, {
				method: 'GET',
				headers: {
					'X-Source': 'daily-brief-worker'
				}
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}
