// Lightweight database schema - auto-generated from database.types.ts
// Generated on: 2025-10-08T17:32:41.702Z

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type DatabaseSchema = {
	admin_analytics: {
		created_at: string;
		date: string;
		id: string;
		metadata: Json | null;
		metric_name: string;
		metric_value: number;
	};
	admin_users: {
		created_at: string;
		granted_at: string | null;
		granted_by: string | null;
		user_id: string;
	};
	api_keys: {
		api_key: string;
		created_at: string | null;
		id: number;
		service_name: string;
		user_id: string;
	};
	beta_event_attendance: {
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
	beta_events: {
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
	beta_feature_votes: {
		created_at: string | null;
		feedback_id: string | null;
		id: string;
		member_id: string | null;
		vote_type: string | null;
	};
	beta_feedback: {
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
	beta_members: {
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
	beta_signups: {
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
	brain_dump_links: {
		brain_dump_id: string;
		created_at: string;
		id: number;
		note_id: string | null;
		project_id: string | null;
		task_id: string | null;
	};
	brain_dumps: {
		ai_insights: string | null;
		ai_summary: string | null;
		content: string | null;
		created_at: string;
		id: string;
		metaData: Json | null;
		parsed_results: Json | null;
		project_id: string | null;
		status: string;
		tags: string[] | null;
		title: string | null;
		updated_at: string;
		user_id: string;
	};
	calendar_analyses: {
		ai_model: string | null;
		ai_model_version: string | null;
		calendars_analyzed: string[] | null;
		completed_at: string | null;
		confidence_average: number | null;
		created_at: string | null;
		date_range_end: string | null;
		date_range_start: string | null;
		error_message: string | null;
		events_analyzed: number | null;
		events_excluded: number | null;
		id: string;
		processing_time_ms: number | null;
		projects_created: number | null;
		projects_suggested: number | null;
		started_at: string | null;
		status: string | null;
		tasks_created: number | null;
		total_tokens_used: number | null;
		updated_at: string | null;
		user_feedback: string | null;
		user_id: string;
		user_rating: number | null;
	};
	calendar_analysis_events: {
		analysis_id: string;
		attendee_count: number | null;
		attendee_emails: string[] | null;
		calendar_event_id: string;
		calendar_id: string;
		created_at: string | null;
		event_description: string | null;
		event_end: string | null;
		event_location: string | null;
		event_start: string | null;
		event_title: string | null;
		exclusion_reason: string | null;
		id: string;
		included_in_analysis: boolean | null;
		is_organizer: boolean | null;
		is_recurring: boolean | null;
		recurrence_pattern: string | null;
		suggestion_id: string | null;
	};
	calendar_analysis_preferences: {
		analysis_frequency: string | null;
		auto_accept_confidence: number | null;
		auto_analyze_on_connect: boolean | null;
		create_tasks_from_events: boolean | null;
		created_at: string | null;
		exclude_all_day_events: boolean | null;
		exclude_declined_events: boolean | null;
		exclude_personal_events: boolean | null;
		exclude_tentative_events: boolean | null;
		excluded_calendar_ids: string[] | null;
		id: string;
		included_calendar_ids: string[] | null;
		last_auto_analysis_at: string | null;
		minimum_attendees: number | null;
		minimum_confidence_to_show: number | null;
		updated_at: string | null;
		user_id: string;
	};
	calendar_project_suggestions: {
		ai_reasoning: string | null;
		analysis_id: string;
		calendar_event_ids: string[];
		calendar_ids: string[] | null;
		confidence_score: number;
		created_at: string | null;
		created_project_id: string | null;
		detected_keywords: string[] | null;
		event_count: number | null;
		event_patterns: Json | null;
		id: string;
		rejection_reason: string | null;
		status: string | null;
		status_changed_at: string | null;
		suggested_context: string | null;
		suggested_description: string | null;
		suggested_name: string;
		suggested_priority: string | null;
		suggested_tasks: Json | null;
		tasks_created_count: number | null;
		updated_at: string | null;
		user_id: string;
		user_modified_context: string | null;
		user_modified_description: string | null;
		user_modified_name: string | null;
	};
	calendar_themes: {
		color_mappings: Json;
		created_at: string | null;
		id: string;
		is_default: boolean | null;
		theme_name: string;
		updated_at: string | null;
		user_id: string;
	};
	calendar_webhook_channels: {
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
	cron_logs: {
		created_at: string | null;
		error_message: string | null;
		executed_at: string;
		id: string;
		job_name: string;
		status: string;
	};
	customer_subscriptions: {
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
	daily_briefs: {
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
	discount_codes: {
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
	email_attachments: {
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
	email_logs: {
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
	email_recipients: {
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
	email_tracking_events: {
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
	emails: {
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
	error_logs: {
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
	failed_payments: {
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
	feedback: {
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
	feedback_rate_limit: {
		first_submission: string | null;
		id: string;
		ip_address: unknown;
		is_blocked: boolean | null;
		last_submission: string | null;
		submission_count: number | null;
	};
	generated_phase_tasks: {
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
	generated_phases: {
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
	invoices: {
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
	llm_prompts: {
		id: string;
		last_used: string | null;
		prompt_text: string | null;
		purpose: string | null;
		title: string | null;
	};
	llm_usage_logs: {
		brain_dump_id: string | null;
		brief_id: string | null;
		completion_tokens: number;
		created_at: string;
		error_message: string | null;
		id: string;
		input_cost_usd: number;
		max_tokens: number | null;
		metadata: Json | null;
		model_requested: string;
		model_used: string;
		openrouter_cache_status: string | null;
		openrouter_request_id: string | null;
		operation_type: string;
		output_cost_usd: number;
		profile: string | null;
		project_id: string | null;
		prompt_tokens: number;
		provider: string | null;
		rate_limit_remaining: number | null;
		request_completed_at: string;
		request_started_at: string;
		response_time_ms: number;
		status: string;
		streaming: boolean | null;
		task_id: string | null;
		temperature: number | null;
		total_cost_usd: number;
		total_tokens: number;
		user_id: string;
	};
	llm_usage_summary: {
		avg_response_time_ms: number | null;
		created_at: string;
		failed_requests: number;
		id: string;
		max_response_time_ms: number | null;
		min_response_time_ms: number | null;
		models_used: Json | null;
		operations_breakdown: Json | null;
		successful_requests: number;
		summary_date: string;
		summary_type: string;
		total_completion_tokens: number;
		total_cost_usd: number;
		total_prompt_tokens: number;
		total_requests: number;
		total_tokens: number;
		updated_at: string;
		user_id: string;
	};
	notes: {
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
	notification_deliveries: {
		attempts: number | null;
		channel: string;
		channel_identifier: string | null;
		clicked_at: string | null;
		created_at: string | null;
		delivered_at: string | null;
		event_id: string | null;
		external_id: string | null;
		failed_at: string | null;
		id: string;
		last_error: string | null;
		max_attempts: number | null;
		opened_at: string | null;
		payload: Json;
		recipient_user_id: string;
		sent_at: string | null;
		status: string;
		subscription_id: string | null;
		tracking_id: string | null;
		updated_at: string | null;
	};
	notification_events: {
		actor_user_id: string | null;
		created_at: string | null;
		event_source: string;
		event_type: string;
		id: string;
		metadata: Json | null;
		payload: Json;
		target_user_id: string | null;
	};
	notification_subscriptions: {
		admin_only: boolean | null;
		created_at: string | null;
		created_by: string | null;
		event_type: string;
		filters: Json | null;
		id: string;
		is_active: boolean | null;
		updated_at: string | null;
		user_id: string;
	};
	notification_tracking_links: {
		click_count: number | null;
		created_at: string | null;
		delivery_id: string;
		destination_url: string;
		first_clicked_at: string | null;
		id: string;
		last_clicked_at: string | null;
		metadata: Json | null;
		short_code: string;
	};
	payment_methods: {
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
	phase_task_schedules: {
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
	phase_tasks: {
		assignment_reason: string | null;
		created_at: string;
		id: string;
		phase_id: string;
		suggested_start_date: string | null;
		task_id: string;
	};
	phases: {
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
	project_brief_template_usage: {
		brief_date: string;
		id: string;
		metadata: Json | null;
		project_id: string | null;
		template_id: string | null;
		used_at: string | null;
		user_id: string | null;
	};
	project_brief_templates: {
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
	project_calendars: {
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
		sync_status: string | null;
		updated_at: string | null;
		user_id: string;
		visibility: string | null;
	};
	project_daily_briefs: {
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
	project_phases_generation: {
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
	project_questions: {
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
	project_synthesis: {
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
	projects: {
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
		source: string | null;
		source_metadata: Json | null;
		start_date: string | null;
		status: string;
		tags: string[] | null;
		updated_at: string;
		user_id: string;
	};
	projects_history: {
		created_at: string | null;
		created_by: string | null;
		history_id: string;
		is_first_version: boolean | null;
		project_data: Json;
		project_id: string;
		version_number: number;
	};
	push_subscriptions: {
		auth_key: string;
		created_at: string | null;
		endpoint: string;
		id: string;
		is_active: boolean | null;
		last_used_at: string | null;
		p256dh_key: string;
		user_agent: string | null;
		user_id: string;
	};
	question_metrics: {
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
	question_templates: {
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
	queue_jobs: {
		attempts: number | null;
		completed_at: string | null;
		created_at: string;
		error_message: string | null;
		id: string;
		job_type: string;
		max_attempts: number | null;
		metadata: Json | null;
		priority: number | null;
		processed_at: string | null;
		queue_job_id: string;
		result: Json | null;
		scheduled_for: string;
		started_at: string | null;
		status: string;
		updated_at: string | null;
		user_id: string;
	};
	recurring_task_instances: {
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
	recurring_task_migration_log: {
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
	scheduled_sms_messages: {
		calendar_event_id: string | null;
		cancelled_at: string | null;
		created_at: string | null;
		event_details: Json | null;
		event_end: string | null;
		event_start: string | null;
		event_title: string | null;
		generated_via: string | null;
		generation_cost_usd: number | null;
		id: string;
		last_error: string | null;
		llm_model: string | null;
		max_send_attempts: number | null;
		message_content: string;
		message_type: string;
		scheduled_for: string;
		send_attempts: number | null;
		sent_at: string | null;
		sms_message_id: string | null;
		status: string;
		timezone: string;
		twilio_sid: string | null;
		updated_at: string | null;
		user_id: string;
	};
	sms_messages: {
		attempt_count: number | null;
		created_at: string | null;
		delivered_at: string | null;
		id: string;
		max_attempts: number | null;
		message_content: string;
		metadata: Json | null;
		next_retry_at: string | null;
		notification_delivery_id: string | null;
		phone_number: string;
		priority: string;
		project_id: string | null;
		queue_job_id: string | null;
		scheduled_for: string | null;
		sent_at: string | null;
		status: string;
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
	sms_templates: {
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
	subscription_plans: {
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
	system_metrics: {
		id: string;
		metric_description: string | null;
		metric_name: string;
		metric_unit: string | null;
		metric_value: number;
		recorded_at: string | null;
	};
	task_calendar_events: {
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
		sync_status: string;
		sync_version: number | null;
		task_id: string;
		updated_at: string | null;
		user_id: string;
	};
	tasks: {
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
		priority: string;
		project_id: string | null;
		recurrence_end_source: string | null;
		recurrence_ends: string | null;
		recurrence_pattern: string | null;
		source: string | null;
		source_calendar_event_id: string | null;
		start_date: string | null;
		status: string;
		task_steps: string | null;
		task_type: string;
		title: string;
		updated_at: string;
		user_id: string;
	};
	trial_reminders: {
		created_at: string | null;
		id: string;
		reminder_type: string;
		sent_at: string | null;
		user_id: string;
	};
	user_activity_logs: {
		activity_data: Json | null;
		activity_type: string;
		created_at: string;
		id: string;
		ip_address: unknown | null;
		user_agent: string | null;
		user_id: string | null;
	};
	user_brief_preferences: {
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
	user_calendar_preferences: {
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
	user_calendar_tokens: {
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
	user_context: {
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
		onboarding_version: number | null;
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
	user_discounts: {
		applied_at: string | null;
		discount_code_id: string;
		expires_at: string | null;
		id: string;
		stripe_subscription_id: string | null;
		user_id: string;
	};
	user_notification_preferences: {
		batch_enabled: boolean | null;
		batch_interval_minutes: number | null;
		created_at: string | null;
		email_enabled: boolean | null;
		event_type: string;
		id: string;
		in_app_enabled: boolean | null;
		max_per_day: number | null;
		max_per_hour: number | null;
		priority: string | null;
		push_enabled: boolean | null;
		quiet_hours_enabled: boolean | null;
		quiet_hours_end: string | null;
		quiet_hours_start: string | null;
		sms_enabled: boolean | null;
		timezone: string | null;
		updated_at: string | null;
		user_id: string;
	};
	user_notifications: {
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
	user_sms_preferences: {
		created_at: string | null;
		daily_brief_sms: boolean | null;
		daily_count_reset_at: string | null;
		daily_sms_count: number | null;
		daily_sms_limit: number | null;
		evening_recap_enabled: boolean | null;
		event_reminders_enabled: boolean | null;
		id: string;
		morning_kickoff_enabled: boolean | null;
		morning_kickoff_time: string | null;
		next_up_enabled: boolean | null;
		opt_out_reason: string | null;
		opted_out: boolean | null;
		opted_out_at: string | null;
		phone_number: string | null;
		phone_verified: boolean | null;
		phone_verified_at: string | null;
		quiet_hours_end: string | null;
		quiet_hours_start: string | null;
		reminder_lead_time_minutes: number | null;
		task_reminders: boolean | null;
		timezone: string | null;
		updated_at: string | null;
		urgent_alerts: boolean | null;
		user_id: string;
	};
	users: {
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
		onboarding_v2_completed_at: string | null;
		onboarding_v2_skipped_calendar: boolean | null;
		onboarding_v2_skipped_sms: boolean | null;
		productivity_challenges: Json | null;
		stripe_customer_id: string | null;
		subscription_plan_id: string | null;
		subscription_status: string | null;
		trial_ends_at: string | null;
		updated_at: string;
		usage_archetype: string | null;
	};
	visitors: {
		created_at: string;
		id: number;
		ip_address: unknown | null;
		updated_at: string;
		user_agent: string | null;
		visitor_id: string;
	};
	webhook_events: {
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
};

export const tableNames = [
	'admin_analytics',
	'admin_users',
	'api_keys',
	'beta_event_attendance',
	'beta_events',
	'beta_feature_votes',
	'beta_feedback',
	'beta_members',
	'beta_signups',
	'brain_dump_links',
	'brain_dumps',
	'calendar_analyses',
	'calendar_analysis_events',
	'calendar_analysis_preferences',
	'calendar_project_suggestions',
	'calendar_themes',
	'calendar_webhook_channels',
	'cron_logs',
	'customer_subscriptions',
	'daily_briefs',
	'discount_codes',
	'email_attachments',
	'email_logs',
	'email_recipients',
	'email_tracking_events',
	'emails',
	'error_logs',
	'failed_payments',
	'feedback',
	'feedback_rate_limit',
	'generated_phase_tasks',
	'generated_phases',
	'invoices',
	'llm_prompts',
	'llm_usage_logs',
	'llm_usage_summary',
	'notes',
	'notification_deliveries',
	'notification_events',
	'notification_subscriptions',
	'notification_tracking_links',
	'payment_methods',
	'phase_task_schedules',
	'phase_tasks',
	'phases',
	'project_brief_template_usage',
	'project_brief_templates',
	'project_calendars',
	'project_daily_briefs',
	'project_phases_generation',
	'project_questions',
	'project_synthesis',
	'projects',
	'projects_history',
	'push_subscriptions',
	'question_metrics',
	'question_templates',
	'queue_jobs',
	'recurring_task_instances',
	'recurring_task_migration_log',
	'scheduled_sms_messages',
	'sms_messages',
	'sms_templates',
	'subscription_plans',
	'system_metrics',
	'task_calendar_events',
	'tasks',
	'trial_reminders',
	'user_activity_logs',
	'user_brief_preferences',
	'user_calendar_preferences',
	'user_calendar_tokens',
	'user_context',
	'user_discounts',
	'user_notification_preferences',
	'user_notifications',
	'user_sms_preferences',
	'users',
	'visitors',
	'webhook_events'
] as const;
