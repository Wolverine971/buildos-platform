// apps/worker/tests/purgeSoftDeletedItems.postgres.test.ts
//
// Tasker 103 (PURGE): "delete means delete". A disposable, socket-only local
// PostgreSQL gets supabase/tests/fixtures/purge_soft_deleted_items_base.sql (with
// the real delete_onto_project() migration), the task archive-state migration and
// the purge migration, then the worker job runs against it: rows deleted 31 days
// ago go with their copies and storage objects; rows deleted 29 days ago, archived
// tasks and live rows stay.
// No hosted database and no paid call exists anywhere in this file.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	type PrivacyRetentionClient,
	type PrivacyRetentionSummary,
	PRIVACY_RETENTION_TASKS,
	runPrivacyRetention
} from '../src/scheduler/privacyRetention';

const REPOSITORY_ROOT = resolve(process.cwd(), '../..');
const FIXTURE = 'supabase/tests/fixtures/purge_soft_deleted_items_base.sql';
const ARCHIVE_MIGRATION = 'supabase/migrations/20260924190350_task_archive_state.sql';
const MIGRATION = 'supabase/migrations/20260924190400_purge_soft_deleted_items.sql';

const PURGE_TASKS = PRIVACY_RETENTION_TASKS.filter(
	(task) =>
		task.rpc.startsWith('list_privacy_deleted_') ||
		task.rpc.startsWith('cleanup_privacy_deleted_')
);

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

async function availablePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			server.close(() => resolvePort(port));
		});
	});
}

// Fixed ids keep the assertions readable.
const U = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'a1111111-1111-4111-8111-111111111111';
const P_LIVE = 'b0000000-0000-4000-8000-000000000001';
const P_OLD = 'b0000000-0000-4000-8000-000000000002';
const P_YOUNG = 'b0000000-0000-4000-8000-000000000003';
const D_OLD = 'd0000000-0000-4000-8000-000000000001';
const D_YOUNG = 'd0000000-0000-4000-8000-000000000002';
const D_LIVE = 'd0000000-0000-4000-8000-000000000003';
const D_IN_OLD = 'd0000000-0000-4000-8000-000000000004';
const T_OLD = 'e0000000-0000-4000-8000-000000000001';
const T_LIVE = 'e0000000-0000-4000-8000-000000000002';
const T_PLANNED = 'e0000000-0000-4000-8000-000000000003';
const T_IN_OLD = 'e0000000-0000-4000-8000-000000000004';
const T_OLD_IN_YOUNG = 'e0000000-0000-4000-8000-000000000005';
const T_ARCHIVED = 'e0000000-0000-4000-8000-000000000006';
const T_ARCHIVED_IN_OLD = 'e0000000-0000-4000-8000-000000000007';
const PL_OLD = 'f0000000-0000-4000-8000-000000000001';
const E_OLD = 'c0000000-0000-4000-8000-000000000001';
const E_PERSONAL = 'c0000000-0000-4000-8000-000000000002';
const E_IN_OLD = 'c0000000-0000-4000-8000-000000000003';
const A_OLD = 'aa000000-0000-4000-8000-000000000001';
const A_LIVE = 'aa000000-0000-4000-8000-000000000002';
const A_IN_OLD = 'aa000000-0000-4000-8000-000000000003';
const A_YOUNG = 'aa000000-0000-4000-8000-000000000004';
const C1 = '9c000000-0000-4000-8000-000000000001';
const C2 = '9c000000-0000-4000-8000-000000000002';
const C3 = '9c000000-0000-4000-8000-000000000003';
const C4 = '9c000000-0000-4000-8000-000000000004';
const C5 = '9c000000-0000-4000-8000-000000000005';
const C6 = '9c000000-0000-4000-8000-000000000006';
const EDGE_OLD = '9e000000-0000-4000-8000-000000000001';
const EDGE_LIVE = '9e000000-0000-4000-8000-000000000002';
const CY_OLD = '9f000000-0000-4000-8000-000000000001';
const CY_IN_OLD = '9f000000-0000-4000-8000-000000000002';
const CY_LIVE = '9f000000-0000-4000-8000-000000000003';
const TR_REFERENCED = '9d000000-0000-4000-8000-000000000001';
const TR_FREE = '9d000000-0000-4000-8000-000000000002';

const OLD = `now() - interval '31 days'`;
const YOUNG = `now() - interval '29 days'`;

