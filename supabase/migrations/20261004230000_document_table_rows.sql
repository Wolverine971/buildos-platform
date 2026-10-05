-- supabase/migrations/20261004230000_document_table_rows.sql
-- Tables: a table is an onto_documents row with type_key 'document.table'
-- (or 'document.table.<flavor>'). Its column schema lives in
-- onto_documents.props.table; its records live here, one row per record.
--
-- Design notes (docs/specs/tables/README.md):
-- - No project_id column. Access is checked through the parent document, so
--   project fold / organize / delete need no changes and rows follow their
--   document by FK. (A project_id column would require a fold policy row.)
-- - row_number is the agent-facing handle ("r12"): allocated under the
--   document row lock, never reused (soft-deleted rows keep their number).
-- - position is numeric (append = max + 1024, insert between = midpoint), so
--   ordering never depends on collation.
-- - onto_document_table_apply() applies a batch of row ops atomically, keeps
--   props.table.revision/row_count current, and regenerates
--   onto_documents.content as a capped markdown projection so search,
--   embeddings, chat reads, versions and public pages keep working unchanged.

-- ============================================================================
-- 1. ROWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onto_document_rows (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	document_id uuid NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	row_number integer NOT NULL,
	position numeric NOT NULL,
	cells jsonb NOT NULL DEFAULT '{}'::jsonb,
	cell_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
	version integer NOT NULL DEFAULT 1,
	created_by uuid REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	updated_by uuid REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz,
	CONSTRAINT onto_document_rows_row_number_unique UNIQUE (document_id, row_number),
	CONSTRAINT onto_document_rows_row_number_positive CHECK (row_number > 0),
	CONSTRAINT onto_document_rows_cells_object CHECK (jsonb_typeof(cells) = 'object'),
	CONSTRAINT onto_document_rows_cell_meta_object CHECK (jsonb_typeof(cell_meta) = 'object')
);

COMMENT ON TABLE public.onto_document_rows IS
	'Records of a table document (onto_documents.type_key = document.table*). Cells are keyed by stable column id from onto_documents.props.table.columns.';

CREATE INDEX IF NOT EXISTS onto_document_rows_live_position_idx
	ON public.onto_document_rows (document_id, position)
	WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. RLS (through the parent document)
-- ============================================================================

ALTER TABLE public.onto_document_rows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.onto_document_rows FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onto_document_rows TO authenticated;
GRANT ALL ON public.onto_document_rows TO service_role;

DROP POLICY IF EXISTS onto_document_rows_select_read ON public.onto_document_rows;
CREATE POLICY onto_document_rows_select_read
	ON public.onto_document_rows FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.onto_documents d
			WHERE d.id = onto_document_rows.document_id
				AND current_actor_has_project_access(d.project_id, 'read')
		)
	);

DROP POLICY IF EXISTS onto_document_rows_insert_write ON public.onto_document_rows;
CREATE POLICY onto_document_rows_insert_write
	ON public.onto_document_rows FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM public.onto_documents d
			WHERE d.id = onto_document_rows.document_id
				AND current_actor_has_project_access(d.project_id, 'write')
		)
	);

DROP POLICY IF EXISTS onto_document_rows_update_write ON public.onto_document_rows;
CREATE POLICY onto_document_rows_update_write
	ON public.onto_document_rows FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.onto_documents d
			WHERE d.id = onto_document_rows.document_id
				AND current_actor_has_project_access(d.project_id, 'write')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM public.onto_documents d
			WHERE d.id = onto_document_rows.document_id
				AND current_actor_has_project_access(d.project_id, 'write')
		)
	);

DROP POLICY IF EXISTS onto_document_rows_delete_write ON public.onto_document_rows;
CREATE POLICY onto_document_rows_delete_write
	ON public.onto_document_rows FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.onto_documents d
			WHERE d.id = onto_document_rows.document_id
				AND current_actor_has_project_access(d.project_id, 'write')
		)
	);

