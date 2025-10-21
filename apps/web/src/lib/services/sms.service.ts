// apps/web/src/lib/services/sms.service.ts
import { ApiService } from './base/api-service';
import type { ServiceResponse } from './base/types';
import { supabase } from '$lib/supabase';

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

	private constructor() {
		super('');
	}

	public static getInstance(): SMSService {
		if (!SMSService.instance) {
			SMSService.instance = new SMSService();
		}
		return SMSService.instance;
	}

	async sendSMS(params: SendSMSParams): Promise<ServiceResponse<{ messageId: string }>> {
		try {
			// Check user SMS preferences
			const { data: prefs } = await supabase
				.from('user_sms_preferences')
				.select(
					'id, user_id, phone_number, phone_verified, phone_verified_at, opted_out, opted_out_at, opt_out_reason, quiet_hours_start, quiet_hours_end, urgent_alerts, task_reminders, event_reminders_enabled, event_reminder_lead_time_minutes, morning_kickoff_enabled, morning_kickoff_time, evening_recap_enabled, next_up_enabled, daily_brief_sms, daily_sms_limit, daily_sms_count, daily_count_reset_at, created_at, updated_at'
				)
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
				p_phone_number: params.phoneNumber || prefs.phone_number,
				p_message: params.message,
				p_priority: params.priority || 'normal',
				p_scheduled_for: params.scheduledFor?.toISOString() || null,
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

		// Legacy implementation below (kept for reference, never executed)
		/*
		try {
			// Get task details
			const { data: task } = await supabase
				.from('tasks')
				.select('*, projects(name)')
				.eq('id', taskId)
				.maybeSingle(); // Use maybeSingle() to avoid 406 when no rows

			if (!task) {
				return {
					success: false,
					errors: ['Task not found']
				};
			}

			// Get user preferences
			const { data: prefs } = await supabase
				.from('user_sms_preferences')
				.select(
					'id, user_id, phone_number, phone_verified, phone_verified_at, opted_out, opted_out_at, opt_out_reason, quiet_hours_start, quiet_hours_end, urgent_alerts, task_reminders, event_reminders_enabled, event_reminder_lead_time_minutes, morning_kickoff_enabled, morning_kickoff_time, evening_recap_enabled, next_up_enabled, daily_brief_sms, daily_sms_limit, daily_sms_count, daily_count_reset_at, created_at, updated_at'
				)
				.eq('user_id', task.user_id)
				.maybeSingle(); // Use maybeSingle() to avoid 406 when no rows

			if (!prefs?.phone_number) {
				return {
					success: false,
					errors: ['Task reminders are disabled or phone not configured']
				};
			}

			// Use the template-based approach
			return this.sendSMS({
				userId: task.user_id,
				phoneNumber: prefs.phone_number,
				message: '', // Will be filled by template
				templateKey: 'task_reminder',
				templateVars: {
					task_name: task.name,
					due_time: task.due_date,
					task_context: task.projects?.name
				},
				priority: task.priority === 'critical' ? 'urgent' : 'normal',
				metadata: {
					task_id: taskId,
					project_id: task.project_id
				}
			});
		} catch (error: any) {
			console.error('Failed to send task reminder:', error);
			return {
				success: false,
				errors: [error.message || 'Failed to send task reminder']
			};
		}
		*/
	}

	async verifyPhoneNumber(
		phoneNumber: string
	): Promise<ServiceResponse<{ verificationSent: boolean }>> {
		try {
			const response = await this.post('/api/sms/verify', { phoneNumber });
			return response;
		} catch (error: any) {
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
			return {
				success: false,
				errors: [error.message || 'Failed to verify phone number']
			};
		}
	}

	async getSMSMessages(userId: string): Promise<ServiceResponse<{ messages: any[] }>> {
		try {
			const { data: messages, error } = await supabase
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
			return {
				success: false,
				errors: [error.message || 'Failed to get SMS messages']
			};
		}
	}

	async getSMSPreferences(userId: string): Promise<ServiceResponse<{ preferences: any }>> {
		try {
			const { data: prefs, error } = await supabase
				.from('user_sms_preferences')
				.select(
					'id, user_id, phone_number, phone_verified, phone_verified_at, opted_out, opted_out_at, opt_out_reason, quiet_hours_start, quiet_hours_end, urgent_alerts, task_reminders, event_reminders_enabled, event_reminder_lead_time_minutes, morning_kickoff_enabled, morning_kickoff_time, evening_recap_enabled, next_up_enabled, daily_brief_sms, daily_sms_limit, daily_sms_count, daily_count_reset_at, created_at, updated_at'
				)
				.eq('user_id', userId)
				.maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 when no rows

			if (error) throw error;

			return {
				success: true,
				data: { preferences: prefs }
			};
		} catch (error: any) {
			console.error('Failed to get SMS preferences:', error);
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
			const { error } = await supabase.from('user_sms_preferences').upsert(
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
			return {
				success: false,
				errors: [error.message || 'Failed to update SMS preferences']
			};
		}
	}

	async optOut(userId: string): Promise<ServiceResponse<{ optedOut: boolean }>> {
		try {
			const { error } = await supabase.from('user_sms_preferences').upsert(
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
			return {
				success: false,
				errors: [error.message || 'Failed to opt out']
			};
		}
	}
}

// Export singleton instance
export const smsService = SMSService.getInstance();