const SEED = `
INSERT INTO auth.users (id) VALUES ('${U}');
INSERT INTO public.users (id) VALUES ('${U}');
INSERT INTO public.onto_actors (id, user_id, name) VALUES ('${ACTOR}', '${U}', 'DJ');

INSERT INTO public.onto_projects (id, name, created_by, deleted_at, doc_structure) VALUES
	('${P_LIVE}', 'Live project', '${ACTOR}', NULL,
		'{"version": 3, "root": [{"id": "${D_LIVE}", "title": "Live doc"}]}'),
	('${P_OLD}', 'Secret launch', '${ACTOR}', ${OLD}, '{"version": 1, "root": []}'),
	('${P_YOUNG}', 'Young project', '${ACTOR}', ${YOUNG}, '{"version": 1, "root": []}');

-- Live project: documents
INSERT INTO public.onto_documents (id, project_id, title, content, created_by, deleted_at) VALUES
	('${D_OLD}', '${P_LIVE}', 'Old secret doc', 'old body', '${ACTOR}', ${OLD}),
	('${D_YOUNG}', '${P_LIVE}', 'Young doc', 'young body', '${ACTOR}', ${YOUNG}),
	('${D_LIVE}', '${P_LIVE}', 'Live doc', 'live body', '${ACTOR}', NULL);
UPDATE public.onto_projects SET context_document_id = '${D_OLD}' WHERE id = '${P_LIVE}';
INSERT INTO public.onto_document_versions (document_id, number, props) VALUES
	('${D_OLD}', 1, '{"content": "old v1"}'), ('${D_OLD}', 2, '{"content": "old v2"}'),
	('${D_YOUNG}', 1, '{"content": "young v1"}'), ('${D_LIVE}', 1, '{"content": "live v1"}');
INSERT INTO public.onto_document_proposals (project_id, document_id, instruction) VALUES
	('${P_LIVE}', '${D_OLD}', 'tighten the old doc');
INSERT INTO public.onto_public_pages (project_id, document_id, slug, published_content) VALUES
	('${P_LIVE}', '${D_OLD}', 'old-doc', 'old body');
INSERT INTO public.onto_project_structure_history (project_id, version, doc_structure) VALUES
	('${P_LIVE}', 1, '{"version": 1, "root": [{"id": "${D_LIVE}", "title": "Live doc", "children": [{"id": "${D_OLD}", "title": "Old secret doc"}]}]}'),
	('${P_LIVE}', 2, '{"version": 2, "root": [{"id": "${D_LIVE}", "title": "Live doc"}]}');

-- Live project: tasks, plan, events, assets
INSERT INTO public.onto_plans (id, project_id, name, created_by, deleted_at) VALUES
	('${PL_OLD}', '${P_LIVE}', 'Old plan', '${ACTOR}', ${OLD});
INSERT INTO public.onto_tasks (id, project_id, plan_id, title, created_by, deleted_at) VALUES
	('${T_OLD}', '${P_LIVE}', NULL, 'Old task', '${ACTOR}', ${OLD}),
	('${T_LIVE}', '${P_LIVE}', NULL, 'Live task', '${ACTOR}', NULL),
	('${T_PLANNED}', '${P_LIVE}', '${PL_OLD}', 'Planned task', '${ACTOR}', NULL);
-- Archived on the board 31 days ago: kept until the person deletes it.
INSERT INTO public.onto_tasks (id, project_id, title, created_by, deleted_at, archived_at) VALUES
	('${T_ARCHIVED}', '${P_LIVE}', 'Archived task', '${ACTOR}', ${OLD}, ${OLD});
INSERT INTO public.onto_task_assignees (project_id, task_id, assignee_actor_id) VALUES
	('${P_LIVE}', '${T_OLD}', '${ACTOR}');
INSERT INTO public.onto_events (id, project_id, title, created_by, deleted_at) VALUES
	('${E_OLD}', '${P_LIVE}', 'Old meeting', '${ACTOR}', ${OLD}),
	('${E_PERSONAL}', NULL, 'Personal thing', '${ACTOR}', ${OLD});
INSERT INTO public.onto_event_sync (event_id, user_id, external_event_id, external_calendar_id, sync_status) VALUES
	('${E_OLD}', '${U}', 'g-old', 'cal-live', 'cancelled');
INSERT INTO public.onto_assets (id, project_id, storage_path, caption, created_by, deleted_at) VALUES
	('${A_OLD}', '${P_LIVE}', 'projects/${P_LIVE}/assets/${A_OLD}/original.png', 'old photo', '${ACTOR}', ${OLD}),
	('${A_LIVE}', '${P_LIVE}', 'projects/${P_LIVE}/assets/${A_LIVE}/original.png', 'live photo', '${ACTOR}', NULL),
	('${A_YOUNG}', '${P_LIVE}', 'projects/${P_LIVE}/assets/${A_YOUNG}/original.png', 'young photo', '${ACTOR}', ${YOUNG});
INSERT INTO public.onto_asset_links (project_id, asset_id, entity_kind, entity_id) VALUES
	('${P_LIVE}', '${A_LIVE}', 'document', '${D_OLD}'),
	('${P_LIVE}', '${A_LIVE}', 'document', '${D_LIVE}');
INSERT INTO public.chat_message_attachments (project_id, asset_id, storage_path) VALUES
	('${P_LIVE}', '${A_OLD}', 'projects/${P_LIVE}/assets/${A_OLD}/original.png');

-- Live project: copies keyed to the old rows
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, rel, dst_kind, dst_id) VALUES
	('${EDGE_OLD}', '${P_LIVE}', 'task', '${T_LIVE}', 'references', 'document', '${D_OLD}'),
	('${EDGE_LIVE}', '${P_LIVE}', 'task', '${T_LIVE}', 'references', 'document', '${D_LIVE}');
INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, before_data, after_data, changed_by) VALUES
	('${P_LIVE}', 'document', '${D_OLD}', 'created', NULL, '{"title": "Old secret doc"}', '${U}'),
	('${P_LIVE}', 'document', '${D_OLD}', 'deleted', '{"title": "Old secret doc"}', NULL, '${U}'),
	('${P_LIVE}', 'edge', '${EDGE_OLD}', 'created', NULL, '{"rel": "references"}', '${U}'),
	('${P_LIVE}', 'document', '${D_YOUNG}', 'deleted', '{"title": "Young doc"}', NULL, '${U}'),
	('${P_LIVE}', 'document', '${D_LIVE}', 'created', NULL, '{"title": "Live doc"}', '${U}'),
	('${P_LIVE}', 'task', '${T_OLD}', 'deleted', '{"title": "Old task"}', NULL, '${U}'),
	('${P_LIVE}', 'task', '${T_LIVE}', 'created', NULL, '{"title": "Live task"}', '${U}'),
	('${P_LIVE}', 'task', '${T_ARCHIVED}', 'deleted', '{"title": "Archived task"}', NULL, '${U}');
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, content_text) VALUES
	('document', '${D_OLD}', '${P_LIVE}', 'old body'),
	('task', '${T_ARCHIVED}', '${P_LIVE}', 'Archived task'),
	('task', '${T_OLD}', '${P_LIVE}', 'Old task'),
	('image', '${A_OLD}', '${P_LIVE}', 'old photo'),
	('document', '${D_LIVE}', '${P_LIVE}', 'live body');
INSERT INTO public.onto_assignments (actor_id, object_kind, object_id, role_key) VALUES
	('${ACTOR}', 'document', '${D_OLD}', 'owner'), ('${ACTOR}', 'document', '${D_LIVE}', 'owner');
INSERT INTO public.onto_permissions (object_kind, object_id, access) VALUES
	('document', '${D_OLD}', 'read'), ('document', '${D_LIVE}', 'read');
INSERT INTO public.legacy_entity_mappings (onto_table, onto_id) VALUES
	('onto_documents', '${D_OLD}'), ('onto_documents', '${D_LIVE}');

-- Live project: comments. C1 (old) has a live reply C2; C3 (old) has an old
-- reply C4; C5 is live; C6 was deleted 29 days ago; the thread on D_OLD goes with it.
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, parent_id, root_id, body, metadata, created_by, deleted_at) VALUES
	('${C1}', '${P_LIVE}', 'task', '${T_LIVE}', NULL, '${C1}', 'old root', '{"mentions": ["x"]}', '${ACTOR}', ${OLD}),
	('${C2}', '${P_LIVE}', 'task', '${T_LIVE}', '${C1}', '${C1}', 'live reply', '{}', '${ACTOR}', NULL),
	('${C3}', '${P_LIVE}', 'task', '${T_LIVE}', NULL, '${C3}', 'old root 2', '{}', '${ACTOR}', ${OLD}),
	('${C4}', '${P_LIVE}', 'task', '${T_LIVE}', '${C3}', '${C3}', 'old reply', '{}', '${ACTOR}', ${OLD}),
	('${C5}', '${P_LIVE}', 'task', '${T_LIVE}', NULL, '${C5}', 'live root', '{}', '${ACTOR}', NULL),
	('${C6}', '${P_LIVE}', 'task', '${T_LIVE}', NULL, '${C6}', 'young root', '{}', '${ACTOR}', ${YOUNG});
WITH root AS (SELECT gen_random_uuid() AS id)
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, root_id, body, created_by)
SELECT root.id, '${P_LIVE}', 'document', '${D_OLD}', root.id, 'on the old doc', '${ACTOR}' FROM root;

-- Old project: everything soft-deleted with it, plus rows that cascade.
INSERT INTO public.onto_tasks (id, project_id, title, created_by, deleted_at, archived_at) VALUES
	('${T_IN_OLD}', '${P_OLD}', 'Task in old project', '${ACTOR}', ${OLD}, NULL),
	('${T_ARCHIVED_IN_OLD}', '${P_OLD}', 'Archived task in old project', '${ACTOR}', ${OLD}, ${OLD});
INSERT INTO public.onto_documents (id, project_id, title, content, created_by, deleted_at) VALUES
	('${D_IN_OLD}', '${P_OLD}', 'Doc in old project', 'secret', '${ACTOR}', ${OLD});
INSERT INTO public.onto_document_versions (document_id, number) VALUES ('${D_IN_OLD}', 1);
INSERT INTO public.onto_document_proposals (project_id, document_id, instruction) VALUES
	('${P_OLD}', '${D_IN_OLD}', 'rewrite');
INSERT INTO public.onto_public_pages (project_id, document_id, slug) VALUES ('${P_OLD}', '${D_IN_OLD}', 'secret-doc');
INSERT INTO public.onto_goals (project_id, name, deleted_at) VALUES ('${P_OLD}', 'Goal', ${OLD});
INSERT INTO public.onto_risks (project_id, title, deleted_at) VALUES ('${P_OLD}', 'Risk', ${OLD});
INSERT INTO public.onto_milestones (project_id, title, deleted_at) VALUES ('${P_OLD}', 'Milestone', ${OLD});
INSERT INTO public.onto_requirements (project_id, text, deleted_at) VALUES ('${P_OLD}', 'Requirement', ${OLD});
INSERT INTO public.onto_sources (project_id) VALUES ('${P_OLD}');
WITH metric AS (INSERT INTO public.onto_metrics (project_id) VALUES ('${P_OLD}') RETURNING id)
INSERT INTO public.onto_metric_points (metric_id) SELECT id FROM metric;
INSERT INTO public.project_calendars (id, project_id, user_id, calendar_id) VALUES
	('5c000000-0000-4000-8000-000000000001', '${P_OLD}', '${U}', 'cal-old');
INSERT INTO public.onto_events (id, project_id, title, created_by, deleted_at, sync_status) VALUES
	('${E_IN_OLD}', '${P_OLD}', 'Launch review', '${ACTOR}', ${OLD}, 'synced');
INSERT INTO public.onto_event_sync (event_id, user_id, external_event_id, external_calendar_id, project_calendar_id, sync_status) VALUES
	('${E_IN_OLD}', '${U}', 'g-launch', 'cal-old', '5c000000-0000-4000-8000-000000000001', 'synced');
INSERT INTO public.onto_assets (id, project_id, storage_path, created_by) VALUES
	('${A_IN_OLD}', '${P_OLD}', 'projects/${P_OLD}/assets/${A_IN_OLD}/original.png', '${ACTOR}');
INSERT INTO public.onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id) VALUES
	('${P_OLD}', 'task', '${T_IN_OLD}', 'references', 'document', '${D_IN_OLD}');
INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, after_data, changed_by) VALUES
	('${P_OLD}', 'project', '${P_OLD}', 'deleted', '{"name": "Secret launch"}', '${U}'),
	('${P_OLD}', 'task', '${T_IN_OLD}', 'created', '{"title": "Task in old project"}', '${U}');
INSERT INTO public.onto_embeddings (entity_type, entity_id, project_id, content_text) VALUES
	('project', '${P_OLD}', '${P_OLD}', 'Secret launch');
INSERT INTO public.onto_project_structure_history (project_id, version, doc_structure) VALUES
	('${P_OLD}', 1, '{"version": 1, "root": [{"id": "${D_IN_OLD}", "title": "Doc in old project"}]}');
WITH root AS (SELECT gen_random_uuid() AS id)
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, root_id, body, created_by)
SELECT root.id, '${P_OLD}', 'project', '${P_OLD}', root.id, 'kickoff notes', '${ACTOR}' FROM root;
INSERT INTO public.cycles (id, user_id, project_id, state) VALUES ('${CY_IN_OLD}', '${U}', '${P_OLD}', 'active');
INSERT INTO public.cycle_runs (cycle_id, user_id, project_id, result) VALUES
	('${CY_IN_OLD}', '${U}', '${P_OLD}', '{"summary": "secret"}');
INSERT INTO public.notification_events (event_type, payload) VALUES
	('project.activity.changed', '{"project_id": "${P_OLD}", "project_name": "Secret launch", "action_type": "task.created"}'),
	('project.activity.changed', '{"project_id": "${P_LIVE}", "project_name": "Live project", "action_type": "task.created"}');

-- Young project and an old item waiting inside it.
INSERT INTO public.onto_tasks (id, project_id, title, created_by, deleted_at) VALUES
	('${T_OLD_IN_YOUNG}', '${P_YOUNG}', 'Old task in young project', '${ACTOR}', ${OLD});
INSERT INTO public.onto_documents (project_id, title, created_by, deleted_at) VALUES
	('${P_YOUNG}', 'Doc in young project', '${ACTOR}', ${YOUNG});

-- Storage objects
INSERT INTO storage.objects (bucket_id, name) VALUES
	('onto-assets', 'projects/${P_OLD}/assets/${A_IN_OLD}/original.png'),
	('onto-assets', 'projects/${P_OLD}/icon.svg'),
	('onto-assets', 'projects/${P_LIVE}/assets/${A_OLD}/original.png'),
	('onto-assets', 'projects/${P_LIVE}/assets/${A_LIVE}/original.png'),
	('onto-assets', 'projects/${P_LIVE}/assets/${A_YOUNG}/original.png'),
	('onto-assets', 'projects/${P_YOUNG}/assets/young-asset/original.png'),
	('onto-assets', 'users/${U}/chat-temp/t1/original.png'),
	('voice_notes', '${U}/in-old-group.webm'),
	('voice_notes', '${U}/old.webm'),
	('voice_notes', '${U}/young.webm'),
	('voice_notes', '${U}/live.webm');

-- Voice
INSERT INTO public.voice_note_groups (id, user_id, deleted_at, status) VALUES
	('7a000000-0000-4000-8000-000000000001', '${U}', ${OLD}, 'orphaned'),
	('7a000000-0000-4000-8000-000000000002', '${U}', NULL, 'draft');
INSERT INTO public.voice_notes (id, user_id, group_id, storage_path, transcript, deleted_at) VALUES
	('7b000000-0000-4000-8000-000000000001', '${U}', '7a000000-0000-4000-8000-000000000001', '${U}/in-old-group.webm', 'group words', NULL),
	('7b000000-0000-4000-8000-000000000002', '${U}', NULL, '${U}/old.webm', 'old words', ${OLD}),
	('7b000000-0000-4000-8000-000000000003', '${U}', NULL, '${U}/already-removed.webm', 'removed words', ${OLD}),
	('7b000000-0000-4000-8000-000000000004', '${U}', NULL, '${U}/young.webm', 'young words', ${YOUNG}),
	('7b000000-0000-4000-8000-000000000005', '${U}', '7a000000-0000-4000-8000-000000000002', '${U}/live.webm', 'live words', NULL);

-- Contacts and profile documents
INSERT INTO public.user_contacts (id, user_id, display_name, status, deleted_at) VALUES
	('8a000000-0000-4000-8000-000000000001', '${U}', 'Old Contact', 'archived', ${OLD}),
	('8a000000-0000-4000-8000-000000000002', '${U}', 'Young Contact', 'archived', ${YOUNG}),
	('8a000000-0000-4000-8000-000000000003', '${U}', 'Live Contact', 'active', NULL);
INSERT INTO public.user_contact_methods (id, user_id, contact_id, value_raw, deleted_at) VALUES
	('8b000000-0000-4000-8000-000000000001', '${U}', '8a000000-0000-4000-8000-000000000001', 'old@example.com', NULL),
	('8b000000-0000-4000-8000-000000000002', '${U}', '8a000000-0000-4000-8000-000000000003', 'dupe@example.com', ${OLD}),
	('8b000000-0000-4000-8000-000000000003', '${U}', '8a000000-0000-4000-8000-000000000003', 'live@example.com', NULL);
INSERT INTO public.user_contact_observations (user_id, proposed_display_name, proposed_method_value, resolved_contact_id) VALUES
	('${U}', 'Old Contact', 'old@example.com', '8a000000-0000-4000-8000-000000000001'),
	('${U}', 'Live Contact', 'live@example.com', '8a000000-0000-4000-8000-000000000003');
INSERT INTO public.user_profiles (id, user_id) VALUES ('8c000000-0000-4000-8000-000000000001', '${U}');
INSERT INTO public.profile_documents (id, profile_id, title, content, deleted_at) VALUES
	('8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', 'Old chapter', 'old', ${OLD}),
	('8d000000-0000-4000-8000-000000000002', '8c000000-0000-4000-8000-000000000001', 'Young chapter', 'young', ${YOUNG});
INSERT INTO public.profile_document_versions (document_id, content) VALUES
	('8d000000-0000-4000-8000-000000000001', 'old v1');
INSERT INTO public.profile_fragments (id, suggested_chapter_id, content) VALUES
	('8e000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001', 'a fragment');
INSERT INTO public.user_contact_links (user_id, contact_id, profile_document_id) VALUES
	('${U}', '8a000000-0000-4000-8000-000000000001', NULL),
	('${U}', '8a000000-0000-4000-8000-000000000003', '8d000000-0000-4000-8000-000000000001');

-- Connections
INSERT INTO public.user_calendar_connections (id, user_id, email_address, status, deleted_at) VALUES
	('6a000000-0000-4000-8000-000000000001', '${U}', 'old@gmail.com', 'disabled', ${OLD}),
	('6a000000-0000-4000-8000-000000000002', '${U}', 'young@gmail.com', 'disabled', ${YOUNG}),
	('6a000000-0000-4000-8000-000000000003', '${U}', 'live@gmail.com', 'active', NULL);
INSERT INTO public.calendar_connection_credentials (connection_id, refresh_token_ciphertext, revoked_at) VALUES
	('6a000000-0000-4000-8000-000000000001', 'enc:calendar:v1.old', ${OLD}),
	('6a000000-0000-4000-8000-000000000002', 'enc:calendar:v1.young', ${YOUNG}),
	('6a000000-0000-4000-8000-000000000003', 'enc:calendar:v1.live', NULL);
INSERT INTO public.user_calendar_sources (id, user_id, connection_id, summary, deleted_at) VALUES
	('6b000000-0000-4000-8000-000000000001', '${U}', '6a000000-0000-4000-8000-000000000001', 'Old calendar', ${OLD}),
	('6b000000-0000-4000-8000-000000000002', '${U}', '6a000000-0000-4000-8000-000000000003', 'Removed calendar', ${OLD}),
	('6b000000-0000-4000-8000-000000000003', '${U}', '6a000000-0000-4000-8000-000000000003', 'Live calendar', NULL);
INSERT INTO public.project_calendars (id, project_id, user_id, calendar_id, calendar_source_id) VALUES
	('5c000000-0000-4000-8000-000000000002', '${P_LIVE}', '${U}', 'cal-live', '6b000000-0000-4000-8000-000000000001');
INSERT INTO public.user_email_connections (id, user_id, email_address, deleted_at) VALUES
	('6c000000-0000-4000-8000-000000000001', '${U}', 'old@gmail.com', ${OLD}),
	('6c000000-0000-4000-8000-000000000002', '${U}', 'live@gmail.com', NULL);
INSERT INTO public.email_connection_credentials (connection_id, refresh_token_ciphertext) VALUES
	('6c000000-0000-4000-8000-000000000001', 'enc:gmail:v1.old'),
	('6c000000-0000-4000-8000-000000000002', 'enc:gmail:v1.live');

-- Cycles: an old deleted cycle with a trigger and a run; a live cycle with one
-- deleted trigger a run still points at and one nothing points at.
INSERT INTO public.cycles (id, user_id, state, deleted_at) VALUES
	('${CY_OLD}', '${U}', 'deleted', ${OLD}),
	('${CY_LIVE}', '${U}', 'active', NULL);
INSERT INTO public.cycle_triggers (id, cycle_id, state, deleted_at) VALUES
	('9d000000-0000-4000-8000-000000000003', '${CY_OLD}', 'deleted', ${OLD}),
	('${TR_REFERENCED}', '${CY_LIVE}', 'deleted', ${OLD}),
	('${TR_FREE}', '${CY_LIVE}', 'deleted', ${OLD});
INSERT INTO public.cycle_runs (cycle_id, user_id, trigger_id, result) VALUES
	('${CY_OLD}', '${U}', '9d000000-0000-4000-8000-000000000003', '{"summary": "old"}'),
	('${CY_LIVE}', '${U}', '${TR_REFERENCED}', '{"summary": "live"}');
UPDATE public.cycles SET last_run_id = (SELECT id FROM public.cycle_runs WHERE cycle_id = '${CY_OLD}') WHERE id = '${CY_OLD}';

-- In production the embedding jobs queued at delete time finished long ago.
UPDATE public.queue_jobs SET status = 'completed';
`;

