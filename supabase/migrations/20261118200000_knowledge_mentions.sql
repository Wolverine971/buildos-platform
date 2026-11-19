-- supabase/migrations/20261118200000_knowledge_mentions.sql
-- Mentions follow edits (tasker 167).
--
-- 1. knowledge_mentions: one row per place a person/org name appears in a task or document, in
--    one user's private graph. Offsets point into the stored field text (task title/description,
--    document title/content); `text` is the exact characters, `prefix`/`suffix` are ~32 characters
--    on each side (quote + context anchoring, like web annotations), `content_hash` is the field's
--    hash when anchored. On every save the readers re-anchor each row: same text found → moved;
--    the words around it found but the text between changed → edited in place (a spelling fix or
--    rename: folded or asked "same person?"); nothing found → deleted. `made_by = 'user'` +
--    `status = 'removed'` is a tag the user removed: it stays (re-anchored) so a re-read never puts
--    the tag back at that spot. knowledge_record_links stays the per-record summary the card shows.
-- 2. knowledge_mention_reads: per user and record, the content hash and reader version last
--    anchored, so an unchanged document is skipped without loading the name finder.
-- 3. knowledge_entities.hidden_reason: 'orphan' marks an entry a reader made that lost its last
--    mention (hidden, reversible). Readers revive it when the name shows up again; entries the user
--    hid (hidden_reason NULL) stay hidden.
-- 4. A merge repoints the merged entry's mentions to the entry it merged into (every merge path:
--    knowledge_merge_entities, the duplicates review, identity questions).
-- 5. queue type knowledge_doc_mentions: the debounced re-read after a document is saved.
--
-- Writers: the worker (service role) and web routes as the signed-in owner. Service-role code
-- filters by owner in code; RLS keeps signed-in callers to their own rows.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Mentions

CREATE TABLE IF NOT EXISTS public.knowledge_mentions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	record_kind text NOT NULL CHECK (record_kind IN ('task', 'document')),
	record_id uuid NOT NULL,
	field text NOT NULL CHECK (field IN ('title', 'description', 'content')),
	start_offset integer NOT NULL CHECK (start_offset >= 0),
	end_offset integer NOT NULL,
	text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300),
	prefix text NOT NULL DEFAULT '' CHECK (char_length(prefix) <= 64),
	suffix text NOT NULL DEFAULT '' CHECK (char_length(suffix) <= 64),
	content_hash text CHECK (content_hash IS NULL OR char_length(content_hash) <= 64),
	made_by text NOT NULL DEFAULT 'reader' CHECK (made_by IN ('reader', 'user')),
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_mentions_span CHECK (end_offset > start_offset)
);

CREATE INDEX IF NOT EXISTS knowledge_mentions_record
	ON public.knowledge_mentions (owner_user_id, record_kind, record_id);
CREATE INDEX IF NOT EXISTS knowledge_mentions_entity
	ON public.knowledge_mentions (entity_id);
-- Every owner with tags on a record (a shared doc re-anchors each owner's own mentions).
CREATE INDEX IF NOT EXISTS knowledge_mentions_record_any_owner
	ON public.knowledge_mentions (record_kind, record_id);

COMMENT ON TABLE public.knowledge_mentions IS
	'Where a person/org name appears in a task or document (private to one user). Offsets into the stored field text plus quote/prefix/suffix anchoring; re-anchored on every save.';
COMMENT ON COLUMN public.knowledge_mentions.status IS
	'active = a tag shown in the text; removed = the user removed the tag here (kept so a re-read never re-tags this spot).';

ALTER TABLE public.knowledge_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_mentions_owner ON public.knowledge_mentions;
CREATE POLICY knowledge_mentions_owner ON public.knowledge_mentions
	FOR ALL TO authenticated
	USING (owner_user_id = (SELECT auth.uid()))
	WITH CHECK (owner_user_id = (SELECT auth.uid())
		AND EXISTS (SELECT 1 FROM public.knowledge_entities e
			WHERE e.id = entity_id AND (e.scope = 'public' OR e.owner_user_id = (SELECT auth.uid()))));

REVOKE ALL ON TABLE public.knowledge_mentions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_mentions TO authenticated;
GRANT ALL ON TABLE public.knowledge_mentions TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Reads (content-hash skip)

CREATE TABLE IF NOT EXISTS public.knowledge_mention_reads (
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	record_kind text NOT NULL CHECK (record_kind IN ('task', 'document')),
	record_id uuid NOT NULL,
	content_hash text NOT NULL CHECK (char_length(content_hash) <= 64),
	reader_version integer NOT NULL DEFAULT 1,
	read_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (owner_user_id, record_kind, record_id)
);

COMMENT ON TABLE public.knowledge_mention_reads IS
	'The text hash and reader version a record''s mentions were last anchored against (skip unchanged records).';

ALTER TABLE public.knowledge_mention_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_mention_reads_owner_read ON public.knowledge_mention_reads;
CREATE POLICY knowledge_mention_reads_owner_read ON public.knowledge_mention_reads
	FOR SELECT TO authenticated
	USING (owner_user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.knowledge_mention_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.knowledge_mention_reads TO authenticated;
GRANT ALL ON TABLE public.knowledge_mention_reads TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Orphan-hidden entries

ALTER TABLE public.knowledge_entities
	ADD COLUMN IF NOT EXISTS hidden_reason text;

ALTER TABLE public.knowledge_entities
	DROP CONSTRAINT IF EXISTS knowledge_entities_hidden_reason_check,
	ADD CONSTRAINT knowledge_entities_hidden_reason_check
		CHECK (hidden_reason IS NULL OR hidden_reason = 'orphan');

COMMENT ON COLUMN public.knowledge_entities.hidden_reason IS
	'Read only while status = hidden. orphan = hidden automatically: a reader made it and its last mention was deleted (revived when the name shows up again). NULL = hidden by the user.';

-- ---------------------------------------------------------------------------
-- 4. Merges carry mentions

CREATE OR REPLACE FUNCTION public.knowledge_mentions_follow_merge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	UPDATE public.knowledge_mentions
	SET entity_id = NEW.merged_into_id, updated_at = now()
	WHERE entity_id = NEW.id
		AND owner_user_id = NEW.owner_user_id;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_mentions_follow_merge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_knowledge_mentions_follow_merge ON public.knowledge_entities;
CREATE TRIGGER trg_knowledge_mentions_follow_merge
	AFTER UPDATE OF status, merged_into_id ON public.knowledge_entities
	FOR EACH ROW
	WHEN (NEW.status = 'merged' AND NEW.merged_into_id IS NOT NULL
		AND NEW.owner_user_id IS NOT NULL
		AND NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id)
	EXECUTE FUNCTION public.knowledge_mentions_follow_merge();

-- ---------------------------------------------------------------------------
-- 5. Debounced document re-read

ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'knowledge_doc_mentions';

COMMIT;
