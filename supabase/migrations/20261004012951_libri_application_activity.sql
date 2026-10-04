-- libri-migration: true
-- libri-allow-security-definer: log_application_activity, record_note_created_activity
-- Client activity is append-only through a bounded, actor-pinned RPC. Note events
-- commit with the note. Archived Convex activity is not replayed as current activity.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.activity_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK (event_type IN ('search.query','book.viewed','chapter.viewed','domain.filtered','note.created')),
 source text NOT NULL CHECK (length(source) BETWEEN 1 AND 120),
 -- These are validated snapshots, retained if the subject is later deleted.
 book_id uuid, book_slug text, book_title text, chapter_id uuid, chapter_title text,
 note_id uuid,
 search_query text CHECK (search_query IS NULL OR length(search_query)<=280),
 domain text CHECK (domain IS NULL OR length(domain)<=120),
 message text NOT NULL CHECK (length(message)<=400),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT activity_events_note_origin CHECK ((event_type='note.created')=(note_id IS NOT NULL)),
 CONSTRAINT activity_events_subject CHECK (
   (event_type IN ('search.query','domain.filtered') AND book_id IS NULL AND chapter_id IS NULL)
   OR (event_type IN ('book.viewed','chapter.viewed','note.created') AND book_id IS NOT NULL)
 ),
 CONSTRAINT activity_events_chapter_subject CHECK (event_type<>'chapter.viewed' OR chapter_id IS NOT NULL)
);
CREATE INDEX activity_events_library_recent_idx ON libri.activity_events(library_id,created_at DESC,id DESC);
CREATE INDEX activity_events_actor_recent_idx ON libri.activity_events(actor_user_id,library_id,event_type,created_at DESC);
CREATE UNIQUE INDEX activity_events_note_origin_idx ON libri.activity_events(note_id) WHERE note_id IS NOT NULL;
ALTER TABLE libri.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.activity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_events_owner_read ON libri.activity_events FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM libri.library_members member WHERE member.library_id=activity_events.library_id
   AND member.user_id=(SELECT auth.uid()) AND member.role='owner'));
REVOKE ALL ON libri.activity_events FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.activity_events TO authenticated;
GRANT ALL ON libri.activity_events TO service_role;