describePostgres('soft-deleted item purge (disposable PostgreSQL)', () => {
	let tempDir = '';
	let dataDir = '';
	let admin: Client;
	let service: Client;

	const sql = (text: string, params: unknown[] = []) => admin.query(text, params);
	const scalar = async <T = unknown>(text: string, params: unknown[] = []): Promise<T> =>
		(await admin.query(text, params)).rows[0]?.value as T;
	const count = (table: string, where = 'true', params: unknown[] = []) =>
		scalar<number>(`SELECT count(*)::int AS value FROM ${table} WHERE ${where}`, params);
	const exists = async (table: string, id: string) => (await count(table, 'id = $1', [id])) === 1;

	async function call(name: string, batchSize = 500): Promise<Record<string, number>> {
		const { rows } = await service.query(
			`SELECT public.${name}(p_batch_size => $1) AS summary`,
			[batchSize]
		);
		return rows[0].summary as Record<string, number>;
	}

	async function listObjects(name: string): Promise<string[]> {
		const { rows } = await service.query(`SELECT object_name FROM public.${name}(1000)`);
		return rows.map((row) => row.object_name as string).sort();
	}

	/** The worker's retention client, backed by this database; Storage removes storage.objects rows. */
	const pgClient = (): PrivacyRetentionClient => ({
		async rpc(name, args = {}) {
			try {
				if (name.startsWith('list_')) {
					const { rows } = await service.query(
						`SELECT * FROM public.${name}(p_limit => $1)`,
						[args.p_limit]
					);
					return { data: rows, error: null };
				}
				const { rows } = await service.query(
					`SELECT public.${name}(p_batch_size => $1) AS data`,
					[args.p_batch_size]
				);
				return { data: rows[0].data, error: null };
			} catch (error) {
				return {
					data: null,
					error: {
						code: (error as { code?: string }).code,
						message: (error as Error).message
					}
				};
			}
		},
		storage: {
			from(bucket) {
				return {
					async remove(paths) {
						await sql(
							`DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2)`,
							[bucket, paths]
						);
						return { data: paths, error: null };
					}
				};
			}
		}
	});

	const runPurge = (batchSize = 500) =>
		runPrivacyRetention({ client: pgClient(), tasks: PURGE_TASKS, batchSize });

	const totals = (summary: PrivacyRetentionSummary) =>
		Object.fromEntries(summary.results.map((result) => [result.name, result.counts]));

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-purge-pg-');
		dataDir = join(tempDir, 'data');
		const socketDir = join(tempDir, 'socket');
		mkdirSync(socketDir);
		const port = await availablePort();
		execFileSync(
			'initdb',
			[
				'-D',
				dataDir,
				'--no-locale',
				'--encoding=UTF8',
				'--auth=trust',
				'--username=postgres'
			],
			{ stdio: 'pipe' }
		);
		const logFile = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-l',
					logFile,
					'-o',
					`-p ${port} -k ${socketDir} -c listen_addresses=''`,
					'-w',
					'start'
				],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(logFile, 'utf8')}`,
				{ cause: error }
			);
		}
		execFileSync(
			'psql',
			[
				'-X',
				'-q',
				'-h',
				socketDir,
				'-p',
				String(port),
				'-U',
				'postgres',
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				resolve(REPOSITORY_ROOT, FIXTURE),
				'-f',
				resolve(REPOSITORY_ROOT, ARCHIVE_MIGRATION),
				'-f',
				resolve(REPOSITORY_ROOT, MIGRATION)
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const connection = { host: socketDir, port, user: 'postgres', database: 'postgres' };
		admin = new Client(connection);
		service = new Client(connection);
		await Promise.all([admin.connect(), service.connect()]);
		await service.query('SET ROLE service_role');
		await service.query('SET client_min_messages = error');
	}, 120_000);

	afterAll(async () => {
		await Promise.all([admin?.end(), service?.end()].map((p) => p?.catch(() => undefined)));
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('schedules every purge function, storage sweeps first', () => {
		expect(PURGE_TASKS.map((task) => task.rpc)).toEqual([
			'list_privacy_deleted_asset_objects',
			'list_privacy_deleted_voice_note_objects',
			'cleanup_privacy_deleted_projects',
			'cleanup_privacy_deleted_project_items',
			'cleanup_privacy_deleted_voice_notes',
			'cleanup_privacy_deleted_contacts',
			'cleanup_privacy_deleted_profile_documents',
			'cleanup_privacy_deleted_connections',
			'cleanup_privacy_deleted_cycles'
		]);
	});

	it('grants the purge functions to service_role only and keeps the helpers internal', async () => {
		await sql('SET ROLE authenticated');
		await expect(sql('SELECT public.cleanup_privacy_deleted_projects(1)')).rejects.toThrow(
			/permission denied/
		);
		await sql('RESET ROLE');
		await expect(
			service.query(`SELECT public.purge_privacy_onto_items('task', ARRAY[]::uuid[])`)
		).rejects.toThrow(/permission denied/);
		await expect(
			service.query('SELECT * FROM public.privacy_purge_failures')
		).resolves.toBeDefined();
	});

	describe('a seeded workspace', () => {
		let queueJobsBefore = 0;
		let first: PrivacyRetentionSummary;

		beforeAll(async () => {
			await sql(SEED);
			queueJobsBefore = await count('public.queue_jobs');
		});

		it('lists the storage objects of expired rows and nothing else', async () => {
			expect(await listObjects('list_privacy_deleted_asset_objects')).toEqual(
				[
					`projects/${P_LIVE}/assets/${A_OLD}/original.png`,
					`projects/${P_OLD}/assets/${A_IN_OLD}/original.png`,
					`projects/${P_OLD}/icon.svg`
				].sort()
			);
			expect(await listObjects('list_privacy_deleted_voice_note_objects')).toEqual([
				`${U}/in-old-group.webm`,
				`${U}/old.webm`
			]);
		});

		it('keeps a project whose objects are still in storage', async () => {
			expect(await call('cleanup_privacy_deleted_projects')).toEqual({
				projects_deleted: 0,
				project_purge_failures: 0
			});
			expect(await exists('public.onto_projects', P_OLD)).toBe(true);
		});

		it('the worker job purges expired rows, their copies and their objects', async () => {
			first = await runPurge();

			expect(first.results.every((result) => result.status === 'drained')).toBe(true);
			const counts = totals(first);
			expect(counts.deleted_asset_objects).toEqual({ 'onto-assets_objects_removed': 3 });
			expect(counts.deleted_voice_note_audio).toEqual({ voice_notes_objects_removed: 2 });
			expect(counts.cleanup_privacy_deleted_projects).toEqual({
				projects_deleted: 1,
				project_purge_failures: 0
			});
			expect(counts.cleanup_privacy_deleted_project_items).toMatchObject({
				onto_events_deleted: 2,
				onto_assets_deleted: 1,
				onto_tasks_deleted: 1,
				onto_documents_deleted: 1,
				onto_plans_deleted: 1,
				onto_goals_deleted: 0,
				onto_comments_deleted: 2,
				onto_comments_blanked: 2,
				item_purge_failures: 0
			});
			expect(counts.cleanup_privacy_deleted_voice_notes).toEqual({
				voice_notes_deleted: 3,
				voice_note_groups_deleted: 1
			});
			expect(counts.cleanup_privacy_deleted_contacts).toEqual({
				user_contacts_deleted: 1,
				user_contact_observations_deleted: 1,
				user_contact_methods_deleted: 1
			});
			expect(counts.cleanup_privacy_deleted_profile_documents).toEqual({
				profile_documents_deleted: 1
			});
			expect(counts.cleanup_privacy_deleted_connections).toEqual({
				user_calendar_connections_deleted: 1,
				user_calendar_sources_deleted: 1,
				user_email_connections_deleted: 1
			});
			expect(counts.cleanup_privacy_deleted_cycles).toEqual({
				cycles_deleted: 1,
				cycle_runs_deleted: 1,
				cycle_triggers_deleted: 1
			});
		});

		it('erases the old project with every child (archived tasks too), log, cycle run and object', async () => {
			expect(await exists('public.onto_projects', P_OLD)).toBe(false);
			for (const table of [
				'onto_tasks',
				'onto_documents',
				'onto_goals',
				'onto_risks',
				'onto_milestones',
				'onto_requirements',
				'onto_sources',
				'onto_metrics',
				'onto_events',
				'onto_assets',
				'onto_edges',
				'onto_project_logs',
				'onto_embeddings',
				'onto_comments',
				'onto_public_pages',
				'onto_document_proposals',
				'onto_project_structure_history',
				'project_calendars',
				'cycles',
				'cycle_runs'
			]) {
				expect(await count(`public.${table}`, 'project_id = $1', [P_OLD]), table).toBe(0);
			}
			expect(
				await count('public.onto_document_versions', 'document_id = $1', [D_IN_OLD])
			).toBe(0);
			expect(await count('public.onto_event_sync', 'event_id = $1', [E_IN_OLD])).toBe(0);
			expect(await count('public.onto_metric_points')).toBe(0);
			expect(await count('storage.objects', `name LIKE $1`, [`projects/${P_OLD}/%`])).toBe(0);

			// Activity events keep the id, lose the name.
			const payloads = (
				await sql(
					`SELECT payload FROM public.notification_events ORDER BY payload->>'project_id'`
				)
			).rows.map((row) => row.payload);
			expect(payloads).toEqual([
				{ project_id: P_LIVE, project_name: 'Live project', action_type: 'task.created' },
				{ project_id: P_OLD, action_type: 'task.created' }
			]);

			// delete_onto_project's calendar trigger queued the Google delete from the mapping.
			const calendarJobs = (
				await sql(
					`SELECT metadata FROM public.queue_jobs
					WHERE job_type = 'sync_calendar' AND status = 'pending'`
				)
			).rows.map((row) => row.metadata);
			expect(calendarJobs).toHaveLength(1);
			expect(calendarJobs[0]).toMatchObject({
				action: 'delete',
				projectId: P_OLD,
				eventId: E_IN_OLD,
				deletionSnapshot: { externalEventId: 'g-launch', calendarId: 'cal-old' }
			});
		});

		it('erases standalone items in the live project with their copies', async () => {
			for (const [table, id] of [
				['onto_documents', D_OLD],
				['onto_tasks', T_OLD],
				['onto_plans', PL_OLD],
				['onto_events', E_OLD],
				['onto_events', E_PERSONAL],
				['onto_assets', A_OLD],
				['onto_edges', EDGE_OLD]
			] as const) {
				expect(await exists(`public.${table}`, id), `${table} ${id}`).toBe(false);
			}
			expect(await count('public.onto_document_versions', 'document_id = $1', [D_OLD])).toBe(
				0
			);
			expect(await count('public.onto_document_proposals', 'document_id = $1', [D_OLD])).toBe(
				0
			);
			expect(await count('public.onto_public_pages', 'document_id = $1', [D_OLD])).toBe(0);
			expect(
				await count('public.onto_project_logs', 'entity_id = ANY($1)', [
					[D_OLD, T_OLD, EDGE_OLD]
				])
			).toBe(0);
			expect(
				await count('public.onto_embeddings', 'entity_id = ANY($1)', [
					[D_OLD, T_OLD, A_OLD]
				])
			).toBe(0);
			expect(await count('public.onto_comments', 'entity_id = $1', [D_OLD])).toBe(0);
			expect(await count('public.onto_asset_links', 'entity_id = $1', [D_OLD])).toBe(0);
			expect(await count('public.onto_assignments', 'object_id = $1', [D_OLD])).toBe(0);
			expect(await count('public.onto_permissions', 'object_id = $1', [D_OLD])).toBe(0);
			expect(await count('public.legacy_entity_mappings', 'onto_id = $1', [D_OLD])).toBe(0);
			expect(await count('public.onto_task_assignees', 'task_id = $1', [T_OLD])).toBe(0);
			expect(await count('public.onto_event_sync', 'event_id = $1', [E_OLD])).toBe(0);
			expect(await count('public.chat_message_attachments', 'asset_id = $1', [A_OLD])).toBe(
				0
			);
			// Only the tree snapshot that listed the old document went.
			expect(
				(
					await sql(
						`SELECT version FROM public.onto_project_structure_history WHERE project_id = $1`,
						[P_LIVE]
					)
				).rows
			).toEqual([{ version: 2 }]);
			// Live rows that pointed at purged ones lose only the pointer.
			expect(
				(
					await sql(
						`SELECT context_document_id, deleted_at FROM public.onto_projects WHERE id = $1`,
						[P_LIVE]
					)
				).rows[0]
			).toEqual({ context_document_id: null, deleted_at: null });
			expect(
				await scalar(`SELECT plan_id AS value FROM public.onto_tasks WHERE id = $1`, [
					T_PLANNED
				])
			).toBeNull();
			expect(await exists('public.onto_assets', A_LIVE)).toBe(true);
		});

		it('peels old comment threads leaf first and blanks one a live reply hangs off', async () => {
			const comments = new Map(
				(
					await sql(
						`SELECT id, body, metadata, edited_at FROM public.onto_comments WHERE entity_id = $1`,
						[T_LIVE]
					)
				).rows.map((row) => [row.id, row])
			);
			expect([...comments.keys()].sort()).toEqual([C1, C2, C5, C6].sort());
			expect(comments.get(C1)).toMatchObject({ body: '[deleted]', metadata: {} });
			expect(comments.get(C2)?.body).toBe('live reply');
			expect(comments.get(C5)?.body).toBe('live root');
			expect(comments.get(C6)?.body).toBe('young root');
		});

		it('erases voice, contact, profile, connection and cycle rows', async () => {
			expect(await count('public.voice_note_groups', `deleted_at IS NOT NULL`)).toBe(0);
			expect(
				(await sql(`SELECT storage_path FROM public.voice_notes ORDER BY storage_path`))
					.rows
			).toEqual([{ storage_path: `${U}/live.webm` }, { storage_path: `${U}/young.webm` }]);

			expect(
				(await sql(`SELECT display_name FROM public.user_contacts ORDER BY display_name`))
					.rows
			).toEqual([{ display_name: 'Live Contact' }, { display_name: 'Young Contact' }]);
			expect((await sql(`SELECT value_raw FROM public.user_contact_methods`)).rows).toEqual([
				{ value_raw: 'live@example.com' }
			]);
			expect(
				(await sql(`SELECT proposed_display_name FROM public.user_contact_observations`))
					.rows
			).toEqual([{ proposed_display_name: 'Live Contact' }]);

			expect((await sql(`SELECT title FROM public.profile_documents`)).rows).toEqual([
				{ title: 'Young chapter' }
			]);
			expect(await count('public.profile_document_versions')).toBe(0);
			expect(
				await scalar(`SELECT suggested_chapter_id AS value FROM public.profile_fragments`)
			).toBeNull();
			expect(await count('public.user_contact_links')).toBe(0);

			expect(
				(
					await sql(
						`SELECT refresh_token_ciphertext FROM public.calendar_connection_credentials ORDER BY 1`
					)
				).rows
			).toEqual([
				{ refresh_token_ciphertext: 'enc:calendar:v1.live' },
				{ refresh_token_ciphertext: 'enc:calendar:v1.young' }
			]);
			expect((await sql(`SELECT summary FROM public.user_calendar_sources`)).rows).toEqual([
				{ summary: 'Live calendar' }
			]);
			expect(
				(
					await sql(
						`SELECT calendar_id, calendar_source_id FROM public.project_calendars WHERE project_id = $1`,
						[P_LIVE]
					)
				).rows
			).toEqual([{ calendar_id: 'cal-live', calendar_source_id: null }]);
			expect(
				(
					await sql(
						`SELECT refresh_token_ciphertext FROM public.email_connection_credentials`
					)
				).rows
			).toEqual([{ refresh_token_ciphertext: 'enc:gmail:v1.live' }]);

			expect((await sql(`SELECT id FROM public.cycles`)).rows).toEqual([{ id: CY_LIVE }]);
			expect((await sql(`SELECT id FROM public.cycle_triggers`)).rows).toEqual([
				{ id: TR_REFERENCED }
			]);
			expect(await count('public.cycle_runs')).toBe(1);
		});

		it('leaves rows deleted 29 days ago, archived tasks, live rows and the young project untouched', async () => {
			for (const [table, id] of [
				['onto_projects', P_LIVE],
				['onto_projects', P_YOUNG],
				['onto_documents', D_YOUNG],
				['onto_documents', D_LIVE],
				['onto_tasks', T_LIVE],
				['onto_tasks', T_PLANNED],
				['onto_tasks', T_OLD_IN_YOUNG],
				['onto_tasks', T_ARCHIVED],
				['onto_assets', A_YOUNG],
				['onto_edges', EDGE_LIVE]
			] as const) {
				expect(await exists(`public.${table}`, id), `${table} ${id}`).toBe(true);
			}
			expect(await count('public.onto_documents', 'project_id = $1', [P_YOUNG])).toBe(1);
			expect(
				await count('public.onto_document_versions', 'document_id = ANY($1)', [
					[D_YOUNG, D_LIVE]
				])
			).toBe(2);
			expect(
				(
					await sql(`SELECT entity_id FROM public.onto_project_logs ORDER BY entity_id`)
				).rows.map((row) => row.entity_id)
			).toEqual([D_YOUNG, D_LIVE, T_LIVE, T_ARCHIVED]);
			expect(await count('public.onto_embeddings', 'entity_id = $1', [D_LIVE])).toBe(1);
			expect(await count('public.onto_embeddings', 'entity_id = $1', [T_ARCHIVED])).toBe(1);
			expect(await count('public.onto_assignments', 'object_id = $1', [D_LIVE])).toBe(1);
			expect(await count('public.onto_asset_links', 'entity_id = $1', [D_LIVE])).toBe(1);
			expect(
				(await sql(`SELECT name FROM storage.objects ORDER BY name`)).rows.map(
					(row) => row.name
				)
			).toEqual(
				[
					`${U}/live.webm`,
					`${U}/young.webm`,
					`projects/${P_LIVE}/assets/${A_LIVE}/original.png`,
					`projects/${P_LIVE}/assets/${A_YOUNG}/original.png`,
					`projects/${P_YOUNG}/assets/young-asset/original.png`,
					`users/${U}/chat-temp/t1/original.png`
				].sort()
			);
		});

		it('queues only the embedding cleanups and the Google delete as side effects', async () => {
			const jobs = (
				await sql(
					`SELECT job_type, count(*)::int AS n FROM public.queue_jobs
					WHERE status = 'pending' GROUP BY job_type ORDER BY job_type`
				)
			).rows;
			const added = (await count('public.queue_jobs')) - queueJobsBefore;
			// One no-op embed_onto_entity delete per purged row with an embedding trigger
			// and a project (project, 2 documents, 3 tasks, 2 events, 2 assets), plus
			// one sync_calendar.
			expect(added).toBe(11);
			expect(jobs.find((row) => row.job_type === 'sync_calendar')?.n).toBe(1);
			expect(
				await count(
					'public.queue_jobs',
					`job_type = 'embed_onto_entity' AND status = 'pending' AND (metadata->>'deleted')::boolean`
				)
			).toBe(10);
		});

		it('is idempotent: a second run affects nothing', async () => {
			const tables = [
				'onto_projects',
				'onto_tasks',
				'onto_documents',
				'onto_comments',
				'voice_notes',
				'queue_jobs'
			];
			const countAll = async () => {
				const counts: number[] = [];
				for (const table of tables) counts.push(await count(`public.${table}`));
				return counts;
			};
			const countsBefore = await countAll();
			const second = await runPurge();

			expect(second.results.every((result) => result.status === 'drained')).toBe(true);
			expect(second.results.every((result) => result.batches === 1)).toBe(true);
			for (const result of second.results) {
				expect(
					Object.values(result.counts).every((value) => value === 0),
					result.name
				).toBe(true);
			}
			expect(await countAll()).toEqual(countsBefore);
			expect(
				(await sql(`SELECT body FROM public.onto_comments WHERE id = $1`, [C1])).rows[0]
					.body
			).toBe('[deleted]');
		});
	});

	describe('task archive state', () => {
		const P_ARCHIVE = 'b3000000-0000-4000-8000-000000000001';
		const T_PARKED = 'e3000000-0000-4000-8000-000000000001';
		const T_UNPARKED = 'e3000000-0000-4000-8000-000000000002';
		const T_ACTIVE = 'e3000000-0000-4000-8000-000000000003';

		it('backfills every soft-deleted task as archived, and the purge keeps them', async () => {
			await sql(`
				INSERT INTO public.onto_projects (id, name, created_by) VALUES ('${P_ARCHIVE}', 'Archive', '${ACTOR}');
				INSERT INTO public.onto_tasks (id, project_id, title, created_by, deleted_at) VALUES
					('${T_PARKED}', '${P_ARCHIVE}', 'Parked in May', '${ACTOR}', now() - interval '140 days'),
					('${T_UNPARKED}', '${P_ARCHIVE}', 'Parked last month', '${ACTOR}', now() - interval '40 days'),
					('${T_ACTIVE}', '${P_ARCHIVE}', 'Active', '${ACTOR}', NULL);
			`);
			const jobsBefore = await count('public.queue_jobs');

			await sql(readFileSync(resolve(REPOSITORY_ROOT, ARCHIVE_MIGRATION), 'utf8'));

			expect(
				(
					await sql(
						`SELECT id, archived_at IS NOT NULL AND archived_at = deleted_at AS archived
						FROM public.onto_tasks WHERE project_id = $1 ORDER BY id`,
						[P_ARCHIVE]
					)
				).rows
			).toEqual([
				{ id: T_PARKED, archived: true },
				{ id: T_UNPARKED, archived: true },
				{ id: T_ACTIVE, archived: false }
			]);
			expect(await count('public.queue_jobs')).toBe(jobsBefore);

			expect(await call('cleanup_privacy_deleted_project_items')).toMatchObject({
				onto_tasks_deleted: 0
			});
			// The purge re-checks each id itself, so an archived id handed to it stays.
			expect(
				await scalar(`SELECT public.purge_privacy_onto_items('task', $1) AS value`, [
					[T_PARKED]
				])
			).toBe(0);
			expect(await count('public.onto_tasks', 'project_id = $1', [P_ARCHIVE])).toBe(3);
		});

		it('purges a task deleted from the archive more than 30 days ago', async () => {
			await sql(`UPDATE public.onto_tasks SET archived_at = NULL WHERE id = $1`, [
				T_UNPARKED
			]);

			expect(await call('cleanup_privacy_deleted_project_items')).toMatchObject({
				onto_tasks_deleted: 1,
				item_purge_failures: 0
			});
			expect(await exists('public.onto_tasks', T_UNPARKED)).toBe(false);
			expect(await exists('public.onto_tasks', T_PARKED)).toBe(true);
			expect(await exists('public.onto_tasks', T_ACTIVE)).toBe(true);
		});
	});

	it('keeps an asset or voice note row until its object is gone', async () => {
		const P_GUARD = 'b2000000-0000-4000-8000-000000000001';
		const A_GUARD = 'ab000000-0000-4000-8000-000000000001';
		const VN_GUARD = '7c000000-0000-4000-8000-000000000001';
		const assetPath = `projects/${P_GUARD}/assets/${A_GUARD}/original.png`;
		await sql(`
			INSERT INTO public.onto_projects (id, name, created_by) VALUES ('${P_GUARD}', 'Guard', '${ACTOR}');
			INSERT INTO public.onto_assets (id, project_id, storage_path, created_by, deleted_at) VALUES
				('${A_GUARD}', '${P_GUARD}', '${assetPath}', '${ACTOR}', ${OLD});
			INSERT INTO public.voice_notes (id, user_id, storage_path, deleted_at) VALUES
				('${VN_GUARD}', '${U}', '${U}/guard.webm', ${OLD});
			INSERT INTO storage.objects (bucket_id, name) VALUES
				('onto-assets', '${assetPath}'), ('voice_notes', '${U}/guard.webm');
		`);

		expect(await call('cleanup_privacy_deleted_project_items')).toMatchObject({
			onto_assets_deleted: 0
		});
		expect(await call('cleanup_privacy_deleted_voice_notes')).toMatchObject({
			voice_notes_deleted: 0
		});
		expect(await exists('public.onto_assets', A_GUARD)).toBe(true);
		expect(await exists('public.voice_notes', VN_GUARD)).toBe(true);

		await sql(`DELETE FROM storage.objects WHERE name = ANY($1)`, [
			[assetPath, `${U}/guard.webm`]
		]);
		expect(await call('cleanup_privacy_deleted_project_items')).toMatchObject({
			onto_assets_deleted: 1
		});
		expect(await call('cleanup_privacy_deleted_voice_notes')).toMatchObject({
			voice_notes_deleted: 1
		});
	});

	describe('failure isolation', () => {
		const P_BAD = 'b1000000-0000-4000-8000-000000000001';
		const P_GOOD = 'b1000000-0000-4000-8000-000000000002';
		const P_HOST = 'b1000000-0000-4000-8000-000000000003';
		const T_BAD = 'e1000000-0000-4000-8000-000000000001';
		const T_GOOD_1 = 'e1000000-0000-4000-8000-000000000002';
		const T_GOOD_2 = 'e1000000-0000-4000-8000-000000000003';

		beforeAll(async () => {
			// A table production might have that the purge does not know about.
			await sql(`
				CREATE TABLE public.unknown_blockers (
					project_id uuid REFERENCES public.onto_projects(id),
					task_id uuid REFERENCES public.onto_tasks(id)
				);
				INSERT INTO public.onto_projects (id, name, created_by, deleted_at) VALUES
					('${P_BAD}', 'Blocked', '${ACTOR}', ${OLD}),
					('${P_GOOD}', 'Fine', '${ACTOR}', ${OLD}),
					('${P_HOST}', 'Host', '${ACTOR}', NULL);
				INSERT INTO public.onto_tasks (id, project_id, title, created_by, deleted_at) VALUES
					('${T_BAD}', '${P_HOST}', 'Blocked task', '${ACTOR}', now() - interval '33 days'),
					('${T_GOOD_1}', '${P_HOST}', 'Fine task 1', '${ACTOR}', now() - interval '32 days'),
					('${T_GOOD_2}', '${P_HOST}', 'Fine task 2', '${ACTOR}', ${OLD});
				INSERT INTO public.unknown_blockers (project_id, task_id) VALUES
					('${P_BAD}', NULL), (NULL, '${T_BAD}');
			`);
		});

		it('records a project that fails, purges the rest, and retries it the next day', async () => {
			expect(await call('cleanup_privacy_deleted_projects')).toEqual({
				projects_deleted: 1,
				project_purge_failures: 1
			});
			expect(await exists('public.onto_projects', P_GOOD)).toBe(false);
			expect(await exists('public.onto_projects', P_BAD)).toBe(true);
			expect(
				(
					await sql(
						`SELECT source_table, row_id, sqlstate, attempts FROM public.privacy_purge_failures`
					)
				).rows
			).toEqual([
				{ source_table: 'onto_projects', row_id: P_BAD, sqlstate: '23503', attempts: 1 }
			]);

			// The same run does not retry it, so the drain ends.
			expect(await call('cleanup_privacy_deleted_projects')).toEqual({
				projects_deleted: 0,
				project_purge_failures: 0
			});

			await sql(
				`UPDATE public.privacy_purge_failures SET last_failed_at = now() - interval '21 hours'`
			);
			await sql(`DELETE FROM public.unknown_blockers WHERE project_id = $1`, [P_BAD]);
			expect(await call('cleanup_privacy_deleted_projects')).toEqual({
				projects_deleted: 1,
				project_purge_failures: 0
			});
			expect(
				await count('public.privacy_purge_failures', `source_table = 'onto_projects'`)
			).toBe(0);
		});

		it('retries a failing item batch row by row, so one bad row blocks nothing', async () => {
			const summary = await call('cleanup_privacy_deleted_project_items');
			expect(summary).toMatchObject({ onto_tasks_deleted: 2, item_purge_failures: 1 });
			expect(await exists('public.onto_tasks', T_GOOD_1)).toBe(false);
			expect(await exists('public.onto_tasks', T_GOOD_2)).toBe(false);
			expect(await exists('public.onto_tasks', T_BAD)).toBe(true);
			expect(
				(
					await sql(
						`SELECT source_table, row_id, sqlstate FROM public.privacy_purge_failures`
					)
				).rows
			).toEqual([{ source_table: 'onto_tasks', row_id: T_BAD, sqlstate: '23503' }]);
			expect(await call('cleanup_privacy_deleted_project_items')).toMatchObject({
				onto_tasks_deleted: 0,
				item_purge_failures: 0
			});
		});
	});
});
