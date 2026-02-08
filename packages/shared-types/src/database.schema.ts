// packages/shared-types/src/database.schema.ts
// Generated on: 2026-02-08T04:27:58.781Z

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
	agent_chat_messages: {
		agent_session_id: string;
		content: string;
		created_at: string;
		id: string;
		model_used: string | null;
		parent_user_session_id: string;
		role: string;
		sender_agent_id: string | null;
		sender_type: string;
		tokens_used: number | null;
		tool_call_id: string | null;
		tool_calls: Json | null;
		user_id: string;
	};
	agent_chat_sessions: {
		completed_at: string | null;
		context_type: string | null;
		created_at: string;
		entity_id: string | null;
		executor_agent_id: string | null;
		id: string;
		initial_context: Json;
		message_count: number;
		parent_session_id: string;
		plan_id: string | null;
		planner_agent_id: string;
		session_type: string;
		status: string;
		step_number: number | null;
		user_id: string;
	};
	agent_executions: {
		agent_session_id: string;
		completed_at: string | null;
		created_at: string;
		duration_ms: number | null;
		error: string | null;
		executor_agent_id: string;
		id: string;
		message_count: number | null;
		plan_id: string;
		result: Json | null;
		status: string;
		step_number: number;
		success: boolean;
		task: Json;
		tokens_used: number | null;
		tool_calls_made: number | null;
		tools_available: Json;
		user_id: string;
	};
	agent_plans: {
		completed_at: string | null;
		created_at: string;
		id: string;
		metadata: Json | null;
		planner_agent_id: string;
		session_id: string;
		status: string;
		steps: Json;
		strategy: string;
		updated_at: string;
		user_id: string;
		user_message: string;
	};
	agents: {
		available_tools: Json | null;
		completed_at: string | null;
		created_at: string;
		created_for_plan: string | null;
		created_for_session: string;
		id: string;
		model_preference: string;
		name: string;
		permissions: string;
		status: string;
		system_prompt: string;
		type: string;
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
		ip_address: unknown;
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
	chat_compressions: {
		compressed_message_count: number;
		compressed_tokens: number;
		compression_ratio: number | null;
		created_at: string | null;
		first_message_id: string | null;
		id: string;
		key_points: Json | null;
		last_message_id: string | null;
		original_message_count: number;
		original_tokens: number;
		session_id: string;
		summary: string;
		tool_usage_summary: Json | null;
	};
	chat_context_cache: {
		abbreviated_context: Json;
		abbreviated_tokens: number;
		access_count: number | null;
		accessed_at: string | null;
		cache_key: string | null;
		context_type: string;
		created_at: string | null;
		entity_id: string | null;
		expires_at: string;
		full_context_available: boolean | null;
		full_tokens_estimate: number | null;
		id: string;
		metadata: Json | null;
		related_entity_ids: string[] | null;
		user_id: string;
	};
	chat_messages: {
		completion_tokens: number | null;
		content: string;
		created_at: string | null;
		error_code: string | null;
		error_message: string | null;
		id: string;
		message_type: string | null;
		metadata: Json | null;
		operation_ids: string[] | null;
		prompt_tokens: number | null;
		role: string;
		session_id: string;
		tool_call_id: string | null;
		tool_calls: Json | null;
		tool_name: string | null;
		tool_result: Json | null;
		total_tokens: number | null;
		user_id: string;
	};
	chat_operations: {
		after_data: Json | null;
		batch_id: string | null;
		before_data: Json | null;
		chat_session_id: string;
		conditions: Json | null;
		created_at: string | null;
		data: Json;
		duration_ms: number | null;
		enabled: boolean | null;
		entity_id: string | null;
		error_message: string | null;
		executed_at: string | null;
		id: string;
		operation_type: string;
		reasoning: string | null;
		ref: string | null;
		result: Json | null;
		search_query: string | null;
		sequence_number: number | null;
		status: string | null;
		table_name: string;
		user_id: string;
	};
	chat_sessions: {
		agent_metadata: Json | null;
		archived_at: string | null;
		auto_accept_operations: boolean | null;
		auto_title: string | null;
		chat_topics: string[] | null;
		chat_type: string | null;
		compressed_at: string | null;
		context_type: string;
		created_at: string | null;
		entity_id: string | null;
		id: string;
		last_classified_at: string | null;
		last_message_at: string | null;
		message_count: number | null;
		preferences: Json | null;
		status: string;
		summary: string | null;
		title: string | null;
		tool_call_count: number | null;
		total_tokens_used: number | null;
		updated_at: string | null;
		user_id: string;
	};
	chat_sessions_daily_briefs: {
		chat_session_id: string;
		daily_brief_id: string;
		id: string;
		linked_at: string | null;
	};
	chat_sessions_projects: {
		chat_session_id: string;
		id: string;
		linked_at: string | null;
		project_id: string;
	};
	chat_sessions_tasks: {
		chat_session_id: string;
		id: string;
		linked_at: string | null;
		task_id: string;
	};
	chat_tool_executions: {
		arguments: Json;
		created_at: string | null;
		error_message: string | null;
		execution_time_ms: number | null;
		id: string;
		message_id: string | null;
		requires_user_action: boolean | null;
		result: Json | null;
		session_id: string;
		success: boolean;
		tokens_consumed: number | null;
		tool_category: string | null;
		tool_name: string;
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
	draft_tasks: {
		completed_at: string | null;
		created_at: string | null;
		deleted_at: string | null;
		dependencies: string[] | null;
		description: string | null;
		details: string | null;
		draft_project_id: string;
		duration_minutes: number | null;
		finalized_task_id: string | null;
		id: string;
		outdated: boolean | null;
		parent_task_id: string | null;
		priority: string | null;
		recurrence_end_source: string | null;
		recurrence_ends: string | null;
		recurrence_pattern: string | null;
		source: string | null;
		source_calendar_event_id: string | null;
		start_date: string | null;
		status: string | null;
		task_steps: Json | null;
		task_type: string | null;
		title: string;
		updated_at: string | null;
		user_id: string;
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
		ip_address: unknown;
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
		ip_address: unknown;
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
	feature_flags: {
		created_at: string;
		enabled: boolean;
		enabled_at: string | null;
		feature_name: string;
		id: string;
		updated_at: string;
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
		user_ip: unknown;
	};
	feedback_rate_limit: {
		first_submission: string | null;
		id: string;
		ip_address: unknown;
		is_blocked: boolean | null;
		last_submission: string | null;
		submission_count: number | null;
	};
	homework_run_events: {
		created_at: string;
		event: Json;
		id: string;
		iteration: number;
		run_id: string;
		seq: number;
	};
	homework_run_iterations: {
		artifacts: Json | null;
		branch_id: string | null;
		created_at: string;
		ended_at: string | null;
		error: string | null;
		error_fingerprint: string | null;
		id: string;
		iteration: number;
		metrics: Json;
		progress_delta: Json | null;
		run_id: string;
		started_at: string | null;
		status: string;
		summary: string | null;
	};
	homework_runs: {
		budgets: Json;
		chat_session_id: string | null;
		completed_at: string | null;
		completion_criteria: Json | null;
		created_at: string;
		duration_ms: number | null;
		id: string;
		iteration: number;
		last_error_fingerprint: string | null;
		max_iterations: number | null;
		metrics: Json;
		objective: string;
		project_ids: string[] | null;
		report: Json | null;
		scope: string;
		started_at: string | null;
		status: string;
		stop_reason: Json | null;
		updated_at: string;
		user_id: string;
		workspace_document_id: string | null;
		workspace_project_id: string | null;
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
	legacy_entity_mappings: {
		checksum: string | null;
		id: number;
		legacy_id: string;
		legacy_table: string;
		metadata: Json;
		migrated_at: string;
		onto_id: string;
		onto_table: string;
	};
	llm_prompts: {
		id: string;
		last_used: string | null;
		prompt_text: string | null;
		purpose: string | null;
		title: string | null;
	};
	llm_usage_logs: {
		agent_execution_id: string | null;
		agent_plan_id: string | null;
		agent_session_id: string | null;
		brain_dump_id: string | null;
		brief_id: string | null;
		chat_session_id: string | null;
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
	migration_log: {
		batch_id: string | null;
		created_at: string;
		entity_type: string;
		error_category: string | null;
		error_message: string | null;
		id: number;
		last_retry_at: string | null;
		legacy_id: string | null;
		legacy_table: string | null;
		metadata: Json;
		onto_id: string | null;
		onto_table: string | null;
		operation: string;
		org_id: string | null;
		retry_count: number | null;
		run_id: string;
		status: string;
		updated_at: string;
		user_id: string | null;
	};
	migration_platform_lock: {
		expires_at: string | null;
		id: number;
		locked_at: string | null;
		locked_by: string | null;
		run_id: string | null;
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
		correlation_id: string | null;
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
		correlation_id: string | null;
		created_at: string | null;
		event_source: string;
		event_type: string;
		id: string;
		metadata: Json | null;
		payload: Json;
		target_user_id: string | null;
	};
	notification_logs: {
		correlation_id: string;
		created_at: string;
		error_stack: string | null;
		id: string;
		level: string;
		message: string;
		metadata: Json | null;
		namespace: string | null;
		notification_delivery_id: string | null;
		notification_event_id: string | null;
		request_id: string | null;
		user_id: string | null;
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
	onto_actors: {
		created_at: string;
		email: string | null;
		id: string;
		kind: string;
		metadata: Json;
		name: string;
		org_id: string | null;
		user_id: string | null;
	};
	onto_assignments: {
		actor_id: string;
		created_at: string;
		id: string;
		object_id: string;
		object_kind: string;
		role_key: string;
	};
	onto_braindumps: {
		chat_session_id: string | null;
		content: string;
		created_at: string;
		error_message: string | null;
		id: string;
		metadata: Json | null;
		processed_at: string | null;
		status: string;
		summary: string | null;
		title: string | null;
		topics: string[] | null;
		updated_at: string;
		user_id: string;
	};
	onto_comment_mentions: {
		comment_id: string;
		created_at: string;
		id: string;
		mentioned_user_id: string;
		notification_id: string | null;
	};
	onto_comment_read_states: {
		actor_id: string;
		entity_id: string;
		entity_type: string;
		id: string;
		last_read_at: string;
		last_read_comment_id: string | null;
		project_id: string;
		root_id: string;
		updated_at: string;
	};
	onto_comments: {
		body: string;
		body_format: string;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		edited_at: string | null;
		entity_id: string;
		entity_type: string;
		id: string;
		metadata: Json;
		parent_id: string | null;
		project_id: string;
		root_id: string;
		updated_at: string;
	};
	onto_decisions: {
		created_at: string;
		created_by: string;
		decision_at: string | null;
		deleted_at: string | null;
		description: string | null;
		id: string;
		outcome: string | null;
		project_id: string;
		props: Json;
		rationale: string | null;
		search_vector: unknown;
		state_key: string;
		title: string;
		type_key: string;
		updated_at: string | null;
	};
	onto_document_versions: {
		created_at: string;
		created_by: string;
		document_id: string;
		embedding: string | null;
		id: string;
		number: number;
		props: Json;
		storage_uri: string;
	};
	onto_documents: {
		children: Json | null;
		content: string | null;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		id: string;
		project_id: string;
		props: Json;
		search_vector: unknown;
		state_key: string;
		title: string;
		type_key: string;
		updated_at: string;
	};
	onto_edges: {
		created_at: string;
		dst_id: string;
		dst_kind: string;
		id: string;
		project_id: string;
		props: Json;
		rel: string;
		src_id: string;
		src_kind: string;
	};
	onto_event_sync: {
		calendar_id: string;
		created_at: string;
		event_id: string;
		external_event_id: string;
		id: string;
		last_synced_at: string | null;
		provider: string;
		sync_error: string | null;
		sync_status: string;
		sync_token: string | null;
		updated_at: string;
	};
	onto_events: {
		all_day: boolean;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		end_at: string | null;
		external_link: string | null;
		facet_context: string | null;
		facet_scale: string | null;
		facet_stage: string | null;
		id: string;
		last_synced_at: string | null;
		location: string | null;
		org_id: string | null;
		owner_entity_id: string | null;
		owner_entity_type: string;
		project_id: string | null;
		props: Json;
		recurrence: Json;
		start_at: string;
		state_key: string;
		sync_error: string | null;
		sync_status: string;
		timezone: string | null;
		title: string;
		type_key: string;
		updated_at: string;
	};
	onto_facet_definitions: {
		allowed_values: Json;
		applies_to: string[];
		created_at: string;
		description: string | null;
		is_multi_value: boolean | null;
		is_required: boolean | null;
		key: string;
		name: string;
	};
	onto_facet_values: {
		color: string | null;
		created_at: string;
		description: string | null;
		facet_key: string;
		icon: string | null;
		id: string;
		label: string;
		parent_value_id: string | null;
		sort_order: number | null;
		value: string;
	};
	onto_goals: {
		completed_at: string | null;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		goal: string | null;
		id: string;
		name: string;
		project_id: string;
		props: Json;
		search_vector: unknown;
		state_key: string;
		target_date: string | null;
		type_key: string | null;
		updated_at: string | null;
	};
	onto_insights: {
		created_at: string;
		derived_from_signal_id: string | null;
		id: string;
		project_id: string;
		props: Json;
		title: string;
	};
	onto_metric_points: {
		created_at: string;
		id: string;
		metric_id: string;
		numeric_value: number;
		props: Json;
		ts: string;
	};
	onto_metrics: {
		created_at: string;
		created_by: string;
		definition: string | null;
		id: string;
		name: string;
		project_id: string;
		props: Json;
		type_key: string | null;
		unit: string;
	};
	onto_milestones: {
		completed_at: string | null;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		due_at: string | null;
		id: string;
		milestone: string | null;
		project_id: string;
		props: Json;
		search_vector: unknown;
		state_key: string;
		title: string;
		type_key: string | null;
		updated_at: string | null;
	};
	onto_permissions: {
		access: string;
		actor_id: string | null;
		created_at: string;
		id: string;
		object_id: string;
		object_kind: string;
		role_key: string | null;
	};
	onto_plans: {
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		facet_context: string | null;
		facet_scale: string | null;
		facet_stage: string | null;
		id: string;
		name: string;
		plan: string | null;
		project_id: string;
		props: Json;
		search_vector: unknown;
		state_key: string;
		type_key: string;
		updated_at: string;
	};
	onto_project_invites: {
		accepted_at: string | null;
		accepted_by_actor_id: string | null;
		access: string;
		created_at: string;
		expires_at: string;
		id: string;
		invited_by_actor_id: string | null;
		invitee_email: string;
		project_id: string;
		role_key: string;
		status: string;
		token_hash: string;
	};
	onto_project_logs: {
		action: string;
		after_data: Json | null;
		before_data: Json | null;
		change_source: string | null;
		changed_by: string;
		changed_by_actor_id: string | null;
		chat_session_id: string | null;
		created_at: string;
		entity_id: string;
		entity_type: string;
		id: string;
		project_id: string;
	};
	onto_project_members: {
		access: string;
		actor_id: string;
		added_by_actor_id: string | null;
		created_at: string;
		id: string;
		project_id: string;
		removed_at: string | null;
		removed_by_actor_id: string | null;
		role_key: string;
	};
	onto_project_structure_history: {
		change_type: string;
		changed_at: string | null;
		changed_by: string | null;
		doc_structure: Json;
		id: string;
		project_id: string;
		version: number;
	};
	onto_projects: {
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		doc_structure: Json | null;
		end_at: string | null;
		facet_context: string | null;
		facet_scale: string | null;
		facet_stage: string | null;
		id: string;
		is_public: boolean | null;
		name: string;
		next_step_long: string | null;
		next_step_short: string | null;
		next_step_source: string | null;
		next_step_updated_at: string | null;
		org_id: string | null;
		props: Json;
		start_at: string | null;
		state_key: string;
		type_key: string;
		updated_at: string;
	};
	onto_requirements: {
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		id: string;
		priority: number | null;
		project_id: string;
		props: Json;
		search_vector: unknown;
		text: string;
		type_key: string;
		updated_at: string | null;
	};
	onto_risks: {
		content: string | null;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		id: string;
		impact: string;
		mitigated_at: string | null;
		probability: number | null;
		project_id: string;
		props: Json;
		search_vector: unknown;
		state_key: string;
		title: string;
		type_key: string | null;
		updated_at: string | null;
	};
	onto_signals: {
		channel: string;
		created_at: string;
		id: string;
		payload: Json;
		project_id: string;
		ts: string;
	};
	onto_sources: {
		captured_at: string | null;
		created_at: string;
		created_by: string;
		id: string;
		project_id: string;
		props: Json;
		snapshot_uri: string | null;
		uri: string;
	};
	onto_tasks: {
		completed_at: string | null;
		created_at: string;
		created_by: string;
		deleted_at: string | null;
		description: string | null;
		due_at: string | null;
		facet_scale: string | null;
		id: string;
		priority: number | null;
		project_id: string;
		props: Json;
		search_vector: unknown;
		start_at: string | null;
		state_key: string;
		title: string;
		type_key: string;
		updated_at: string;
	};
	onto_tools: {
		capability_key: string;
		config: Json;
		created_at: string;
		id: string;
		name: string;
	};
	ontology_brief_entities: {
		created_at: string;
		daily_brief_id: string;
		entity_id: string;
		entity_kind: string;
		id: string;
		project_id: string | null;
		role: string | null;
	};
	ontology_daily_briefs: {
		actor_id: string;
		brief_date: string;
		created_at: string;
		executive_summary: string;
		generation_completed_at: string | null;
		generation_error: string | null;
		generation_started_at: string | null;
		generation_status: string;
		id: string;
		llm_analysis: string | null;
		metadata: Json;
		priority_actions: string[] | null;
		updated_at: string;
		user_id: string;
	};
	ontology_project_briefs: {
		brief_content: string;
		created_at: string;
		daily_brief_id: string;
		id: string;
		metadata: Json;
		project_id: string;
		updated_at: string;
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
	phase_tasks: {
		assignment_reason: string | null;
		created_at: string;
		id: string;
		order: number;
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
	project_context_snapshot: {
		compute_ms: number | null;
		computed_at: string;
		created_at: string;
		project_id: string;
		snapshot: Json;
		snapshot_version: number;
		source_updated_at: string | null;
		updated_at: string;
	};
	project_context_snapshot_metrics: {
		computed_at: string;
		duration_ms: number | null;
		error_message: string | null;
		id: string;
		project_id: string;
		queue_job_id: string | null;
		snapshot_version: number;
		status: string;
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
	project_drafts: {
		calendar_color_id: string | null;
		calendar_settings: Json | null;
		calendar_sync_enabled: boolean | null;
		chat_session_id: string | null;
		completed_at: string | null;
		context: string | null;
		core_goals_momentum: string | null;
		core_harmony_integration: string | null;
		core_integrity_ideals: string | null;
		core_meaning_identity: string | null;
		core_opportunity_freedom: string | null;
		core_people_bonds: string | null;
		core_power_resources: string | null;
		core_reality_understanding: string | null;
		core_trust_safeguards: string | null;
		created_at: string | null;
		description: string | null;
		dimensions_covered: string[] | null;
		end_date: string | null;
		executive_summary: string | null;
		finalized_project_id: string | null;
		id: string;
		name: string | null;
		question_count: number | null;
		slug: string | null;
		source: string | null;
		source_metadata: Json | null;
		start_date: string | null;
		status: string | null;
		tags: string[] | null;
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
		core_context_descriptions: Json | null;
		core_goals_momentum: string | null;
		core_harmony_integration: string | null;
		core_integrity_ideals: string | null;
		core_meaning_identity: string | null;
		core_opportunity_freedom: string | null;
		core_people_bonds: string | null;
		core_power_resources: string | null;
		core_reality_understanding: string | null;
		core_trust_safeguards: string | null;
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
		dedup_key: string | null;
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
	research_artifact_refs: {
		created_at: string;
		id: string;
		importance: number | null;
		ref: Json;
		ref_type: string;
		session_id: string;
		snippet: string | null;
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
	security_logs: {
		content: string;
		created_at: string;
		event_type: string;
		id: string;
		ip_address: string | null;
		llm_validation: Json | null;
		metadata: Json | null;
		regex_patterns: Json | null;
		user_agent: string | null;
		user_id: string;
		was_blocked: boolean;
	};
	sms_alert_history: {
		alert_type: string;
		id: string;
		metadata: Json | null;
		metric_value: number;
		notification_error: string | null;
		notification_sent: boolean;
		resolved_at: string | null;
		severity: string;
		threshold_value: number;
		triggered_at: string;
	};
	sms_alert_thresholds: {
		alert_type: string;
		cooldown_minutes: number;
		created_at: string;
		id: string;
		is_enabled: boolean;
		last_triggered_at: string | null;
		notification_channels: string[];
		severity: string;
		threshold_value: number;
		updated_at: string;
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
	sms_metrics: {
		created_at: string;
		id: string;
		metadata: Json | null;
		metric_date: string;
		metric_hour: number | null;
		metric_type: string;
		metric_value: number;
		updated_at: string;
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
		attendees: Json | null;
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
		organizer_display_name: string | null;
		organizer_email: string | null;
		organizer_self: boolean | null;
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
	time_blocks: {
		ai_suggestions: Json | null;
		block_type: string;
		calendar_event_id: string | null;
		calendar_event_link: string | null;
		created_at: string;
		duration_minutes: number;
		end_time: string;
		id: string;
		last_synced_at: string | null;
		project_id: string | null;
		start_time: string;
		suggestions_generated_at: string | null;
		suggestions_model: string | null;
		suggestions_state: Json | null;
		suggestions_summary: string | null;
		sync_source: string | null;
		sync_status: string;
		timezone: string;
		updated_at: string;
		user_id: string;
	};
	timing_metrics: {
		agent_plan_id: string | null;
		clarification_ms: number | null;
		context_build_ms: number | null;
		context_type: string | null;
		created_at: string;
		first_event_at: string | null;
		first_response_at: string | null;
		id: string;
		message_length: number | null;
		message_received_at: string;
		metadata: Json;
		plan_completed_at: string | null;
		plan_created_at: string | null;
		plan_creation_ms: number | null;
		plan_execution_ms: number | null;
		plan_execution_started_at: string | null;
		plan_status: string | null;
		plan_step_count: number | null;
		planner_agent_id: string | null;
		session_id: string | null;
		time_to_first_event_ms: number | null;
		time_to_first_response_ms: number | null;
		tool_selection_ms: number | null;
		updated_at: string;
		user_id: string;
	};
	tree_agent_artifacts: {
		artifact_type: string;
		created_at: string;
		document_id: string | null;
		id: string;
		is_primary: boolean;
		json_payload: Json | null;
		label: string;
		node_id: string;
		run_id: string;
	};
	tree_agent_events: {
		created_at: string;
		event_type: string;
		id: string;
		node_id: string;
		payload: Json;
		run_id: string;
		seq: number | null;
	};
	tree_agent_nodes: {
		band_index: number;
		context: Json;
		created_at: string;
		depth: number;
		ended_at: string | null;
		id: string;
		parent_node_id: string | null;
		reason: string;
		result: Json | null;
		role_state: string;
		run_id: string;
		scratchpad_doc_id: string | null;
		started_at: string | null;
		status: string;
		step_index: number;
		success_criteria: Json;
		title: string;
		updated_at: string;
	};
	tree_agent_plans: {
		created_at: string;
		id: string;
		node_id: string;
		plan_json: Json;
		run_id: string;
		version: number;
	};
	tree_agent_runs: {
		budgets: Json;
		completed_at: string | null;
		created_at: string;
		id: string;
		metrics: Json;
		objective: string;
		root_node_id: string | null;
		started_at: string | null;
		status: string;
		updated_at: string;
		user_id: string;
		workspace_project_id: string | null;
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
		ip_address: unknown;
		user_agent: string | null;
		user_id: string | null;
	};
	user_brief_preferences: {
		created_at: string;
		day_of_week: number | null;
		frequency: string | null;
		id: string;
		is_active: boolean | null;
		time_of_day: string | null;
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
		show_events: boolean;
		show_task_due: boolean;
		show_task_scheduled: boolean;
		show_task_start: boolean;
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
		batch_enabled: boolean;
		batch_interval_minutes: number | null;
		created_at: string;
		email_enabled: boolean;
		id: string;
		in_app_enabled: boolean;
		max_per_day: number | null;
		max_per_hour: number | null;
		priority: string;
		push_enabled: boolean;
		quiet_hours_enabled: boolean;
		quiet_hours_end: string | null;
		quiet_hours_start: string | null;
		should_email_daily_brief: boolean;
		should_sms_daily_brief: boolean;
		sms_enabled: boolean;
		updated_at: string;
		user_id: string;
	};
	user_notification_preferences_backup: {
		batch_enabled: boolean | null;
		batch_interval_minutes: number | null;
		created_at: string | null;
		email_enabled: boolean | null;
		event_type: string | null;
		id: string | null;
		in_app_enabled: boolean | null;
		max_per_day: number | null;
		max_per_hour: number | null;
		priority: string | null;
		push_enabled: boolean | null;
		quiet_hours_enabled: boolean | null;
		quiet_hours_end: string | null;
		quiet_hours_start: string | null;
		should_email_daily_brief: boolean | null;
		should_sms_daily_brief: boolean | null;
		sms_enabled: boolean | null;
		updated_at: string | null;
		user_id: string | null;
	};
	user_notifications: {
		action_url: string | null;
		created_at: string | null;
		data: Json | null;
		delivery_id: string | null;
		dismissed_at: string | null;
		event_id: string | null;
		event_type: string | null;
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
		daily_count_reset_at: string | null;
		daily_sms_count: number | null;
		daily_sms_limit: number | null;
		evening_recap_enabled: boolean | null;
		event_reminder_lead_time_minutes: number | null;
		event_reminders_enabled: boolean | null;
		id: string;
		morning_kickoff_enabled: boolean | null;
		morning_kickoff_time: string | null;
		opt_out_reason: string | null;
		opted_out: boolean | null;
		opted_out_at: string | null;
		phone_number: string | null;
		phone_verified: boolean | null;
		phone_verified_at: string | null;
		quiet_hours_end: string | null;
		quiet_hours_start: string | null;
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
		preferences: Json | null;
		productivity_challenges: Json | null;
		stripe_customer_id: string | null;
		subscription_plan_id: string | null;
		subscription_status: string | null;
		timezone: string;
		trial_ends_at: string | null;
		updated_at: string;
		usage_archetype: string | null;
	};
	visitors: {
		created_at: string;
		id: number;
		ip_address: unknown;
		updated_at: string;
		user_agent: string | null;
		visitor_id: string;
	};
	voice_note_groups: {
		chat_session_id: string | null;
		created_at: string;
		deleted_at: string | null;
		id: string;
		linked_entity_id: string | null;
		linked_entity_type: string | null;
		metadata: Json;
		status: string;
		updated_at: string;
		user_id: string;
	};
	voice_notes: {
		created_at: string;
		deleted_at: string | null;
		duration_seconds: number | null;
		file_size_bytes: number;
		group_id: string | null;
		id: string;
		linked_entity_id: string | null;
		linked_entity_type: string | null;
		metadata: Json;
		mime_type: string;
		recorded_at: string | null;
		segment_index: number | null;
		storage_bucket: string;
		storage_path: string;
		transcript: string | null;
		transcription_error: string | null;
		transcription_model: string | null;
		transcription_status: string;
		updated_at: string;
		user_id: string;
	};
	web_page_visits: {
		bytes: number | null;
		canonical_url: string | null;
		content_hash: string | null;
		content_type: string | null;
		created_at: string;
		error_message: string | null;
		excerpt: string | null;
		final_url: string;
		first_visited_at: string;
		id: string;
		last_fetch_ms: number | null;
		last_llm_model: string | null;
		last_llm_ms: number | null;
		last_visited_at: string;
		llm_completion_tokens: number | null;
		llm_prompt_tokens: number | null;
		llm_total_tokens: number | null;
		markdown: string | null;
		meta: Json | null;
		normalized_url: string;
		status_code: number;
		title: string | null;
		updated_at: string;
		url: string;
		visit_count: number;
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
	'agent_chat_messages',
	'agent_chat_sessions',
	'agent_executions',
	'agent_plans',
	'agents',
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
	'chat_compressions',
	'chat_context_cache',
	'chat_messages',
	'chat_operations',
	'chat_sessions',
	'chat_sessions_daily_briefs',
	'chat_sessions_projects',
	'chat_sessions_tasks',
	'chat_tool_executions',
	'cron_logs',
	'customer_subscriptions',
	'daily_briefs',
	'discount_codes',
	'draft_tasks',
	'email_attachments',
	'email_logs',
	'email_recipients',
	'email_tracking_events',
	'emails',
	'error_logs',
	'failed_payments',
	'feature_flags',
	'feedback',
	'feedback_rate_limit',
	'homework_run_events',
	'homework_run_iterations',
	'homework_runs',
	'invoices',
	'legacy_entity_mappings',
	'llm_prompts',
	'llm_usage_logs',
	'llm_usage_summary',
	'migration_log',
	'migration_platform_lock',
	'notes',
	'notification_deliveries',
	'notification_events',
	'notification_logs',
	'notification_subscriptions',
	'notification_tracking_links',
	'onto_actors',
	'onto_assignments',
	'onto_braindumps',
	'onto_comment_mentions',
	'onto_comment_read_states',
	'onto_comments',
	'onto_decisions',
	'onto_document_versions',
	'onto_documents',
	'onto_edges',
	'onto_event_sync',
	'onto_events',
	'onto_facet_definitions',
	'onto_facet_values',
	'onto_goals',
	'onto_insights',
	'onto_metric_points',
	'onto_metrics',
	'onto_milestones',
	'onto_permissions',
	'onto_plans',
	'onto_project_invites',
	'onto_project_logs',
	'onto_project_members',
	'onto_project_structure_history',
	'onto_projects',
	'onto_requirements',
	'onto_risks',
	'onto_signals',
	'onto_sources',
	'onto_tasks',
	'onto_tools',
	'ontology_brief_entities',
	'ontology_daily_briefs',
	'ontology_project_briefs',
	'payment_methods',
	'phase_tasks',
	'phases',
	'project_brief_templates',
	'project_calendars',
	'project_context_snapshot',
	'project_context_snapshot_metrics',
	'project_daily_briefs',
	'project_drafts',
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
	'research_artifact_refs',
	'scheduled_sms_messages',
	'security_logs',
	'sms_alert_history',
	'sms_alert_thresholds',
	'sms_messages',
	'sms_metrics',
	'sms_templates',
	'subscription_plans',
	'system_metrics',
	'task_calendar_events',
	'tasks',
	'time_blocks',
	'timing_metrics',
	'tree_agent_artifacts',
	'tree_agent_events',
	'tree_agent_nodes',
	'tree_agent_plans',
	'tree_agent_runs',
	'trial_reminders',
	'user_activity_logs',
	'user_brief_preferences',
	'user_calendar_preferences',
	'user_calendar_tokens',
	'user_context',
	'user_discounts',
	'user_notification_preferences',
	'user_notification_preferences_backup',
	'user_notifications',
	'user_sms_preferences',
	'users',
	'visitors',
	'voice_note_groups',
	'voice_notes',
	'web_page_visits',
	'webhook_events'
] as const;
