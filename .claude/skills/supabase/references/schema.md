# BuildOS Database Schema Reference

Complete column listing for all 240 tables, grouped by domain.

**Source:** `packages/shared-types/src/database.schema.ts`
**Schema generated:** 2026-08-18T15:56:07.260Z

GENERATED FILE — do not edit by hand. Regenerate with `pnpm gen:schema`
(script: `scripts/generate-supabase-skill-schema.ts`).

Types are TypeScript shapes from the generated schema; `?` = nullable.
For enum values, constraints, and RLS, check migrations in `supabase/migrations/`.

## Table of Contents

- [Users & Auth](#users--auth) (6 tables)
- [People & Contacts](#people--contacts) (6 tables)
- [Ontology System](#ontology-system) (39 tables)
- [Projects & Tasks (Legacy)](#projects--tasks-legacy) (21 tables)
- [Chat & Agents](#chat--agents) (33 tables)
- [Calendar](#calendar) (13 tables)
- [Notifications](#notifications) (7 tables)
- [SMS & Twilio](#sms--twilio) (7 tables)
- [Email](#email) (28 tables)
- [Billing](#billing) (14 tables)
- [Beta Program](#beta-program) (6 tables)
- [Queue & Jobs](#queue--jobs) (2 tables)
- [Daily Briefs](#daily-briefs) (5 tables)
- [Monitoring & Analytics](#monitoring--analytics) (10 tables)
- [Web & Webhooks](#web--webhooks) (4 tables)
- [Other](#other) (39 tables)

---

## Users & Auth

### account_deletion_requests

attempt_count `number` · billing_cancellation_error `string?` · billing_cancellation_status `string` · billing_subscription_ids `string[]` · completed_at `string?` · created_at `string` · id `string` · last_error `string?` · lease_expires_at `string?` · next_attempt_at `string?` · processing_started_at `string?` · requested_at `string` · scheduled_for `string` · status `string` · updated_at `string` · user_id `string`

### admin_users

created_at `string` · granted_at `string?` · granted_by `string?` · user_id `string`

### user_context

active_projects `string?` · background `string?` · blockers `string?` · collaboration_needs `string?` · communication_style `string?` · created_at `string` · focus_areas `string?` · goals_overview `string?` · habits `string?` · help_priorities `string?` · id `string` · input_challenges `string?` · input_help_focus `string?` · input_projects `string?` · input_work_style `string?` · last_parsed_input_challenges `string?` · last_parsed_input_help_focus `string?` · last_parsed_input_projects `string?` · last_parsed_input_work_style `string?` · onboarding_completed_at `string?` · onboarding_version `number?` · organization_method `string?` · preferred_work_hours `string?` · priorities `string?` · productivity_challenges `string?` · schedule_preferences `string?` · skill_gaps `string?` · tools `string?` · updated_at `string` · user_id `string` · work_style `string?` · workflows `string?`

### user_profiles

actor_id `string?` · created_at `string` · doc_structure `Json` · extraction_enabled `boolean` · id `string` · safe_summary `string?` · summary `string?` · summary_updated_at `string?` · updated_at `string` · user_id `string`

### users

access_restricted `boolean?` · access_restricted_at `string?` · bio `string?` · created_at `string` · deletion_requested_at `string?` · deletion_scheduled_for `string?` · deletion_status `string?` · email `string` · id `string` · is_admin `boolean` · is_beta_user `boolean?` · last_visit `string?` · name `string?` · onboarding_completed_at `string?` · onboarding_intent `string?` · onboarding_stakes `string?` · onboarding_v2_skipped_calendar `boolean?` · onboarding_v2_skipped_sms `boolean?` · preferences `Json?` · productivity_challenges `Json?` · referrer `string?` · signup_source `string?` · stripe_customer_id `string?` · subscription_plan_id `string?` · subscription_status `string?` · timezone `string` · trial_ends_at `string?` · updated_at `string` · usage_archetype `string?` · username `string?` · utm_campaign `string?` · utm_medium `string?` · utm_source `string?` · voice_narration_enabled `boolean`

### visitors

created_at `string` · id `number` · ip_address `unknown` · updated_at `string` · user_agent `string?` · visitor_id `string`

---

## People & Contacts

### user_contact_access_audit

access_type `string` · actor_id `string?` · contact_id `string?` · context_type `string?` · created_at `string` · id `string` · metadata `Json` · reason `string?` · user_id `string`

### user_contact_links

actor_id `string?` · contact_id `string` · created_at `string` · created_by_actor_id `string?` · entity_id `string?` · entity_type `string?` · id `string` · link_type `string` · profile_document_id `string?` · profile_fragment_id `string?` · project_id `string?` · props `Json` · user_id `string`

### user_contact_merge_candidates

created_at `string` · id `string` · observation_id `string?` · primary_contact_id `string` · reason `string` · resolved_at `string?` · resolved_by_actor_id `string?` · score `number` · secondary_contact_id `string` · status `string` · user_id `string`

### user_contact_methods

confidence `number` · contact_id `string` · created_at `string` · deleted_at `string?` · id `string` · is_primary `boolean` · is_verified `boolean` · label `string?` · method_type `string` · sensitivity `string` · updated_at `string` · usage_scope `string` · user_id `string` · value_hash `string` · value_normalized `string` · value_raw `string` · verification_source `string`

### user_contact_observations

confidence `number` · created_at `string` · id `string` · idempotency_key `string` · inference_flags `Json` · proposed_display_name `string?` · proposed_method_hash `string?` · proposed_method_normalized `string?` · proposed_method_type `string?` · proposed_method_value `string?` · relationship_label `string?` · resolved_at `string?` · resolved_contact_id `string?` · session_id `string?` · source_id `string?` · source_type `string` · status `string` · user_id `string`

### user_contacts

confidence `number` · created_at `string` · deleted_at `string?` · display_name `string` · family_name `string?` · first_seen_at `string` · first_seen_source `string` · given_name `string?` · id `string` · last_confirmed_at `string?` · last_seen_at `string` · linked_actor_id `string?` · linked_user_id `string?` · merged_into_contact_id `string?` · nickname `string?` · normalized_name `string?` · notes `string?` · organization `string?` · profile_id `string?` · relationship_label `string?` · search_vector `unknown` · sensitivity `string` · status `string` · title `string?` · updated_at `string` · usage_scope `string` · user_id `string`

---

## Ontology System

### onto_actors

created_at `string` · email `string?` · id `string` · kind `string` · metadata `Json` · name `string` · org_id `string?` · user_id `string?`

### onto_asset_links

asset_id `string` · created_at `string` · created_by `string` · entity_id `string` · entity_kind `string` · id `string` · project_id `string` · props `Json` · role `string`

### onto_assets

alt_text `string?` · caption `string?` · checksum_sha256 `string?` · content_type `string` · created_at `string` · created_by `string` · deleted_at `string?` · extracted_text `string?` · extracted_text_source `string` · extracted_text_updated_at `string?` · extracted_text_updated_by `string?` · extraction_metadata `Json` · extraction_summary `string?` · file_size_bytes `number` · height `number?` · id `string` · kind `string` · metadata `Json` · ocr_completed_at `string?` · ocr_error `string?` · ocr_model `string?` · ocr_started_at `string?` · ocr_status `string` · ocr_version `number` · original_filename `string?` · project_id `string` · search_vector `unknown` · storage_bucket `string` · storage_path `string` · updated_at `string` · width `number?`

### onto_assignments

actor_id `string` · created_at `string` · id `string` · object_id `string` · object_kind `string` · role_key `string`

### onto_braindumps

chat_session_id `string?` · content `string` · created_at `string` · error_message `string?` · id `string` · metadata `Json?` · processed_at `string?` · status `string` · summary `string?` · title `string?` · topics `string[]?` · updated_at `string` · user_id `string`

### onto_comment_mentions

comment_id `string` · created_at `string` · id `string` · mentioned_user_id `string` · notification_id `string?`

### onto_comment_read_states

actor_id `string` · entity_id `string` · entity_type `string` · id `string` · last_read_at `string` · last_read_comment_id `string?` · project_id `string` · root_id `string` · updated_at `string`

### onto_comments

body `string` · body_format `string` · created_at `string` · created_by `string` · deleted_at `string?` · edited_at `string?` · entity_id `string` · entity_type `string` · id `string` · metadata `Json` · parent_id `string?` · project_id `string` · root_id `string` · updated_at `string`

### onto_document_versions

created_at `string` · created_by `string` · document_id `string` · embedding `string?` · id `string` · number `number` · props `Json` · storage_uri `string`

### onto_documents

archived_at `string?` · children `Json?` · content `string?` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · id `string` · outline `Json?` · project_id `string` · props `Json` · search_vector `unknown` · state_key `string` · title `string` · type_key `string` · updated_at `string`

### onto_edges

created_at `string` · dst_id `string` · dst_kind `string` · id `string` · project_id `string` · props `Json` · rel `string` · src_id `string` · src_kind `string`

### onto_event_sync

calendar_id `string?` · calendar_source_id `string?` · created_at `string` · event_id `string` · external_calendar_id `string?` · external_event_id `string` · id `string` · last_synced_at `string?` · project_calendar_id `string?` · provider `string` · sync_error `string?` · sync_status `string` · sync_token `string?` · updated_at `string` · user_id `string?`

### onto_events

all_day `boolean` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · end_at `string?` · external_link `string?` · facet_context `string?` · facet_scale `string?` · facet_stage `string?` · id `string` · last_synced_at `string?` · location `string?` · org_id `string?` · owner_entity_id `string?` · owner_entity_type `string` · project_id `string?` · props `Json` · recurrence `Json` · start_at `string` · state_key `string` · sync_error `string?` · sync_status `string` · timezone `string?` · title `string` · type_key `string` · updated_at `string`

### onto_facet_definitions

allowed_values `Json` · applies_to `string[]` · created_at `string` · description `string?` · is_multi_value `boolean?` · is_required `boolean?` · key `string` · name `string`

### onto_facet_values

color `string?` · created_at `string` · description `string?` · facet_key `string` · icon `string?` · id `string` · label `string` · parent_value_id `string?` · sort_order `number?` · value `string`

### onto_goals

archived_at `string?` · completed_at `string?` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · goal `string?` · id `string` · name `string` · project_id `string` · props `Json` · search_vector `unknown` · state_key `string` · target_date `string?` · type_key `string?` · updated_at `string?`

### onto_insights

created_at `string` · derived_from_signal_id `string?` · id `string` · project_id `string` · props `Json` · title `string`

### onto_metric_points

created_at `string` · id `string` · metric_id `string` · numeric_value `number` · props `Json` · ts `string`

### onto_metrics

created_at `string` · created_by `string` · definition `string?` · id `string` · name `string` · project_id `string` · props `Json` · type_key `string?` · unit `string`

### onto_milestones

archived_at `string?` · completed_at `string?` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · due_at `string?` · id `string` · milestone `string?` · project_id `string` · props `Json` · search_vector `unknown` · state_key `string` · title `string` · type_key `string?` · updated_at `string?`

### onto_permissions

access `string` · actor_id `string?` · created_at `string` · id `string` · object_id `string` · object_kind `string` · role_key `string?`

### onto_plans

archived_at `string?` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · facet_context `string?` · facet_scale `string?` · facet_stage `string?` · id `string` · name `string` · plan `string?` · project_id `string` · props `Json` · search_vector `unknown` · state_key `string` · type_key `string` · updated_at `string`

### onto_project_icon_candidates

candidate_index `number` · concept `string` · created_at `string` · generation_id `string` · id `string` · llm_model `string?` · project_id `string` · selected_at `string?` · svg_byte_size `number` · svg_raw `string` · svg_sanitized `string`

### onto_project_icon_generations

candidate_count `number` · completed_at `string?` · created_at `string` · error_message `string?` · id `string` · project_id `string` · requested_by `string` · selected_candidate_id `string?` · status `string` · steering_prompt `string?` · trigger_source `string` · updated_at `string`

### onto_project_invites

accepted_at `string?` · accepted_by_actor_id `string?` · access `string` · created_at `string` · declined_at `string?` · expires_at `string` · id `string` · invited_by_actor_id `string?` · invitee_email `string` · project_id `string` · role_key `string` · status `string` · token_hash `string`

### onto_project_logs

action `string` · after_data `Json?` · agent_call_session_id `string?` · before_data `Json?` · change_source `string?` · changed_by `string` · changed_by_actor_id `string?` · chat_session_id `string?` · created_at `string` · entity_id `string` · entity_type `string` · external_agent_caller_id `string?` · id `string` · project_id `string`

### onto_project_members

access `string` · actor_id `string` · added_by_actor_id `string?` · created_at `string` · id `string` · project_id `string` · removed_at `string?` · removed_by_actor_id `string?` · role_description `string?` · role_key `string` · role_name `string?`

### onto_project_structure_history

change_type `string` · changed_at `string?` · changed_by `string?` · doc_structure `Json` · id `string` · project_id `string` · version `number`

### onto_projects

archived_at `string?` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · doc_structure `Json?` · end_at `string?` · external_agent_access `string` · facet_context `string?` · facet_scale `string?` · facet_stage `string?` · icon_concept `string?` · icon_generated_at `string?` · icon_generation_prompt `string?` · icon_generation_source `string?` · icon_svg `string?` · id `string` · is_public `boolean?` · name `string` · next_step_long `string?` · next_step_short `string?` · next_step_source `string?` · next_step_updated_at `string?` · org_id `string?` · props `Json` · search_vector `unknown` · start_at `string?` · state_key `string` · type_key `string` · updated_at `string`

### onto_public_page_review_attempts

admin_decision `string?` · admin_decision_at `string?` · admin_decision_by `string?` · admin_decision_reason `string?` · created_at `string` · created_by `string` · document_id `string` · id `string` · image_findings `Json` · policy_version `string` · project_id `string` · public_page_id `string?` · reasons `Json` · review_metadata `Json` · source `string` · status `string` · summary `string?` · text_findings `Json`

### onto_public_page_slug_history

changed_at `string` · changed_by `string?` · id `string` · new_slug `string` · old_slug `string` · project_id `string` · public_page_id `string`

### onto_public_page_views

created_at `string` · id `string` · is_author `boolean` · public_page_id `string` · referrer `string?` · session_id `string?` · viewed_at `string` · viewer_hash `string?`

### onto_public_pages

created_at `string` · created_by `string` · deleted_at `string?` · document_id `string` · id `string` · last_live_sync_at `string?` · last_live_sync_error `string?` · last_unpublished_at `string?` · live_sync_enabled `boolean` · noindex `boolean` · project_id `string` · public_status `string` · published_at `string?` · published_by `string?` · published_content `string?` · published_description `string?` · published_props `Json` · published_version_number `number?` · slug `string` · slug_base `string?` · slug_prefix `string?` · status `string` · summary `string?` · title `string` · updated_at `string` · updated_by `string` · view_count_30d `number` · view_count_30d_updated_at `string?` · view_count_all `number` · visibility `string`

### onto_requirements

created_at `string` · created_by `string` · deleted_at `string?` · id `string` · priority `number?` · project_id `string` · props `Json` · search_vector `unknown` · text `string` · type_key `string` · updated_at `string?`

### onto_risks

archived_at `string?` · content `string?` · created_at `string` · created_by `string` · deleted_at `string?` · id `string` · impact `string` · mitigated_at `string?` · probability `number?` · project_id `string` · props `Json` · search_vector `unknown` · state_key `string` · title `string` · type_key `string?` · updated_at `string?`

### onto_signals

channel `string` · created_at `string` · id `string` · payload `Json` · project_id `string` · ts `string`

### onto_sources

captured_at `string?` · created_at `string` · created_by `string` · id `string` · project_id `string` · props `Json` · snapshot_uri `string?` · uri `string`

### onto_task_assignees

assigned_by_actor_id `string` · assignee_actor_id `string` · created_at `string` · id `string` · project_id `string` · source `string` · task_id `string`

### onto_tasks

archived_at `string?` · completed_at `string?` · created_at `string` · created_by `string` · deleted_at `string?` · description `string?` · due_at `string?` · facet_scale `string?` · id `string` · idempotency_key `string?` · priority `number?` · project_id `string` · props `Json` · search_vector `unknown` · start_at `string?` · state_key `string` · title `string` · type_key `string` · updated_at `string`

---

## Projects & Tasks (Legacy)

### phase_tasks

assignment_reason `string?` · created_at `string` · id `string` · order `number` · phase_id `string` · suggested_start_date `string?` · task_id `string`

### phases

created_at `string` · description `string?` · end_date `string` · id `string` · name `string` · order `number` · project_id `string` · scheduling_method `string?` · start_date `string` · updated_at `string` · user_id `string`

### project_audit_suggestions

audit_id `string` · created_at `string` · id `string` · role `string` · suggestion_id `string`

### project_audit_trigger_evaluations

burst_score `number?` · changed_entity_count `number?` · cooldown_until `string?` · created_at `string` · created_audit_id `string?` · created_loop_run_id `string?` · decision `string` · eligible `boolean` · evaluated_at `string` · id `string` · last_audit_id `string?` · major_change_count `number?` · maturity_snapshot `Json` · project_id `string` · project_size_class `string` · quiet_until `string?` · reason_summary `string` · trigger_reason `string` · user_id `string`

### project_audits

archived_at `string?` · audit_depth `string` · change_summary `Json` · chat_session_id `string?` · cost_usd `number?` · created_at `string` · delivery_confidence `string` · dimensions `Json` · error_message `string?` · evidence_refs `Json` · finished_at `string?` · generated_suggestion_count `number` · id `string` · loop_run_id `string?` · model_used `string?` · open_questions `Json` · project_id `string` · project_size_class `string` · project_snapshot_fingerprint `string?` · project_thesis `string?` · recommendations `Json` · reviewed_at `string?` · risks `Json` · started_at `string?` · status `string` · summary `string` · superseded_by `string?` · top_actions `Json` · top_findings `Json` · trigger_reason `string` · trigger_snapshot `Json` · unresolved_suggestion_count `number` · updated_at `string` · user_id `string`

### project_brief_templates

context_snapshot `Json?` · created_at `string?` · description `string?` · generated_by `string?` · generation_model `string?` · id `string` · in_use `boolean?` · is_default `boolean?` · metadata `Json?` · name `string` · project_id `string?` · template_content `string` · updated_at `string?` · user_id `string?` · variables `Json?`

### project_calendars

calendar_id `string` · calendar_name `string` · calendar_source_id `string?` · color_id `string?` · created_at `string?` · hex_color `string?` · id `string` · is_primary `boolean?` · last_synced_at `string?` · project_id `string` · provider_resource_managed `boolean` · sync_enabled `boolean?` · sync_error `string?` · updated_at `string?` · user_id `string` · visibility `string?`

### project_context_snapshot

compute_ms `number?` · computed_at `string` · created_at `string` · project_id `string` · snapshot `Json` · snapshot_version `number` · source_updated_at `string?` · updated_at `string`

### project_context_snapshot_metrics

computed_at `string` · duration_ms `number?` · error_message `string?` · id `string` · project_id `string` · queue_job_id `string?` · snapshot_version `number` · status `string`

### project_daily_briefs

brief_content `string` · brief_date `string` · created_at `string` · generation_completed_at `string?` · generation_error `string?` · generation_started_at `string?` · generation_status `string` · id `string` · metadata `Json?` · project_id `string` · template_id `string?` · updated_at `string` · user_id `string`

### project_drafts

calendar_color_id `string?` · calendar_settings `Json?` · calendar_sync_enabled `boolean?` · chat_session_id `string?` · completed_at `string?` · context `string?` · core_goals_momentum `string?` · core_harmony_integration `string?` · core_integrity_ideals `string?` · core_meaning_identity `string?` · core_opportunity_freedom `string?` · core_people_bonds `string?` · core_power_resources `string?` · core_reality_understanding `string?` · core_trust_safeguards `string?` · created_at `string?` · description `string?` · dimensions_covered `string[]?` · end_date `string?` · executive_summary `string?` · finalized_project_id `string?` · id `string` · name `string?` · question_count `number?` · slug `string?` · source `string?` · source_metadata `Json?` · start_date `string?` · status `string?` · tags `string[]?` · updated_at `string?` · user_id `string`

### project_loop_runs

brief `Json?` · chat_session_id `string?` · cost_usd `number?` · created_at `string` · error_message `string?` · finished_at `string?` · id `string` · project_id `string` · queue_job_id `string?` · started_at `string?` · status `string` · suggestion_count `number` · summary `string?` · trigger_reason `string` · updated_at `string` · user_id `string`

### project_notification_batches

action_counts `Json` · actor_counts `Json` · attempts `number` · created_at `string` · event_count `number` · flush_after `string` · flushed_at `string?` · flushed_event_id `string?` · id `string` · last_error `string?` · latest_event_at `string` · project_id `string` · recipient_user_id `string` · status `string` · updated_at `string` · window_end `string` · window_start `string`

### project_questions

answer_brain_dump_id `string?` · answered_at `string?` · ask_after `string?` · category `string?` · context `string?` · created_at `string` · expected_outcome `string?` · id `string` · priority `string?` · project_id `string?` · question `string` · shown_to_user_count `number` · source `string?` · source_field `string?` · status `string?` · triggers `Json?` · updated_at `string` · user_id `string`

### project_review_signals

activity_score `number` · created_at `string` · due_at `string` · entity_count `number` · entity_ids `string[]` · entity_type `string?` · error_message `string?` · finished_at `string?` · id `string` · last_seen_at `string` · metadata `Json` · operation_ids `string[]` · operation_kind `string?` · origin `string?` · processed_audit_id `string?` · processed_loop_run_id `string?` · project_id `string` · queue_job_id `string?` · review_policy `string` · signal_count `number` · source `string` · started_at `string?` · status `string` · updated_at `string` · user_id `string`

### project_suggestions

agent_run_id `string?` · applied_at `string?` · chat_session_id `string?` · confidence `number?` · created_at `string` · decided_at `string?` · depends_on `string?` · evidence_refs `Json` · freshness_state `string` · id `string` · kind `string` · operations `Json` · preview `Json?` · project_id `string` · rationale `string?` · result `Json?` · reversible `boolean?` · risk_tier `number` · run_id `string` · sort_order `number` · source_fingerprint `string?` · status `string` · title `string` · undo_operations `Json?` · updated_at `string` · user_feedback `Json?` · why_now `string?`

### project_synthesis

applied_at `string?` · created_at `string` · generation_duration_ms `number?` · generation_model `string?` · id `string` · insights `string?` · operations_count `number?` · project_id `string` · status `string?` · synthesis_content `Json` · updated_at `string` · user_id `string`

### projects

calendar_color_id `string?` · calendar_settings `Json?` · calendar_sync_enabled `boolean?` · context `string?` · core_context_descriptions `Json?` · core_goals_momentum `string?` · core_harmony_integration `string?` · core_integrity_ideals `string?` · core_meaning_identity `string?` · core_opportunity_freedom `string?` · core_people_bonds `string?` · core_power_resources `string?` · core_reality_understanding `string?` · core_trust_safeguards `string?` · created_at `string` · description `string?` · end_date `string?` · executive_summary `string?` · id `string` · name `string` · slug `string` · source `string?` · source_metadata `Json?` · start_date `string?` · status `string` · tags `string[]?` · updated_at `string` · user_id `string`

### projects_history

created_at `string?` · created_by `string?` · history_id `string` · is_first_version `boolean?` · project_data `Json` · project_id `string` · version_number `number`

### task_calendar_events

attendees `Json?` · calendar_event_id `string` · calendar_id `string` · calendar_source_id `string?` · created_at `string?` · event_end `string?` · event_link `string?` · event_start `string?` · event_title `string?` · exception_type `string?` · id `string` · is_exception `boolean?` · is_master_event `boolean?` · last_synced_at `string?` · organizer_display_name `string?` · organizer_email `string?` · organizer_self `boolean?` · original_start_time `string?` · project_calendar_id `string?` · recurrence_instance_date `string?` · recurrence_master_id `string?` · recurrence_rule `string?` · series_update_scope `string?` · sync_error `string?` · sync_source `string?` · sync_status `string` · sync_version `number?` · task_id `string` · updated_at `string?` · user_id `string`

### tasks

completed_at `string?` · created_at `string` · deleted_at `string?` · dependencies `string[]?` · description `string?` · details `string?` · duration_minutes `number?` · id `string` · outdated `boolean?` · parent_task_id `string?` · priority `string` · project_id `string?` · recurrence_ends `string?` · source `string?` · source_calendar_event_id `string?` · source_calendar_source_id `string?` · start_date `string?` · status `string` · task_steps `string?` · task_type `string` · title `string` · updated_at `string` · user_id `string`

---

## Chat & Agents

### agent_call_bootstrap_links

created_at `string` · expires_at `string` · external_agent_caller_id `string` · id `string` · last_accessed_at `string?` · payload `Json` · setup_token_hash `string` · updated_at `string` · user_id `string`

### agent_call_sessions

direction `string` · ended_at `string?` · external_agent_caller_id `string` · granted_scope `Json` · id `string` · metadata `Json` · rejection_reason `string?` · requested_scope `Json` · started_at `string` · status `string` · updated_at `string` · user_buildos_agent_id `string` · user_id `string`

### agent_call_tool_executions

agent_call_session_id `string` · args `Json` · completed_at `string?` · created_at `string` · entity_id `string?` · entity_kind `string?` · error_payload `Json?` · external_agent_caller_id `string` · id `string` · idempotency_key `string?` · op `string` · response_payload `Json?` · started_at `string` · status `string` · updated_at `string` · user_id `string`

### agent_chat_media_events

asset_id `string?` · checksum_sha256 `string?` · content_type `string?` · created_at `string` · event_type `string` · external_agent_caller_id `string?` · file_size_bytes `number?` · id `string` · media_type `string` · message_id `string?` · metadata `Json` · project_id `string?` · session_id `string?` · source `string` · user_id `string`

### agent_oauth_access_tokens

client_id `string` · created_at `string` · expires_at `string` · external_agent_caller_id `string` · grant_id `string` · id `string` · last_used_at `string?` · resource `string` · revoked_at `string?` · scope `string` · token_hash `string` · token_prefix `string` · updated_at `string` · user_id `string`

### agent_oauth_authorization_codes

client_id `string` · code_challenge `string` · code_challenge_method `string` · code_hash `string` · created_at `string` · expires_at `string` · external_agent_caller_id `string` · grant_id `string` · id `string` · redirect_uri `string` · resource `string` · scope `string` · updated_at `string` · used_at `string?` · user_id `string`

### agent_oauth_clients

allowed_scopes `Json` · client_id `string` · client_name `string` · client_secret_hash `string?` · client_type `string` · client_uri `string?` · created_at `string` · id `string` · logo_uri `string?` · metadata `Json` · redirect_uris `Json` · registration_source `string` · status `string` · updated_at `string`

### agent_oauth_grants

allowed_ops `Json` · allowed_project_ids `Json?` · client_id `string` · client_profile_id `string` · created_at `string` · external_agent_caller_id `string` · id `string` · last_used_at `string?` · project_scope_mode `string` · resource `string` · scope `string` · scope_mode `string` · status `string` · updated_at `string` · user_id `string`

### agent_oauth_refresh_tokens

client_id `string` · created_at `string` · expires_at `string` · external_agent_caller_id `string` · family_id `string` · grant_id `string` · id `string` · resource `string` · revoked_at `string?` · rotated_from_id `string?` · scope `string` · token_hash `string` · token_prefix `string` · updated_at `string` · used_at `string?` · user_id `string`

### agent_operatives

allowed_ops `string[]?` · budgets `Json` · context_type `string` · created_at `string` · expected_output `string?` · goal `string` · id `string` · instructions `string?` · label `string` · last_run_at `string?` · last_run_id `string?` · next_run_at `string?` · project_id `string?` · review_required `boolean` · schedule_day_of_week `number?` · schedule_enabled `boolean` · schedule_error `string?` · schedule_frequency `string?` · schedule_locked_at `string?` · schedule_time_of_day `string?` · schedule_timezone `string` · scope_mode `string` · updated_at `string` · user_id `string`

### agent_run_cost_entries

actual_cost_usd `number?` · actual_units `number?` · attempt_key `string` · id `string` · leaf_run_id `string` · metadata `Json` · operation `string` · provider `string` · provider_request_id `string?` · reconciliation_attempts `number` · reconciliation_completed_token `string?` · reconciliation_last_error `string?` · reconciliation_lock_expires_at `string?` · reconciliation_lock_token `string?` · reconciliation_locked_at `string?` · reconciliation_needs_operator_at `string?` · reconciliation_next_attempt_at `string?` · reserved_at `string` · reserved_cost_usd `number` · reserved_units `number?` · resource `string` · root_run_id `string` · settled_at `string?` · status `string` · unit_type `string?` · updated_at `string`

### agent_run_events

created_at `string` · event_type `string` · id `string` · payload `Json` · run_id `string` · seq `number?`

### agent_run_signals

consumed_at `string?` · created_at `string` · id `string` · kind `string` · payload `Json?` · run_id `string` · source `string`

### agent_runs

allowed_ops `string[]?` · budgets `Json` · change_set `Json?` · commit_started_at `string?` · completed_at `string?` · context_type `string` · created_at `string` · depth `number` · effort `string` · error `string?` · execution_generation `number` · expected_output `string?` · goal `string` · id `string` · instructions `string?` · label `string` · metrics `Json?` · operative_id `string?` · orchestration_state `Json` · parent_message_id `string?` · parent_run_id `string?` · parent_session_id `string?` · project_id `string?` · result `Json?` · review_required `boolean` · run_template `string` · scope_mode `string` · source_decision `string?` · source_suggestion_id `string?` · started_at `string?` · status `string` · trigger `string` · updated_at `string` · user_id `string`

### agent_tool_executions

agent_run_id `string` · arguments `Json?` · created_at `string` · entity_id `string?` · entity_kind `string?` · error_message `string?` · execution_time_ms `number?` · gateway_op `string?` · id `string` · mutation_mode `string?` · proposed_change_id `string?` · result `Json?` · success `boolean` · tokens_consumed `number?` · tool_category `string?` · tool_name `string` · user_id `string`

### chat_compressions

compressed_message_count `number` · compressed_tokens `number` · compression_ratio `number?` · created_at `string?` · first_message_id `string?` · id `string` · key_points `Json?` · last_message_id `string?` · original_message_count `number` · original_tokens `number` · session_id `string` · summary `string` · tool_usage_summary `Json?`

### chat_context_cache

abbreviated_context `Json` · abbreviated_tokens `number` · access_count `number?` · accessed_at `string?` · cache_key `string?` · context_type `string` · created_at `string?` · entity_id `string?` · expires_at `string` · full_context_available `boolean?` · full_tokens_estimate `number?` · id `string` · metadata `Json?` · related_entity_ids `string[]?` · user_id `string`

### chat_message_attachments

asset_id `string?` · attachment_kind `string` · created_at `string` · display_order `number` · id `string` · media_type `string` · message_id `string` · metadata `Json` · project_id `string?` · role `string` · session_id `string` · user_id `string`

### chat_messages

completion_tokens `number?` · content `string` · created_at `string?` · error_code `string?` · error_message `string?` · id `string` · message_type `string?` · metadata `Json?` · operation_ids `string[]?` · prompt_tokens `number?` · role `string` · session_id `string` · tool_call_id `string?` · tool_calls `Json?` · tool_name `string?` · tool_result `Json?` · total_tokens `number?` · user_id `string`

### chat_operations

after_data `Json?` · batch_id `string?` · before_data `Json?` · chat_session_id `string` · conditions `Json?` · created_at `string?` · data `Json` · duration_ms `number?` · enabled `boolean?` · entity_id `string?` · error_message `string?` · executed_at `string?` · id `string` · operation_type `string` · reasoning `string?` · ref `string?` · result `Json?` · search_query `string?` · sequence_number `number?` · status `string?` · table_name `string` · user_id `string`

### chat_prompt_eval_assertions

actual `Json?` · assertion_key `string` · created_at `string` · details `string?` · eval_run_id `string` · expected `Json?` · id `string` · status `string`

### chat_prompt_eval_runs

completed_at `string?` · created_at `string` · created_by `string?` · id `string` · runner_type `string` · scenario_slug `string` · scenario_version `string` · started_at `string` · status `string` · summary `Json` · turn_run_id `string`

### chat_prompt_snapshots

approx_prompt_tokens `number?` · context_payload `Json?` · created_at `string` · id `string` · message_chars `number` · messages_sha256 `string` · model_messages `Json` · prompt_sections `Json?` · prompt_variant `string` · rendered_dump_text `string?` · request_payload `Json?` · session_id `string` · snapshot_version `string` · system_prompt `string` · system_prompt_chars `number` · system_prompt_sha256 `string` · tool_definitions `Json?` · tools_sha256 `string?` · turn_run_id `string` · user_id `string`

### chat_sessions

agent_metadata `Json?` · archived_at `string?` · auto_accept_operations `boolean?` · auto_title `string?` · chat_topics `string[]?` · chat_type `string?` · compressed_at `string?` · context_type `string` · created_at `string?` · entity_id `string?` · extracted_entities `Json?` · id `string` · last_classified_at `string?` · last_message_at `string?` · message_count `number?` · preferences `Json?` · status `string` · summary `string?` · title `string?` · tool_call_count `number?` · total_tokens_used `number?` · updated_at `string?` · user_id `string`

### chat_sessions_projects

chat_session_id `string` · id `string` · linked_at `string?` · project_id `string`

### chat_tool_executions

affected_entities `Json` · arguments `Json` · client_turn_id `string?` · created_at `string?` · effect_id `string?` · error_message `string?` · execution_time_ms `number?` · gateway_op `string?` · help_path `string?` · id `string` · message_id `string?` · provider_tool_call_id `string?` · requires_user_action `boolean?` · result `Json?` · result_count `number?` · sequence_index `number?` · session_id `string` · stream_run_id `string?` · success `boolean` · tokens_consumed `number?` · tool_category `string?` · tool_name `string` · turn_run_id `string?` · zero_result `boolean?`

### chat_turn_checkpoints

checkpoint_type `string` · created_at `string` · digest `Json` · execution_generation `number?` · expires_at `string?` · id `string` · question `string?` · reason `string` · resume_context `Json` · resume_started_at `string?` · resume_turn_run_id `string?` · resumed_at `string?` · session_id `string` · status `string` · supervisor_decision `Json` · supervisor_sequence `number?` · supervisor_transition_id `string?` · turn_run_id `string` · updated_at `string` · user_id `string`

### chat_turn_effects

canonical_argument_hash `string` · created_at `string` · downstream_idempotency_supported `boolean` · downstream_receipt `Json?` · execution_generation `number` · failure_code `string?` · finished_at `string?` · id `string` · operation_name `string` · provider_tool_call_id `string?` · reserved_at `string` · session_id `string` · started_at `string?` · state `string` · tool_name `string` · turn_run_id `string` · updated_at `string` · user_id `string`

### chat_turn_events

created_at `string` · event_id `string` · event_type `string` · execution_generation `number` · id `string` · payload `Json` · phase `string` · sequence_index `number` · session_id `string` · stream_run_id `string` · turn_run_id `string` · user_id `string` · worker_transition_id `string?`

### chat_turn_input_artifacts

artifact_version `string` · content_bytes `number` · content_hash `string` · created_at `string` · history `Json` · history_bytes `number` · history_source `string` · id `string` · prepared `Json` · retain_until `string` · session_id `string` · source_prepared_prompt_id `string?` · turn_run_id `string` · user_id `string`

### chat_turn_runs

assistant_message_id `string?` · cache_age_seconds `number?` · cache_source `string?` · cancel_reason `string?` · cancel_requested_at `string?` · client_turn_id `string?` · context_type `string` · correlation_id `string` · created_at `string` · entity_id `string?` · execution_generation `number` · execution_mode `string` · execution_started_at `string?` · failure_code `string?` · finished_at `string?` · finished_reason `string?` · first_canonical_op `string?` · first_help_path `string?` · first_lane `string?` · first_skill_path `string?` · gateway_enabled `boolean` · history_compressed `boolean?` · history_cutoff_at `string?` · history_for_model_count `number?` · history_message_ids `string[]?` · history_strategy `string?` · id `string` · input_artifact_id `string?` · irreversible_boundary_at `string?` · last_event_sequence `number` · last_progress_at `string?` · llm_pass_count `number` · mutation_reserved_at `string?` · prepared_prompt_hit `boolean?` · prepared_prompt_id `string?` · prepared_prompt_miss_reason `string?` · prepared_surface_profile `string?` · project_id `string?` · prompt_snapshot_id `string?` · queue_job_id `string?` · raw_history_count `number?` · request_hash `string?` · request_hash_version `string?` · request_message `string` · request_payload `Json` · request_payload_version `string` · request_prewarmed_context `boolean?` · session_id `string` · source `string` · stale_context_policy `string?` · started_at `string` · status `string` · stream_run_id `string` · terminal_event_id `string?` · terminalized_at `string?` · timing_metric_id `string?` · tool_call_count `number` · tool_round_count `number` · transport_contract_version `string?` · transport_decision_id `string?` · updated_at `string` · user_id `string` · user_message_id `string?` · validation_failure_count `number` · worker_started_at `string?`

### chat_turn_signals

consumed_at `string?` · consumed_by_generation `number?` · created_at `string` · id `string` · kind `string` · reason `string` · session_id `string` · signal_version `string` · source `string` · turn_run_id `string` · user_id `string`

### chat_turn_stream_state

assistant_text `string` · created_at `string` · durable_through_sequence `number` · execution_generation `number` · first_text_persisted_at `string?` · last_text_batch_id `string?` · last_text_end_bytes `number?` · last_text_sequence `number?` · projection `Json` · projection_durable_sequence `number` · reconcile_required `boolean` · session_id `string` · snapshot_sequence `number` · turn_run_id `string` · updated_at `string` · user_id `string`

---

## Calendar

### calendar_access_audit_events

calendar_source_id `string?` · connection_id `string?` · created_at `string` · id `string` · metadata `Json` · operation `string` · outcome `string` · reason_code `string?` · user_id `string`

### calendar_analyses

ai_model `string?` · ai_model_version `string?` · analysis_warnings `Json` · calendar_source_ids `string[]` · calendars_analyzed `string[]?` · completed_at `string?` · confidence_average `number?` · created_at `string?` · date_range_end `string?` · date_range_start `string?` · error_message `string?` · events_analyzed `number?` · events_excluded `number?` · id `string` · partial_result `boolean` · processing_time_ms `number?` · projects_created `number?` · projects_suggested `number?` · source_statuses `Json` · started_at `string?` · status `string?` · tasks_created `number?` · total_tokens_used `number?` · updated_at `string?` · user_feedback `string?` · user_id `string` · user_rating `number?`

### calendar_analysis_events

analysis_id `string` · attendee_count `number?` · attendee_emails `string[]?` · calendar_event_id `string` · calendar_id `string` · calendar_source_id `string?` · contributing_source_event_ids `Json` · created_at `string?` · event_description `string?` · event_end `string?` · event_location `string?` · event_start `string?` · event_title `string?` · exclusion_reason `string?` · id `string` · included_in_analysis `boolean?` · is_organizer `boolean?` · is_recurring `boolean?` · recurrence_pattern `string?` · suggestion_id `string?`

### calendar_analysis_preferences

analysis_frequency `string?` · auto_accept_confidence `number?` · auto_analyze_on_connect `boolean?` · create_tasks_from_events `boolean?` · created_at `string?` · exclude_all_day_events `boolean?` · exclude_declined_events `boolean?` · exclude_personal_events `boolean?` · exclude_tentative_events `boolean?` · excluded_calendar_ids `string[]?` · id `string` · included_calendar_ids `string[]?` · last_auto_analysis_at `string?` · minimum_attendees `number?` · minimum_confidence_to_show `number?` · updated_at `string?` · user_id `string`

### calendar_connection_credentials

access_token_ciphertext `string` · access_token_expires_at `string?` · connection_id `string` · created_at `string` · granted_scopes `string[]` · id `string` · key_version `number` · last_refreshed_at `string?` · oauth_client_kind `string` · refresh_token_ciphertext `string` · refresh_token_expires_at `string?` · revoked_at `string?` · token_type `string` · updated_at `string`

### calendar_event_orphan_receipts

attempt_count `number` · calendar_source_id `string` · created_at `string` · entity_id `string` · entity_kind `string` · id `string` · last_attempted_at `string?` · operation `string` · provider_event_id `string` · reason_code `string` · resolved_at `string?` · status `string` · updated_at `string` · user_id `string`

### calendar_oauth_states

code_verifier `string` · connection_id `string?` · consumed_at `string?` · created_at `string` · expires_at `string` · id `string` · nonce `string` · oauth_client_kind `string` · redirect_path `string` · state_hash `string` · user_id `string`

### calendar_project_suggestions

ai_reasoning `string?` · analysis_id `string` · calendar_event_ids `string[]` · calendar_ids `string[]?` · calendar_source_event_ids `Json` · confidence_score `number` · created_at `string?` · created_project_id `string?` · detected_keywords `string[]?` · event_count `number?` · event_patterns `Json?` · id `string` · rejection_reason `string?` · status `string?` · status_changed_at `string?` · suggested_context `string?` · suggested_description `string?` · suggested_name `string` · suggested_priority `string?` · suggested_tasks `Json?` · tasks_created_count `number?` · updated_at `string?` · user_id `string` · user_modified_context `string?` · user_modified_description `string?` · user_modified_name `string?`

### calendar_webhook_channels

calendar_id `string?` · calendar_source_id `string?` · channel_id `string` · created_at `string` · expiration `number` · id `string` · resource_id `string?` · sync_token `string?` · updated_at `string` · user_id `string` · webhook_token `string`

### user_calendar_connections

account_label `string` · connected_at `string` · created_at `string` · deleted_at `string?` · display_name `string?` · email_address `string` · id `string` · last_used_at `string?` · last_verified_at `string?` · provider `string` · provider_account_id `string` · status `string` · updated_at `string` · user_id `string`

### user_calendar_preferences

created_at `string` · default_task_duration_minutes `number?` · default_write_calendar_source_id `string?` · exclude_holidays `boolean?` · holiday_country_code `string?` · id `string` · max_task_duration_minutes `number?` · min_task_duration_minutes `number?` · prefer_morning_for_important_tasks `boolean?` · show_events `boolean` · show_task_due `boolean` · show_task_scheduled `boolean` · show_task_start `boolean` · updated_at `string` · user_id `string` · work_end_time `string?` · work_start_time `string?` · working_days `number[]?`

### user_calendar_sources

access_role `string` · analysis_enabled `boolean` · availability_enabled `boolean` · background_color `string?` · color_id `string?` · connection_id `string` · created_at `string` · deleted_at `string?` · description `string?` · foreground_color `string?` · id `string` · is_hidden `boolean` · is_primary `boolean` · is_selected_in_google `boolean` · last_discovered_at `string` · last_seen_at `string` · provider_calendar_id `string` · provider_deleted_at `string?` · read_enabled `boolean` · summary `string` · summary_override `string?` · sync_enabled `boolean` · timezone `string?` · updated_at `string` · user_id `string`

### user_calendar_tokens

access_token `string` · created_at `string?` · expiry_date `number?` · google_email `string?` · google_user_id `string?` · id `string` · refresh_token `string?` · scope `string?` · token_type `string?` · updated_at `string?` · user_id `string`

---

## Notifications

### notification_deliveries

attempts `number?` · channel `string` · channel_identifier `string?` · clicked_at `string?` · correlation_id `string?` · created_at `string?` · delivered_at `string?` · event_id `string?` · external_id `string?` · failed_at `string?` · id `string` · last_error `string?` · max_attempts `number?` · opened_at `string?` · payload `Json` · recipient_user_id `string` · sent_at `string?` · status `string` · subscription_id `string?` · tracking_id `string?` · updated_at `string?`

### notification_events

actor_user_id `string?` · correlation_id `string?` · created_at `string?` · event_source `string` · event_type `string` · id `string` · metadata `Json?` · payload `Json` · target_user_id `string?`

### notification_logs

correlation_id `string` · created_at `string` · error_stack `string?` · id `string` · level `string` · message `string` · metadata `Json?` · namespace `string?` · notification_delivery_id `string?` · notification_event_id `string?` · request_id `string?` · user_id `string?`

### notification_subscriptions

admin_only `boolean?` · created_at `string?` · created_by `string?` · event_type `string` · filters `Json?` · id `string` · is_active `boolean?` · updated_at `string?` · user_id `string`

### notification_tracking_links

click_count `number?` · created_at `string?` · delivery_id `string` · destination_url `string` · first_clicked_at `string?` · id `string` · last_clicked_at `string?` · metadata `Json?` · short_code `string`

### user_notification_preferences

batch_enabled `boolean` · batch_interval_minutes `number?` · created_at `string` · email_enabled `boolean` · id `string` · in_app_enabled `boolean` · max_per_day `number?` · max_per_hour `number?` · priority `string` · push_enabled `boolean` · quiet_hours_enabled `boolean` · quiet_hours_end `string?` · quiet_hours_start `string?` · should_email_daily_brief `boolean` · should_sms_daily_brief `boolean` · sms_enabled `boolean` · updated_at `string` · user_id `string`

### user_notifications

action_url `string?` · created_at `string?` · data `Json?` · delivery_id `string?` · dismissed_at `string?` · event_id `string?` · event_type `string?` · expires_at `string?` · id `string` · message `string` · priority `string?` · read_at `string?` · title `string` · type `string` · user_id `string`

---

## SMS & Twilio

### scheduled_sms_messages

calendar_event_id `string?` · calendar_source_id `string?` · cancelled_at `string?` · created_at `string?` · event_details `Json?` · event_end `string?` · event_start `string?` · event_title `string?` · generated_via `string?` · generation_cost_usd `number?` · id `string` · last_error `string?` · llm_model `string?` · max_send_attempts `number?` · message_content `string` · message_type `string` · scheduled_for `string` · send_attempts `number?` · sent_at `string?` · sms_message_id `string?` · status `string` · timezone `string` · twilio_sid `string?` · updated_at `string?` · user_id `string`

### sms_alert_history

alert_type `string` · id `string` · metadata `Json?` · metric_value `number` · notification_error `string?` · notification_sent `boolean` · resolved_at `string?` · severity `string` · threshold_value `number` · triggered_at `string`

### sms_alert_thresholds

alert_type `string` · cooldown_minutes `number` · created_at `string` · id `string` · is_enabled `boolean` · last_triggered_at `string?` · notification_channels `string[]` · severity `string` · threshold_value `number` · updated_at `string`

### sms_messages

attempt_count `number?` · created_at `string?` · delivered_at `string?` · id `string` · max_attempts `number?` · message_content `string` · metadata `Json?` · next_retry_at `string?` · notification_delivery_id `string?` · phone_number `string` · priority `string` · project_id `string?` · queue_job_id `string?` · scheduled_for `string?` · sent_at `string?` · status `string` · task_id `string?` · template_id `string?` · template_vars `Json?` · twilio_error_code `number?` · twilio_error_message `string?` · twilio_sid `string?` · twilio_status `string?` · updated_at `string?` · user_id `string`

### sms_metrics

created_at `string` · id `string` · metadata `Json?` · metric_date `string` · metric_hour `number?` · metric_type `string` · metric_value `number` · updated_at `string` · user_id `string`

### sms_templates

created_at `string?` · created_by `string?` · description `string?` · id `string` · is_active `boolean?` · last_used_at `string?` · max_length `number?` · message_template `string` · name `string` · required_vars `Json?` · template_key `string` · template_vars `Json?` · updated_at `string?` · usage_count `number?`

### user_sms_preferences

created_at `string?` · daily_count_reset_at `string?` · daily_sms_count `number?` · daily_sms_limit `number?` · evening_recap_enabled `boolean?` · event_reminder_lead_time_minutes `number?` · event_reminders_enabled `boolean?` · id `string` · morning_kickoff_enabled `boolean?` · morning_kickoff_time `string?` · opt_out_reason `string?` · opted_out `boolean?` · opted_out_at `string?` · phone_number `string?` · phone_verified `boolean?` · phone_verified_at `string?` · quiet_hours_end `string?` · quiet_hours_start `string?` · updated_at `string?` · urgent_alerts `boolean?` · user_id `string`

---

## Email

### email_access_audit_events

connection_id `string?` · created_at `string` · id `string` · metadata `Json` · operation `string` · outcome `string` · reason_code `string?` · user_id `string`

### email_attachments

cid `string?` · content_type `string` · created_at `string?` · created_by `string` · email_id `string` · file_size `number` · filename `string` · id `string` · image_height `number?` · image_width `number?` · is_image `boolean?` · is_inline `boolean?` · optimized_versions `Json?` · original_filename `string` · storage_bucket `string` · storage_path `string`

### email_capability_grants

capability `string` · connection_id `string` · consent_policy_version `string` · created_at `string` · disabled_at `string?` · enabled_at `string?` · enabled_by_user_id `string?` · granted_scopes `string[]` · id `string` · status `string` · updated_at `string`

### email_connection_credentials

access_token_ciphertext `string` · access_token_expires_at `string?` · connection_id `string` · created_at `string` · grant_kind `string` · granted_scopes `string[]` · id `string` · key_version `number` · last_refreshed_at `string?` · oauth_client_kind `string` · refresh_token_ciphertext `string` · refresh_token_expires_at `string?` · revoked_at `string?` · token_type `string` · updated_at `string`

### email_logs

bcc `string[]?` · body `string` · cc `string[]?` · created_at `string` · error_message `string?` · id `string` · metadata `Json?` · reply_to `string?` · sent_at `string?` · status `string` · subject `string` · to_email `string` · user_id `string?`

### email_oauth_states

code_verifier `string` · connection_id `string?` · consumed_at `string?` · created_at `string` · expires_at `string` · id `string` · nonce `string` · oauth_client_kind `string` · redirect_path `string` · state_hash `string` · user_id `string`

### email_project_profile_versions

compiler_version `string` · created_at `string` · diff `Json` · groups `Json` · id `string` · omitted `Json` · profile_hash `string` · profile_id `string` · profile_version `number` · source_snapshot_at `string`

### email_project_profiles

compiler_version `string?` · created_at `string` · current_profile_hash `string?` · current_version `number` · deleted_at `string?` · id `string` · project_id `string` · source_snapshot_at `string?` · updated_at `string` · user_id `string`

### email_project_rules

connection_id `string?` · created_at `string` · disabled_at `string?` · id `string` · key_version `number` · match_value_ciphertext `string` · match_value_hash `string` · project_id `string` · rule_kind `string` · source_decision_id `string?` · updated_at `string` · user_id `string`

### email_recipients

created_at `string?` · delivered_at `string?` · email_id `string` · error_message `string?` · id `string` · last_opened_at `string?` · open_count `number?` · opened_at `string?` · recipient_email `string` · recipient_id `string?` · recipient_name `string?` · recipient_type `string` · sent_at `string?` · status `string` · updated_at `string?`

### email_relevance_adjudications

corrected_project_id `string?` · correction_reason `string?` · created_at `string` · decision `string` · decision_hash `string` · id `string` · idempotency_key_hash `string` · review_contract_version `string` · reviewer_user_id `string` · rule_proposal `string?` · run_id `string` · sample_id `string` · user_id `string` · variant_blinded `boolean`

### email_relevance_message_observations

connection_scope_id `string` · created_at `string` · discovery_page `number` · evidence_fingerprints `string[]` · id `string` · internal_date `string?` · key_version `number` · mailbox_inbox `boolean?` · mailbox_sent `boolean?` · processed_at `string?` · processing_state `string` · provider_message_id_ciphertext `string` · provider_message_id_hash `string` · provider_thread_id_ciphertext `string` · provider_thread_id_hash `string` · retention_expires_at `string` · run_id `string` · user_id `string`

### email_relevance_project_candidates

actor_overlap `boolean` · actor_overlap_count `number` · artifact_overlap `boolean` · artifact_overlap_count `number` · candidate_state `string` · confidence `number` · confirmed_thread `boolean` · created_at `string` · domain_overlap `boolean` · domain_overlap_count `number` · explicit_rule `boolean` · id `string` · identifier_overlap `boolean` · identifier_overlap_count `number` · lexical_overlap `boolean` · lexical_overlap_count `number` · negative_evidence `boolean` · negative_evidence_count `number` · observation_id `string` · policy_version `string` · profile_version_id `string` · project_id `string` · retention_expires_at `string` · score `number` · scorer_version `string` · user_id `string` · variant `string`

### email_relevance_review_samples

a_actor_overlap `boolean` · a_artifact_overlap `boolean` · a_confidence `number?` · a_confirmed_thread `boolean` · a_domain_overlap `boolean` · a_explicit_rule `boolean` · a_identifier_overlap `boolean` · a_lexical_overlap `boolean` · a_negative_evidence `boolean` · a_score `number?` · b_actor_overlap `boolean` · b_artifact_overlap `boolean` · b_confidence `number?` · b_confirmed_thread `boolean` · b_domain_overlap `boolean` · b_explicit_rule `boolean` · b_identifier_overlap `boolean` · b_lexical_overlap `boolean` · b_negative_evidence `boolean` · b_score `number?` · candidate_a_id `string?` · candidate_b_id `string?` · connection_scope_id `string` · created_at `string` · id `string` · profile_version_id `string` · project_id `string` · reviewed_at `string?` · run_id `string` · sample_key_hash `string` · sample_order `number` · sampling_stratum `string` · sampling_version `string` · sampling_weight `number` · source_observation_id `string` · source_retention_expires_at `string` · state `string` · stratum_population_size `number` · stratum_sample_size `number` · user_id `string`

### email_relevance_scan_connections

checkpoint_attempts `number` · checkpoint_version `number` · completed_at `string?` · connection_id `string?` · created_at `string` · cursor_envelope `string?` · cursor_key_version `number?` · gmail_quota_budget `number` · gmail_quota_reserved `number` · gmail_quota_used `number` · id `string` · last_error_code `string?` · lease_expires_at `string?` · lease_owner `string?` · lease_token_hash `string?` · list_pages_completed `number` · max_attempts `number` · message_cap `number` · messages_seen `number` · metadata_batch_ceiling `number` · model_cost_budget_micros `number` · model_token_budget `number` · next_attempt_at `string?` · observations_discovered `number` · observations_processed `number` · pending_cursor_envelope `string?` · pending_cursor_key_version `number?` · pending_page_is_final `boolean?` · raw_content_byte_budget `number` · run_id `string` · runtime_ms_budget `number` · runtime_ms_reserved `number` · runtime_ms_used `number` · started_at `string?` · state `string` · steps_completed `number` · synthetic_step `number` · terminal_reason_code `string?` · total_attempts `number` · updated_at `string`

### email_relevance_scan_projects

created_at `string` · invalidated_at `string?` · invalidation_reason_code `string?` · profile_hash `string` · profile_id `string` · profile_version `number` · project_id `string` · run_id `string`

### email_relevance_scan_reservations

attempt `number` · checkpoint_version `number` · connection_scope_id `string` · created_at `string` · id `string` · operation_code `string` · operation_id `string` · policy_version `string` · reserved_quantity `number` · resource_kind `string` · run_id `string` · settled_at `string?` · settled_quantity `number?` · state `string`

### email_relevance_scan_runs

cancel_requested_at `string?` · completed_at `string?` · configuration `Json` · connection_count `number` · control_plane_version `string` · created_at `string` · expires_at `string` · gmail_quota_budget `number` · gmail_quota_reserved `number` · gmail_quota_used `number` · id `string` · idempotency_key_hash `string` · manifest_hash `string` · message_cap_per_connection `number` · messages_seen `number` · model_cost_budget_micros `number` · model_token_budget `number` · pause_requested_at `string?` · project_count `number` · query_policy_version `string` · quota_policy_version `string` · raw_content_byte_budget `number` · runtime_ms_budget `number` · runtime_ms_reserved `number` · runtime_ms_used `number` · serializer_version `string` · started_at `string?` · state `string` · steps_completed `number` · terminal_reason_code `string?` · updated_at `string` · user_id `string` · window_end `string` · window_start `string`

### email_sequence_copy_overrides

body `string` · created_at `string` · created_by `string?` · id `string` · metadata `Json` · sequence_key `string` · step_key `string` · subject `string` · updated_at `string` · updated_by `string?` · variant_key `string`

### email_sequence_enrollments

created_at `string` · current_step_number `number` · exit_reason `string?` · failure_count `number` · id `string` · last_email_id `string?` · last_error `string?` · last_sent_at `string?` · metadata `Json` · next_send_at `string?` · next_step_number `number?` · processing_started_at `string?` · recipient_email `string` · sequence_id `string` · status `string` · updated_at `string` · user_id `string`

### email_sequence_events

branch_key `string?` · created_at `string` · email_id `string?` · enrollment_id `string?` · event_type `string` · id `string` · metadata `Json` · reason `string?` · sequence_id `string` · step_key `string?` · step_number `number?` · user_id `string?`

### email_sequence_steps

absolute_day_offset `number` · created_at `string` · delay_days_after_previous `number` · id `string` · metadata `Json` · send_on_weekends `boolean` · send_window_end_hour `number` · send_window_start_hour `number` · sequence_id `string` · status `string` · step_key `string` · step_number `number` · updated_at `string`

### email_sequences

created_at `string` · description `string?` · display_name `string` · id `string` · key `string` · metadata `Json` · status `string` · trigger_type `string` · updated_at `string`

### email_suppressions

created_at `string` · email `string` · id `string` · metadata `Json` · reason `string` · scope `string` · source `string` · updated_at `string`

### email_tracking_events

clicked_url `string?` · created_at `string?` · email_id `string` · event_data `Json?` · event_type `string` · id `string` · ip_address `unknown` · recipient_id `string?` · timestamp `string?` · user_agent `string?`

### emails

category `string?` · content `string` · created_at `string?` · created_by `string` · from_email `string` · from_name `string` · id `string` · scheduled_at `string?` · sent_at `string?` · status `string` · subject `string` · template_data `Json?` · tracking_enabled `boolean` · tracking_id `string?` · updated_at `string?`

### user_email_connections

account_label `string` · connected_at `string` · created_at `string` · deleted_at `string?` · display_name `string?` · email_address `string` · id `string` · last_used_at `string?` · last_verified_at `string?` · provider `string` · provider_account_id `string` · read_enabled `boolean` · status `string` · updated_at `string` · user_id `string`

### welcome_email_sequences

completed_at `string?` · created_at `string` · email_1_sent_at `string?` · email_1_skipped_at `string?` · email_2_sent_at `string?` · email_2_skipped_at `string?` · email_3_sent_at `string?` · email_3_skipped_at `string?` · email_4_sent_at `string?` · email_4_skipped_at `string?` · email_5_sent_at `string?` · email_5_skipped_at `string?` · last_evaluated_at `string?` · sequence_version `string` · signup_method `string` · started_at `string` · status `string` · trigger_source `string` · updated_at `string` · user_id `string`

---

## Billing

### billing_accounts

billing_state `string` · billing_tier `string` · created_at `string` · cycle_end_at `string?` · cycle_start_at `string?` · frozen_at `string?` · frozen_reason `string?` · id `string` · updated_at `string` · user_id `string`

### billing_credit_ledger

created_at `string` · credits_delta `number` · event_type `string` · id `string` · idempotency_key `string?` · metadata `Json` · source_id `string?` · source_type `string` · user_id `string`

### billing_ops_anomalies

anomaly_key `string` · baseline_value `number?` · created_at `string` · delta_ratio `number?` · delta_value `number?` · details `Json` · id `string` · metric_name `string` · notification_channels `string[]` · notified_at `string?` · observed_value `number` · severity `string` · snapshot_date `string` · snapshot_id `string` · updated_at `string` · window_days `number`

### billing_ops_snapshots

anomaly_count `number` · auto_pro_to_power_escalation_rate `number` · auto_pro_to_power_transition_window_count `number` · created_at `string` · current_power_account_count `number` · current_power_share `number` · freeze_transitions_window_count `number` · frozen_account_share `number` · frozen_active_count `number` · generated_alerts `Json` · id `string` · manual_unfreeze_rate `number` · manual_unfreeze_window_count `number` · paid_account_count `number` · pro_to_power_transition_window_count `number` · snapshot_at `string` · snapshot_date `string` · source `string` · total_accounts_count `number` · updated_at `string` · window_days `number`

### billing_state_transitions

change_source `string` · changed_by_user_id `string?` · created_at `string` · from_billing_state `string?` · from_billing_tier `string?` · from_frozen_reason `string?` · id `string` · to_billing_state `string` · to_billing_tier `string` · to_frozen_reason `string?` · user_id `string`

### customer_subscriptions

cancel_at `string?` · canceled_at `string?` · cancellation_reason `string?` · created_at `string?` · current_period_end `string?` · current_period_start `string?` · id `string` · metadata `Json?` · plan_id `string?` · status `string` · stripe_customer_id `string` · stripe_price_id `string?` · stripe_subscription_id `string` · trial_end `string?` · trial_start `string?` · updated_at `string?` · user_id `string`

### discount_codes

code `string` · created_at `string?` · description `string?` · discount_type `string` · discount_value `number` · duration `string` · duration_in_months `number?` · id `string` · is_active `boolean?` · max_redemptions `number?` · metadata `Json?` · stripe_coupon_id `string?` · times_redeemed `number?` · updated_at `string?` · valid_from `string?` · valid_until `string?`

### failed_payments

amount_due `number` · created_at `string?` · dunning_stage `string?` · failed_at `string` · id `string` · invoice_id `string` · last_dunning_at `string?` · last_retry_at `string?` · resolution_type `string?` · resolved_at `string?` · retry_count `number?` · subscription_id `string?` · updated_at `string?` · user_id `string`

### invoices

amount_due `number` · amount_paid `number` · created_at `string?` · currency `string?` · hosted_invoice_url `string?` · id `string` · invoice_pdf `string?` · status `string` · stripe_customer_id `string` · stripe_invoice_id `string` · subscription_id `string?` · user_id `string`

### payment_methods

card_brand `string?` · card_last4 `string?` · created_at `string?` · id `string` · is_default `boolean?` · stripe_payment_method_id `string` · type `string` · updated_at `string?` · user_id `string`

### push_subscriptions

auth_key `string` · created_at `string?` · endpoint `string` · id `string` · is_active `boolean?` · last_used_at `string?` · p256dh_key `string` · user_agent `string?` · user_id `string`

### subscription_plans

billing_interval `string?` · created_at `string` · currency `string?` · description `string?` · features `Json?` · id `string` · interval_count `number?` · is_active `boolean?` · name `string` · price_cents `number` · stripe_price_id `string` · updated_at `string`

### trial_reminders

created_at `string?` · id `string` · reminder_type `string` · sent_at `string?` · user_id `string`

### user_discounts

applied_at `string?` · discount_code_id `string` · expires_at `string?` · id `string` · stripe_subscription_id `string?` · user_id `string`

---

## Beta Program

### beta_event_attendance

attended `boolean?` · created_at `string` · event_feedback `string?` · event_id `string?` · event_rating `number?` · id `string` · joined_at `string?` · left_at `string?` · member_id `string?` · rsvp_at `string?` · rsvp_status `string?` · user_id `string?`

### beta_events

agenda `string?` · created_at `string` · created_by `string?` · duration_minutes `number?` · event_description `string?` · event_status `string?` · event_timezone `string?` · event_title `string` · event_type `string?` · id `string` · max_attendees `number?` · meeting_link `string?` · meeting_notes `string?` · recording_url `string?` · scheduled_at `string` · updated_at `string`

### beta_feature_votes

created_at `string?` · feedback_id `string?` · id `string` · member_id `string?` · vote_type `string?`

### beta_feedback

created_at `string?` · declined_reason `string?` · feature_area `string?` · feedback_description `string` · feedback_priority `string?` · feedback_status `string?` · feedback_tags `string[]?` · feedback_title `string` · feedback_type `string?` · founder_responded_at `string?` · founder_response `string?` · id `string` · implemented_at `string?` · member_id `string?` · updated_at `string?` · upvotes `number?` · user_id `string?`

### beta_members

access_level `string?` · beta_tier `string?` · company_name `string?` · created_at `string?` · deactivated_at `string?` · deactivation_reason `string?` · discount_percentage `number?` · early_access_features `string[]?` · email `string` · full_name `string` · has_lifetime_pricing `boolean?` · id `string` · is_active `boolean?` · job_title `string?` · joined_at `string?` · last_active_at `string?` · signup_id `string?` · total_calls_attended `number?` · total_features_requested `number?` · total_feedback_submitted `number?` · updated_at `string?` · user_id `string?` · user_timezone `string?` · wants_community_access `boolean?` · wants_feature_updates `boolean?` · wants_weekly_calls `boolean?`

### beta_signups

approved_at `string?` · biggest_challenge `string?` · company_name `string?` · created_at `string` · email `string` · full_name `string` · id `string` · invited_by `string?` · ip_address `unknown` · job_title `string?` · productivity_tools `string[]?` · referral_source `string?` · signup_status `string?` · updated_at `string` · user_agent `string?` · user_timezone `string?` · wants_community_access `boolean?` · wants_weekly_calls `boolean?` · why_interested `string?`

---

## Queue & Jobs

### cron_logs

created_at `string?` · error_message `string?` · executed_at `string` · id `string` · job_name `string` · message `string?` · status `string`

### queue_jobs

attempts `number?` · completed_at `string?` · created_at `string` · dedup_key `string?` · error_message `string?` · id `string` · job_type `string` · max_attempts `number?` · metadata `Json?` · priority `number?` · processed_at `string?` · processing_token `string?` · queue_job_id `string` · result `Json?` · scheduled_for `string` · started_at `string?` · status `string` · updated_at `string?` · user_id `string`

---

## Daily Briefs

### daily_briefs

brief_date `string` · created_at `string` · generation_completed_at `string?` · generation_error `string?` · generation_progress `Json?` · generation_started_at `string?` · generation_status `string` · id `string` · insights `string?` · llm_analysis `string?` · metadata `Json?` · priority_actions `string[]?` · project_brief_ids `string[]?` · summary_content `string` · updated_at `string` · user_id `string`

### ontology_brief_entities

created_at `string` · daily_brief_id `string` · entity_id `string` · entity_kind `string` · id `string` · project_id `string?` · role `string?`

### ontology_daily_briefs

actor_id `string` · audio_duration_ms `number?` · audio_error `string?` · audio_generated_at `string?` · audio_generation_ms `number?` · audio_generation_started_at `string?` · audio_model `string?` · audio_requested_at `string?` · audio_status `string` · audio_storage_path `string?` · audio_voice `string?` · brief_date `string` · created_at `string` · executive_summary `string` · generation_completed_at `string?` · generation_error `string?` · generation_started_at `string?` · generation_status `string` · id `string` · llm_analysis `string?` · metadata `Json` · priority_actions `string[]?` · updated_at `string` · user_id `string`

### ontology_project_briefs

brief_content `string` · created_at `string` · daily_brief_id `string` · id `string` · metadata `Json` · project_id `string` · updated_at `string`

### user_brief_preferences

created_at `string` · day_of_week `number?` · frequency `string?` · id `string` · is_active `boolean?` · time_of_day `string?` · updated_at `string` · user_id `string`

---

## Monitoring & Analytics

### admin_analytics

created_at `string` · date `string` · id `string` · metadata `Json?` · metric_name `string` · metric_value `number`

### error_logs

app_version `string?` · brain_dump_id `string?` · browser_info `Json?` · completion_tokens `number?` · created_at `string` · endpoint `string?` · environment `string?` · error_code `string?` · error_message `string` · error_stack `string?` · error_type `string` · http_method `string?` · id `string` · ip_address `unknown` · llm_max_tokens `number?` · llm_model `string?` · llm_provider `string?` · llm_temperature `number?` · metadata `Json?` · operation_payload `Json?` · operation_type `string?` · project_id `string?` · prompt_tokens `number?` · record_id `string?` · request_id `string?` · resolution_notes `string?` · resolved `boolean?` · resolved_at `string?` · resolved_by `string?` · response_time_ms `number?` · severity `string?` · table_name `string?` · total_tokens `number?` · updated_at `string` · user_agent `string?` · user_id `string?`

### llm_usage_logs

brain_dump_id `string?` · brief_id `string?` · cache_write_tokens `number` · cached_prompt_tokens `number` · chat_session_id `string?` · client_turn_id `string?` · completion_tokens `number` · created_at `string` · error_message `string?` · id `string` · input_cost_usd `number` · max_tokens `number?` · metadata `Json?` · model_requested `string` · model_used `string` · openrouter_byok `boolean?` · openrouter_cache_status `string?` · openrouter_request_id `string?` · openrouter_upstream_inference_cost_usd `number?` · openrouter_usage_cost_usd `number?` · operation_type `string` · output_cost_usd `number` · profile `string?` · project_id `string?` · prompt_tokens `number` · provider `string?` · rate_limit_remaining `number?` · reasoning_tokens `number` · request_completed_at `string` · request_started_at `string` · response_time_ms `number` · status `string` · stream_run_id `string?` · streaming `boolean?` · task_id `string?` · temperature `number?` · total_cost_usd `number` · total_tokens `number` · turn_run_id `string?` · user_id `string`

### llm_usage_summary

avg_response_time_ms `number?` · created_at `string` · failed_requests `number` · id `string` · max_response_time_ms `number?` · min_response_time_ms `number?` · models_used `Json?` · operations_breakdown `Json?` · successful_requests `number` · summary_date `string` · summary_type `string` · total_completion_tokens `number` · total_cost_usd `number` · total_prompt_tokens `number` · total_requests `number` · total_tokens `number` · updated_at `string` · user_id `string`

### migration_log

batch_id `string?` · created_at `string` · entity_type `string` · error_category `string?` · error_message `string?` · id `number` · last_retry_at `string?` · legacy_id `string?` · legacy_table `string?` · metadata `Json` · onto_id `string?` · onto_table `string?` · operation `string` · org_id `string?` · retry_count `number?` · run_id `string` · status `string` · updated_at `string` · user_id `string?`

### recurring_task_migration_log

created_at `string?` · error_message `string?` · id `string` · migration_type `string` · new_calendar_event_id `string?` · new_recurrence_ends `string?` · old_calendar_event_id `string?` · old_recurrence_ends `string?` · project_id `string?` · status `string` · task_id `string` · updated_at `string?` · user_id `string`

### security_logs

content `string` · created_at `string` · event_type `string` · id `string` · ip_address `string?` · llm_validation `Json?` · metadata `Json?` · regex_patterns `Json?` · user_agent `string?` · user_id `string` · was_blocked `boolean`

### system_metrics

id `string` · metric_description `string?` · metric_name `string` · metric_unit `string?` · metric_value `number` · recorded_at `string?`

### timing_metrics

clarification_ms `number?` · context_build_ms `number?` · context_type `string?` · created_at `string` · first_event_at `string?` · first_response_at `string?` · id `string` · message_length `number?` · message_received_at `string` · metadata `Json` · plan_completed_at `string?` · plan_created_at `string?` · plan_creation_ms `number?` · plan_execution_ms `number?` · plan_execution_started_at `string?` · plan_status `string?` · plan_step_count `number?` · session_id `string?` · time_to_first_event_ms `number?` · time_to_first_response_ms `number?` · tool_selection_ms `number?` · turn_run_id `string?` · updated_at `string` · user_id `string`

### user_activity_logs

activity_data `Json?` · activity_type `string` · created_at `string` · id `string` · ip_address `unknown` · user_agent `string?` · user_id `string?`

---

## Web & Webhooks

### web_page_evidence_chunks

chunk_index `number` · content `string` · content_hash `string` · created_at `string` · end_offset `number` · id `string` · page_version_id `string` · selector `string` · start_offset `number`

### web_page_versions

bytes `number?` · canonical_url `string?` · content `string` · content_format `string` · content_hash `string` · content_type `string?` · created_at `string` · etag `string?` · excerpt `string?` · extraction_method `string` · extraction_strategy `string?` · extraction_version `string` · fetched_at `string` · final_url `string` · id `string` · last_modified `string?` · meta `Json?` · parser `string?` · requested_url `string` · status_code `number` · structured_data `Json?` · title `string?` · version_number `number` · web_page_visit_id `string`

### web_page_visits

bytes `number?` · canonical_url `string?` · content_hash `string?` · content_type `string?` · created_at `string` · current_version_id `string?` · error_message `string?` · etag `string?` · excerpt `string?` · final_url `string` · first_visited_at `string` · id `string` · last_fetch_ms `number?` · last_fetched_at `string` · last_llm_model `string?` · last_llm_ms `number?` · last_modified `string?` · last_visited_at `string` · llm_completion_tokens `number?` · llm_prompt_tokens `number?` · llm_total_tokens `number?` · markdown `string?` · meta `Json?` · normalized_url `string` · status_code `number` · structured_data `Json?` · title `string?` · updated_at `string` · url `string` · visit_count `number`

### webhook_events

attempts `number?` · created_at `string?` · error_message `string?` · event_id `string` · event_type `string` · id `string` · payload `Json?` · processed_at `string?` · status `string`

---

## Other

### agentic_chat_execution_observations

event_type `string` · execution_generation `number` · id `number` · observation_key `string` · observed_at `string` · payload `Json` · phase `string` · session_id `string` · turn_run_id `string` · user_id `string`

### agentic_chat_prepared_prompts

cache_key `string` · consumed_at `string?` · context_cache_version `number` · context_payload `Json` · context_payload_sha256 `string` · context_type `string` · conversation_summary `string?` · created_at `string` · default_surface_profile `string` · entity_id `string?` · expires_at `string` · history_compressed `boolean?` · history_for_model `Json` · history_for_model_count `number?` · history_strategy `string?` · id `string` · nonce_sha256 `string` · prepared_surfaces `Json` · project_focus `Json?` · project_id `string?` · prompt_variant `string` · raw_history_count `number?` · session_id `string?` · updated_at `string` · user_id `string`

### domain_research_queue

budget `Json` · claimed_at `string?` · claimed_by `string?` · completed_at `string?` · created_at `string` · domain_ids `string[]` · evidence `Json` · first_seen_at `string` · id `string` · kind `string` · last_seen_at `string` · missing_resource_id `string?` · missing_skill_id `string?` · occurrences `number` · parent_skill_id `string?` · priority `string` · queue_key `string` · result `Json?` · source_session_ids `string[]` · source_user_count `number` · status `string` · summary `string` · updated_at `string` · user_need `string` · work_capability_id `string?`

### draft_tasks

completed_at `string?` · created_at `string?` · deleted_at `string?` · dependencies `string[]?` · description `string?` · details `string?` · draft_project_id `string` · duration_minutes `number?` · finalized_task_id `string?` · id `string` · outdated `boolean?` · parent_task_id `string?` · priority `string?` · recurrence_end_source `string?` · recurrence_ends `string?` · recurrence_pattern `string?` · source `string?` · source_calendar_event_id `string?` · source_calendar_source_id `string?` · start_date `string?` · status `string?` · task_steps `Json?` · task_type `string?` · title `string` · updated_at `string?` · user_id `string`

### external_agent_callers

caller_key `string` · created_at `string` · id `string` · last_used_at `string?` · metadata `Json` · policy `Json` · project_scope_mode `string` · provider `string` · status `string` · token_hash `string` · token_prefix `string` · updated_at `string` · user_id `string`

### external_agent_project_permissions

access_mode `string` · agent_oauth_grant_id `string?` · created_at `string` · external_agent_caller_id `string` · granted_at `string` · granted_by `string?` · id `string` · metadata `Json` · project_id `string` · revoked_at `string?` · source `string` · updated_at `string` · user_id `string`

### feature_flags

created_at `string` · enabled `boolean` · enabled_at `string?` · feature_name `string` · id `string` · updated_at `string` · user_id `string`

### feedback

category `string` · created_at `string` · feedback_text `string` · id `string` · rating `number?` · status `string?` · updated_at `string` · user_agent `string?` · user_email `string?` · user_id `string?` · user_ip `unknown`

### feedback_rate_limit

first_submission `string?` · id `string` · ip_address `unknown` · is_blocked `boolean?` · last_submission `string?` · submission_count `number?`

### homework_run_events

created_at `string` · event `Json` · id `string` · iteration `number` · run_id `string` · seq `number`

### homework_run_iterations

artifacts `Json?` · branch_id `string?` · created_at `string` · ended_at `string?` · error `string?` · error_fingerprint `string?` · id `string` · iteration `number` · metrics `Json` · progress_delta `Json?` · run_id `string` · started_at `string?` · status `string` · summary `string?`

### homework_runs

budgets `Json` · chat_session_id `string?` · completed_at `string?` · completion_criteria `Json?` · created_at `string` · duration_ms `number?` · id `string` · iteration `number` · last_error_fingerprint `string?` · max_iterations `number?` · metrics `Json` · objective `string` · project_ids `string[]?` · report `Json?` · scope `string` · started_at `string?` · status `string` · stop_reason `Json?` · updated_at `string` · user_id `string` · workspace_document_id `string?` · workspace_project_id `string?`

### inbox_items

action_kinds `string[]` · audience `string` · blocked_reason `string?` · created_at `string` · decided_at `string?` · expires_at `string?` · id `string` · project_id `string?` · risk_tier `number?` · snoozed_until `string?` · source_ref_id `string` · source_status `string?` · source_type `string` · status `string` · summary `string?` · title `string` · updated_at `string` · user_id `string?`

### legacy_entity_mappings

checksum `string?` · id `number` · legacy_id `string` · legacy_table `string` · metadata `Json` · migrated_at `string` · onto_id `string` · onto_table `string`

### legal_acceptance_intents

accepted_at `string` · client_ip `unknown` · created_at `string` · expires_at `string` · id `string` · intended_surface `string` · privacy_version `string` · terms_version `string` · token_hash `string` · used_at `string?` · used_by_user_id `string?` · user_agent `string?`

### legal_acceptances

acceptance_surface `string` · accepted_at `string` · client_ip `unknown` · created_at `string` · id `string` · intent_id `string` · privacy_version `string` · terms_version `string` · user_agent `string?` · user_id `string`

### migration_platform_lock

expires_at `string?` · id `number` · locked_at `string?` · locked_by `string?` · run_id `string?`

### native_search_cache

adapter_version `string` · cache_key `string` · created_at `string` · expires_at `string` · fetched_at `string?` · hit_count `number` · last_hit_at `string?` · lease_expires_at `string?` · owner_token `string?` · provider `string?` · provider_credits `number?` · provider_request_id `string?` · response `Json?` · response_version `string` · status `string` · updated_at `string`

### profile_access_audit

access_type `string` · actor_id `string?` · context_type `string?` · created_at `string` · document_ids `Json?` · id `string` · profile_id `string` · reason `string?`

### profile_document_embeddings

created_at `string` · document_id `string` · embedding `string` · embedding_dim `number` · id `string` · model_key `string` · updated_at `string`

### profile_document_sources

created_at `string` · document_version_id `string` · fragment_id `string?` · id `string` · source_id `string?` · source_type `string`

### profile_document_versions

change_type `string?` · content `string?` · created_at `string` · created_by `string?` · document_id `string` · id `string` · merge_run_id `string?` · number `number`

### profile_documents

content `string?` · created_at `string` · deleted_at `string?` · id `string` · profile_id `string` · props `Json` · search_vector `unknown` · sensitivity `string` · summary `string?` · title `string` · type_key `string` · updated_at `string` · usage_scope `string`

### profile_fragments

category `string` · confidence `number` · content `string` · created_at `string` · extracted_from_message_ids `Json?` · fingerprint_hash `string` · id `string` · idempotency_key `string` · profile_id `string` · sensitivity `string` · source_id `string?` · source_type `string` · status `string` · suggested_chapter_id `string?` · suggested_chapter_title `string?`

### question_tree_events

created_at `string` · event_type `string` · id `string` · node_id `string?` · payload `Json` · run_id `string` · seq `number`

### question_tree_nodes

answer `string?` · attempt_count `number` · completed_at `string?` · completion_tokens `number` · confidence `number?` · cost_usd `number` · created_at `string` · depth `number` · epistemic_assessment `Json?` · error_code `string?` · error_message `string?` · id `string` · latency_ms `number` · lease_expires_at `string?` · lease_owner `string?` · model_requested `string?` · model_used `string?` · node_kind `string` · node_number `number` · normalized_question `string` · parent_node_id `string?` · prompt_tokens `number` · provider_request_id `string?` · question `string` · reasoning_tokens `number` · run_id `string` · search_document `unknown` · sibling_index `number?` · started_at `string?` · status `string` · stop_reason `string?` · thesis `string?` · updated_at `string`

### question_tree_proposals

child_node_id `string?` · created_at `string` · duplicate_of_node_id `string?` · expected_information_gain `string` · id `string` · model_priority `number?` · normalized_question `string` · purpose `string` · question `string` · rank `number` · run_id `string` · scheduler_score `number?` · source_node_id `string` · status `string` · target_claim `string?` · updated_at `string` · validation_error `string?` · why_it_matters `string`

### question_tree_runs

advance_sequence `number` · completed_at `string?` · config `Json` · created_at `string` · created_by `string` · deepest_depth `number` · explorer_model_requested `string` · frontier_count `number` · id `string` · max_provider_requests `number` · model_policy `string` · next_batch_not_before `string?` · next_retry_at `string?` · node_limit `number` · nodes_completed `number` · nodes_created `number` · nodes_failed `number` · pause_reason `string?` · phase `string` · prompt_version `string` · provider_requests `number` · root_node_id `string?` · root_question `string` · started_at `string?` · status `string` · synthesis `Json?` · synthesis_model_requested `string` · updated_at `string` · usage `Json`

### recurring_task_instances

calendar_event_id `string?` · calendar_source_id `string?` · completed_at `string?` · created_at `string?` · id `string` · instance_date `string` · notes `string?` · skipped `boolean?` · status `string?` · task_id `string` · updated_at `string?` · user_id `string?`

### retargeting_founder_pilot_members

batch_id `string?` · campaign_id `string` · cohort_frozen_at `string` · cohort_id `string` · cohort_size `number` · conversion_window_days `number` · created_at `string` · email `string` · first_14d_activity_count `number` · first_activity_at `string?` · holdout `boolean` · id `string` · last_meaningful_activity_at `string?` · last_outbound_email_at `string?` · last_seen_at `string?` · lifetime_activity_count `number` · manual_stop `boolean` · manual_stop_at `string?` · manual_stop_reason `string?` · name `string?` · notes `string?` · pilot_segment `string` · prioritized_rank `number` · reply_recorded_at `string?` · reply_status `string` · touch_1_sent_at `string?` · touch_2_sent_at `string?` · touch_3_sent_at `string?` · updated_at `string` · user_id `string` · variant `string`

### retargeting_founder_pilot_sends

batch_id `string` · campaign_id `string` · cohort_id `string` · created_at `string` · email_id `string?` · failed_at `string?` · failure_reason `string?` · id `string` · member_id `string` · metadata `Json` · queued_by_admin `string?` · recipient_email `string` · scheduled_for `string` · sent_at `string?` · sent_by_admin `string?` · skipped_at `string?` · status `string` · step `string` · trigger_mode `string` · trigger_source `string` · updated_at `string` · user_id `string?` · variant `string`

### security_event_daily_rollups

category `string` · event_count `number` · event_type `string` · first_seen_at `string?` · id `string` · last_seen_at `string?` · max_risk_score `number?` · outcome `string` · rollup_date `string` · severity `string` · unique_actor_user_count `number` · unique_external_agent_caller_count `number` · updated_at `string`

### security_events

actor_type `string` · actor_user_id `string?` · category `string` · created_at `string` · event_type `string` · external_agent_caller_id `string?` · id `string` · ip_address `unknown` · metadata `Json` · outcome `string` · reason `string?` · request_id `string?` · risk_score `number?` · session_id `string?` · severity `string` · target_id `string?` · target_type `string?` · user_agent `string?`

### time_blocks

ai_suggestions `Json?` · block_type `string` · calendar_event_id `string?` · calendar_event_link `string?` · calendar_source_id `string?` · created_at `string` · duration_minutes `number` · end_time `string` · id `string` · last_synced_at `string?` · project_id `string?` · start_time `string` · suggestions_generated_at `string?` · suggestions_model `string?` · suggestions_state `Json?` · suggestions_summary `string?` · sync_source `string?` · sync_status `string` · timezone `string` · updated_at `string` · user_id `string`

### user_behavioral_profiles

agent_instructions `string` · analysis_version `number` · computed_at `string` · confidence `number` · created_at `string` · dimensions `Json` · id `string` · next_analysis_trigger `Json` · onboarding_seed `Json?` · patterns `Json` · project_summary `Json` · session_count `number` · updated_at `string` · user_context `Json` · user_id `string`

### user_buildos_agents

agent_handle `string` · created_at `string` · default_policy `Json` · id `string` · metadata `Json` · status `string` · updated_at `string` · user_id `string`

### user_project_behavioral_profiles

agent_instructions `string` · computed_at `string` · confidence `number` · created_at `string` · dimensions `Json` · id `string` · patterns `Json` · project_id `string` · session_count `number` · updated_at `string` · user_id `string`

### voice_note_groups

chat_session_id `string?` · created_at `string` · deleted_at `string?` · id `string` · linked_entity_id `string?` · linked_entity_type `string?` · metadata `Json` · status `string` · updated_at `string` · user_id `string`

### voice_notes

created_at `string` · deleted_at `string?` · duration_seconds `number?` · file_size_bytes `number` · group_id `string?` · id `string` · linked_entity_id `string?` · linked_entity_type `string?` · metadata `Json` · mime_type `string` · recorded_at `string?` · segment_index `number?` · storage_bucket `string` · storage_path `string` · transcript `string?` · transcription_error `string?` · transcription_model `string?` · transcription_status `string` · updated_at `string` · user_id `string`
