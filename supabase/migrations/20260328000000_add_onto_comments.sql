-- supabase/migrations/20260328000000_add_onto_comments.sql
-- Migration: Ontology comments (threads, mentions, read states)
-- Date: 2026-03-28
-- Description: Adds comment tables, triggers, RLS, and notification data payloads.

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS onto_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  parent_id uuid NULL REFERENCES onto_comments(id) ON DELETE CASCADE,
  root_id uuid NOT NULL REFERENCES onto_comments(id) ON DELETE CASCADE,

  body text NOT NULL,
  body_format text NOT NULL DEFAULT 'markdown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid NOT NULL REFERENCES onto_actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NULL,
  deleted_at timestamptz NULL,

  CONSTRAINT chk_onto_comments_body_format CHECK (body_format = 'markdown'),
  CONSTRAINT chk_onto_comments_body_length CHECK (char_length(body) > 0 AND char_length(body) <= 10000),
  CONSTRAINT chk_onto_comments_project_target CHECK (
    entity_type <> 'project' OR entity_id = project_id
  )
);

CREATE TABLE IF NOT EXISTS onto_comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES onto_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notification_id uuid NULL REFERENCES user_notifications(id) ON DELETE SET NULL,

  UNIQUE (comment_id, mentioned_user_id)
);

