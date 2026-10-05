-- supabase/tests/fixtures/account_deletion_purge_seed.sql
-- TEST FIXTURE ONLY (account_deletion_purge.check.sql). Disposable database only.
-- Runs inside the check's transaction after the two people (U = d9…01 deletes, O = d9…02 stays),
-- their actors (d9…11 / d9…12), U's project d9…21, O's shared project d9…22 and task d9…31.
-- Rows the generic seeder cannot build (CHECKs, triggers, hash columns), pointing at U.

-- A chat session and turn in U's project: the parents of every chat_turn_* child below.
INSERT INTO public.chat_sessions (id, user_id, title, context_type, entity_id, chat_type) VALUES
	('d9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'Gone chat', 'project', 'd9000000-0000-4000-8000-000000000021', 'project');
INSERT INTO public.chat_turn_runs (id, session_id, user_id, stream_run_id, context_type, entity_id, project_id, request_message, execution_generation) VALUES
	('d9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'stream-d9-102', 'project', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000021', 'Review my project', 1);

-- One reserved tool effect for the turn.
INSERT INTO public.chat_turn_effects (id, turn_run_id, session_id, user_id, execution_generation, tool_name, operation_name, canonical_argument_hash, downstream_idempotency_supported) VALUES
	('d9000000-0000-4000-8000-000000000103', 'd9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 1, 'update_task', 'onto.task.update', repeat('a', 64), false);

-- Cycles: a user-level cycle for U and one run of it.
INSERT INTO public.cycles (id, user_id, create_request_id, create_request_fingerprint, label, kind, target_type) VALUES
	('d9000000-0000-4000-8000-000000000110', 'd9000000-0000-4000-8000-000000000001', 'req-d9-110', repeat('b', 64), 'Weekly look', 'review', 'user');
INSERT INTO public.cycle_runs (id, cycle_id, cycle_version, user_id, kind, trigger, status, triggered_at, occurrence_key, idempotency_key, definition_snapshot, execution_input, delivery_intent) VALUES
	('d9000000-0000-4000-8000-000000000111', 'd9000000-0000-4000-8000-000000000110', 1, 'd9000000-0000-4000-8000-000000000001', 'review', 'manual', 'queued', now(), 'occ-d9-111', 'idem-d9-111', '{}', '{}', '{"mode": "evaluate"}');

-- The turn's immutable input artifact.
INSERT INTO public.chat_turn_input_artifacts (id, turn_run_id, session_id, user_id, artifact_version, history_source, history, prepared, content_hash, history_bytes, content_bytes) VALUES
	('d9000000-0000-4000-8000-000000000104', 'd9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'agentic_chat_input_v2', 'admission_window', '[]', '{}', repeat('c', 64), 2, 64);

-- A second session with a turn U cancelled, plus the cancel signal the trigger demands (one active turn per session).
INSERT INTO public.chat_sessions (id, user_id, title, context_type, entity_id, chat_type) VALUES
	('d9000000-0000-4000-8000-000000000109', 'd9000000-0000-4000-8000-000000000001', 'Gone cancelled chat', 'project', 'd9000000-0000-4000-8000-000000000021', 'project');
INSERT INTO public.chat_turn_runs (id, session_id, user_id, stream_run_id, context_type, entity_id, project_id, request_message, execution_generation, status, cancel_requested_at, cancel_reason) VALUES
	('d9000000-0000-4000-8000-000000000105', 'd9000000-0000-4000-8000-000000000109', 'd9000000-0000-4000-8000-000000000001', 'stream-d9-105', 'project', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000021', 'Never mind', 1, 'running', now(), 'user_cancelled');
INSERT INTO public.chat_turn_signals (id, turn_run_id, session_id, user_id, reason, source) VALUES
	('d9000000-0000-4000-8000-000000000106', 'd9000000-0000-4000-8000-000000000105', 'd9000000-0000-4000-8000-000000000109', 'd9000000-0000-4000-8000-000000000001', 'user_cancelled', 'browser');

-- Workflow run for the first turn (preparing phase), its planner step, one dispatch and the specialist snapshot.
INSERT INTO public.chat_turn_workflow_runs (turn_run_id, session_id, user_id, request_artifact_id, project_id, policy, policy_ref, request_hash, max_spend_micro_usd, synthesis_headroom_micro_usd, max_physical_dispatches, max_step_attempts, whole_run_lifetime_ms) VALUES
	('d9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000104', 'd9000000-0000-4000-8000-000000000021', '{}', 'internal-document-organization:v2', repeat('d', 64), 1000000, 100000, 8, 2, 600000);
INSERT INTO public.chat_turn_workflow_steps (turn_run_id, session_id, user_id, plan_version, step_key, capability, depends_on, assignment) VALUES
	('d9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'agentic_chat_project_review_plan_v1', 'planner', 'plan_review', ARRAY[]::text[], '{}');
INSERT INTO public.chat_turn_workflow_dispatches (dispatch_id, turn_run_id, session_id, user_id, step_key, step_attempt_id, physical_attempt, dispatch_kind, model_requested, pricing, serialized_request_bytes, estimated_input_tokens, max_output_tokens, reserved_micro_usd, reserved_generation) VALUES
	('d9000000-0000-4000-8000-000000000107', 'd9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'planner', 'd9000000-0000-4000-8000-000000000108', 1, 'planner', 'test/model', '{}', 100, 1124, 100, 458, 1);
INSERT INTO public.chat_turn_specialist_snapshots (turn_run_id, user_id, session_id, project_id, request_hash, snapshot, snapshot_hash)
	SELECT 'd9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000021', repeat('d', 64), s.snapshot,
		public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(s.snapshot))
	FROM (SELECT '{"version": "agentic_chat_specialist_snapshot_v2", "profileId": "document_organization", "profileVersion": "1", "engineVersion": "agentic_chat_workflow_v1"}'::jsonb AS snapshot) AS s;

-- Ontology parents: a document in each project and a task in U's own project.
INSERT INTO public.onto_documents (id, project_id, title, type_key, created_by) VALUES
	('d9000000-0000-4000-8000-000000000120', 'd9000000-0000-4000-8000-000000000022', 'Shared notes', 'document.default', 'd9000000-0000-4000-8000-000000000011'),
	('d9000000-0000-4000-8000-000000000121', 'd9000000-0000-4000-8000-000000000021', 'Gone notes', 'document.default', 'd9000000-0000-4000-8000-000000000011');
INSERT INTO public.onto_tasks (id, project_id, title, created_by) VALUES
	('d9000000-0000-4000-8000-000000000122', 'd9000000-0000-4000-8000-000000000021', 'Gone task', 'd9000000-0000-4000-8000-000000000011');

-- U's activity in O's shared project: a comment on the shared task, a document proposal, and U assigned to the shared task.
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, root_id, body, created_by) VALUES
	('d9000000-0000-4000-8000-000000000123', 'd9000000-0000-4000-8000-000000000022', 'task', 'd9000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000123', 'I can take this one.', 'd9000000-0000-4000-8000-000000000011');
INSERT INTO public.onto_document_proposals (id, project_id, document_id, created_by_actor_id, instruction, patch, patch_hash, base_content_hash, result_content_hash)
	SELECT 'd9000000-0000-4000-8000-000000000124', 'd9000000-0000-4000-8000-000000000022', 'd9000000-0000-4000-8000-000000000120', 'd9000000-0000-4000-8000-000000000011', 'Tighten the intro',
		jsonb_build_object('schema_version', '1', 'project_id', 'd9000000-0000-4000-8000-000000000022', 'document_id', 'd9000000-0000-4000-8000-000000000120', 'base_content_hash', repeat('e', 64), 'patch_hash', repeat('f', 64)),
		repeat('f', 64), repeat('e', 64), repeat('1', 64);
INSERT INTO public.onto_task_assignees (id, project_id, task_id, assignee_actor_id, assigned_by_actor_id) VALUES
	('d9000000-0000-4000-8000-000000000125', 'd9000000-0000-4000-8000-000000000022', 'd9000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000012');

-- An asset in U's project, linked to U's document.
INSERT INTO public.onto_assets (id, project_id, storage_path, content_type, file_size_bytes, created_by) VALUES
	('d9000000-0000-4000-8000-000000000126', 'd9000000-0000-4000-8000-000000000021', 'projects/d9000000-0000-4000-8000-000000000021/assets/d9000000-0000-4000-8000-000000000126/photo.png', 'image/png', 1024, 'd9000000-0000-4000-8000-000000000011');
INSERT INTO public.onto_asset_links (id, project_id, asset_id, entity_kind, entity_id, created_by) VALUES
	('d9000000-0000-4000-8000-000000000127', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000126', 'document', 'd9000000-0000-4000-8000-000000000121', 'd9000000-0000-4000-8000-000000000011');

-- A daily brief for U.
INSERT INTO public.daily_briefs (id, user_id, brief_date, summary_content, generation_status) VALUES
	('d9000000-0000-4000-8000-000000000130', 'd9000000-0000-4000-8000-000000000001', '2026-10-01', 'Quiet day.', 'completed');

-- Gmail relevance: U's connection, scan memo, project rule, project profile and its first version, and one scan run.
INSERT INTO public.user_email_connections (id, user_id, provider_account_id, email_address, account_label) VALUES
	('d9000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000001', 'acct-d9-131', 'inbox@fixture.invalid', 'Fixture inbox');
INSERT INTO public.email_scan_checks (user_id, connection_id, scope_key, message_key, relevance, relevant) VALUES
	('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000131', 'project:d9000000-0000-4000-8000-000000000021:v1', repeat('a', 32), 0.5, true);
INSERT INTO public.email_project_rules (id, user_id, project_id, connection_id, rule_kind, match_value_hash, match_value_ciphertext) VALUES
	('d9000000-0000-4000-8000-000000000132', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000131', 'always_sender', repeat('a', 64), 'enc:gmail-relevance:v1.fixture');
INSERT INTO public.email_project_profiles (id, user_id, project_id) VALUES
	('d9000000-0000-4000-8000-000000000133', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000021');
INSERT INTO public.email_project_profile_versions (id, profile_id, profile_version, compiler_version, source_snapshot_at, profile_hash, groups) VALUES
	('d9000000-0000-4000-8000-000000000134', 'd9000000-0000-4000-8000-000000000133', 1, 'project-email-profile-v1', now(), repeat('b', 64),
		'{"identity": [], "actors": [], "artifacts": [], "identifiers": [], "semantic_context": [], "negative_evidence": [], "user_rules": [], "recency": []}');
INSERT INTO public.email_relevance_scan_runs (id, user_id, idempotency_key_hash, window_start, window_end, message_cap_per_connection, query_policy_version, control_plane_version, serializer_version, quota_policy_version, manifest_hash, configuration, gmail_quota_budget, runtime_ms_budget, connection_count, project_count, expires_at, created_at)
	VALUES ('d9000000-0000-4000-8000-000000000135', 'd9000000-0000-4000-8000-000000000001', repeat('c', 64), '2026-09-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00', 1000, 'inbox-sent-exclude-spam-trash-drafts-v1', 'email-relevance-scan-control-plane-v1', 'email-relevance-scan-serializer-v1', 'email-relevance-gmail-quota-v1', repeat('d', 64),
		jsonb_build_object(
			'manifest_schema_version', 'email-relevance-scan-manifest-v1', 'control_plane_version', 'email-relevance-scan-control-plane-v1',
			'serializer_version', 'email-relevance-scan-serializer-v1', 'profile_compiler_version', 'project-email-profile-v1',
			'quota_policy_version', 'email-relevance-gmail-quota-v1', 'query_policy_version', 'inbox-sent-exclude-spam-trash-drafts-v1',
			'start_mode', 'manual', 'user_id', 'd9000000-0000-4000-8000-000000000001',
			'connection_ids', jsonb_build_array('d9000000-0000-4000-8000-000000000131'),
			'projects', jsonb_build_array(jsonb_build_object('project_id', 'd9000000-0000-4000-8000-000000000021', 'profile_id', 'd9000000-0000-4000-8000-000000000133', 'profile_version', 1, 'profile_hash', repeat('b', 64))),
			'window_start', '2026-09-01T00:00:00+00:00', 'window_end', '2026-10-01T00:00:00+00:00', 'expires_at', '2026-10-04T20:00:00+00:00',
			'message_cap_per_connection', 1000, 'metadata_batch_ceiling', 50,
			'per_connection_budgets', jsonb_build_object('gmail_quota_units', 20050, 'runtime_ms', 1200000, 'raw_content_bytes', 0, 'model_tokens', 0, 'model_cost_micros', 0),
			'global_budgets', jsonb_build_object('gmail_quota_units', 20050, 'runtime_ms', 1200000, 'raw_content_bytes', 0, 'model_tokens', 0, 'model_cost_micros', 0)),
		20050, 1200000, 1, 1, '2026-10-04T20:00:00+00:00', '2026-10-04T12:00:00+00:00');

-- A consolidation run and an agent operative scoped to U's project.
INSERT INTO public.consolidation_runs (id, user_id, root_project_id, project_ids) VALUES
	('d9000000-0000-4000-8000-000000000136', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000021', ARRAY['d9000000-0000-4000-8000-000000000021']::uuid[]);
INSERT INTO public.agent_operatives (id, user_id, label, goal, context_type, project_id) VALUES
	('d9000000-0000-4000-8000-000000000137', 'd9000000-0000-4000-8000-000000000001', 'Gone operative', 'Watch the project', 'project', 'd9000000-0000-4000-8000-000000000021');

-- Two of U's contacts and a merge candidate between them.
INSERT INTO public.user_contacts (id, user_id, display_name) VALUES
	('d9000000-0000-4000-8000-000000000138', 'd9000000-0000-4000-8000-000000000001', 'Pat Example'),
	('d9000000-0000-4000-8000-000000000139', 'd9000000-0000-4000-8000-000000000001', 'Patricia Example');
INSERT INTO public.user_contact_merge_candidates (id, user_id, primary_contact_id, secondary_contact_id, reason, score) VALUES
	('d9000000-0000-4000-8000-00000000013a', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000138', 'd9000000-0000-4000-8000-000000000139', 'similar name', 0.8);

-- Question tree: U's run, its root node, and the run's root pointer.
INSERT INTO public.question_tree_runs (id, created_by, root_question, explorer_model_requested, synthesis_model_requested) VALUES
	('d9000000-0000-4000-8000-00000000013b', 'd9000000-0000-4000-8000-000000000001', 'What matters most here?', 'test/explorer', 'test/synthesis');
INSERT INTO public.question_tree_nodes (id, run_id, node_kind, node_number, depth, question, normalized_question) VALUES
	('d9000000-0000-4000-8000-00000000013c', 'd9000000-0000-4000-8000-00000000013b', 'root', 0, 0, 'What matters most here?', 'what matters most here');

-- A page U's agent visited: version 1 and the visit row pointing at it.
INSERT INTO public.web_page_visits (id, url, final_url, normalized_url, status_code, user_id) VALUES
	('d9000000-0000-4000-8000-00000000013d', 'https://example.com/page', 'https://example.com/page', 'example.com/page', 200, 'd9000000-0000-4000-8000-000000000001');
INSERT INTO public.web_page_versions (id, web_page_visit_id, version_number, content_hash, requested_url, final_url, status_code, content, content_format, fetched_at, extraction_method, extraction_version) VALUES
	('d9000000-0000-4000-8000-00000000013e', 'd9000000-0000-4000-8000-00000000013d', 1, repeat('e', 64), 'https://example.com/page', 'https://example.com/page', 200, 'Example page', 'text', now(), 'static', 'v1');

-- One provider-attempt observation for U's first turn.
INSERT INTO public.agentic_chat_execution_observations (turn_run_id, session_id, user_id, execution_generation, observation_key, phase, event_type, payload) VALUES
	('d9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 1, repeat('f', 64), 'provider', 'provider_attempt_started', '{}');

-- Specialist workbench: U's draft, its published version, and a recommendation (hash columns computed by the same functions the CHECKs use).
INSERT INTO public.agentic_chat_specialist_drafts (id, user_id, revision, draft, draft_hash)
	SELECT 'd9000000-0000-4000-8000-000000000140', 'd9000000-0000-4000-8000-000000000001', 1, d.draft, public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(d.draft))
	FROM (SELECT '{"schemaVersion": "specialist_workbench_draft_v1"}'::jsonb AS draft) AS d;
INSERT INTO public.agentic_chat_specialist_versions (draft_id, user_id, version, draft_revision, snapshot, snapshot_hash)
	SELECT dr.id, dr.user_id, 1, 1, s.snapshot, public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(s.snapshot))
	FROM public.agentic_chat_specialist_drafts AS dr
	CROSS JOIN LATERAL (
		SELECT jsonb_build_object('schemaVersion', 'specialist_workbench_version_v1', 'activation', 'catalog_only', 'profile', 'document_evidence_v1',
			'draftId', dr.id, 'draftRevision', 1, 'draftHash', dr.draft_hash, 'definition', jsonb_build_object('version', 1, 'label', 'Fixture specialist')) AS snapshot
	) AS s
	WHERE dr.id = 'd9000000-0000-4000-8000-000000000140';
INSERT INTO public.agentic_chat_specialist_recommendations (id, user_id, project_id, question, input, input_hash, attempt_token)
	SELECT 'd9000000-0000-4000-8000-000000000141', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000021', 'Which specialist?', i.input,
		public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(i.input)), 'd9000000-0000-4000-8000-000000000142'
	FROM (SELECT jsonb_build_object('version', 'specialist_recommendation_input_v1', 'policy', 'jev_specialist_choice_v1', 'projectId', 'd9000000-0000-4000-8000-000000000021',
		'question', 'Which specialist?', 'candidates', '[]'::jsonb) AS input) AS i;

-- Answer comparison U ran: two candidate answers and U's vote.
INSERT INTO public.agentic_chat_answer_comparisons (id, user_id, title, question, set_kind, source_packet, source_packet_sha256, rubric)
	SELECT 'd9000000-0000-4000-8000-000000000143', 'd9000000-0000-4000-8000-000000000001', 'Fixture comparison', 'Which answer is better?', 'exploratory', p.packet,
		public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p.packet)), '{"version": "answer_comparison_rubric_v1", "requiredFacts": []}'
	FROM (SELECT '{"version": "answer_comparison_source_packet_v1", "question": "Which answer is better?"}'::jsonb AS packet) AS p;
INSERT INTO public.agentic_chat_answer_comparison_candidates (id, comparison_id, user_id, position, identity, answer, answer_sha256, receipts, source_packet_sha256)
	SELECT c.id, cmp.id, cmp.user_id, c.position, jsonb_build_object('version', 'answer_comparison_candidate_identity_v1', 'kind', 'manual', 'name', c.name),
		c.answer, public.agentic_chat_sha256_hex_v1(c.answer), '{"version": "answer_comparison_receipts_v1"}', cmp.source_packet_sha256
	FROM public.agentic_chat_answer_comparisons AS cmp
	CROSS JOIN (VALUES
		('d9000000-0000-4000-8000-000000000144'::uuid, 1, 'Answer A', 'First answer.'),
		('d9000000-0000-4000-8000-000000000145'::uuid, 2, 'Answer B', 'Second answer.')
	) AS c(id, position, name, answer)
	WHERE cmp.id = 'd9000000-0000-4000-8000-000000000143';
INSERT INTO public.agentic_chat_answer_comparison_votes (comparison_id, reviewer_user_id, label_assignment, choice, preferred_candidate_id, reason, rubric_scores) VALUES
	('d9000000-0000-4000-8000-000000000143', 'd9000000-0000-4000-8000-000000000001', '{}', 'candidate', 'd9000000-0000-4000-8000-000000000144', 'Clearer.', '{}');

-- A Libri image upload U requested (library and book first; the path CHECK ties the intent to its library).
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	('d9000000-0000-4000-8000-000000000150', 'gone-library', 'Gone library', 'd9000000-0000-4000-8000-000000000001');
INSERT INTO libri.books (id, library_id, title) VALUES
	('d9000000-0000-4000-8000-000000000151', 'd9000000-0000-4000-8000-000000000150', 'Gone book');
INSERT INTO libri.image_upload_intents (id, library_id, book_id, requested_by, idempotency_key, file_metadata, object_path, created_at, signing_deadline, expires_at) VALUES
	('d9000000-0000-4000-8000-000000000152', 'd9000000-0000-4000-8000-000000000150', 'd9000000-0000-4000-8000-000000000151', 'd9000000-0000-4000-8000-000000000001', 'idem-key-d9-0000152', '{}',
		'd9000000-0000-4000-8000-000000000150/uploads/d9000000-0000-4000-8000-000000000152/original.png', '2026-10-04T12:00:00+00:00', '2026-10-04T12:10:00+00:00', '2026-10-04T14:15:00+00:00');

-- The first turn's live stream state and one event (generation must match the turn's).
INSERT INTO public.chat_turn_stream_state (turn_run_id, session_id, user_id, execution_generation) VALUES
	('d9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 1);
INSERT INTO public.chat_turn_events (id, turn_run_id, session_id, user_id, stream_run_id, sequence_index, phase, event_type, execution_generation) VALUES
	('d9000000-0000-4000-8000-000000000160', 'd9000000-0000-4000-8000-000000000102', 'd9000000-0000-4000-8000-000000000101', 'd9000000-0000-4000-8000-000000000001', 'stream-d9-102', 1, 'run', 'turn_started', 1);

-- The scan run's per-connection row (parent of the Gmail observations, review samples and candidates).
INSERT INTO public.email_relevance_scan_connections (id, run_id, connection_id, message_cap, metadata_batch_ceiling, gmail_quota_budget, runtime_ms_budget) VALUES
	('d9000000-0000-4000-8000-000000000161', 'd9000000-0000-4000-8000-000000000135', 'd9000000-0000-4000-8000-000000000131', 1000, 50, 20050, 1200000);

-- One scanned message, the project it was matched to, U's review sample of that match and U's verdict.
INSERT INTO public.email_relevance_message_observations (id, user_id, run_id, connection_scope_id, provider_message_id_hash, provider_message_id_ciphertext, provider_thread_id_hash, provider_thread_id_ciphertext, key_version, discovery_page, retention_expires_at, created_at) VALUES
	('d9000000-0000-4000-8000-000000000165', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000135', 'd9000000-0000-4000-8000-000000000161', repeat('1', 64), 'enc:gmail-relevance:v1.fixture', repeat('2', 64), 'enc:gmail-relevance:v1.fixture', 1, 1, '2026-10-08T12:00:00+00:00', '2026-10-04T12:00:00+00:00');
INSERT INTO public.email_relevance_project_candidates (id, observation_id, user_id, project_id, profile_version_id, variant, scorer_version, policy_version, score, confidence, retention_expires_at, created_at) VALUES
	('d9000000-0000-4000-8000-000000000166', 'd9000000-0000-4000-8000-000000000165', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000134', 'a', 'email-relevance-ab-scorer-v1', 'email-relevance-metadata-policy-v1', 80, 0.8, '2026-10-08T12:00:00+00:00', '2026-10-04T12:00:00+00:00');
INSERT INTO public.email_relevance_review_samples (id, user_id, run_id, connection_scope_id, source_observation_id, project_id, profile_version_id, candidate_a_id, sampling_stratum, sample_key_hash, sample_order, stratum_population_size, stratum_sample_size, sampling_weight, a_score, a_confidence, source_retention_expires_at, created_at) VALUES
	('d9000000-0000-4000-8000-000000000167', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000135', 'd9000000-0000-4000-8000-000000000161', 'd9000000-0000-4000-8000-000000000165', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000134', 'd9000000-0000-4000-8000-000000000166', 'a_only', repeat('3', 64), 1, 1, 1, 1, 80, 0.8, '2026-10-08T12:00:00+00:00', '2026-10-04T12:00:00+00:00');
INSERT INTO public.email_relevance_adjudications (id, sample_id, user_id, run_id, reviewer_user_id, decision, idempotency_key_hash, decision_hash) VALUES
	('d9000000-0000-4000-8000-000000000168', 'd9000000-0000-4000-8000-000000000167', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000135', 'd9000000-0000-4000-8000-000000000001', 'correct_project', repeat('4', 64), repeat('5', 64));

-- U publishes a page for their document: the page, a review attempt and a slug rename.
INSERT INTO public.onto_public_pages (id, project_id, document_id, slug, title, created_by, updated_by) VALUES
	('d9000000-0000-4000-8000-000000000162', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000121', 'gone-notes', 'Gone notes', 'd9000000-0000-4000-8000-000000000011', 'd9000000-0000-4000-8000-000000000011');
INSERT INTO public.onto_public_page_review_attempts (id, project_id, document_id, public_page_id, source, status, created_by) VALUES
	('d9000000-0000-4000-8000-000000000163', 'd9000000-0000-4000-8000-000000000021', 'd9000000-0000-4000-8000-000000000121', 'd9000000-0000-4000-8000-000000000162', 'publish_confirm', 'passed', 'd9000000-0000-4000-8000-000000000011');
INSERT INTO public.onto_public_page_slug_history (id, public_page_id, project_id, old_slug, new_slug, changed_by) VALUES
	('d9000000-0000-4000-8000-000000000164', 'd9000000-0000-4000-8000-000000000162', 'd9000000-0000-4000-8000-000000000021', 'notes', 'gone-notes', 'd9000000-0000-4000-8000-000000000011');
