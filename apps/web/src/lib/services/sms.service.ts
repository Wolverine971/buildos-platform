// apps/web/src/lib/services/sms.service.ts
import { ApiService, type ServiceResponse } from './base/api-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ErrorLoggerService } from './errorLogger.service';
import { createSupabaseBrowser } from '$lib/supabase';
import { browser } from '$app/environment';

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
	private supabase: SupabaseClient<Database> | null;
	protected errorLogger: ErrorLoggerService | null;

	private constructor(supabase: SupabaseClient<Database> | null = null) {
		super('');
		this.supabase = supabase;
		this.errorLogger = supabase ? ErrorLoggerService.getInstance(supabase) : null;
	}

	public static getInstance(supabase: SupabaseClient<Database> | null = null): SMSService {
		if (!SMSService.instance) {
			SMSService.instance = new SMSService(supabase);
		} else if (supabase && !SMSService.instance.supabase) {
			SMSService.instance.supabase = supabase;
			SMSService.instance.errorLogger = ErrorLoggerService.getInstance(supabase);
		}
		return SMSService.instance;
	}

	private getSupabase(): SupabaseClient<Database> {
		if (!browser) {
			throw new Error('SMSService is only available in the browser');
		}
		if (!this.supabase) {
			this.supabase = createSupabaseBrowser();
		}
		return this.supabase;
	}

	private getErrorLogger(): ErrorLoggerService {
		if (!this.errorLogger) {
			this.errorLogger = ErrorLoggerService.getInstance(this.getSupabase());
		}
		return this.errorLogger;
	}

	async sendSMS(params: SendSMSParams): Promise<ServiceResponse<{ messageId: string }>> {
		try {
			const supabase = this.getSupabase();
			// Check user SMS preferences
			const { data: prefs } = await supabase
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
			const { data, error } = await supabase.rpc('queue_sms_message', {
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
			await this.getErrorLogger().logAPIError(error, '/api/sms/send', 'POST', params.userId, {
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
			await this.getErrorLogger().logAPIError(error, '/api/sms/verify', 'POST', undefined, {
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
			const supabase = this.getSupabase();
			const response = await this.post('/api/sms/verify/confirm', {
				phoneNumber,
				code
			});

			if (response.success) {
				// Update user preferences
				const {
					data: { user }
				} = await supabase.auth.getUser();
				if (user) {
					await supabase.from('user_sms_preferences').upsert(
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
			await this.getErrorLogger().logAPIError(
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
			const { data: messages, error } = await this.getSupabase()
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
			await this.getErrorLogger().logDatabaseError(error, 'SELECT', 'sms_messages', userId, {
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
			const { data: prefs, error } = await this.getSupabase()
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
			await this.getErrorLogger().logDatabaseError(
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
			event_reminders_enabled: boolean;
			event_reminder_lead_time_minutes: number;
			morning_kickoff_enabled: boolean;
			morning_kickoff_time: string;
			evening_recap_enabled: boolean;
			urgent_alerts: boolean;
			quiet_hours_start: string;
			quiet_hours_end: string;
			timezone: string;
		}>
	): Promise<ServiceResponse<{ updated: boolean }>> {
		try {
			const { error } = await this.getSupabase()
				.from('user_sms_preferences')
				.upsert(
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
			await this.getErrorLogger().logDatabaseError(
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
			const { error } = await this.getSupabase().from('user_sms_preferences').upsert(
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
			await this.getErrorLogger().logDatabaseError(
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

// Creating the singleton is SSR-safe. Its browser Supabase client is allocated only
// when a browser-only method actually needs it.
export const smsService = SMSService.getInstance();