CREATE TABLE IF NOT EXISTS onto_comment_read_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  root_id uuid NOT NULL REFERENCES onto_comments(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES onto_actors(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_read_comment_id uuid NULL REFERENCES onto_comments(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (project_id, entity_type, entity_id, root_id, actor_id)
);

-- Add comment payloads to user notifications
ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS data jsonb;

-- ============================================================================
-- 2. VALIDATION HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION onto_comment_validate_target(
  p_project_id uuid,
  p_entity_type text,
  p_entity_id uuid
) RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_project_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  CASE p_entity_type
    WHEN 'project' THEN
      RETURN p_entity_id = p_project_id;
    WHEN 'task' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_tasks t
        WHERE t.id = p_entity_id AND t.project_id = p_project_id
      );
    WHEN 'plan' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_plans pl
        WHERE pl.id = p_entity_id AND pl.project_id = p_project_id
      );
    WHEN 'output' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_outputs o
        WHERE o.id = p_entity_id AND o.project_id = p_project_id
      );
    WHEN 'document' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_documents d
        WHERE d.id = p_entity_id AND d.project_id = p_project_id
      );
    WHEN 'goal' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_goals g
        WHERE g.id = p_entity_id AND g.project_id = p_project_id
      );
    WHEN 'requirement' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_requirements r
        WHERE r.id = p_entity_id AND r.project_id = p_project_id
      );
    WHEN 'milestone' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_milestones m
        WHERE m.id = p_entity_id AND m.project_id = p_project_id
      );
    WHEN 'risk' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_risks rk
        WHERE rk.id = p_entity_id AND rk.project_id = p_project_id
      );
    WHEN 'decision' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_decisions dc
        WHERE dc.id = p_entity_id AND dc.project_id = p_project_id
      );
    WHEN 'event' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_events ev
        WHERE ev.id = p_entity_id AND ev.project_id = p_project_id
      );
    WHEN 'metric' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_metrics mt
        WHERE mt.id = p_entity_id AND mt.project_id = p_project_id
      );
    WHEN 'metric_point' THEN
      RETURN EXISTS (
        SELECT 1
        FROM onto_metric_points mp
        JOIN onto_metrics mt ON mt.id = mp.metric_id
        WHERE mp.id = p_entity_id AND mt.project_id = p_project_id
      );
    WHEN 'source' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_sources s
        WHERE s.id = p_entity_id AND s.project_id = p_project_id
      );
    WHEN 'signal' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_signals sg
        WHERE sg.id = p_entity_id AND sg.project_id = p_project_id
      );
    WHEN 'insight' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_insights i
        WHERE i.id = p_entity_id AND i.project_id = p_project_id
      );
    WHEN 'note' THEN
      RETURN EXISTS (
        SELECT 1 FROM onto_documents d
        WHERE d.id = p_entity_id AND d.project_id = p_project_id
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION onto_comment_validate_target(uuid, text, uuid) TO authenticated;

-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION onto_comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent onto_comments%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.root_id IS NOT NULL AND NEW.root_id <> NEW.id THEN
      RAISE EXCEPTION 'root_id must match id for top-level comments';
    END IF;
    NEW.root_id := NEW.id;
  ELSE
    SELECT * INTO v_parent FROM onto_comments WHERE id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent comment not found';
    END IF;

    IF v_parent.project_id <> NEW.project_id
      OR v_parent.entity_type <> NEW.entity_type
      OR v_parent.entity_id <> NEW.entity_id THEN
      RAISE EXCEPTION 'Parent comment must share target context';
    END IF;

    IF NEW.root_id IS NOT NULL AND NEW.root_id <> v_parent.root_id THEN
      RAISE EXCEPTION 'root_id must match parent root_id';
    END IF;

    NEW.root_id := v_parent.root_id;
  END IF;

  IF NOT onto_comment_validate_target(NEW.project_id, NEW.entity_type, NEW.entity_id) THEN
    RAISE EXCEPTION 'Invalid comment target';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION onto_comments_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id <> OLD.project_id
    OR NEW.entity_type <> OLD.entity_type
    OR NEW.entity_id <> OLD.entity_id
    OR NEW.parent_id <> OLD.parent_id
    OR NEW.root_id <> OLD.root_id
    OR NEW.created_by <> OLD.created_by
    OR NEW.created_at <> OLD.created_at
    OR NEW.body_format <> OLD.body_format THEN
    RAISE EXCEPTION 'Immutable comment fields cannot be changed';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onto_comments_before_insert ON onto_comments;
CREATE TRIGGER trg_onto_comments_before_insert
  BEFORE INSERT ON onto_comments
  FOR EACH ROW EXECUTE FUNCTION onto_comments_before_insert();

DROP TRIGGER IF EXISTS trg_onto_comments_before_update ON onto_comments;
CREATE TRIGGER trg_onto_comments_before_update
  BEFORE UPDATE ON onto_comments
  FOR EACH ROW EXECUTE FUNCTION onto_comments_before_update();

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onto_comments_entity
  ON onto_comments(project_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_comments_root
  ON onto_comments(root_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_onto_comments_parent
  ON onto_comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_onto_comment_mentions_user
  ON onto_comment_mentions(mentioned_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_comment_read_states_actor
  ON onto_comment_read_states(actor_id, updated_at DESC);

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

ALTER TABLE onto_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_comment_read_states ENABLE ROW LEVEL SECURITY;

-- onto_comments policies
CREATE POLICY "comment_select_member"
  ON onto_comments FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

CREATE POLICY "comment_select_admin"
  ON onto_comments FOR SELECT
  USING (is_admin());

CREATE POLICY "comment_select_public"
  ON onto_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = onto_comments.project_id AND p.is_public = true
  ));

CREATE POLICY "comment_insert_member"
  ON onto_comments FOR INSERT
  WITH CHECK (
    current_actor_has_project_access(project_id, 'write')
    AND created_by = current_actor_id()
  );

CREATE POLICY "comment_insert_admin"
  ON onto_comments FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "comment_update_author"
  ON onto_comments FOR UPDATE
  USING (created_by = current_actor_id())
  WITH CHECK (created_by = current_actor_id());

CREATE POLICY "comment_update_admin"
  ON onto_comments FOR UPDATE
  USING (is_admin());

CREATE POLICY "comment_service_role"
  ON onto_comments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- onto_comment_mentions policies
CREATE POLICY "comment_mentions_select_reader"
  ON onto_comment_mentions FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM onto_comments c
    JOIN onto_projects p ON p.id = c.project_id
    WHERE c.id = onto_comment_mentions.comment_id
      AND (
        current_actor_has_project_access(c.project_id, 'read')
        OR p.is_public = true
      )
  ));

CREATE POLICY "comment_mentions_insert_author"
  ON onto_comment_mentions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM onto_comments c
    WHERE c.id = onto_comment_mentions.comment_id
      AND c.created_by = current_actor_id()
  ));

CREATE POLICY "comment_mentions_admin"
  ON onto_comment_mentions FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "comment_mentions_service_role"
  ON onto_comment_mentions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- onto_comment_read_states policies
CREATE POLICY "comment_read_states_select_actor"
  ON onto_comment_read_states FOR SELECT
  USING (actor_id = current_actor_id());

CREATE POLICY "comment_read_states_insert_actor"
  ON onto_comment_read_states FOR INSERT
  WITH CHECK (actor_id = current_actor_id());

CREATE POLICY "comment_read_states_update_actor"
  ON onto_comment_read_states FOR UPDATE
  USING (actor_id = current_actor_id())
  WITH CHECK (actor_id = current_actor_id());

CREATE POLICY "comment_read_states_service_role"
  ON onto_comment_read_states FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
