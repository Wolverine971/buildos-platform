// packages/twilio-service/src/index.ts
export { TwilioClient, type TwilioConfig } from './client';
export { SMSService } from './services/sms.service';

// Export common types for message jobs
export interface MessageJob {
	id: string;
	recipient_phone: string;
	message_content: string;
	template_id?: string;
	template_vars?: Record<string, any>;
	scheduled_for?: string;
	priority?: 'low' | 'normal' | 'high' | 'urgent';
	metadata?: Record<string, any>;
}
