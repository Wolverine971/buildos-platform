// apps/web/src/lib/services/sms.service.ts
import { ApiService, type ServiceResponse } from './base/api-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ErrorLoggerService } from './errorLogger.service';
import { createSupabaseBrowser } from '$lib/supabase';

export interface SendSMSParams {
	userId: string;
	phoneNumber: string;
	message: string;
	templateKey?: string;
	templateVars?: Record<string, any>;
	priority?: 'low' | 'normal' | 'high' | 'urgent';
	scheduledFor?: Date;
	metadata?: Record<string, any>;
}

export class SMSService extends ApiService {
	private static instance: SMSService;
	private supabase: SupabaseClient<Database>;
	protected errorLogger: ErrorLoggerService;

	private constructor(supabase: SupabaseClient<Database>) {
		super('');
		this.supabase = supabase;
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	public static getInstance(supabase: SupabaseClient<Database>): SMSService {
		if (!SMSService.instance) {
			SMSService.instance = new SMSService(supabase);
		}
		return SMSService.instance;
	}

	async sendSMS(params: SendSMSParams): Promise<ServiceResponse<{ messageId: string }>> {
		try {
			// Check user SMS preferences
			const { data: prefs } = await this.supabase
				.from('user_sms_preferences')
				.select('*')
				.eq('user_id', params.userId)
				.maybeSingle(); // Use maybeSingle() to avoid 406 when no rows

			if (!prefs || !prefs.phone_verified) {
				return {
					success: false,
					errors: [
						'Phone number not verified. Please verify your phone number in settings.'
					]
				};
			}

			if (prefs.opted_out) {
				return {
					success: false,
					errors: ['SMS notifications are disabled. Enable them in settings.']
				};
			}

			// Queue the SMS message
			const { data, error } = await this.supabase.rpc('queue_sms_message', {
				p_user_id: params.userId,
				p_phone_number: params.phoneNumber || prefs.phone_number || '',
				p_message: params.message,
				p_priority: params.priority || 'normal',
				p_scheduled_for: params.scheduledFor?.toISOString() ?? undefined,
				p_metadata: params.metadata || {}
			});

			if (error) {
				throw error;
			}

			return {
				success: true,
				data: { messageId: data }
			};
		} catch (error: any) {
			console.error('Failed to send SMS:', error);
			await this.errorLogger.logAPIError(error, '/api/sms/send', 'POST', params.userId, {
				operation: 'sendSMS',
				errorType: 'sms_delivery_failure',
				phoneNumber: params.phoneNumber ? 'provided' : 'from_preferences',
				priority: params.priority || 'normal',
				hasTemplate: !!params.templateKey,
				scheduled: !!params.scheduledFor
			});
			return {
				success: false,
				errors: [error.message || 'Failed to send SMS']
			};
		}
	}

	/**
	 * @deprecated This feature (task reminders via SMS) is deprecated and no longer supported.
	 * Use event reminders or morning/evening briefings instead.
	 * Will be removed in a future version.
	 */
	async sendTaskReminder(taskId: string): Promise<ServiceResponse<{ messageId: string }>> {
		// Feature deprecated - task_reminders field removed from schema
		return {
			success: false,
			errors: [
				'Task reminders via SMS are no longer supported. Please use event reminders or daily briefings instead.'
			]
		};
	}

	async verifyPhoneNumber(
		phoneNumber: string
	): Promise<ServiceResponse<{ verificationSent: boolean }>> {
		try {
			const response = await this.post('/api/sms/verify', { phoneNumber });
			return response;
		} catch (error: any) {
			await this.errorLogger.logAPIError(error, '/api/sms/verify', 'POST', undefined, {
				operation: 'verifyPhoneNumber',
				errorType: 'sms_verification_send_failure',
				hasPhoneNumber: !!phoneNumber
			});
			return {
				success: false,
				errors: [error.message || 'Failed to send verification']
			};
		}
	}

	async confirmVerification(
		phoneNumber: string,
		code: string
	): Promise<ServiceResponse<{ verified: boolean }>> {
		try {
			const response = await this.post('/api/sms/verify/confirm', {
				phoneNumber,
				code
			});

			if (response.success) {
				// Update user preferences
				const {
					data: { user }
				} = await this.supabase.auth.getUser();
				if (user) {
					await this.supabase.from('user_sms_preferences').upsert(
						{
							user_id: user.id,
							phone_number: phoneNumber,
							phone_verified: true,
							phone_verified_at: new Date().toISOString()
						},
						{
							onConflict: 'user_id'
						}
					);
				}
			}

			return response;
		} catch (error: any) {
			await this.errorLogger.logAPIError(
				error,
				'/api/sms/verify/confirm',
				'POST',
				undefined,
				{
					operation: 'confirmVerification',
					errorType: 'sms_verification_confirm_failure',
					hasPhoneNumber: !!phoneNumber,
					hasCode: !!code
				}
			);
			return {
				success: false,
				errors: [error.message || 'Failed to verify phone number']
			};
		}
	}

	async getSMSMessages(userId: string): Promise<ServiceResponse<{ messages: any[] }>> {
		try {
			const { data: messages, error } = await this.supabase
				.from('sms_messages')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.limit(50);

			if (error) throw error;

			return {
				success: true,
				data: { messages: messages || [] }
			};
		} catch (error: any) {
			console.error('Failed to get SMS messages:', error);
			await this.errorLogger.logDatabaseError(error, 'SELECT', 'sms_messages', userId, {
				operation: 'getSMSMessages'
			});
			return {
				success: false,
				errors: [error.message || 'Failed to get SMS messages']
			};
		}
	}

	async getSMSPreferences(userId: string): Promise<ServiceResponse<{ preferences: any }>> {
		try {
			const { data: prefs, error } = await this.supabase
				.from('user_sms_preferences')
				.select('*')
				.eq('user_id', userId)
				.maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 when no rows

			if (error) throw error;

			return {
				success: true,
				data: { preferences: prefs }
			};
		} catch (error: any) {
			console.error('Failed to get SMS preferences:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'user_sms_preferences',
				userId,
				{ operation: 'getSMSPreferences' }
			);
			return {
				success: false,
				errors: [error.message || 'Failed to get SMS preferences']
			};
		}
	}

	async updateSMSPreferences(
		userId: string,
		preferences: Partial<{
			phone_number: string;
			urgent_alerts: boolean;
			quiet_hours_start: string;
			quiet_hours_end: string;
			timezone: string;
		}>
	): Promise<ServiceResponse<{ updated: boolean }>> {
		try {
			const { error } = await this.supabase.from('user_sms_preferences').upsert(
				{
					user_id: userId,
					...preferences,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'user_id'
				}
			);

			if (error) throw error;

			return {
				success: true,
				data: { updated: true }
			};
		} catch (error: any) {
			console.error('Failed to update SMS preferences:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'UPSERT',
				'user_sms_preferences',
				userId,
				{
					operation: 'updateSMSPreferences',
					updatedFields: Object.keys(preferences)
				}
			);
			return {
				success: false,
				errors: [error.message || 'Failed to update SMS preferences']
			};
		}
	}

	async optOut(userId: string): Promise<ServiceResponse<{ optedOut: boolean }>> {
		try {
			const { error } = await this.supabase.from('user_sms_preferences').upsert(
				{
					user_id: userId,
					opted_out: true,
					opted_out_at: new Date().toISOString()
				},
				{
					onConflict: 'user_id'
				}
			);

			if (error) throw error;

			return {
				success: true,
				data: { optedOut: true }
			};
		} catch (error: any) {
			console.error('Failed to opt out:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'UPSERT',
				'user_sms_preferences',
				userId,
				{
					operation: 'optOut',
					errorType: 'sms_opt_out_failure',
					severity: 'critical', // TCPA compliance requirement
					tcpaCompliance: 'CRITICAL - Opt-out must succeed for TCPA compliance'
				}
			);
			return {
				success: false,
				errors: [error.message || 'Failed to opt out']
			};
		}
	}
}

// Export singleton instance (for browser contexts only)
// Note: This creates a new Supabase client instance. For more control,
// use SMSService.getInstance(supabaseClient) directly in your components.
export const smsService = SMSService.getInstance(createSupabaseBrowser());
