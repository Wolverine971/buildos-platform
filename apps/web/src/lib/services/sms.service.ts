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
		super();
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
				.select('*')
				.eq('user_id', params.userId)
				.single();

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

	async sendTaskReminder(taskId: string): Promise<ServiceResponse<{ messageId: string }>> {
		try {
			// Get task details
			const { data: task } = await supabase
				.from('tasks')
				.select('*, projects(name)')
				.eq('id', taskId)
				.single();

			if (!task) {
				return {
					success: false,
					errors: ['Task not found']
				};
			}

			// Get user preferences
			const { data: prefs } = await supabase
				.from('user_sms_preferences')
				.select('*')
				.eq('user_id', task.user_id)
				.single();

			if (!prefs?.phone_number || !prefs.task_reminders) {
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
					await supabase.from('user_sms_preferences').upsert({
						user_id: user.id,
						phone_number: phoneNumber,
						phone_verified: true,
						phone_verified_at: new Date().toISOString()
					});
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
				.select('*')
				.eq('user_id', userId)
				.single();

			if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned

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
			task_reminders: boolean;
			daily_brief_sms: boolean;
			urgent_alerts: boolean;
			quiet_hours_start: string;
			quiet_hours_end: string;
			timezone: string;
		}>
	): Promise<ServiceResponse<{ updated: boolean }>> {
		try {
			const { error } = await supabase.from('user_sms_preferences').upsert({
				user_id: userId,
				...preferences,
				updated_at: new Date().toISOString()
			});

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
			const { error } = await supabase.from('user_sms_preferences').upsert({
				user_id: userId,
				opted_out: true,
				opted_out_at: new Date().toISOString()
			});

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