CREATE FUNCTION libri.log_application_activity(
 p_library_id uuid,p_event_type text,p_source text DEFAULT NULL,
 p_book_id uuid DEFAULT NULL,p_chapter_id uuid DEFAULT NULL,p_query text DEFAULT NULL,p_domain text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 actor_id uuid := auth.uid();
 member_role text;
 source_value text;
 query_value text;
 domain_value text;
 subject_book libri.books%ROWTYPE;
 subject_chapter libri.chapters%ROWTYPE;
 message_value text;
 dedupe_seconds integer;
 event_time timestamptz;
BEGIN
 -- Authorize before lookup or normalization. Locking this one membership row makes
 -- concurrent duplicate requests serialize and prevents revocation during the write.
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 SELECT role INTO member_role FROM libri.library_members
 WHERE library_id=p_library_id AND user_id=actor_id FOR UPDATE;
 IF member_role IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_event_type IS NULL OR p_event_type NOT IN ('search.query','book.viewed','chapter.viewed','domain.filtered')
 OR (p_source IS NOT NULL AND length(p_source)>120)
 OR (p_query IS NOT NULL AND length(p_query)>280)
 OR (p_domain IS NOT NULL AND length(p_domain)>120) THEN
   RAISE EXCEPTION 'Invalid activity input' USING ERRCODE='22023';
 END IF;
 source_value := coalesce(nullif(btrim(p_source),''),CASE p_event_type
   WHEN 'search.query' THEN 'books.search' WHEN 'book.viewed' THEN 'books.detail'
   WHEN 'chapter.viewed' THEN 'books.detail.chapter' ELSE 'home.filter' END);
 IF p_event_type='search.query' THEN
   IF p_book_id IS NOT NULL OR p_chapter_id IS NOT NULL OR p_domain IS NOT NULL THEN RAISE EXCEPTION 'Unexpected activity context' USING ERRCODE='22023'; END IF;
   query_value := btrim(regexp_replace(coalesce(p_query,''),'\s+',' ','g'));
   IF length(query_value)<2 THEN RETURN '{"logged":false,"reason":"too_short"}'::jsonb; END IF;
   message_value := format('Searched for "%s"',query_value); dedupe_seconds := 45;
 ELSIF p_event_type='domain.filtered' THEN
   IF p_book_id IS NOT NULL OR p_chapter_id IS NOT NULL OR p_query IS NOT NULL THEN RAISE EXCEPTION 'Unexpected activity context' USING ERRCODE='22023'; END IF;
   domain_value := btrim(regexp_replace(coalesce(p_domain,''),'\s+',' ','g'));
   IF domain_value='' THEN RETURN '{"logged":false,"reason":"empty_domain"}'::jsonb; END IF;
   message_value := format('Filtered by domain "%s"',domain_value); dedupe_seconds := 30;
 ELSE
   IF p_book_id IS NULL OR p_query IS NOT NULL OR p_domain IS NOT NULL
     OR (p_event_type='book.viewed' AND p_chapter_id IS NOT NULL)
     OR (p_event_type='chapter.viewed' AND p_chapter_id IS NULL) THEN
     RAISE EXCEPTION 'Invalid activity context' USING ERRCODE='22023';
   END IF;
   SELECT * INTO subject_book FROM libri.books WHERE library_id=p_library_id AND id=p_book_id FOR SHARE;
   IF NOT FOUND THEN RETURN '{"logged":false,"reason":"book_not_found"}'::jsonb; END IF;
   IF p_event_type='chapter.viewed' THEN
     SELECT * INTO subject_chapter FROM libri.chapters WHERE library_id=p_library_id AND id=p_chapter_id AND book_id=p_book_id FOR SHARE;
     IF NOT FOUND THEN RETURN '{"logged":false,"reason":"chapter_not_found"}'::jsonb; END IF;
     message_value := format('Viewed chapter "%s" in "%s"',subject_chapter.title,subject_book.title);
   ELSE message_value := format('Viewed "%s"',subject_book.title); END IF;
   dedupe_seconds := 60;
 END IF;
 event_time := clock_timestamp();
 IF EXISTS (SELECT 1 FROM libri.activity_events event WHERE event.library_id=p_library_id
   AND event.actor_user_id=actor_id AND event.event_type=p_event_type
   AND event.created_at>=event_time-make_interval(secs=>dedupe_seconds)
   AND lower(event.source)=lower(source_value)
   AND event.book_id IS NOT DISTINCT FROM p_book_id AND event.chapter_id IS NOT DISTINCT FROM p_chapter_id
   AND lower(event.search_query) IS NOT DISTINCT FROM lower(query_value)
   AND lower(event.domain) IS NOT DISTINCT FROM lower(domain_value)) THEN
   RETURN '{"logged":false,"deduped":true}'::jsonb;
 END IF;
 INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,chapter_id,chapter_title,search_query,domain,message,created_at)
 VALUES (p_library_id,actor_id,p_event_type,source_value,p_book_id,left(subject_book.slug,180),left(subject_book.title,240),p_chapter_id,left(subject_chapter.title,240),query_value,domain_value,left(message_value,400),event_time);
 RETURN '{"logged":true}'::jsonb;
END;
$function$;
REVOKE ALL ON FUNCTION libri.log_application_activity(uuid,text,text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
-- This is an intentional session API: auth.uid(), owner membership and all subject
-- scope are checked inside the function; raw append/update/delete remain forbidden.
GRANT EXECUTE ON FUNCTION libri.log_application_activity(uuid,text,text,uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION libri.record_note_created_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 actor_id uuid := auth.uid();
 subject_book libri.books%ROWTYPE;
 subject_chapter libri.chapters%ROWTYPE;
BEGIN
 -- Offline imports and service maintenance have no user identity and must not be
 -- misrepresented as current user actions. Existing note RLS remains authoritative.
 IF actor_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.owner_user_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Invalid note actor' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=NEW.library_id AND user_id=actor_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT subject_book FROM libri.books WHERE library_id=NEW.library_id AND id=NEW.book_id;
 IF NEW.chapter_id IS NOT NULL THEN
   SELECT * INTO STRICT subject_chapter FROM libri.chapters WHERE library_id=NEW.library_id AND id=NEW.chapter_id AND book_id=NEW.book_id;
 END IF;
 INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,chapter_id,chapter_title,note_id,message)
 VALUES (NEW.library_id,actor_id,'note.created','notes.create',NEW.book_id,left(subject_book.slug,180),left(subject_book.title,240),NEW.chapter_id,left(subject_chapter.title,240),NEW.id,
   left(CASE WHEN NEW.chapter_id IS NULL THEN format('Created note for "%s"',subject_book.title)
     ELSE format('Created note for chapter "%s" in "%s"',subject_chapter.title,subject_book.title) END,400));
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION libri.record_note_created_activity() FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
CREATE TRIGGER notes_created_activity AFTER INSERT ON libri.notes FOR EACH ROW EXECUTE FUNCTION libri.record_note_created_activity();
-- Library and actor cascades integrate with account deletion without changing any
-- shared-account purge routine. Note content is never copied into activity.
NOTIFY pgrst,'reload schema';
RESET statement_timeout;
RESET lock_timeout;
