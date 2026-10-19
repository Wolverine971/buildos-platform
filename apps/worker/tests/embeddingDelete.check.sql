-- apps/worker/tests/embeddingDelete.check.sql
-- Tasker 134: run through db:rehearse --check against the disposable production schema.
BEGIN;
CREATE TEMP TABLE embedding_trigger_source (
  id uuid PRIMARY KEY, project_id uuid, created_by uuid, title text,
  deleted_at timestamptz, unrelated integer DEFAULT 0
);
CREATE TRIGGER embedding_trigger_test AFTER INSERT OR UPDATE OR DELETE
  ON embedding_trigger_source FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_onto_entity_embedding('document', 'title');
GRANT SELECT, UPDATE ON embedding_trigger_source TO authenticated;

DO $$
DECLARE
  v_user uuid := 'a1340000-0000-4000-8000-000000000001';
  v_actor uuid;
  v_project uuid := 'a1340000-0000-4000-8000-000000000002';
  v_entity uuid := 'a1340000-0000-4000-8000-000000000003';
  v_other uuid := 'a1340000-0000-4000-8000-000000000004';
  v_jobs bigint;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user, 'embedding-delete@example.com');
  INSERT INTO public.users (id, email) VALUES (v_user, 'embedding-delete@example.com')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.onto_actors (kind, name, user_id) VALUES ('human', 'Embedding test', v_user)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_actor FROM public.onto_actors WHERE user_id = v_user;
  INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key)
    VALUES (v_project, 'Embedding test', 'project.default', v_actor, 'active');
  -- Real source rows satisfy the production embedding/project consistency guard.
  INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, created_by)
    VALUES (v_entity, v_project, 'Original', 'document.default', 'draft', v_actor),
      (v_other, v_project, 'Other', 'document.default', 'draft', v_actor);
  INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by)
    VALUES (v_entity, v_project, 'Other type', 'todo', v_actor);
  INSERT INTO embedding_trigger_source (id, project_id, created_by, title)
    VALUES (v_entity, v_project, v_actor, 'Original');
  ASSERT EXISTS (SELECT 1 FROM public.queue_jobs WHERE job_type = 'embed_onto_entity'
    AND metadata->>'entityId' = v_entity::text AND metadata->>'deleted' = 'false'),
    'live inserts must still enqueue embeddings';
  SELECT count(*) INTO v_jobs FROM public.queue_jobs WHERE user_id = v_user;

  INSERT INTO public.onto_embeddings
    (project_id, entity_type, entity_id, chunk_index, content_text, content_hash, embedding)
  SELECT v_project, kind, id, chunk, 'Test chunk', 'hash', array_fill(0.1::real, ARRAY[1536])::vector
  FROM (VALUES ('document', v_entity, 0), ('document', v_entity, 1),
    ('task', v_entity, 0), ('document', v_other, 0)) AS chunks(kind, id, chunk);

  UPDATE embedding_trigger_source SET unrelated = 1 WHERE id = v_entity;
  ASSERT (SELECT count(*) FROM public.queue_jobs WHERE user_id = v_user) = v_jobs,
    'non-text updates must remain quiet';
  -- Existing triggers must still fire for signed-in writes after EXECUTE is revoked.
  SET LOCAL ROLE authenticated;
  UPDATE embedding_trigger_source SET deleted_at = now() WHERE id = v_entity;
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_embeddings
    WHERE entity_type = 'document' AND entity_id = v_entity),
    'soft delete must remove all embedding chunks inline';
  ASSERT (SELECT count(*) FROM public.queue_jobs WHERE user_id = v_user) = v_jobs,
    'soft deletes must not enqueue jobs';
  ASSERT (SELECT count(*) FROM public.onto_embeddings WHERE entity_id IN (v_entity, v_other)) = 2,
    'delete must preserve other entity types and IDs';

  UPDATE embedding_trigger_source SET deleted_at = NULL, title = 'Restored' WHERE id = v_entity;
  ASSERT (SELECT count(*) FROM public.queue_jobs WHERE user_id = v_user) = v_jobs + 1,
    'restores must still enqueue embeddings';
  SELECT count(*) INTO v_jobs FROM public.queue_jobs WHERE user_id = v_user;
  INSERT INTO public.onto_embeddings
    (project_id, entity_type, entity_id, content_text, content_hash, embedding)
  VALUES (v_project, 'document', v_entity, 'Restored', 'hash', array_fill(0.1::real, ARRAY[1536])::vector);
  -- Deletion must work even after owner/project linkage has gone away.
  UPDATE embedding_trigger_source SET project_id = NULL, created_by = NULL WHERE id = v_entity;
  DELETE FROM embedding_trigger_source WHERE id = v_entity;
  ASSERT NOT EXISTS (SELECT 1 FROM public.onto_embeddings
    WHERE entity_type = 'document' AND entity_id = v_entity),
    'hard delete must clear embeddings without owner/project lookup';
  ASSERT (SELECT count(*) FROM public.queue_jobs WHERE user_id = v_user) = v_jobs,
    'hard deletes must not enqueue jobs';

  INSERT INTO embedding_trigger_source (id, deleted_at) VALUES (v_entity, now());
  DELETE FROM embedding_trigger_source WHERE id = v_entity;
  ASSERT (SELECT count(*) FROM public.queue_jobs WHERE user_id = v_user) = v_jobs,
    'deletes with no embeddings must be harmless and enqueue nothing';
END;
$$;
ROLLBACK;
