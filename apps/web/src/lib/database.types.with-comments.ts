export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: '12.2.3 (519615d)';
	};
	public: {
		Tables: {
			admin_analytics: {
				Row: {
					created_at: string;
					date: string;
					id: string;
					metadata: Json | null;
					metric_name: string;
					metric_value: number;
				};
				Insert: {
					created_at?: string;
					date: string;
					id?: string;
					metadata?: Json | null;
					metric_name: string;
					metric_value: number;
				};
				Update: {
					created_at?: string;
					date?: string;
					id?: string;
					metadata?: Json | null;
					metric_name?: string;
					metric_value?: number;
				};
				Relationships: [];
			};
			admin_users: {
				Row: {
					created_at: string;
					granted_at: string | null;
					granted_by: string | null;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					granted_at?: string | null;
					granted_by?: string | null;
					user_id: string;
				};
				Update: {
					created_at?: string;
					granted_at?: string | null;
					granted_by?: string | null;
					user_id?: string;
				};
				Relationships: [];
			};
			api_keys: {
				Row: {
					api_key: string;
					created_at: string | null;
					id: number;
					service_name: string;
					user_id: string;
				};
				Insert: {
					api_key: string;
					created_at?: string | null;
					id?: number;
					service_name: string;
					user_id: string;
				};
				Update: {
					api_key?: string;
					created_at?: string | null;
					id?: number;
					service_name?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'api_keys_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			beta_event_attendance: {
				Row: {
					attended: boolean | null;
					created_at: string;
					event_feedback: string | null;
					event_id: string | null;
					event_rating: number | null;
					id: string;
					joined_at: string | null;
					left_at: string | null;
					member_id: string | null;
					rsvp_at: string | null;
					rsvp_status: string | null;
					user_id: string | null;
				};
				Insert: {
					attended?: boolean | null;
					created_at?: string;
					event_feedback?: string | null;
					event_id?: string | null;
					event_rating?: number | null;
					id?: string;
					joined_at?: string | null;
					left_at?: string | null;
					member_id?: string | null;
					rsvp_at?: string | null;
					rsvp_status?: string | null;
					user_id?: string | null;
				};
				Update: {
					attended?: boolean | null;
					created_at?: string;
					event_feedback?: string | null;
					event_id?: string | null;
					event_rating?: number | null;
					id?: string;
					joined_at?: string | null;
					left_at?: string | null;
					member_id?: string | null;
					rsvp_at?: string | null;
					rsvp_status?: string | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'beta_event_attendance_event_id_fkey';
						columns: ['event_id'];
						isOneToOne: false;
						referencedRelation: 'beta_events';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'beta_event_attendance_member_id_fkey';
						columns: ['member_id'];
						isOneToOne: false;
						referencedRelation: 'beta_members';
						referencedColumns: ['id'];
					}
				];
			};
			beta_events: {
				Row: {
					agenda: string | null;
					created_at: string;
					created_by: string | null;
					duration_minutes: number | null;
					event_description: string | null;
					event_status: string | null;
					event_timezone: string | null;
					event_title: string;
					event_type: string | null;
					id: string;
					max_attendees: number | null;
					meeting_link: string | null;
					meeting_notes: string | null;
					recording_url: string | null;
					scheduled_at: string;
					updated_at: string;
				};
				Insert: {
					agenda?: string | null;
					created_at?: string;
					created_by?: string | null;
					duration_minutes?: number | null;
					event_description?: string | null;
					event_status?: string | null;
					event_timezone?: string | null;
					event_title: string;
					event_type?: string | null;
					id?: string;
					max_attendees?: number | null;
					meeting_link?: string | null;
					meeting_notes?: string | null;
					recording_url?: string | null;
					scheduled_at: string;
					updated_at?: string;
				};
				Update: {
					agenda?: string | null;
					created_at?: string;
					created_by?: string | null;
					duration_minutes?: number | null;
					event_description?: string | null;
					event_status?: string | null;
					event_timezone?: string | null;
					event_title?: string;
					event_type?: string | null;
					id?: string;
					max_attendees?: number | null;
					meeting_link?: string | null;
					meeting_notes?: string | null;
					recording_url?: string | null;
					scheduled_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			beta_feature_votes: {
				Row: {
					created_at: string | null;
					feedback_id: string | null;
					id: string;
					member_id: string | null;
					vote_type: string | null;
				};
				Insert: {
					created_at?: string | null;
					feedback_id?: string | null;
					id?: string;
					member_id?: string | null;
					vote_type?: string | null;
				};
				Update: {
					created_at?: string | null;
					feedback_id?: string | null;
					id?: string;
					member_id?: string | null;
					vote_type?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'beta_feature_votes_feedback_id_fkey';
						columns: ['feedback_id'];
						isOneToOne: false;
						referencedRelation: 'beta_feedback';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'beta_feature_votes_member_id_fkey';
						columns: ['member_id'];
						isOneToOne: false;
						referencedRelation: 'beta_members';
						referencedColumns: ['id'];
					}
				];
			};
			beta_feedback: {
				Row: {
					created_at: string | null;
					declined_reason: string | null;
					feature_area: string | null;
					feedback_description: string;
					feedback_priority: string | null;
					feedback_status: string | null;
					feedback_tags: string[] | null;
					feedback_title: string;
					feedback_type: string | null;
					founder_responded_at: string | null;
					founder_response: string | null;
					id: string;
					implemented_at: string | null;
					member_id: string | null;
					updated_at: string | null;
					upvotes: number | null;
					user_id: string | null;
				};
				Insert: {
					created_at?: string | null;
					declined_reason?: string | null;
					feature_area?: string | null;
					feedback_description: string;
					feedback_priority?: string | null;
					feedback_status?: string | null;
					feedback_tags?: string[] | null;
					feedback_title: string;
					feedback_type?: string | null;
					founder_responded_at?: string | null;
					founder_response?: string | null;
					id?: string;
					implemented_at?: string | null;
					member_id?: string | null;
					updated_at?: string | null;
					upvotes?: number | null;
					user_id?: string | null;
				};
				Update: {
					created_at?: string | null;
					declined_reason?: string | null;
					feature_area?: string | null;
					feedback_description?: string;
					feedback_priority?: string | null;
					feedback_status?: string | null;
					feedback_tags?: string[] | null;
					feedback_title?: string;
					feedback_type?: string | null;
					founder_responded_at?: string | null;
					founder_response?: string | null;
					id?: string;
					implemented_at?: string | null;
					member_id?: string | null;
					updated_at?: string | null;
					upvotes?: number | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'beta_feedback_member_id_fkey';
						columns: ['member_id'];
						isOneToOne: false;
						referencedRelation: 'beta_members';
						referencedColumns: ['id'];
					}
				];
			};
			beta_members: {
				Row: {
					access_level: string | null;
					beta_tier: string | null;
					company_name: string | null;
					created_at: string | null;
					deactivated_at: string | null;
					deactivation_reason: string | null;
					discount_percentage: number | null;
					early_access_features: string[] | null;
					email: string;
					full_name: string;
					has_lifetime_pricing: boolean | null;
					id: string;
					is_active: boolean | null;
					job_title: string | null;
					joined_at: string | null;
					last_active_at: string | null;
					signup_id: string | null;
					total_calls_attended: number | null;
					total_features_requested: number | null;
					total_feedback_submitted: number | null;
					updated_at: string | null;
					user_id: string | null;
					user_timezone: string | null;
					wants_community_access: boolean | null;
					wants_feature_updates: boolean | null;
					wants_weekly_calls: boolean | null;
				};
				Insert: {
					access_level?: string | null;
					beta_tier?: string | null;
					company_name?: string | null;
					created_at?: string | null;
					deactivated_at?: string | null;
					deactivation_reason?: string | null;
					discount_percentage?: number | null;
					early_access_features?: string[] | null;
					email: string;
					full_name: string;
					has_lifetime_pricing?: boolean | null;
					id?: string;
					is_active?: boolean | null;
					job_title?: string | null;
					joined_at?: string | null;
					last_active_at?: string | null;
					signup_id?: string | null;
					total_calls_attended?: number | null;
					total_features_requested?: number | null;
					total_feedback_submitted?: number | null;
					updated_at?: string | null;
					user_id?: string | null;
					user_timezone?: string | null;
					wants_community_access?: boolean | null;
					wants_feature_updates?: boolean | null;
					wants_weekly_calls?: boolean | null;
				};
				Update: {
					access_level?: string | null;
					beta_tier?: string | null;
					company_name?: string | null;
					created_at?: string | null;
					deactivated_at?: string | null;
					deactivation_reason?: string | null;
					discount_percentage?: number | null;
					early_access_features?: string[] | null;
					email?: string;
					full_name?: string;
					has_lifetime_pricing?: boolean | null;
					id?: string;
					is_active?: boolean | null;
					job_title?: string | null;
					joined_at?: string | null;
					last_active_at?: string | null;
					signup_id?: string | null;
					total_calls_attended?: number | null;
					total_features_requested?: number | null;
					total_feedback_submitted?: number | null;
					updated_at?: string | null;
					user_id?: string | null;
					user_timezone?: string | null;
					wants_community_access?: boolean | null;
					wants_feature_updates?: boolean | null;
					wants_weekly_calls?: boolean | null;
				};
				Relationships: [
					{
						foreignKeyName: 'beta_members_signup_id_fkey';
						columns: ['signup_id'];
						isOneToOne: false;
						referencedRelation: 'beta_signups';
						referencedColumns: ['id'];
					}
				];
			};
			beta_signups: {
				Row: {
					approved_at: string | null;
					biggest_challenge: string | null;
					company_name: string | null;
					created_at: string;
					email: string;
					full_name: string;
					id: string;
					invited_by: string | null;
					ip_address: unknown | null;
					job_title: string | null;
					productivity_tools: string[] | null;
					referral_source: string | null;
					signup_status: string | null;
					updated_at: string;
					user_agent: string | null;
					user_timezone: string | null;
					wants_community_access: boolean | null;
					wants_weekly_calls: boolean | null;
					why_interested: string | null;
				};
				Insert: {
					approved_at?: string | null;
					biggest_challenge?: string | null;
					company_name?: string | null;
					created_at?: string;
					email: string;
					full_name: string;
					id?: string;
					invited_by?: string | null;
					ip_address?: unknown | null;
					job_title?: string | null;
					productivity_tools?: string[] | null;
					referral_source?: string | null;
					signup_status?: string | null;
					updated_at?: string;
					user_agent?: string | null;
					user_timezone?: string | null;
					wants_community_access?: boolean | null;
					wants_weekly_calls?: boolean | null;
					why_interested?: string | null;
				};
				Update: {
					approved_at?: string | null;
					biggest_challenge?: string | null;
					company_name?: string | null;
					created_at?: string;
					email?: string;
					full_name?: string;
					id?: string;
					invited_by?: string | null;
					ip_address?: unknown | null;
					job_title?: string | null;
					productivity_tools?: string[] | null;
					referral_source?: string | null;
					signup_status?: string | null;
					updated_at?: string;
					user_agent?: string | null;
					user_timezone?: string | null;
					wants_community_access?: boolean | null;
					wants_weekly_calls?: boolean | null;
					why_interested?: string | null;
				};
				Relationships: [];
			};
			brain_dump_links: {
				Row: {
					brain_dump_id: string;
					created_at: string;
					id: number;
					note_id: string | null;
					project_id: string | null;
					task_id: string | null;
				};
				Insert: {
					brain_dump_id: string;
					created_at?: string;
					id?: number;
					note_id?: string | null;
					project_id?: string | null;
					task_id?: string | null;
				};
				Update: {
					brain_dump_id?: string;
					created_at?: string;
					id?: number;
					note_id?: string | null;
					project_id?: string | null;
					task_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'brain_dump_links_brain_dump_id_fkey';
						columns: ['brain_dump_id'];
						isOneToOne: false;
						referencedRelation: 'brain_dumps';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'brain_dump_links_note_id_fkey';
						columns: ['note_id'];
						isOneToOne: false;
						referencedRelation: 'notes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'brain_dump_links_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'brain_dump_links_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'brain_dump_links_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			brain_dumps: {
				Row: {
					ai_insights: string | null;
					ai_summary: string | null;
					content: string | null;
					created_at: string;
					id: string;
					metaData: Json | null;
					parsed_results: Json | null;
					project_id: string | null;
					status: Database['public']['Enums']['brain_dump_status'];
					tags: string[] | null;
					title: string | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					ai_insights?: string | null;
					ai_summary?: string | null;
					content?: string | null;
					created_at?: string;
					id?: string;
					metaData?: Json | null;
					parsed_results?: Json | null;
					project_id?: string | null;
					status?: Database['public']['Enums']['brain_dump_status'];
					tags?: string[] | null;
					title?: string | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					ai_insights?: string | null;
					ai_summary?: string | null;
					content?: string | null;
					created_at?: string;
					id?: string;
					metaData?: Json | null;
					parsed_results?: Json | null;
					project_id?: string | null;
					status?: Database['public']['Enums']['brain_dump_status'];
					tags?: string[] | null;
					title?: string | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'brain_dumps_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'brain_dumps_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			calendar_themes: {
				Row: {
					color_mappings: Json;
					created_at: string | null;
					id: string;
					is_default: boolean | null;
					theme_name: string;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					color_mappings?: Json;
					created_at?: string | null;
					id?: string;
					is_default?: boolean | null;
					theme_name: string;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					color_mappings?: Json;
					created_at?: string | null;
					id?: string;
					is_default?: boolean | null;
					theme_name?: string;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [];
			};
			calendar_webhook_channels: {
				Row: {
					calendar_id: string | null;
					channel_id: string;
					created_at: string;
					expiration: number;
					id: string;
					resource_id: string | null;
					sync_token: string | null;
					updated_at: string;
					user_id: string;
					webhook_token: string;
				};
				Insert: {
					calendar_id?: string | null;
					channel_id: string;
					created_at?: string;
					expiration: number;
					id?: string;
					resource_id?: string | null;
					sync_token?: string | null;
					updated_at?: string;
					user_id: string;
					webhook_token: string;
				};
				Update: {
					calendar_id?: string | null;
					channel_id?: string;
					created_at?: string;
					expiration?: number;
					id?: string;
					resource_id?: string | null;
					sync_token?: string | null;
					updated_at?: string;
					user_id?: string;
					webhook_token?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'calendar_webhook_channels_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			cron_logs: {
				Row: {
					created_at: string | null;
					error_message: string | null;
					executed_at: string;
					id: string;
					job_name: string;
					status: string;
				};
				Insert: {
					created_at?: string | null;
					error_message?: string | null;
					executed_at: string;
					id?: string;
					job_name: string;
					status: string;
				};
				Update: {
					created_at?: string | null;
					error_message?: string | null;
					executed_at?: string;
					id?: string;
					job_name?: string;
					status?: string;
				};
				Relationships: [];
			};
			customer_subscriptions: {
				Row: {
					cancel_at: string | null;
					canceled_at: string | null;
					cancellation_reason: string | null;
					created_at: string | null;
					current_period_end: string | null;
					current_period_start: string | null;
					id: string;
					metadata: Json | null;
					plan_id: string | null;
					status: string;
					stripe_customer_id: string;
					stripe_price_id: string | null;
					stripe_subscription_id: string;
					trial_end: string | null;
					trial_start: string | null;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					cancel_at?: string | null;
					canceled_at?: string | null;
					cancellation_reason?: string | null;
					created_at?: string | null;
					current_period_end?: string | null;
					current_period_start?: string | null;
					id?: string;
					metadata?: Json | null;
					plan_id?: string | null;
					status: string;
					stripe_customer_id: string;
					stripe_price_id?: string | null;
					stripe_subscription_id: string;
					trial_end?: string | null;
					trial_start?: string | null;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					cancel_at?: string | null;
					canceled_at?: string | null;
					cancellation_reason?: string | null;
					created_at?: string | null;
					current_period_end?: string | null;
					current_period_start?: string | null;
					id?: string;
					metadata?: Json | null;
					plan_id?: string | null;
					status?: string;
					stripe_customer_id?: string;
					stripe_price_id?: string | null;
					stripe_subscription_id?: string;
					trial_end?: string | null;
					trial_start?: string | null;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'customer_subscriptions_plan_id_fkey';
						columns: ['plan_id'];
						isOneToOne: false;
						referencedRelation: 'subscription_plans';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'customer_subscriptions_stripe_price_id_fkey';
						columns: ['stripe_price_id'];
						isOneToOne: false;
						referencedRelation: 'subscription_plans';
						referencedColumns: ['stripe_price_id'];
					},
					{
						foreignKeyName: 'customer_subscriptions_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			daily_briefs: {
				Row: {
					brief_date: string;
					created_at: string;
					generation_completed_at: string | null;
					generation_error: string | null;
					generation_progress: Json | null;
					generation_started_at: string | null;
					generation_status: string;
					id: string;
					insights: string | null;
					llm_analysis: string | null;
					metadata: Json | null;
					priority_actions: string[] | null;
					project_brief_ids: string[] | null;
					summary_content: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					brief_date: string;
					created_at?: string;
					generation_completed_at?: string | null;
					generation_error?: string | null;
					generation_progress?: Json | null;
					generation_started_at?: string | null;
					generation_status?: string;
					id?: string;
					insights?: string | null;
					llm_analysis?: string | null;
					metadata?: Json | null;
					priority_actions?: string[] | null;
					project_brief_ids?: string[] | null;
					summary_content: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					brief_date?: string;
					created_at?: string;
					generation_completed_at?: string | null;
					generation_error?: string | null;
					generation_progress?: Json | null;
					generation_started_at?: string | null;
					generation_status?: string;
					id?: string;
					insights?: string | null;
					llm_analysis?: string | null;
					metadata?: Json | null;
					priority_actions?: string[] | null;
					project_brief_ids?: string[] | null;
					summary_content?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'daily_briefs_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			discount_codes: {
				Row: {
					code: string;
					created_at: string | null;
					description: string | null;
					discount_type: string;
					discount_value: number;
					duration: string;
					duration_in_months: number | null;
					id: string;
					is_active: boolean | null;
					max_redemptions: number | null;
					metadata: Json | null;
					stripe_coupon_id: string | null;
					times_redeemed: number | null;
					updated_at: string | null;
					valid_from: string | null;
					valid_until: string | null;
				};
				Insert: {
					code: string;
					created_at?: string | null;
					description?: string | null;
					discount_type: string;
					discount_value: number;
					duration: string;
					duration_in_months?: number | null;
					id?: string;
					is_active?: boolean | null;
					max_redemptions?: number | null;
					metadata?: Json | null;
					stripe_coupon_id?: string | null;
					times_redeemed?: number | null;
					updated_at?: string | null;
					valid_from?: string | null;
					valid_until?: string | null;
				};
				Update: {
					code?: string;
					created_at?: string | null;
					description?: string | null;
					discount_type?: string;
					discount_value?: number;
					duration?: string;
					duration_in_months?: number | null;
					id?: string;
					is_active?: boolean | null;
					max_redemptions?: number | null;
					metadata?: Json | null;
					stripe_coupon_id?: string | null;
					times_redeemed?: number | null;
					updated_at?: string | null;
					valid_from?: string | null;
					valid_until?: string | null;
				};
				Relationships: [];
			};
			email_attachments: {
				Row: {
					cid: string | null;
					content_type: string;
					created_at: string | null;
					created_by: string;
					email_id: string;
					file_size: number;
					filename: string;
					id: string;
					image_height: number | null;
					image_width: number | null;
					is_image: boolean | null;
					is_inline: boolean | null;
					optimized_versions: Json | null;
					original_filename: string;
					storage_bucket: string;
					storage_path: string;
				};
				Insert: {
					cid?: string | null;
					content_type: string;
					created_at?: string | null;
					created_by: string;
					email_id: string;
					file_size: number;
					filename: string;
					id?: string;
					image_height?: number | null;
					image_width?: number | null;
					is_image?: boolean | null;
					is_inline?: boolean | null;
					optimized_versions?: Json | null;
					original_filename: string;
					storage_bucket?: string;
					storage_path: string;
				};
				Update: {
					cid?: string | null;
					content_type?: string;
					created_at?: string | null;
					created_by?: string;
					email_id?: string;
					file_size?: number;
					filename?: string;
					id?: string;
					image_height?: number | null;
					image_width?: number | null;
					is_image?: boolean | null;
					is_inline?: boolean | null;
					optimized_versions?: Json | null;
					original_filename?: string;
					storage_bucket?: string;
					storage_path?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'email_attachments_email_id_fkey';
						columns: ['email_id'];
						isOneToOne: false;
						referencedRelation: 'emails';
						referencedColumns: ['id'];
					}
				];
			};
			email_logs: {
				Row: {
					bcc: string[] | null;
					body: string;
					cc: string[] | null;
					created_at: string;
					error_message: string | null;
					id: string;
					metadata: Json | null;
					reply_to: string | null;
					sent_at: string | null;
					status: string;
					subject: string;
					to_email: string;
					user_id: string | null;
				};
				Insert: {
					bcc?: string[] | null;
					body: string;
					cc?: string[] | null;
					created_at?: string;
					error_message?: string | null;
					id?: string;
					metadata?: Json | null;
					reply_to?: string | null;
					sent_at?: string | null;
					status: string;
					subject: string;
					to_email: string;
					user_id?: string | null;
				};
				Update: {
					bcc?: string[] | null;
					body?: string;
					cc?: string[] | null;
					created_at?: string;
					error_message?: string | null;
					id?: string;
					metadata?: Json | null;
					reply_to?: string | null;
					sent_at?: string | null;
					status?: string;
					subject?: string;
					to_email?: string;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'email_logs_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			email_recipients: {
				Row: {
					created_at: string | null;
					delivered_at: string | null;
					email_id: string;
					error_message: string | null;
					id: string;
					last_opened_at: string | null;
					open_count: number | null;
					opened_at: string | null;
					recipient_email: string;
					recipient_id: string | null;
					recipient_name: string | null;
					recipient_type: string;
					sent_at: string | null;
					status: string;
					updated_at: string | null;
				};
				Insert: {
					created_at?: string | null;
					delivered_at?: string | null;
					email_id: string;
					error_message?: string | null;
					id?: string;
					last_opened_at?: string | null;
					open_count?: number | null;
					opened_at?: string | null;
					recipient_email: string;
					recipient_id?: string | null;
					recipient_name?: string | null;
					recipient_type?: string;
					sent_at?: string | null;
					status?: string;
					updated_at?: string | null;
				};
				Update: {
					created_at?: string | null;
					delivered_at?: string | null;
					email_id?: string;
					error_message?: string | null;
					id?: string;
					last_opened_at?: string | null;
					open_count?: number | null;
					opened_at?: string | null;
					recipient_email?: string;
					recipient_id?: string | null;
					recipient_name?: string | null;
					recipient_type?: string;
					sent_at?: string | null;
					status?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'email_recipients_email_id_fkey';
						columns: ['email_id'];
						isOneToOne: false;
						referencedRelation: 'emails';
						referencedColumns: ['id'];
					}
				];
			};
			email_tracking_events: {
				Row: {
					clicked_url: string | null;
					created_at: string | null;
					email_id: string;
					event_data: Json | null;
					event_type: string;
					id: string;
					ip_address: unknown | null;
					recipient_id: string | null;
					timestamp: string | null;
					user_agent: string | null;
				};
				Insert: {
					clicked_url?: string | null;
					created_at?: string | null;
					email_id: string;
					event_data?: Json | null;
					event_type: string;
					id?: string;
					ip_address?: unknown | null;
					recipient_id?: string | null;
					timestamp?: string | null;
					user_agent?: string | null;
				};
				Update: {
					clicked_url?: string | null;
					created_at?: string | null;
					email_id?: string;
					event_data?: Json | null;
					event_type?: string;
					id?: string;
					ip_address?: unknown | null;
					recipient_id?: string | null;
					timestamp?: string | null;
					user_agent?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'email_tracking_events_email_id_fkey';
						columns: ['email_id'];
						isOneToOne: false;
						referencedRelation: 'emails';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'email_tracking_events_recipient_id_fkey';
						columns: ['recipient_id'];
						isOneToOne: false;
						referencedRelation: 'email_recipients';
						referencedColumns: ['id'];
					}
				];
			};
			emails: {
				Row: {
					category: string | null;
					content: string;
					created_at: string | null;
					created_by: string;
					from_email: string;
					from_name: string;
					id: string;
					scheduled_at: string | null;
					sent_at: string | null;
					status: string;
					subject: string;
					template_data: Json | null;
					tracking_enabled: boolean;
					tracking_id: string | null;
					updated_at: string | null;
				};
				Insert: {
					category?: string | null;
					content: string;
					created_at?: string | null;
					created_by: string;
					from_email?: string;
					from_name?: string;
					id?: string;
					scheduled_at?: string | null;
					sent_at?: string | null;
					status?: string;
					subject: string;
					template_data?: Json | null;
					tracking_enabled?: boolean;
					tracking_id?: string | null;
					updated_at?: string | null;
				};
				Update: {
					category?: string | null;
					content?: string;
					created_at?: string | null;
					created_by?: string;
					from_email?: string;
					from_name?: string;
					id?: string;
					scheduled_at?: string | null;
					sent_at?: string | null;
					status?: string;
					subject?: string;
					template_data?: Json | null;
					tracking_enabled?: boolean;
					tracking_id?: string | null;
					updated_at?: string | null;
				};
				Relationships: [];
			};
			error_logs: {
				Row: {
					app_version: string | null;
					brain_dump_id: string | null;
					browser_info: Json | null;
					completion_tokens: number | null;
					created_at: string;
					endpoint: string | null;
					environment: string | null;
					error_code: string | null;
					error_message: string;
					error_stack: string | null;
					error_type: string;
					http_method: string | null;
					id: string;
					ip_address: unknown | null;
					llm_max_tokens: number | null;
					llm_model: string | null;
					llm_provider: string | null;
					llm_temperature: number | null;
					metadata: Json | null;
					operation_payload: Json | null;
					operation_type: string | null;
					project_id: string | null;
					prompt_tokens: number | null;
					record_id: string | null;
					request_id: string | null;
					resolution_notes: string | null;
					resolved: boolean | null;
					resolved_at: string | null;
					resolved_by: string | null;
					response_time_ms: number | null;
					severity: string | null;
					table_name: string | null;
					total_tokens: number | null;
					updated_at: string;
					user_agent: string | null;
					user_id: string | null;
				};
				Insert: {
					app_version?: string | null;
					brain_dump_id?: string | null;
					browser_info?: Json | null;
					completion_tokens?: number | null;
					created_at?: string;
					endpoint?: string | null;
					environment?: string | null;
					error_code?: string | null;
					error_message: string;
					error_stack?: string | null;
					error_type: string;
					http_method?: string | null;
					id?: string;
					ip_address?: unknown | null;
					llm_max_tokens?: number | null;
					llm_model?: string | null;
					llm_provider?: string | null;
					llm_temperature?: number | null;
					metadata?: Json | null;
					operation_payload?: Json | null;
					operation_type?: string | null;
					project_id?: string | null;
					prompt_tokens?: number | null;
					record_id?: string | null;
					request_id?: string | null;
					resolution_notes?: string | null;
					resolved?: boolean | null;
					resolved_at?: string | null;
					resolved_by?: string | null;
					response_time_ms?: number | null;
					severity?: string | null;
					table_name?: string | null;
					total_tokens?: number | null;
					updated_at?: string;
					user_agent?: string | null;
					user_id?: string | null;
				};
				Update: {
					app_version?: string | null;
					brain_dump_id?: string | null;
					browser_info?: Json | null;
					completion_tokens?: number | null;
					created_at?: string;
					endpoint?: string | null;
					environment?: string | null;
					error_code?: string | null;
					error_message?: string;
					error_stack?: string | null;
					error_type?: string;
					http_method?: string | null;
					id?: string;
					ip_address?: unknown | null;
					llm_max_tokens?: number | null;
					llm_model?: string | null;
					llm_provider?: string | null;
					llm_temperature?: number | null;
					metadata?: Json | null;
					operation_payload?: Json | null;
					operation_type?: string | null;
					project_id?: string | null;
					prompt_tokens?: number | null;
					record_id?: string | null;
					request_id?: string | null;
					resolution_notes?: string | null;
					resolved?: boolean | null;
					resolved_at?: string | null;
					resolved_by?: string | null;
					response_time_ms?: number | null;
					severity?: string | null;
					table_name?: string | null;
					total_tokens?: number | null;
					updated_at?: string;
					user_agent?: string | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'error_logs_brain_dump_id_fkey';
						columns: ['brain_dump_id'];
						isOneToOne: false;
						referencedRelation: 'brain_dumps';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'error_logs_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			failed_payments: {
				Row: {
					amount_due: number;
					created_at: string | null;
					dunning_stage: string | null;
					failed_at: string;
					id: string;
					invoice_id: string;
					last_dunning_at: string | null;
					last_retry_at: string | null;
					resolution_type: string | null;
					resolved_at: string | null;
					retry_count: number | null;
					subscription_id: string | null;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					amount_due: number;
					created_at?: string | null;
					dunning_stage?: string | null;
					failed_at?: string;
					id?: string;
					invoice_id: string;
					last_dunning_at?: string | null;
					last_retry_at?: string | null;
					resolution_type?: string | null;
					resolved_at?: string | null;
					retry_count?: number | null;
					subscription_id?: string | null;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					amount_due?: number;
					created_at?: string | null;
					dunning_stage?: string | null;
					failed_at?: string;
					id?: string;
					invoice_id?: string;
					last_dunning_at?: string | null;
					last_retry_at?: string | null;
					resolution_type?: string | null;
					resolved_at?: string | null;
					retry_count?: number | null;
					subscription_id?: string | null;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'failed_payments_subscription_id_fkey';
						columns: ['subscription_id'];
						isOneToOne: false;
						referencedRelation: 'customer_subscriptions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'failed_payments_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			feedback: {
				Row: {
					category: string;
					created_at: string;
					feedback_text: string;
					id: string;
					rating: number | null;
					status: string | null;
					updated_at: string;
					user_agent: string | null;
					user_email: string | null;
					user_id: string | null;
					user_ip: unknown | null;
				};
				Insert: {
					category: string;
					created_at?: string;
					feedback_text: string;
					id?: string;
					rating?: number | null;
					status?: string | null;
					updated_at?: string;
					user_agent?: string | null;
					user_email?: string | null;
					user_id?: string | null;
					user_ip?: unknown | null;
				};
				Update: {
					category?: string;
					created_at?: string;
					feedback_text?: string;
					id?: string;
					rating?: number | null;
					status?: string | null;
					updated_at?: string;
					user_agent?: string | null;
					user_email?: string | null;
					user_id?: string | null;
					user_ip?: unknown | null;
				};
				Relationships: [];
			};
			feedback_rate_limit: {
				Row: {
					first_submission: string | null;
					id: string;
					ip_address: unknown;
					is_blocked: boolean | null;
					last_submission: string | null;
					submission_count: number | null;
				};
				Insert: {
					first_submission?: string | null;
					id?: string;
					ip_address: unknown;
					is_blocked?: boolean | null;
					last_submission?: string | null;
					submission_count?: number | null;
				};
				Update: {
					first_submission?: string | null;
					id?: string;
					ip_address?: unknown;
					is_blocked?: boolean | null;
					last_submission?: string | null;
					submission_count?: number | null;
				};
				Relationships: [];
			};
			generated_phase_tasks: {
				Row: {
					confidence_score: number | null;
					created_at: string;
					generated_phase_id: string;
					id: string;
					is_approved: boolean | null;
					reasoning: string | null;
					suggested_due_date: string | null;
					suggested_start_date: string | null;
					task_id: string;
				};
				Insert: {
					confidence_score?: number | null;
					created_at?: string;
					generated_phase_id: string;
					id?: string;
					is_approved?: boolean | null;
					reasoning?: string | null;
					suggested_due_date?: string | null;
					suggested_start_date?: string | null;
					task_id: string;
				};
				Update: {
					confidence_score?: number | null;
					created_at?: string;
					generated_phase_id?: string;
					id?: string;
					is_approved?: boolean | null;
					reasoning?: string | null;
					suggested_due_date?: string | null;
					suggested_start_date?: string | null;
					task_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'generated_phase_tasks_generated_phase_id_fkey';
						columns: ['generated_phase_id'];
						isOneToOne: false;
						referencedRelation: 'generated_phases';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'generated_phase_tasks_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'generated_phase_tasks_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			generated_phases: {
				Row: {
					approved_at: string | null;
					approved_by: string | null;
					confidence_score: number | null;
					created_at: string;
					deliverables: string[] | null;
					description: string | null;
					generation_id: string;
					id: string;
					is_approved: boolean | null;
					metadata: Json | null;
					name: string;
					objectives: string[] | null;
					phase_id: string | null;
					project_id: string;
					success_criteria: string[] | null;
					suggested_duration_days: number | null;
					suggested_end_date: string | null;
					suggested_order: number;
					suggested_start_date: string | null;
				};
				Insert: {
					approved_at?: string | null;
					approved_by?: string | null;
					confidence_score?: number | null;
					created_at?: string;
					deliverables?: string[] | null;
					description?: string | null;
					generation_id: string;
					id?: string;
					is_approved?: boolean | null;
					metadata?: Json | null;
					name: string;
					objectives?: string[] | null;
					phase_id?: string | null;
					project_id: string;
					success_criteria?: string[] | null;
					suggested_duration_days?: number | null;
					suggested_end_date?: string | null;
					suggested_order: number;
					suggested_start_date?: string | null;
				};
				Update: {
					approved_at?: string | null;
					approved_by?: string | null;
					confidence_score?: number | null;
					created_at?: string;
					deliverables?: string[] | null;
					description?: string | null;
					generation_id?: string;
					id?: string;
					is_approved?: boolean | null;
					metadata?: Json | null;
					name?: string;
					objectives?: string[] | null;
					phase_id?: string | null;
					project_id?: string;
					success_criteria?: string[] | null;
					suggested_duration_days?: number | null;
					suggested_end_date?: string | null;
					suggested_order?: number;
					suggested_start_date?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'generated_phases_generation_id_fkey';
						columns: ['generation_id'];
						isOneToOne: false;
						referencedRelation: 'project_phases_generation';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'generated_phases_phase_id_fkey';
						columns: ['phase_id'];
						isOneToOne: false;
						referencedRelation: 'phases';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'generated_phases_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			invoices: {
				Row: {
					amount_due: number;
					amount_paid: number;
					created_at: string | null;
					currency: string | null;
					hosted_invoice_url: string | null;
					id: string;
					invoice_pdf: string | null;
					status: string;
					stripe_customer_id: string;
					stripe_invoice_id: string;
					subscription_id: string | null;
					user_id: string;
				};
				Insert: {
					amount_due: number;
					amount_paid: number;
					created_at?: string | null;
					currency?: string | null;
					hosted_invoice_url?: string | null;
					id?: string;
					invoice_pdf?: string | null;
					status: string;
					stripe_customer_id: string;
					stripe_invoice_id: string;
					subscription_id?: string | null;
					user_id: string;
				};
				Update: {
					amount_due?: number;
					amount_paid?: number;
					created_at?: string | null;
					currency?: string | null;
					hosted_invoice_url?: string | null;
					id?: string;
					invoice_pdf?: string | null;
					status?: string;
					stripe_customer_id?: string;
					stripe_invoice_id?: string;
					subscription_id?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'invoices_subscription_id_fkey';
						columns: ['subscription_id'];
						isOneToOne: false;
						referencedRelation: 'customer_subscriptions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'invoices_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			llm_prompts: {
				Row: {
					id: string;
					last_used: string | null;
					prompt_text: string | null;
					purpose: string | null;
					title: string | null;
				};
				Insert: {
					id?: string;
					last_used?: string | null;
					prompt_text?: string | null;
					purpose?: string | null;
					title?: string | null;
				};
				Update: {
					id?: string;
					last_used?: string | null;
					prompt_text?: string | null;
					purpose?: string | null;
					title?: string | null;
				};
				Relationships: [];
			};
			notes: {
				Row: {
					category: string | null;
					content: string | null;
					created_at: string;
					id: string;
					project_id: string | null;
					tags: string[] | null;
					title: string | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					category?: string | null;
					content?: string | null;
					created_at?: string;
					id?: string;
					project_id?: string | null;
					tags?: string[] | null;
					title?: string | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					category?: string | null;
					content?: string | null;
					created_at?: string;
					id?: string;
					project_id?: string | null;
					tags?: string[] | null;
					title?: string | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'notes_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'notes_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			payment_methods: {
				Row: {
					card_brand: string | null;
					card_last4: string | null;
					created_at: string | null;
					id: string;
					is_default: boolean | null;
					stripe_payment_method_id: string;
					type: string;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					card_brand?: string | null;
					card_last4?: string | null;
					created_at?: string | null;
					id?: string;
					is_default?: boolean | null;
					stripe_payment_method_id: string;
					type: string;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					card_brand?: string | null;
					card_last4?: string | null;
					created_at?: string | null;
					id?: string;
					is_default?: boolean | null;
					stripe_payment_method_id?: string;
					type?: string;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'payment_methods_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			phase_task_schedules: {
				Row: {
					conflict_warnings: string[] | null;
					created_at: string | null;
					id: string;
					is_confirmed: boolean | null;
					phase_id: string;
					proposed_end: string;
					proposed_start: string;
					scheduling_notes: string | null;
					task_id: string | null;
					updated_at: string | null;
				};
				Insert: {
					conflict_warnings?: string[] | null;
					created_at?: string | null;
					id?: string;
					is_confirmed?: boolean | null;
					phase_id: string;
					proposed_end: string;
					proposed_start: string;
					scheduling_notes?: string | null;
					task_id?: string | null;
					updated_at?: string | null;
				};
				Update: {
					conflict_warnings?: string[] | null;
					created_at?: string | null;
					id?: string;
					is_confirmed?: boolean | null;
					phase_id?: string;
					proposed_end?: string;
					proposed_start?: string;
					scheduling_notes?: string | null;
					task_id?: string | null;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'phase_task_schedules_phase_id_fkey';
						columns: ['phase_id'];
						isOneToOne: false;
						referencedRelation: 'phases';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'phase_task_schedules_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'phase_task_schedules_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			phase_tasks: {
				Row: {
					assignment_reason: string | null;
					created_at: string;
					id: string;
					phase_id: string;
					suggested_start_date: string | null;
					task_id: string;
				};
				Insert: {
					assignment_reason?: string | null;
					created_at?: string;
					id?: string;
					phase_id: string;
					suggested_start_date?: string | null;
					task_id: string;
				};
				Update: {
					assignment_reason?: string | null;
					created_at?: string;
					id?: string;
					phase_id?: string;
					suggested_start_date?: string | null;
					task_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'phase_tasks_phase_id_fkey';
						columns: ['phase_id'];
						isOneToOne: false;
						referencedRelation: 'phases';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'phase_tasks_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'phase_tasks_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			phases: {
				Row: {
					created_at: string;
					description: string | null;
					end_date: string;
					id: string;
					name: string;
					order: number;
					project_id: string;
					scheduling_method: string | null;
					start_date: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					description?: string | null;
					end_date: string;
					id?: string;
					name: string;
					order: number;
					project_id: string;
					scheduling_method?: string | null;
					start_date: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					end_date?: string;
					id?: string;
					name?: string;
					order?: number;
					project_id?: string;
					scheduling_method?: string | null;
					start_date?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'phases_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'phases_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			project_brief_template_usage: {
				Row: {
					brief_date: string;
					id: string;
					metadata: Json | null;
					project_id: string | null;
					template_id: string | null;
					used_at: string | null;
					user_id: string | null;
				};
				Insert: {
					brief_date: string;
					id?: string;
					metadata?: Json | null;
					project_id?: string | null;
					template_id?: string | null;
					used_at?: string | null;
					user_id?: string | null;
				};
				Update: {
					brief_date?: string;
					id?: string;
					metadata?: Json | null;
					project_id?: string | null;
					template_id?: string | null;
					used_at?: string | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'project_brief_template_usage_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_brief_template_usage_template_id_fkey';
						columns: ['template_id'];
						isOneToOne: false;
						referencedRelation: 'project_brief_templates';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_brief_template_usage_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			project_brief_templates: {
				Row: {
					context_snapshot: Json | null;
					created_at: string | null;
					description: string | null;
					generated_by: string | null;
					generation_model: string | null;
					id: string;
					in_use: boolean | null;
					is_default: boolean | null;
					metadata: Json | null;
					name: string;
					project_id: string | null;
					template_content: string;
					updated_at: string | null;
					user_id: string | null;
					variables: Json | null;
				};
				Insert: {
					context_snapshot?: Json | null;
					created_at?: string | null;
					description?: string | null;
					generated_by?: string | null;
					generation_model?: string | null;
					id?: string;
					in_use?: boolean | null;
					is_default?: boolean | null;
					metadata?: Json | null;
					name: string;
					project_id?: string | null;
					template_content: string;
					updated_at?: string | null;
					user_id?: string | null;
					variables?: Json | null;
				};
				Update: {
					context_snapshot?: Json | null;
					created_at?: string | null;
					description?: string | null;
					generated_by?: string | null;
					generation_model?: string | null;
					id?: string;
					in_use?: boolean | null;
					is_default?: boolean | null;
					metadata?: Json | null;
					name?: string;
					project_id?: string | null;
					template_content?: string;
					updated_at?: string | null;
					user_id?: string | null;
					variables?: Json | null;
				};
				Relationships: [
					{
						foreignKeyName: 'project_brief_templates_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_brief_templates_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			project_calendars: {
				Row: {
					calendar_id: string;
					calendar_name: string;
					color_id: string | null;
					created_at: string | null;
					hex_color: string | null;
					id: string;
					is_primary: boolean | null;
					last_synced_at: string | null;
					project_id: string;
					sync_enabled: boolean | null;
					sync_error: string | null;
					sync_status: Database['public']['Enums']['calendar_sync_status'] | null;
					updated_at: string | null;
					user_id: string;
					visibility: Database['public']['Enums']['calendar_visibility'] | null;
				};
				Insert: {
					calendar_id: string;
					calendar_name: string;
					color_id?: string | null;
					created_at?: string | null;
					hex_color?: string | null;
					id?: string;
					is_primary?: boolean | null;
					last_synced_at?: string | null;
					project_id: string;
					sync_enabled?: boolean | null;
					sync_error?: string | null;
					sync_status?: Database['public']['Enums']['calendar_sync_status'] | null;
					updated_at?: string | null;
					user_id: string;
					visibility?: Database['public']['Enums']['calendar_visibility'] | null;
				};
				Update: {
					calendar_id?: string;
					calendar_name?: string;
					color_id?: string | null;
					created_at?: string | null;
					hex_color?: string | null;
					id?: string;
					is_primary?: boolean | null;
					last_synced_at?: string | null;
					project_id?: string;
					sync_enabled?: boolean | null;
					sync_error?: string | null;
					sync_status?: Database['public']['Enums']['calendar_sync_status'] | null;
					updated_at?: string | null;
					user_id?: string;
					visibility?: Database['public']['Enums']['calendar_visibility'] | null;
				};
				Relationships: [
					{
						foreignKeyName: 'project_calendars_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			project_daily_briefs: {
				Row: {
					brief_content: string;
					brief_date: string;
					created_at: string;
					generation_completed_at: string | null;
					generation_error: string | null;
					generation_started_at: string | null;
					generation_status: string;
					id: string;
					metadata: Json | null;
					project_id: string;
					template_id: string | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					brief_content: string;
					brief_date: string;
					created_at?: string;
					generation_completed_at?: string | null;
					generation_error?: string | null;
					generation_started_at?: string | null;
					generation_status?: string;
					id?: string;
					metadata?: Json | null;
					project_id: string;
					template_id?: string | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					brief_content?: string;
					brief_date?: string;
					created_at?: string;
					generation_completed_at?: string | null;
					generation_error?: string | null;
					generation_started_at?: string | null;
					generation_status?: string;
					id?: string;
					metadata?: Json | null;
					project_id?: string;
					template_id?: string | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'project_daily_briefs_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_daily_briefs_template_id_fkey';
						columns: ['template_id'];
						isOneToOne: false;
						referencedRelation: 'project_brief_templates';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_daily_briefs_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			project_phases_generation: {
				Row: {
					created_at: string | null;
					generation_completed_at: string | null;
					generation_error: string | null;
					generation_progress: Json | null;
					generation_started_at: string | null;
					generation_status: string | null;
					id: string;
					metadata: Json | null;
					phases_count: number | null;
					phases_data: Json | null;
					project_id: string;
					regenerated: boolean | null;
					template_used: string | null;
					total_duration_days: number | null;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					created_at?: string | null;
					generation_completed_at?: string | null;
					generation_error?: string | null;
					generation_progress?: Json | null;
					generation_started_at?: string | null;
					generation_status?: string | null;
					id?: string;
					metadata?: Json | null;
					phases_count?: number | null;
					phases_data?: Json | null;
					project_id: string;
					regenerated?: boolean | null;
					template_used?: string | null;
					total_duration_days?: number | null;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					created_at?: string | null;
					generation_completed_at?: string | null;
					generation_error?: string | null;
					generation_progress?: Json | null;
					generation_started_at?: string | null;
					generation_status?: string | null;
					id?: string;
					metadata?: Json | null;
					phases_count?: number | null;
					phases_data?: Json | null;
					project_id?: string;
					regenerated?: boolean | null;
					template_used?: string | null;
					total_duration_days?: number | null;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'project_phases_generation_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			project_questions: {
				Row: {
					answer_brain_dump_id: string | null;
					answered_at: string | null;
					ask_after: string | null;
					category: string | null;
					context: string | null;
					created_at: string;
					expected_outcome: string | null;
					id: string;
					priority: string | null;
					project_id: string | null;
					question: string;
					shown_to_user_count: number;
					source: string | null;
					source_field: string | null;
					status: string | null;
					triggers: Json | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					answer_brain_dump_id?: string | null;
					answered_at?: string | null;
					ask_after?: string | null;
					category?: string | null;
					context?: string | null;
					created_at?: string;
					expected_outcome?: string | null;
					id?: string;
					priority?: string | null;
					project_id?: string | null;
					question: string;
					shown_to_user_count?: number;
					source?: string | null;
					source_field?: string | null;
					status?: string | null;
					triggers?: Json | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					answer_brain_dump_id?: string | null;
					answered_at?: string | null;
					ask_after?: string | null;
					category?: string | null;
					context?: string | null;
					created_at?: string;
					expected_outcome?: string | null;
					id?: string;
					priority?: string | null;
					project_id?: string | null;
					question?: string;
					shown_to_user_count?: number;
					source?: string | null;
					source_field?: string | null;
					status?: string | null;
					triggers?: Json | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'project_questions_answer_brain_dump_id_fkey';
						columns: ['answer_brain_dump_id'];
						isOneToOne: false;
						referencedRelation: 'brain_dumps';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_questions_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'project_questions_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			project_synthesis: {
				Row: {
					applied_at: string | null;
					created_at: string;
					generation_duration_ms: number | null;
					generation_model: string | null;
					id: string;
					insights: string | null;
					operations_count: number | null;
					project_id: string;
					status: string | null;
					synthesis_content: Json;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					applied_at?: string | null;
					created_at?: string;
					generation_duration_ms?: number | null;
					generation_model?: string | null;
					id?: string;
					insights?: string | null;
					operations_count?: number | null;
					project_id: string;
					status?: string | null;
					synthesis_content: Json;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					applied_at?: string | null;
					created_at?: string;
					generation_duration_ms?: number | null;
					generation_model?: string | null;
					id?: string;
					insights?: string | null;
					operations_count?: number | null;
					project_id?: string;
					status?: string | null;
					synthesis_content?: Json;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'project_synthesis_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			projects: {
				Row: {
					calendar_color_id: string | null;
					calendar_settings: Json | null;
					calendar_sync_enabled: boolean | null;
					context: string | null;
					created_at: string;
					description: string | null;
					end_date: string | null;
					executive_summary: string | null;
					id: string;
					name: string;
					slug: string;
					start_date: string | null;
					status: Database['public']['Enums']['project_status'];
					tags: string[] | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					calendar_color_id?: string | null;
					calendar_settings?: Json | null;
					calendar_sync_enabled?: boolean | null;
					context?: string | null;
					created_at?: string;
					description?: string | null;
					end_date?: string | null;
					executive_summary?: string | null;
					id?: string;
					name: string;
					slug: string;
					start_date?: string | null;
					status?: Database['public']['Enums']['project_status'];
					tags?: string[] | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					calendar_color_id?: string | null;
					calendar_settings?: Json | null;
					calendar_sync_enabled?: boolean | null;
					context?: string | null;
					created_at?: string;
					description?: string | null;
					end_date?: string | null;
					executive_summary?: string | null;
					id?: string;
					name?: string;
					slug?: string;
					start_date?: string | null;
					status?: Database['public']['Enums']['project_status'];
					tags?: string[] | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'projects_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			projects_history: {
				Row: {
					created_at: string | null;
					created_by: string | null;
					history_id: string;
					is_first_version: boolean | null;
					project_data: Json;
					project_id: string;
					version_number: number;
				};
				Insert: {
					created_at?: string | null;
					created_by?: string | null;
					history_id?: string;
					is_first_version?: boolean | null;
					project_data: Json;
					project_id: string;
					version_number: number;
				};
				Update: {
					created_at?: string | null;
					created_by?: string | null;
					history_id?: string;
					is_first_version?: boolean | null;
					project_data?: Json;
					project_id?: string;
					version_number?: number;
				};
				Relationships: [];
			};
			question_metrics: {
				Row: {
					brain_dump_length: number | null;
					created_at: string | null;
					created_project: boolean | null;
					created_tasks_count: number | null;
					id: string;
					presented_at: string;
					question_id: string | null;
					responded_at: string | null;
					response_quality: string | null;
					user_id: string | null;
				};
				Insert: {
					brain_dump_length?: number | null;
					created_at?: string | null;
					created_project?: boolean | null;
					created_tasks_count?: number | null;
					id?: string;
					presented_at: string;
					question_id?: string | null;
					responded_at?: string | null;
					response_quality?: string | null;
					user_id?: string | null;
				};
				Update: {
					brain_dump_length?: number | null;
					created_at?: string | null;
					created_project?: boolean | null;
					created_tasks_count?: number | null;
					id?: string;
					presented_at?: string;
					question_id?: string | null;
					responded_at?: string | null;
					response_quality?: string | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'question_metrics_question_id_fkey';
						columns: ['question_id'];
						isOneToOne: false;
						referencedRelation: 'project_questions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'question_metrics_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			question_templates: {
				Row: {
					category: string;
					conditions: Json | null;
					created_at: string | null;
					effectiveness_score: number | null;
					id: string;
					template: string;
					updated_at: string | null;
					usage_count: number | null;
					variables: Json | null;
				};
				Insert: {
					category: string;
					conditions?: Json | null;
					created_at?: string | null;
					effectiveness_score?: number | null;
					id?: string;
					template: string;
					updated_at?: string | null;
					usage_count?: number | null;
					variables?: Json | null;
				};
				Update: {
					category?: string;
					conditions?: Json | null;
					created_at?: string | null;
					effectiveness_score?: number | null;
					id?: string;
					template?: string;
					updated_at?: string | null;
					usage_count?: number | null;
					variables?: Json | null;
				};
				Relationships: [];
			};
			queue_jobs: {
				Row: {
					attempts: number | null;
					completed_at: string | null;
					created_at: string;
					error_message: string | null;
					id: string;
					job_type: Database['public']['Enums']['queue_type'];
					max_attempts: number | null;
					metadata: Json | null;
					priority: number | null;
					processed_at: string | null;
					queue_job_id: string;
					result: Json | null;
					scheduled_for: string;
					started_at: string | null;
					status: Database['public']['Enums']['queue_status'];
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					attempts?: number | null;
					completed_at?: string | null;
					created_at?: string;
					error_message?: string | null;
					id?: string;
					job_type: Database['public']['Enums']['queue_type'];
					max_attempts?: number | null;
					metadata?: Json | null;
					priority?: number | null;
					processed_at?: string | null;
					queue_job_id: string;
					result?: Json | null;
					scheduled_for: string;
					started_at?: string | null;
					status: Database['public']['Enums']['queue_status'];
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					attempts?: number | null;
					completed_at?: string | null;
					created_at?: string;
					error_message?: string | null;
					id?: string;
					job_type?: Database['public']['Enums']['queue_type'];
					max_attempts?: number | null;
					metadata?: Json | null;
					priority?: number | null;
					processed_at?: string | null;
					queue_job_id?: string;
					result?: Json | null;
					scheduled_for?: string;
					started_at?: string | null;
					status?: Database['public']['Enums']['queue_status'];
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [];
			};
			recurring_task_instances: {
				Row: {
					calendar_event_id: string | null;
					completed_at: string | null;
					created_at: string | null;
					id: string;
					instance_date: string;
					notes: string | null;
					skipped: boolean | null;
					status: string | null;
					task_id: string;
					updated_at: string | null;
					user_id: string | null;
				};
				Insert: {
					calendar_event_id?: string | null;
					completed_at?: string | null;
					created_at?: string | null;
					id?: string;
					instance_date: string;
					notes?: string | null;
					skipped?: boolean | null;
					status?: string | null;
					task_id: string;
					updated_at?: string | null;
					user_id?: string | null;
				};
				Update: {
					calendar_event_id?: string | null;
					completed_at?: string | null;
					created_at?: string | null;
					id?: string;
					instance_date?: string;
					notes?: string | null;
					skipped?: boolean | null;
					status?: string | null;
					task_id?: string;
					updated_at?: string | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'recurring_task_instances_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'recurring_task_instances_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			recurring_task_migration_log: {
				Row: {
					created_at: string | null;
					error_message: string | null;
					id: string;
					migration_type: string;
					new_calendar_event_id: string | null;
					new_recurrence_ends: string | null;
					old_calendar_event_id: string | null;
					old_recurrence_ends: string | null;
					project_id: string | null;
					status: string;
					task_id: string;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					created_at?: string | null;
					error_message?: string | null;
					id?: string;
					migration_type: string;
					new_calendar_event_id?: string | null;
					new_recurrence_ends?: string | null;
					old_calendar_event_id?: string | null;
					old_recurrence_ends?: string | null;
					project_id?: string | null;
					status?: string;
					task_id: string;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					created_at?: string | null;
					error_message?: string | null;
					id?: string;
					migration_type?: string;
					new_calendar_event_id?: string | null;
					new_recurrence_ends?: string | null;
					old_calendar_event_id?: string | null;
					old_recurrence_ends?: string | null;
					project_id?: string | null;
					status?: string;
					task_id?: string;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'recurring_task_migration_log_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'recurring_task_migration_log_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'recurring_task_migration_log_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			sms_messages: {
				Row: {
					attempt_count: number | null;
					created_at: string | null;
					delivered_at: string | null;
					id: string;
					max_attempts: number | null;
					message_content: string;
					metadata: Json | null;
					next_retry_at: string | null;
					phone_number: string;
					priority: Database['public']['Enums']['sms_priority'];
					project_id: string | null;
					queue_job_id: string | null;
					scheduled_for: string | null;
					sent_at: string | null;
					status: Database['public']['Enums']['sms_status'];
					task_id: string | null;
					template_id: string | null;
					template_vars: Json | null;
					twilio_error_code: number | null;
					twilio_error_message: string | null;
					twilio_sid: string | null;
					twilio_status: string | null;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					attempt_count?: number | null;
					created_at?: string | null;
					delivered_at?: string | null;
					id?: string;
					max_attempts?: number | null;
					message_content: string;
					metadata?: Json | null;
					next_retry_at?: string | null;
					phone_number: string;
					priority?: Database['public']['Enums']['sms_priority'];
					project_id?: string | null;
					queue_job_id?: string | null;
					scheduled_for?: string | null;
					sent_at?: string | null;
					status?: Database['public']['Enums']['sms_status'];
					task_id?: string | null;
					template_id?: string | null;
					template_vars?: Json | null;
					twilio_error_code?: number | null;
					twilio_error_message?: string | null;
					twilio_sid?: string | null;
					twilio_status?: string | null;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					attempt_count?: number | null;
					created_at?: string | null;
					delivered_at?: string | null;
					id?: string;
					max_attempts?: number | null;
					message_content?: string;
					metadata?: Json | null;
					next_retry_at?: string | null;
					phone_number?: string;
					priority?: Database['public']['Enums']['sms_priority'];
					project_id?: string | null;
					queue_job_id?: string | null;
					scheduled_for?: string | null;
					sent_at?: string | null;
					status?: Database['public']['Enums']['sms_status'];
					task_id?: string | null;
					template_id?: string | null;
					template_vars?: Json | null;
					twilio_error_code?: number | null;
					twilio_error_message?: string | null;
					twilio_sid?: string | null;
					twilio_status?: string | null;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'sms_messages_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'sms_messages_queue_job_id_fkey';
						columns: ['queue_job_id'];
						isOneToOne: false;
						referencedRelation: 'queue_jobs';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'sms_messages_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'sms_messages_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'sms_messages_template_id_fkey';
						columns: ['template_id'];
						isOneToOne: false;
						referencedRelation: 'sms_templates';
						referencedColumns: ['id'];
					}
				];
			};
			sms_templates: {
				Row: {
					created_at: string | null;
					created_by: string | null;
					description: string | null;
					id: string;
					is_active: boolean | null;
					last_used_at: string | null;
					max_length: number | null;
					message_template: string;
					name: string;
					required_vars: Json | null;
					template_key: string;
					template_vars: Json | null;
					updated_at: string | null;
					usage_count: number | null;
				};
				Insert: {
					created_at?: string | null;
					created_by?: string | null;
					description?: string | null;
					id?: string;
					is_active?: boolean | null;
					last_used_at?: string | null;
					max_length?: number | null;
					message_template: string;
					name: string;
					required_vars?: Json | null;
					template_key: string;
					template_vars?: Json | null;
					updated_at?: string | null;
					usage_count?: number | null;
				};
				Update: {
					created_at?: string | null;
					created_by?: string | null;
					description?: string | null;
					id?: string;
					is_active?: boolean | null;
					last_used_at?: string | null;
					max_length?: number | null;
					message_template?: string;
					name?: string;
					required_vars?: Json | null;
					template_key?: string;
					template_vars?: Json | null;
					updated_at?: string | null;
					usage_count?: number | null;
				};
				Relationships: [];
			};
			subscription_plans: {
				Row: {
					billing_interval: string | null;
					created_at: string;
					currency: string | null;
					description: string | null;
					features: Json | null;
					id: string;
					interval_count: number | null;
					is_active: boolean | null;
					name: string;
					price_cents: number;
					stripe_price_id: string;
					updated_at: string;
				};
				Insert: {
					billing_interval?: string | null;
					created_at?: string;
					currency?: string | null;
					description?: string | null;
					features?: Json | null;
					id?: string;
					interval_count?: number | null;
					is_active?: boolean | null;
					name: string;
					price_cents: number;
					stripe_price_id: string;
					updated_at?: string;
				};
				Update: {
					billing_interval?: string | null;
					created_at?: string;
					currency?: string | null;
					description?: string | null;
					features?: Json | null;
					id?: string;
					interval_count?: number | null;
					is_active?: boolean | null;
					name?: string;
					price_cents?: number;
					stripe_price_id?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			system_metrics: {
				Row: {
					id: string;
					metric_description: string | null;
					metric_name: string;
					metric_unit: string | null;
					metric_value: number;
					recorded_at: string | null;
				};
				Insert: {
					id?: string;
					metric_description?: string | null;
					metric_name: string;
					metric_unit?: string | null;
					metric_value: number;
					recorded_at?: string | null;
				};
				Update: {
					id?: string;
					metric_description?: string | null;
					metric_name?: string;
					metric_unit?: string | null;
					metric_value?: number;
					recorded_at?: string | null;
				};
				Relationships: [];
			};
			task_calendar_events: {
				Row: {
					calendar_event_id: string;
					calendar_id: string;
					created_at: string | null;
					event_end: string | null;
					event_link: string | null;
					event_start: string | null;
					event_title: string | null;
					exception_type: string | null;
					id: string;
					is_exception: boolean | null;
					is_master_event: boolean | null;
					last_synced_at: string | null;
					original_start_time: string | null;
					project_calendar_id: string | null;
					recurrence_instance_date: string | null;
					recurrence_master_id: string | null;
					recurrence_rule: string | null;
					series_update_scope: string | null;
					sync_error: string | null;
					sync_source: string | null;
					sync_status: Database['public']['Enums']['sync_status'];
					sync_version: number | null;
					task_id: string;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					calendar_event_id: string;
					calendar_id: string;
					created_at?: string | null;
					event_end?: string | null;
					event_link?: string | null;
					event_start?: string | null;
					event_title?: string | null;
					exception_type?: string | null;
					id?: string;
					is_exception?: boolean | null;
					is_master_event?: boolean | null;
					last_synced_at?: string | null;
					original_start_time?: string | null;
					project_calendar_id?: string | null;
					recurrence_instance_date?: string | null;
					recurrence_master_id?: string | null;
					recurrence_rule?: string | null;
					series_update_scope?: string | null;
					sync_error?: string | null;
					sync_source?: string | null;
					sync_status?: Database['public']['Enums']['sync_status'];
					sync_version?: number | null;
					task_id: string;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					calendar_event_id?: string;
					calendar_id?: string;
					created_at?: string | null;
					event_end?: string | null;
					event_link?: string | null;
					event_start?: string | null;
					event_title?: string | null;
					exception_type?: string | null;
					id?: string;
					is_exception?: boolean | null;
					is_master_event?: boolean | null;
					last_synced_at?: string | null;
					original_start_time?: string | null;
					project_calendar_id?: string | null;
					recurrence_instance_date?: string | null;
					recurrence_master_id?: string | null;
					recurrence_rule?: string | null;
					series_update_scope?: string | null;
					sync_error?: string | null;
					sync_source?: string | null;
					sync_status?: Database['public']['Enums']['sync_status'];
					sync_version?: number | null;
					task_id?: string;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'task_calendar_events_project_calendar_id_fkey';
						columns: ['project_calendar_id'];
						isOneToOne: false;
						referencedRelation: 'project_calendars';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'task_calendar_events_recurrence_master_id_fkey';
						columns: ['recurrence_master_id'];
						isOneToOne: false;
						referencedRelation: 'task_calendar_events';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'task_calendar_events_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'task_calendar_events_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'task_calendar_events_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			tasks: {
				Row: {
					completed_at: string | null;
					created_at: string;
					deleted_at: string | null;
					dependencies: string[] | null;
					description: string | null;
					details: string | null;
					duration_minutes: number | null;
					id: string;
					outdated: boolean | null;
					parent_task_id: string | null;
					priority: Database['public']['Enums']['priority_level'];
					project_id: string | null;
					recurrence_end_source:
						| Database['public']['Enums']['recurrence_end_reason']
						| null;
					recurrence_ends: string | null;
					recurrence_pattern: Database['public']['Enums']['recurrence_pattern'] | null;
					start_date: string | null;
					status: Database['public']['Enums']['task_status'];
					task_steps: string | null;
					task_type: Database['public']['Enums']['task_type'];
					title: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					completed_at?: string | null;
					created_at?: string;
					deleted_at?: string | null;
					dependencies?: string[] | null;
					description?: string | null;
					details?: string | null;
					duration_minutes?: number | null;
					id?: string;
					outdated?: boolean | null;
					parent_task_id?: string | null;
					priority?: Database['public']['Enums']['priority_level'];
					project_id?: string | null;
					recurrence_end_source?:
						| Database['public']['Enums']['recurrence_end_reason']
						| null;
					recurrence_ends?: string | null;
					recurrence_pattern?: Database['public']['Enums']['recurrence_pattern'] | null;
					start_date?: string | null;
					status?: Database['public']['Enums']['task_status'];
					task_steps?: string | null;
					task_type?: Database['public']['Enums']['task_type'];
					title: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					completed_at?: string | null;
					created_at?: string;
					deleted_at?: string | null;
					dependencies?: string[] | null;
					description?: string | null;
					details?: string | null;
					duration_minutes?: number | null;
					id?: string;
					outdated?: boolean | null;
					parent_task_id?: string | null;
					priority?: Database['public']['Enums']['priority_level'];
					project_id?: string | null;
					recurrence_end_source?:
						| Database['public']['Enums']['recurrence_end_reason']
						| null;
					recurrence_ends?: string | null;
					recurrence_pattern?: Database['public']['Enums']['recurrence_pattern'] | null;
					start_date?: string | null;
					status?: Database['public']['Enums']['task_status'];
					task_steps?: string | null;
					task_type?: Database['public']['Enums']['task_type'];
					title?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_parent_task_id_fkey';
						columns: ['parent_task_id'];
						isOneToOne: false;
						referencedRelation: 'recurring_task_summary';
						referencedColumns: ['task_id'];
					},
					{
						foreignKeyName: 'tasks_parent_task_id_fkey';
						columns: ['parent_task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			trial_reminders: {
				Row: {
					created_at: string | null;
					id: string;
					reminder_type: string;
					sent_at: string | null;
					user_id: string;
				};
				Insert: {
					created_at?: string | null;
					id?: string;
					reminder_type: string;
					sent_at?: string | null;
					user_id: string;
				};
				Update: {
					created_at?: string | null;
					id?: string;
					reminder_type?: string;
					sent_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'trial_reminders_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_activity_logs: {
				Row: {
					activity_data: Json | null;
					activity_type: string;
					created_at: string;
					id: string;
					ip_address: unknown | null;
					user_agent: string | null;
					user_id: string | null;
				};
				Insert: {
					activity_data?: Json | null;
					activity_type: string;
					created_at?: string;
					id?: string;
					ip_address?: unknown | null;
					user_agent?: string | null;
					user_id?: string | null;
				};
				Update: {
					activity_data?: Json | null;
					activity_type?: string;
					created_at?: string;
					id?: string;
					ip_address?: unknown | null;
					user_agent?: string | null;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'user_activity_logs_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_brief_preferences: {
				Row: {
					created_at: string;
					day_of_week: number | null;
					email_daily_brief: boolean | null;
					frequency: string | null;
					id: string;
					is_active: boolean | null;
					time_of_day: string | null;
					timezone: string | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					day_of_week?: number | null;
					email_daily_brief?: boolean | null;
					frequency?: string | null;
					id?: string;
					is_active?: boolean | null;
					time_of_day?: string | null;
					timezone?: string | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					day_of_week?: number | null;
					email_daily_brief?: boolean | null;
					frequency?: string | null;
					id?: string;
					is_active?: boolean | null;
					time_of_day?: string | null;
					timezone?: string | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			user_calendar_preferences: {
				Row: {
					created_at: string;
					default_task_duration_minutes: number | null;
					exclude_holidays: boolean | null;
					holiday_country_code: string | null;
					id: string;
					max_task_duration_minutes: number | null;
					min_task_duration_minutes: number | null;
					prefer_morning_for_important_tasks: boolean | null;
					timezone: string | null;
					updated_at: string;
					user_id: string;
					work_end_time: string | null;
					work_start_time: string | null;
					working_days: number[] | null;
				};
				Insert: {
					created_at?: string;
					default_task_duration_minutes?: number | null;
					exclude_holidays?: boolean | null;
					holiday_country_code?: string | null;
					id?: string;
					max_task_duration_minutes?: number | null;
					min_task_duration_minutes?: number | null;
					prefer_morning_for_important_tasks?: boolean | null;
					timezone?: string | null;
					updated_at?: string;
					user_id: string;
					work_end_time?: string | null;
					work_start_time?: string | null;
					working_days?: number[] | null;
				};
				Update: {
					created_at?: string;
					default_task_duration_minutes?: number | null;
					exclude_holidays?: boolean | null;
					holiday_country_code?: string | null;
					id?: string;
					max_task_duration_minutes?: number | null;
					min_task_duration_minutes?: number | null;
					prefer_morning_for_important_tasks?: boolean | null;
					timezone?: string | null;
					updated_at?: string;
					user_id?: string;
					work_end_time?: string | null;
					work_start_time?: string | null;
					working_days?: number[] | null;
				};
				Relationships: [
					{
						foreignKeyName: 'user_calendar_preferences_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: true;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_calendar_tokens: {
				Row: {
					access_token: string;
					created_at: string | null;
					expiry_date: number | null;
					google_email: string | null;
					google_user_id: string | null;
					id: string;
					refresh_token: string | null;
					scope: string | null;
					token_type: string | null;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					access_token: string;
					created_at?: string | null;
					expiry_date?: number | null;
					google_email?: string | null;
					google_user_id?: string | null;
					id?: string;
					refresh_token?: string | null;
					scope?: string | null;
					token_type?: string | null;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					access_token?: string;
					created_at?: string | null;
					expiry_date?: number | null;
					google_email?: string | null;
					google_user_id?: string | null;
					id?: string;
					refresh_token?: string | null;
					scope?: string | null;
					token_type?: string | null;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'user_calendar_tokens_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: true;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_context: {
				Row: {
					active_projects: string | null;
					background: string | null;
					blockers: string | null;
					collaboration_needs: string | null;
					communication_style: string | null;
					created_at: string;
					focus_areas: string | null;
					goals_overview: string | null;
					habits: string | null;
					help_priorities: string | null;
					id: string;
					input_challenges: string | null;
					input_help_focus: string | null;
					input_projects: string | null;
					input_work_style: string | null;
					last_parsed_input_challenges: string | null;
					last_parsed_input_help_focus: string | null;
					last_parsed_input_projects: string | null;
					last_parsed_input_work_style: string | null;
					onboarding_completed_at: string | null;
					organization_method: string | null;
					preferred_work_hours: string | null;
					priorities: string | null;
					productivity_challenges: string | null;
					schedule_preferences: string | null;
					skill_gaps: string | null;
					tools: string | null;
					updated_at: string;
					user_id: string;
					work_style: string | null;
					workflows: string | null;
				};
				Insert: {
					active_projects?: string | null;
					background?: string | null;
					blockers?: string | null;
					collaboration_needs?: string | null;
					communication_style?: string | null;
					created_at?: string;
					focus_areas?: string | null;
					goals_overview?: string | null;
					habits?: string | null;
					help_priorities?: string | null;
					id?: string;
					input_challenges?: string | null;
					input_help_focus?: string | null;
					input_projects?: string | null;
					input_work_style?: string | null;
					last_parsed_input_challenges?: string | null;
					last_parsed_input_help_focus?: string | null;
					last_parsed_input_projects?: string | null;
					last_parsed_input_work_style?: string | null;
					onboarding_completed_at?: string | null;
					organization_method?: string | null;
					preferred_work_hours?: string | null;
					priorities?: string | null;
					productivity_challenges?: string | null;
					schedule_preferences?: string | null;
					skill_gaps?: string | null;
					tools?: string | null;
					updated_at?: string;
					user_id: string;
					work_style?: string | null;
					workflows?: string | null;
				};
				Update: {
					active_projects?: string | null;
					background?: string | null;
					blockers?: string | null;
					collaboration_needs?: string | null;
					communication_style?: string | null;
					created_at?: string;
					focus_areas?: string | null;
					goals_overview?: string | null;
					habits?: string | null;
					help_priorities?: string | null;
					id?: string;
					input_challenges?: string | null;
					input_help_focus?: string | null;
					input_projects?: string | null;
					input_work_style?: string | null;
					last_parsed_input_challenges?: string | null;
					last_parsed_input_help_focus?: string | null;
					last_parsed_input_projects?: string | null;
					last_parsed_input_work_style?: string | null;
					onboarding_completed_at?: string | null;
					organization_method?: string | null;
					preferred_work_hours?: string | null;
					priorities?: string | null;
					productivity_challenges?: string | null;
					schedule_preferences?: string | null;
					skill_gaps?: string | null;
					tools?: string | null;
					updated_at?: string;
					user_id?: string;
					work_style?: string | null;
					workflows?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'user_context_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: true;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_discounts: {
				Row: {
					applied_at: string | null;
					discount_code_id: string;
					expires_at: string | null;
					id: string;
					stripe_subscription_id: string | null;
					user_id: string;
				};
				Insert: {
					applied_at?: string | null;
					discount_code_id: string;
					expires_at?: string | null;
					id?: string;
					stripe_subscription_id?: string | null;
					user_id: string;
				};
				Update: {
					applied_at?: string | null;
					discount_code_id?: string;
					expires_at?: string | null;
					id?: string;
					stripe_subscription_id?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'user_discounts_discount_code_id_fkey';
						columns: ['discount_code_id'];
						isOneToOne: false;
						referencedRelation: 'discount_codes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'user_discounts_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_notifications: {
				Row: {
					action_url: string | null;
					created_at: string | null;
					dismissed_at: string | null;
					expires_at: string | null;
					id: string;
					message: string;
					priority: string | null;
					read_at: string | null;
					title: string;
					type: string;
					user_id: string;
				};
				Insert: {
					action_url?: string | null;
					created_at?: string | null;
					dismissed_at?: string | null;
					expires_at?: string | null;
					id?: string;
					message: string;
					priority?: string | null;
					read_at?: string | null;
					title: string;
					type: string;
					user_id: string;
				};
				Update: {
					action_url?: string | null;
					created_at?: string | null;
					dismissed_at?: string | null;
					expires_at?: string | null;
					id?: string;
					message?: string;
					priority?: string | null;
					read_at?: string | null;
					title?: string;
					type?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'user_notifications_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			user_sms_preferences: {
				Row: {
					created_at: string | null;
					daily_brief_sms: boolean | null;
					daily_count_reset_at: string | null;
					daily_sms_count: number | null;
					daily_sms_limit: number | null;
					id: string;
					opt_out_reason: string | null;
					opted_out: boolean | null;
					opted_out_at: string | null;
					phone_number: string | null;
					phone_verified: boolean | null;
					phone_verified_at: string | null;
					quiet_hours_end: string | null;
					quiet_hours_start: string | null;
					task_reminders: boolean | null;
					timezone: string | null;
					updated_at: string | null;
					urgent_alerts: boolean | null;
					user_id: string;
				};
				Insert: {
					created_at?: string | null;
					daily_brief_sms?: boolean | null;
					daily_count_reset_at?: string | null;
					daily_sms_count?: number | null;
					daily_sms_limit?: number | null;
					id?: string;
					opt_out_reason?: string | null;
					opted_out?: boolean | null;
					opted_out_at?: string | null;
					phone_number?: string | null;
					phone_verified?: boolean | null;
					phone_verified_at?: string | null;
					quiet_hours_end?: string | null;
					quiet_hours_start?: string | null;
					task_reminders?: boolean | null;
					timezone?: string | null;
					updated_at?: string | null;
					urgent_alerts?: boolean | null;
					user_id: string;
				};
				Update: {
					created_at?: string | null;
					daily_brief_sms?: boolean | null;
					daily_count_reset_at?: string | null;
					daily_sms_count?: number | null;
					daily_sms_limit?: number | null;
					id?: string;
					opt_out_reason?: string | null;
					opted_out?: boolean | null;
					opted_out_at?: string | null;
					phone_number?: string | null;
					phone_verified?: boolean | null;
					phone_verified_at?: string | null;
					quiet_hours_end?: string | null;
					quiet_hours_start?: string | null;
					task_reminders?: boolean | null;
					timezone?: string | null;
					updated_at?: string | null;
					urgent_alerts?: boolean | null;
					user_id?: string;
				};
				Relationships: [];
			};
			users: {
				Row: {
					access_restricted: boolean | null;
					access_restricted_at: string | null;
					bio: string | null;
					completed_onboarding: boolean | null;
					created_at: string;
					email: string;
					id: string;
					is_admin: boolean;
					is_beta_user: boolean | null;
					last_visit: string | null;
					name: string | null;
					stripe_customer_id: string | null;
					subscription_plan_id: string | null;
					subscription_status: string | null;
					trial_ends_at: string | null;
					updated_at: string;
				};
				Insert: {
					access_restricted?: boolean | null;
					access_restricted_at?: string | null;
					bio?: string | null;
					completed_onboarding?: boolean | null;
					created_at?: string;
					email: string;
					id: string;
					is_admin?: boolean;
					is_beta_user?: boolean | null;
					last_visit?: string | null;
					name?: string | null;
					stripe_customer_id?: string | null;
					subscription_plan_id?: string | null;
					subscription_status?: string | null;
					trial_ends_at?: string | null;
					updated_at?: string;
				};
				Update: {
					access_restricted?: boolean | null;
					access_restricted_at?: string | null;
					bio?: string | null;
					completed_onboarding?: boolean | null;
					created_at?: string;
					email?: string;
					id?: string;
					is_admin?: boolean;
					is_beta_user?: boolean | null;
					last_visit?: string | null;
					name?: string | null;
					stripe_customer_id?: string | null;
					subscription_plan_id?: string | null;
					subscription_status?: string | null;
					trial_ends_at?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'users_subscription_plan_id_fkey';
						columns: ['subscription_plan_id'];
						isOneToOne: false;
						referencedRelation: 'subscription_plans';
						referencedColumns: ['id'];
					}
				];
			};
			visitors: {
				Row: {
					created_at: string;
					id: number;
					ip_address: unknown | null;
					updated_at: string;
					user_agent: string | null;
					visitor_id: string;
				};
				Insert: {
					created_at?: string;
					id?: number;
					ip_address?: unknown | null;
					updated_at?: string;
					user_agent?: string | null;
					visitor_id: string;
				};
				Update: {
					created_at?: string;
					id?: number;
					ip_address?: unknown | null;
					updated_at?: string;
					user_agent?: string | null;
					visitor_id?: string;
				};
				Relationships: [];
			};
			webhook_events: {
				Row: {
					attempts: number | null;
					created_at: string | null;
					error_message: string | null;
					event_id: string;
					event_type: string;
					id: string;
					payload: Json | null;
					processed_at: string | null;
					status: string;
				};
				Insert: {
					attempts?: number | null;
					created_at?: string | null;
					error_message?: string | null;
					event_id: string;
					event_type: string;
					id?: string;
					payload?: Json | null;
					processed_at?: string | null;
					status?: string;
				};
				Update: {
					attempts?: number | null;
					created_at?: string | null;
					error_message?: string | null;
					event_id?: string;
					event_type?: string;
					id?: string;
					payload?: Json | null;
					processed_at?: string | null;
					status?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			error_summary: {
				Row: {
					affected_projects: number | null;
					affected_users: number | null;
					avg_response_time_ms: number | null;
					error_count: number | null;
					error_type: string | null;
					first_occurrence: string | null;
					last_occurrence: string | null;
					resolved_count: number | null;
					severity: string | null;
				};
				Relationships: [];
			};
			project_kept_versions: {
				Row: {
					created_at: string | null;
					created_by: string | null;
					current_name: string | null;
					history_id: string | null;
					is_first_version: boolean | null;
					project_data: Json | null;
					project_id: string | null;
					version_name: string | null;
					version_number: number | null;
					version_status: string | null;
					version_type: string | null;
				};
				Relationships: [];
			};
			queue_jobs_stats: {
				Row: {
					avg_duration_seconds: number | null;
					count: number | null;
					job_type: string | null;
					newest_job: string | null;
					oldest_job: string | null;
					status: string | null;
				};
				Relationships: [];
			};
			recurring_task_summary: {
				Row: {
					completed_instances: number | null;
					exception_count: number | null;
					last_completed_at: string | null;
					next_occurrence: string | null;
					recurrence_ends: string | null;
					recurrence_pattern: Database['public']['Enums']['recurrence_pattern'] | null;
					skipped_instances: number | null;
					start_date: string | null;
					task_id: string | null;
					title: string | null;
					total_instances: number | null;
					user_id: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_user_id_fkey';
						columns: ['user_id'];
						isOneToOne: false;
						referencedRelation: 'users';
						referencedColumns: ['id'];
					}
				];
			};
			trial_statistics: {
				Row: {
					active_subscriptions: number | null;
					active_trials: number | null;
					avg_trial_length_days: number | null;
					beta_users: number | null;
					expired_trials: number | null;
				};
				Relationships: [];
			};
		};
		Functions: {
			add_queue_job: {
				Args: {
					p_dedup_key?: string;
					p_job_type: string;
					p_metadata?: Json;
					p_priority?: number;
					p_scheduled_for?: string;
					p_user_id: string;
				};
				Returns: string;
			};
			approve_generated_phases: {
				Args: { p_generation_id: string; p_phase_ids?: string[] };
				Returns: {
					created_phase_id: string;
					generated_phase_id: string;
					phase_name: string;
				}[];
			};
			batch_update_phase_dates: {
				Args: { p_project_id: string; p_updates: Json };
				Returns: {
					end_date: string;
					id: string;
					start_date: string;
					updated_at: string;
				}[];
			};
			batch_update_phase_orders: {
				Args: { p_project_id: string; p_updates: Json };
				Returns: {
					id: string;
					order_position: number;
					updated_at: string;
				}[];
			};
			binary_quantize: {
				Args: { '': string } | { '': unknown };
				Returns: unknown;
			};
			brain_dump_cleanup_preview: {
				Args: Record<PropertyKey, never>;
				Returns: {
					draft_to_keep_id: string;
					draft_to_keep_size: number;
					drafts_to_delete: number;
					exact_duplicates: number;
					prefix_matches: number;
					project_name: string;
					user_email: string;
				}[];
			};
			brain_dump_cleanup_report: {
				Args: Record<PropertyKey, never>;
				Returns: {
					metric: string;
					value: number;
				}[];
			};
			brain_dump_cleanup_with_report: {
				Args: { execute_delete?: boolean };
				Returns: {
					details: Json;
					report_type: string;
				}[];
			};
			cancel_brief_jobs_for_date: {
				Args: {
					p_brief_date: string;
					p_exclude_job_id?: string;
					p_user_id: string;
				};
				Returns: {
					cancelled_count: number;
					cancelled_job_ids: string[];
				}[];
			};
			cancel_job_with_reason: {
				Args: {
					p_allow_processing?: boolean;
					p_job_id: string;
					p_reason: string;
				};
				Returns: boolean;
			};
			cancel_jobs_atomic: {
				Args: {
					p_allowed_statuses?: string[];
					p_job_type: string;
					p_metadata_filter?: Json;
					p_user_id: string;
				};
				Returns: {
					cancelled_job_id: string;
					cancelled_queue_job_id: string;
					previous_status: string;
				}[];
			};
			cancel_jobs_in_time_window: {
				Args: {
					p_exclude_job_id?: string;
					p_job_type: string;
					p_user_id: string;
					p_window_end: string;
					p_window_start: string;
				};
				Returns: number;
			};
			check_feedback_rate_limit: {
				Args: { client_ip: unknown };
				Returns: boolean;
			};
			check_onboarding_complete: {
				Args: { user_id_param: string };
				Returns: boolean;
			};
			claim_pending_jobs: {
				Args: { p_batch_size?: number; p_job_types: string[] };
				Returns: {
					attempts: number;
					created_at: string;
					id: string;
					job_type: Database['public']['Enums']['queue_type'];
					max_attempts: number;
					metadata: Json;
					priority: number;
					queue_job_id: string;
					scheduled_for: string;
					status: Database['public']['Enums']['queue_status'];
					user_id: string;
				}[];
			};
			cleanup_duplicate_brain_dump_drafts: {
				Args: Record<PropertyKey, never>;
				Returns: {
					affected_projects: number;
					affected_users: number;
					deleted_count: number;
				}[];
			};
			cleanup_old_brief_jobs: {
				Args: Record<PropertyKey, never>;
				Returns: undefined;
			};
			cleanup_project_history: {
				Args: { target_project_id: string };
				Returns: undefined;
			};
			cleanup_stale_brief_generations: {
				Args: { p_timeout_minutes?: number; p_user_id: string };
				Returns: {
					brief_date: string;
					id: string;
				}[];
			};
			complete_queue_job: {
				Args: { p_job_id: string; p_result?: Json };
				Returns: boolean;
			};
			complete_recurring_instance: {
				Args: { p_instance_date: string; p_task_id: string; p_user_id: string };
				Returns: boolean;
			};
			create_manual_project_version: {
				Args: { created_by_user?: string; target_project_id: string };
				Returns: number;
			};
			decrement_phase_order: {
				Args: { p_order_threshold: number; p_project_id: string };
				Returns: undefined;
			};
			fail_queue_job: {
				Args: { p_error_message: string; p_job_id: string; p_retry?: boolean };
				Returns: boolean;
			};
			generate_recurring_instances: {
				Args: { p_end_date: string; p_start_date: string; p_task_id: string };
				Returns: {
					instance_date: string;
				}[];
			};
			get_brief_generation_stats: {
				Args: { end_date: string; start_date: string };
				Returns: {
					avg_briefs_per_user: number;
					date: string;
					total_briefs: number;
					unique_users: number;
				}[];
			};
			get_daily_active_users: {
				Args: { end_date: string; start_date: string };
				Returns: {
					active_users: number;
					date: string;
				}[];
			};
			get_daily_visitors: {
				Args: { end_date: string; start_date: string };
				Returns: {
					date: string;
					visitor_count: number;
				}[];
			};
			get_dashboard_data: {
				Args: {
					p_date_end?: string;
					p_date_start?: string;
					p_timezone?: string;
					p_today?: string;
					p_user_id: string;
				};
				Returns: Json;
			};
			get_project_history: {
				Args: { target_project_id: string };
				Returns: {
					created_at: string;
					created_by: string;
					is_first_version: boolean;
					project_data: Json;
					version_number: number;
					version_type: string;
				}[];
			};
			get_project_phases_hierarchy: {
				Args: { p_project_id: string; p_user_id?: string };
				Returns: Json;
			};
			get_project_statistics: {
				Args: { p_project_id: string; p_user_id: string };
				Returns: Json;
			};
			get_project_version: {
				Args: { target_project_id: string; target_version: number };
				Returns: Json;
			};
			get_projects_with_stats: {
				Args: {
					p_limit?: number;
					p_offset?: number;
					p_search?: string;
					p_status?: string;
					p_user_id: string;
				};
				Returns: Json;
			};
			get_revenue_metrics: {
				Args: Record<PropertyKey, never>;
				Returns: {
					average_revenue_per_user: number;
					churn_rate: number;
					current_mrr: number;
					lifetime_value: number;
					mrr_growth: number;
					previous_mrr: number;
					total_revenue: number;
				}[];
			};
			get_subscription_changes: {
				Args: { p_timeframe?: string };
				Returns: {
					cancellations: number;
					date: string;
					net_change: number;
					new_subscriptions: number;
				}[];
			};
			get_subscription_overview: {
				Args: Record<PropertyKey, never>;
				Returns: {
					active_subscriptions: number;
					arr: number;
					canceled_subscriptions: number;
					mrr: number;
					paused_subscriptions: number;
					total_subscribers: number;
					trial_subscriptions: number;
				}[];
			};
			get_user_active_generations: {
				Args: { p_user_id: string };
				Returns: {
					brief_date: string;
					brief_id: string;
					generation_progress: Json;
					generation_started_at: string;
					generation_status: string;
				}[];
			};
			get_user_engagement_metrics: {
				Args: Record<PropertyKey, never>;
				Returns: {
					active_users_30d: number;
					active_users_7d: number;
					avg_brief_length: number;
					top_active_users: Json;
					total_briefs: number;
					total_users: number;
				}[];
			};
			get_user_failed_payments_count: {
				Args: { p_user_id: string };
				Returns: number;
			};
			get_user_subscription_status: {
				Args: { user_uuid: string };
				Returns: {
					current_period_end: string;
					has_subscription: boolean;
					is_beta_user: boolean;
					subscription_status: string;
				}[];
			};
			get_user_trial_status: {
				Args: { p_user_id: string };
				Returns: {
					days_until_trial_end: number;
					has_active_subscription: boolean;
					is_in_grace_period: boolean;
					is_in_trial: boolean;
					is_read_only: boolean;
					is_trial_expired: boolean;
					trial_end_date: string;
				}[];
			};
			get_visitor_overview: {
				Args: Record<PropertyKey, never>;
				Returns: {
					total_visitors: number;
					unique_visitors_today: number;
					visitors_30d: number;
					visitors_7d: number;
				}[];
			};
			gtrgm_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gtrgm_decompress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gtrgm_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gtrgm_options: {
				Args: { '': unknown };
				Returns: undefined;
			};
			gtrgm_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			halfvec_avg: {
				Args: { '': number[] };
				Returns: unknown;
			};
			halfvec_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			halfvec_send: {
				Args: { '': unknown };
				Returns: string;
			};
			halfvec_typmod_in: {
				Args: { '': unknown[] };
				Returns: number;
			};
			has_active_subscription: {
				Args: { user_uuid: string };
				Returns: boolean;
			};
			hnsw_bit_support: {
				Args: { '': unknown };
				Returns: unknown;
			};
			hnsw_halfvec_support: {
				Args: { '': unknown };
				Returns: unknown;
			};
			hnsw_sparsevec_support: {
				Args: { '': unknown };
				Returns: unknown;
			};
			hnswhandler: {
				Args: { '': unknown };
				Returns: unknown;
			};
			increment_question_display_count: {
				Args: { question_ids: string[] };
				Returns: undefined;
			};
			is_admin: {
				Args: Record<PropertyKey, never>;
				Returns: boolean;
			};
			ivfflat_bit_support: {
				Args: { '': unknown };
				Returns: unknown;
			};
			ivfflat_halfvec_support: {
				Args: { '': unknown };
				Returns: unknown;
			};
			ivfflathandler: {
				Args: { '': unknown };
				Returns: unknown;
			};
			l2_norm: {
				Args: { '': unknown } | { '': unknown };
				Returns: number;
			};
			l2_normalize: {
				Args: { '': string } | { '': unknown } | { '': unknown };
				Returns: string;
			};
			normalize_queue_job_metadata: {
				Args: Record<PropertyKey, never>;
				Returns: {
					details: string;
					error_count: number;
					fixed_count: number;
					skipped_count: number;
				}[];
			};
			queue_sms_message: {
				Args: {
					p_message: string;
					p_metadata?: Json;
					p_phone_number: string;
					p_priority?: Database['public']['Enums']['sms_priority'];
					p_scheduled_for?: string;
					p_user_id: string;
				};
				Returns: string;
			};
			refresh_system_metrics: {
				Args: Record<PropertyKey, never>;
				Returns: undefined;
			};
			reorder_phases_with_tasks: {
				Args: {
					p_affected_task_ids?: string[];
					p_clear_task_dates?: boolean;
					p_phase_updates: Json;
					p_project_id: string;
				};
				Returns: Json;
			};
			reset_stalled_jobs: {
				Args: { p_stall_timeout?: unknown };
				Returns: number;
			};
			restore_deleted_task: {
				Args: { task_id_param: string };
				Returns: boolean;
			};
			search_all_content: {
				Args: {
					current_user_id: string;
					items_per_category?: number;
					search_query: string;
				};
				Returns: {
					created_at: string;
					description: string;
					is_completed: boolean;
					is_deleted: boolean;
					item_id: string;
					item_type: string;
					matched_fields: string[];
					project_id: string;
					relevance_score: number;
					status: string;
					tags: string[];
					title: string;
					updated_at: string;
				}[];
			};
			search_all_similar: {
				Args: { query_embedding: string; similarity_threshold?: number };
				Returns: {
					content: string;
					id: string;
					similarity: number;
					table_name: string;
				}[];
			};
			search_by_type: {
				Args: {
					current_user_id: string;
					page_limit?: number;
					page_offset?: number;
					search_query: string;
					search_type: string;
				};
				Returns: {
					created_at: string;
					description: string;
					is_completed: boolean;
					is_deleted: boolean;
					item_id: string;
					matched_fields: string[];
					project_id: string;
					relevance_score: number;
					status: string;
					tags: string[];
					title: string;
					updated_at: string;
				}[];
			};
			search_similar_items: {
				Args: {
					match_count?: number;
					query_embedding: string;
					similarity_threshold?: number;
					table_name: string;
				};
				Returns: {
					content: string;
					id: string;
					similarity: number;
				}[];
			};
			set_limit: {
				Args: { '': number };
				Returns: number;
			};
			show_limit: {
				Args: Record<PropertyKey, never>;
				Returns: number;
			};
			show_trgm: {
				Args: { '': string };
				Returns: string[];
			};
			sparsevec_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			sparsevec_send: {
				Args: { '': unknown };
				Returns: string;
			};
			sparsevec_typmod_in: {
				Args: { '': unknown[] };
				Returns: number;
			};
			start_daily_brief_generation: {
				Args: { p_brief_date?: string; p_user_id: string };
				Returns: Json;
			};
			start_or_resume_brief_generation: {
				Args: {
					p_brief_date: string;
					p_force_regenerate?: boolean;
					p_user_id: string;
				};
				Returns: {
					brief_id: string;
					message: string;
					started: boolean;
				}[];
			};
			unaccent: {
				Args: { '': string };
				Returns: string;
			};
			unaccent_init: {
				Args: { '': unknown };
				Returns: unknown;
			};
			update_brief_generation_progress: {
				Args: {
					p_brief_id: string;
					p_life_goals_completed: number;
					p_projects_completed: number;
					p_total_life_goals: number;
					p_total_projects: number;
				};
				Returns: undefined;
			};
			user_has_payment_issues: {
				Args: { p_user_id: string };
				Returns: boolean;
			};
			validate_all_queue_jobs: {
				Args: { p_fix?: boolean };
				Returns: {
					fixed: boolean;
					is_valid: boolean;
					issue: string;
					job_id: string;
					job_type: string;
					status: string;
				}[];
			};
			vector_avg: {
				Args: { '': number[] };
				Returns: string;
			};
			vector_dims: {
				Args: { '': string } | { '': unknown };
				Returns: number;
			};
			vector_norm: {
				Args: { '': string };
				Returns: number;
			};
			vector_out: {
				Args: { '': string };
				Returns: unknown;
			};
			vector_send: {
				Args: { '': string };
				Returns: string;
			};
			vector_typmod_in: {
				Args: { '': unknown[] };
				Returns: number;
			};
		};
		Enums: {
			brain_dump_status: 'pending' | 'parsed' | 'saved' | 'parsed_and_deleted';
			calendar_sync_status: 'active' | 'paused' | 'error';
			calendar_visibility: 'public' | 'private' | 'shared';
			priority_level: 'low' | 'medium' | 'high';
			project_status: 'active' | 'paused' | 'completed' | 'archived';
			queue_status:
				| 'pending'
				| 'processing'
				| 'completed'
				| 'failed'
				| 'cancelled'
				| 'retrying';
			queue_type:
				| 'generate_daily_brief'
				| 'generate_phases'
				| 'sync_calendar'
				| 'process_brain_dump'
				| 'send_email'
				| 'update_recurring_tasks'
				| 'cleanup_old_data'
				| 'onboarding_analysis'
				| 'other'
				| 'send_sms';
			recurrence_end_reason:
				| 'indefinite'
				| 'project_inherited'
				| 'user_specified'
				| 'user_action'
				| 'project_end'
				| 'max_occurrences'
				| 'end_date'
				| 'task_deleted';
			recurrence_pattern:
				| 'daily'
				| 'weekdays'
				| 'weekly'
				| 'biweekly'
				| 'monthly'
				| 'quarterly'
				| 'yearly';
			sms_priority: 'low' | 'normal' | 'high' | 'urgent';
			sms_status:
				| 'pending'
				| 'queued'
				| 'sending'
				| 'sent'
				| 'delivered'
				| 'failed'
				| 'undelivered'
				| 'scheduled'
				| 'cancelled';
			sync_status: 'pending' | 'synced' | 'failed' | 'cancelled';
			task_status: 'backlog' | 'in_progress' | 'done' | 'blocked';
			task_type: 'one_off' | 'recurring';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
				DefaultSchema['Views'])
		? (DefaultSchema['Tables'] &
				DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema['Enums']
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema['CompositeTypes']
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			brain_dump_status: ['pending', 'parsed', 'saved', 'parsed_and_deleted'],
			calendar_sync_status: ['active', 'paused', 'error'],
			calendar_visibility: ['public', 'private', 'shared'],
			priority_level: ['low', 'medium', 'high'],
			project_status: ['active', 'paused', 'completed', 'archived'],
			queue_status: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying'],
			queue_type: [
				'generate_daily_brief',
				'generate_phases',
				'sync_calendar',
				'process_brain_dump',
				'send_email',
				'update_recurring_tasks',
				'cleanup_old_data',
				'onboarding_analysis',
				'other',
				'send_sms'
			],
			recurrence_end_reason: [
				'indefinite',
				'project_inherited',
				'user_specified',
				'user_action',
				'project_end',
				'max_occurrences',
				'end_date',
				'task_deleted'
			],
			recurrence_pattern: [
				'daily',
				'weekdays',
				'weekly',
				'biweekly',
				'monthly',
				'quarterly',
				'yearly'
			],
			sms_priority: ['low', 'normal', 'high', 'urgent'],
			sms_status: [
				'pending',
				'queued',
				'sending',
				'sent',
				'delivered',
				'failed',
				'undelivered',
				'scheduled',
				'cancelled'
			],
			sync_status: ['pending', 'synced', 'failed', 'cancelled'],
			task_status: ['backlog', 'in_progress', 'done', 'blocked'],
			task_type: ['one_off', 'recurring']
		}
	}
} as const;