-- ============================================================================
-- 3. CELL TEXT (markdown projection helper)
-- ============================================================================

-- Plain-text rendering of one cell value for the markdown projection.
-- Strings: newlines flattened, pipes escaped, capped at 300 chars.
-- Link objects render their label; arrays join with ", ".
CREATE OR REPLACE FUNCTION public.onto_table_cell_text(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
	v_text text;
BEGIN
	IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
		RETURN '';
	END IF;

	CASE jsonb_typeof(p_value)
		WHEN 'string' THEN
			v_text := p_value #>> '{}';
		WHEN 'number' THEN
			v_text := p_value::text;
		WHEN 'boolean' THEN
			v_text := CASE WHEN (p_value #>> '{}')::boolean THEN 'Yes' ELSE 'No' END;
		WHEN 'array' THEN
			SELECT string_agg(public.onto_table_cell_text(e.value), ', ' ORDER BY e.ordinality)
			INTO v_text
			FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ordinality);
		WHEN 'object' THEN
			v_text := COALESCE(p_value->>'label', p_value->>'title', p_value->>'value', p_value->>'id', '');
		ELSE
			v_text := p_value::text;
	END CASE;

	v_text := COALESCE(v_text, '');
	v_text := regexp_replace(v_text, '[\r\n\t]+', ' ', 'g');
	v_text := replace(v_text, '|', '\|');
	IF char_length(v_text) > 300 THEN
		v_text := left(v_text, 299) || '…';
	END IF;
	RETURN v_text;
END;
$$;

-- ============================================================================
-- 4. MARKDOWN PROJECTION
-- ============================================================================

-- Renders the live rows of a table document as a GFM table (first 500 rows),
-- followed by a "N more rows" note. Columns come from p_table.columns, in order,
-- skipping hidden columns.
CREATE OR REPLACE FUNCTION public.onto_document_table_render_markdown(
	p_document_id uuid,
	p_table jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
	v_columns jsonb;
	v_header text;
	v_separator text;
	v_body text;
	v_total integer;
	v_cap constant integer := 500;
BEGIN
	SELECT COALESCE(jsonb_agg(c.value ORDER BY c.ordinality), '[]'::jsonb)
	INTO v_columns
	FROM jsonb_array_elements(COALESCE(p_table->'columns', '[]'::jsonb)) WITH ORDINALITY AS c(value, ordinality)
	WHERE COALESCE((c.value->>'hidden')::boolean, false) = false
		AND COALESCE(c.value->>'id', '') <> '';

	IF jsonb_array_length(v_columns) = 0 THEN
		RETURN '';
	END IF;

	SELECT
		'| ' || string_agg(public.onto_table_cell_text(c.value->'name'), ' | ' ORDER BY c.ordinality) || ' |',
		'|' || string_agg(' --- ', '|' ORDER BY c.ordinality) || '|'
	INTO v_header, v_separator
	FROM jsonb_array_elements(v_columns) WITH ORDINALITY AS c(value, ordinality);

	SELECT count(*) INTO v_total
	FROM public.onto_document_rows r
	WHERE r.document_id = p_document_id AND r.deleted_at IS NULL;

	SELECT string_agg(line, E'\n' ORDER BY rn)
	INTO v_body
	FROM (
		SELECT
			row_number() OVER (ORDER BY r.position, r.row_number) AS rn,
			'| ' || (
				SELECT string_agg(public.onto_table_cell_text(r.cells->(c.value->>'id')), ' | ' ORDER BY c.ordinality)
				FROM jsonb_array_elements(v_columns) WITH ORDINALITY AS c(value, ordinality)
			) || ' |' AS line
		FROM public.onto_document_rows r
		WHERE r.document_id = p_document_id AND r.deleted_at IS NULL
		ORDER BY r.position, r.row_number
		LIMIT v_cap
	) lines;

	RETURN v_header || E'\n' || v_separator
		|| CASE WHEN v_body IS NULL THEN '' ELSE E'\n' || v_body END
		|| CASE WHEN v_total > v_cap THEN E'\n\n_… ' || (v_total - v_cap)::text || ' more rows_' ELSE '' END;
END;
$$;

-- ============================================================================
-- 5. ATOMIC APPLY
-- ============================================================================

-- Applies a batch of row ops (and optionally a new column schema) to a table
-- document in one transaction. All or none: any failing op raises and rolls
-- back the whole batch.
--
-- p_ops: jsonb array of
--   {op:'insert', ref?, cells, cell_meta?, position?, after_row_id?}
--   {op:'update', row_id, cells?, cell_meta?, expected_version?}
--       cells merge into the row; a null value clears that cell. Every cell the
--       patch touches has its cell_meta replaced by p.cell_meta[key] (or
--       cleared), so an edited AI-filled cell stops claiming its old source.
--   {op:'delete', row_id, expected_version?}   (soft delete)
--   {op:'restore', row_id}
--   {op:'move', row_id, position?, after_row_id?}
-- p_table: full replacement for props.table (columns/views/etc.), validated by
--   the caller; revision and row_count are always maintained here.
-- p_expected_revision: optional optimistic check on props.table.revision.
-- p_actor_id: honored only for service_role callers (the gateway); user
--   sessions are attributed to current_actor_id().
--
-- Errors (message prefix, SQLSTATE):
--   TABLE_NOT_FOUND (P0002), NOT_A_TABLE (22023), TABLE_CONFLICT (40001),
--   ROW_NOT_FOUND (P0002), ROW_CONFLICT (40001), INVALID_OP (22023)
CREATE OR REPLACE FUNCTION public.onto_document_table_apply(
	p_document_id uuid,
	p_ops jsonb DEFAULT '[]'::jsonb,
	p_table jsonb DEFAULT NULL,
	p_expected_revision integer DEFAULT NULL,
	p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
	v_doc record;
	v_table jsonb;
	v_revision integer;
	v_actor uuid;
	v_op jsonb;
	v_kind text;
	v_row public.onto_document_rows%ROWTYPE;
	v_results jsonb := '[]'::jsonb;
	v_next_number integer;
	v_tail_position numeric;
	v_position numeric;
	v_after_id uuid;
	v_after_position numeric;
	v_next_position numeric;
	v_patch jsonb;
	v_meta_patch jsonb;
	v_null_keys text[];
	v_before_cells jsonb;
	v_before_meta jsonb;
	v_row_count integer;
	v_content text;
	v_updated_at timestamptz;
BEGIN
	IF p_ops IS NULL THEN
		p_ops := '[]'::jsonb;
	END IF;
	IF jsonb_typeof(p_ops) <> 'array' THEN
		RAISE EXCEPTION 'INVALID_OP: p_ops must be an array' USING ERRCODE = '22023';
	END IF;
	IF p_table IS NOT NULL AND jsonb_typeof(p_table) <> 'object' THEN
		RAISE EXCEPTION 'INVALID_OP: p_table must be an object' USING ERRCODE = '22023';
	END IF;

	SELECT d.id, d.project_id, d.type_key, d.props
	INTO v_doc
	FROM public.onto_documents d
	WHERE d.id = p_document_id AND d.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'TABLE_NOT_FOUND: %', p_document_id USING ERRCODE = 'P0002';
	END IF;

	IF v_doc.type_key IS NULL
		OR (v_doc.type_key <> 'document.table' AND v_doc.type_key NOT LIKE 'document.table.%') THEN
		RAISE EXCEPTION 'NOT_A_TABLE: %', p_document_id USING ERRCODE = '22023';
	END IF;

	v_table := COALESCE(v_doc.props->'table', '{}'::jsonb);
	v_revision := COALESCE((v_table->>'revision')::integer, 0);

	IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_revision THEN
		RAISE EXCEPTION 'TABLE_CONFLICT: expected revision %, found %', p_expected_revision, v_revision
			USING ERRCODE = '40001';
	END IF;

	IF auth.role() = 'service_role' THEN
		v_actor := p_actor_id;
	ELSE
		v_actor := current_actor_id();
	END IF;

	SELECT COALESCE(max(r.row_number), 0) + 1 INTO v_next_number
	FROM public.onto_document_rows r
	WHERE r.document_id = p_document_id;

	SELECT COALESCE(max(r.position), 0) INTO v_tail_position
	FROM public.onto_document_rows r
	WHERE r.document_id = p_document_id AND r.deleted_at IS NULL;

	FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops)
	LOOP
		v_kind := v_op->>'op';

		IF v_kind = 'insert' THEN
			v_patch := COALESCE(v_op->'cells', '{}'::jsonb);
			v_meta_patch := COALESCE(v_op->'cell_meta', '{}'::jsonb);
			IF jsonb_typeof(v_patch) <> 'object' OR jsonb_typeof(v_meta_patch) <> 'object' THEN
				RAISE EXCEPTION 'INVALID_OP: insert cells/cell_meta must be objects' USING ERRCODE = '22023';
			END IF;

			v_position := NULL;
			IF v_op ? 'position' AND jsonb_typeof(v_op->'position') = 'number' THEN
				v_position := (v_op->>'position')::numeric;
			ELSIF COALESCE(v_op->>'after_row_id', '') <> '' THEN
				v_after_id := (v_op->>'after_row_id')::uuid;
				SELECT r.position INTO v_after_position
				FROM public.onto_document_rows r
				WHERE r.id = v_after_id AND r.document_id = p_document_id AND r.deleted_at IS NULL;
				IF NOT FOUND THEN
					RAISE EXCEPTION 'ROW_NOT_FOUND: %', v_after_id USING ERRCODE = 'P0002';
				END IF;
				SELECT min(r.position) INTO v_next_position
				FROM public.onto_document_rows r
				WHERE r.document_id = p_document_id AND r.deleted_at IS NULL AND r.position > v_after_position;
				v_position := CASE
					WHEN v_next_position IS NULL THEN v_after_position + 1024
					ELSE (v_after_position + v_next_position) / 2
				END;
			END IF;

			IF v_position IS NULL THEN
				v_tail_position := v_tail_position + 1024;
				v_position := v_tail_position;
			ELSIF v_position > v_tail_position THEN
				v_tail_position := v_position;
			END IF;

			INSERT INTO public.onto_document_rows (
				document_id, row_number, position, cells, cell_meta, created_by, updated_by
			) VALUES (
				p_document_id,
				v_next_number,
				v_position,
				jsonb_strip_nulls(v_patch),
				jsonb_strip_nulls(v_meta_patch),
				v_actor,
				v_actor
			)
			RETURNING * INTO v_row;
			v_next_number := v_next_number + 1;

			v_results := v_results || jsonb_build_array(jsonb_build_object(
				'op', 'insert',
				'ref', v_op->'ref',
				'row_id', v_row.id,
				'row_number', v_row.row_number,
				'version', v_row.version,
				'before', NULL,
				'after', jsonb_build_object('cells', v_row.cells, 'cell_meta', v_row.cell_meta)
			));

		ELSIF v_kind IN ('update', 'delete', 'restore', 'move') THEN
			IF COALESCE(v_op->>'row_id', '') = '' THEN
				RAISE EXCEPTION 'INVALID_OP: % requires row_id', v_kind USING ERRCODE = '22023';
			END IF;

			SELECT * INTO v_row
			FROM public.onto_document_rows r
			WHERE r.id = (v_op->>'row_id')::uuid AND r.document_id = p_document_id
			FOR UPDATE;

			IF NOT FOUND
				OR (v_kind <> 'restore' AND v_row.deleted_at IS NOT NULL)
				OR (v_kind = 'restore' AND v_row.deleted_at IS NULL) THEN
				RAISE EXCEPTION 'ROW_NOT_FOUND: %', v_op->>'row_id' USING ERRCODE = 'P0002';
			END IF;

			IF v_op ? 'expected_version'
				AND jsonb_typeof(v_op->'expected_version') = 'number'
				AND (v_op->>'expected_version')::integer <> v_row.version THEN
				RAISE EXCEPTION 'ROW_CONFLICT: row % expected version %, found %',
					v_row.id, v_op->>'expected_version', v_row.version
					USING ERRCODE = '40001';
			END IF;

			IF v_kind = 'update' THEN
				v_patch := COALESCE(v_op->'cells', '{}'::jsonb);
				v_meta_patch := COALESCE(v_op->'cell_meta', '{}'::jsonb);
				IF jsonb_typeof(v_patch) <> 'object' OR jsonb_typeof(v_meta_patch) <> 'object' THEN
					RAISE EXCEPTION 'INVALID_OP: update cells/cell_meta must be objects' USING ERRCODE = '22023';
				END IF;

				SELECT
					COALESCE(jsonb_object_agg(k.key, COALESCE(v_row.cells->k.key, 'null'::jsonb)), '{}'::jsonb),
					COALESCE(jsonb_object_agg(k.key, COALESCE(v_row.cell_meta->k.key, 'null'::jsonb)), '{}'::jsonb)
				INTO v_before_cells, v_before_meta
				FROM (
					SELECT key FROM jsonb_object_keys(v_patch) AS key
					UNION
					SELECT key FROM jsonb_object_keys(v_meta_patch) AS key
				) k;

				SELECT COALESCE(array_agg(e.key), ARRAY[]::text[]) INTO v_null_keys
				FROM jsonb_each(v_patch) e
				WHERE jsonb_typeof(e.value) = 'null';

				UPDATE public.onto_document_rows r
				SET
					cells = (r.cells || v_patch) - v_null_keys,
					cell_meta = jsonb_strip_nulls(
						(r.cell_meta - ARRAY(SELECT jsonb_object_keys(v_patch))) || v_meta_patch
					),
					version = r.version + 1,
					updated_by = v_actor,
					updated_at = now()
				WHERE r.id = v_row.id
				RETURNING * INTO v_row;

				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'op', 'update',
					'row_id', v_row.id,
					'row_number', v_row.row_number,
					'version', v_row.version,
					'before', jsonb_build_object('cells', v_before_cells, 'cell_meta', v_before_meta),
					'after', jsonb_build_object('cells', v_row.cells, 'cell_meta', v_row.cell_meta)
				));

			ELSIF v_kind = 'delete' THEN
				UPDATE public.onto_document_rows r
				SET deleted_at = now(), version = r.version + 1, updated_by = v_actor, updated_at = now()
				WHERE r.id = v_row.id
				RETURNING * INTO v_row;

				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'op', 'delete',
					'row_id', v_row.id,
					'row_number', v_row.row_number,
					'version', v_row.version,
					'before', jsonb_build_object('cells', v_row.cells, 'cell_meta', v_row.cell_meta),
					'after', NULL
				));

			ELSIF v_kind = 'restore' THEN
				UPDATE public.onto_document_rows r
				SET deleted_at = NULL, version = r.version + 1, updated_by = v_actor, updated_at = now()
				WHERE r.id = v_row.id
				RETURNING * INTO v_row;

				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'op', 'restore',
					'row_id', v_row.id,
					'row_number', v_row.row_number,
					'version', v_row.version,
					'before', NULL,
					'after', jsonb_build_object('cells', v_row.cells, 'cell_meta', v_row.cell_meta)
				));

			ELSE -- move
				v_position := NULL;
				IF v_op ? 'position' AND jsonb_typeof(v_op->'position') = 'number' THEN
					v_position := (v_op->>'position')::numeric;
				ELSIF COALESCE(v_op->>'after_row_id', '') <> '' THEN
					v_after_id := (v_op->>'after_row_id')::uuid;
					SELECT r.position INTO v_after_position
					FROM public.onto_document_rows r
					WHERE r.id = v_after_id AND r.document_id = p_document_id AND r.deleted_at IS NULL;
					IF NOT FOUND THEN
						RAISE EXCEPTION 'ROW_NOT_FOUND: %', v_after_id USING ERRCODE = 'P0002';
					END IF;
					SELECT min(r.position) INTO v_next_position
					FROM public.onto_document_rows r
					WHERE r.document_id = p_document_id AND r.deleted_at IS NULL
						AND r.position > v_after_position AND r.id <> v_row.id;
					v_position := CASE
						WHEN v_next_position IS NULL THEN v_after_position + 1024
						ELSE (v_after_position + v_next_position) / 2
					END;
				ELSE
					-- No anchor: move to the top.
					SELECT COALESCE(min(r.position), 1024) - 1024 INTO v_position
					FROM public.onto_document_rows r
					WHERE r.document_id = p_document_id AND r.deleted_at IS NULL AND r.id <> v_row.id;
				END IF;

				v_before_cells := to_jsonb(v_row.position);
				UPDATE public.onto_document_rows r
				SET position = v_position, version = r.version + 1, updated_by = v_actor, updated_at = now()
				WHERE r.id = v_row.id
				RETURNING * INTO v_row;
				IF v_position > v_tail_position THEN
					v_tail_position := v_position;
				END IF;

				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'op', 'move',
					'row_id', v_row.id,
					'row_number', v_row.row_number,
					'version', v_row.version,
					'before', jsonb_build_object('position', v_before_cells),
					'after', jsonb_build_object('position', v_row.position)
				));
			END IF;

		ELSE
			RAISE EXCEPTION 'INVALID_OP: unknown op %', COALESCE(v_kind, 'null') USING ERRCODE = '22023';
		END IF;
	END LOOP;

	IF p_table IS NOT NULL THEN
		v_table := p_table;
	END IF;

	SELECT count(*) INTO v_row_count
	FROM public.onto_document_rows r
	WHERE r.document_id = p_document_id AND r.deleted_at IS NULL;

	v_table := v_table
		|| jsonb_build_object('revision', v_revision + 1, 'row_count', v_row_count);

	v_content := public.onto_document_table_render_markdown(p_document_id, v_table);

	UPDATE public.onto_documents d
	SET
		props = jsonb_set(COALESCE(d.props, '{}'::jsonb) - 'body_markdown', '{table}', v_table, true),
		content = v_content
	WHERE d.id = p_document_id
	RETURNING d.updated_at INTO v_updated_at;

	RETURN jsonb_build_object(
		'document_id', p_document_id,
		'revision', v_revision + 1,
		'row_count', v_row_count,
		'updated_at', v_updated_at,
		'results', v_results
	);
END;
$$;

COMMENT ON FUNCTION public.onto_document_table_apply(uuid, jsonb, jsonb, integer, uuid) IS
	'Atomically applies row ops (and optionally a new props.table schema) to a table document and regenerates its markdown projection. Invoker rights: RLS on onto_documents/onto_document_rows decides access.';

-- ============================================================================
-- 6. GRANTS (functions are server-only by default; the web app calls apply
--    with the signed-in user's session, and RLS decides access)
-- ============================================================================

REVOKE ALL ON FUNCTION public.onto_table_cell_text(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onto_document_table_render_markdown(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onto_document_table_apply(uuid, jsonb, jsonb, integer, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.onto_table_cell_text(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.onto_document_table_render_markdown(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.onto_document_table_apply(uuid, jsonb, jsonb, integer, uuid) TO authenticated, service_role;
