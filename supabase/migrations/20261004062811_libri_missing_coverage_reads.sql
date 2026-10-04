-- libri-migration: true
-- Member-visible glossary storage and bounded, current capture-coverage counts.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE TABLE libri.glossary_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 book_id uuid NOT NULL,
 term text NOT NULL CHECK(length(btrim(term)) BETWEEN 1 AND 1000),
 term_normalized text NOT NULL CHECK(length(btrim(term_normalized)) BETWEEN 1 AND 1000),
 definition text NOT NULL CHECK(octet_length(definition)<=200000),
 first_seen_page text CHECK(length(first_seen_page)<=100),
 provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(provenance)='object' AND octet_length(provenance::text)<=100000),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(library_id,id),
 FOREIGN KEY(library_id,book_id) REFERENCES libri.books(library_id,id) ON DELETE CASCADE
);
CREATE INDEX glossary_terms_book_term_idx ON libri.glossary_terms(library_id,book_id,term_normalized);
CREATE TRIGGER glossary_terms_updated_at BEFORE UPDATE ON libri.glossary_terms FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
ALTER TABLE libri.glossary_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.glossary_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY glossary_terms_member_read ON libri.glossary_terms FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=glossary_terms.library_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON libri.glossary_terms FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.glossary_terms TO authenticated;
GRANT ALL ON libri.glossary_terms TO service_role;

CREATE FUNCTION libri.read_missing_book_coverage(p_library_id uuid,p_book_ids uuid[])
RETURNS TABLE(book_id uuid,has_cover boolean,has_toc boolean,has_glossary boolean,has_cover_image boolean,has_toc_image boolean,has_glossary_image boolean,glossary_term_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri SET statement_timeout='5s'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501'; END IF;
 IF p_book_ids IS NULL OR cardinality(p_book_ids) NOT BETWEEN 1 AND 100 OR array_position(p_book_ids,NULL) IS NOT NULL
  OR (SELECT count(DISTINCT id) FROM unnest(p_book_ids) id)<>cardinality(p_book_ids) THEN
  RAISE EXCEPTION 'Use one to one hundred unique book IDs' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH selected AS MATERIALIZED (SELECT b.id,b.indexing FROM libri.books b WHERE b.library_id=p_library_id AND b.id=ANY(p_book_ids)),
 image_flags AS (SELECT i.book_id,bool_or(i.image_type='cover') cover,bool_or(i.image_type='toc') toc,bool_or(i.image_type='glossary') glossary
  FROM libri.images i JOIN selected b ON b.id=i.book_id WHERE i.library_id=p_library_id GROUP BY i.book_id),
 terms AS (SELECT g.book_id,count(*) total FROM libri.glossary_terms g JOIN selected b ON b.id=g.book_id WHERE g.library_id=p_library_id GROUP BY g.book_id)
 SELECT b.id,coalesce((b.indexing->'hasCover')='true'::jsonb,false) OR coalesce(i.cover,false),
  coalesce((b.indexing->'hasToc')='true'::jsonb,false) OR coalesce(i.toc,false),
  coalesce(i.glossary,false) OR coalesce(t.total,0)>0,
  coalesce(i.cover,false),coalesce(i.toc,false),coalesce(i.glossary,false),coalesce(t.total,0)
 FROM selected b LEFT JOIN image_flags i ON i.book_id=b.id LEFT JOIN terms t ON t.book_id=b.id ORDER BY b.id;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_missing_book_coverage(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_missing_book_coverage(uuid,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
