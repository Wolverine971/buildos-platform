-- libri-migration: true
-- Compute current completeness from caller-visible canonical records. This is a
-- bounded read, not a write, queue admission, or replay of legacy research tasks.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE FUNCTION libri.read_book_completeness(p_library_id uuid,p_book_ids uuid[])
RETURNS TABLE(book_id uuid,completeness jsonb,indexing_enriched boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 book_row libri.books%ROWTYPE;
 chapter_count integer; summary_count integer; concept_count integer; chapter_ai_count integer;
 basic_count integer; deep_count integer; fragment_count integer; note_count integer;
 author_count integer; author_enriched boolean; source_count integer; podcast_count integer; video_count integer;
 book_ai_count integer; analysis_count integer; synthesis_count integer; target_fragments integer;
 analysis_row libri.derived_artifacts%ROWTYPE;
 latest_note timestamptz; analysis_outdated boolean;
 fragment_coverage numeric; chapter_ai_coverage numeric;
 points jsonb; counts jsonb; gaps jsonb; score_value integer; tier_value text;
 missing_summary integer; missing_concepts integer; missing_deep integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM libri.library_members member
   WHERE member.library_id=p_library_id AND member.user_id=auth.uid()) THEN
   RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501';
 END IF;
 IF p_book_ids IS NULL OR cardinality(p_book_ids)<1 OR cardinality(p_book_ids)>100
   OR array_position(p_book_ids,NULL) IS NOT NULL
   OR (SELECT count(DISTINCT id) FROM unnest(p_book_ids) id)<>cardinality(p_book_ids) THEN
   RAISE EXCEPTION 'Use one to one hundred unique book IDs' USING ERRCODE='22023';
 END IF;
 FOR book_row IN SELECT b.* FROM libri.books b WHERE b.library_id=p_library_id AND b.id=ANY(p_book_ids) ORDER BY b.id LOOP
   SELECT count(*)::int,
     count(*) FILTER (WHERE nullif(btrim(chapter.summary),'') IS NOT NULL OR EXISTS
       (SELECT 1 FROM libri.derived_artifacts artifact WHERE artifact.library_id=p_library_id AND artifact.book_id=book_row.id
        AND artifact.chapter_id=chapter.id AND artifact.is_current AND artifact.status NOT IN ('rejected','failed') AND artifact.artifact_type='chapter_summary'))::int,
     count(*) FILTER (WHERE (jsonb_typeof(chapter.enrichment_payload->'keyConcepts')='array' AND chapter.enrichment_payload->'keyConcepts'<>'[]'::jsonb) OR EXISTS
       (SELECT 1 FROM libri.derived_artifacts artifact WHERE artifact.library_id=p_library_id AND artifact.book_id=book_row.id
        AND artifact.chapter_id=chapter.id AND artifact.is_current AND artifact.status NOT IN ('rejected','failed') AND artifact.artifact_type='key_concepts'))::int,
     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM libri.derived_artifacts artifact WHERE artifact.library_id=p_library_id AND artifact.book_id=book_row.id
       AND artifact.chapter_id=chapter.id AND artifact.is_current AND artifact.status NOT IN ('rejected','failed')))::int,
     count(*) FILTER (WHERE chapter.research_status='complete')::int,
     count(*) FILTER (WHERE chapter.enrichment_phase='complete')::int,
     coalesce(bool_and(nullif(btrim(chapter.summary),'') IS NOT NULL OR chapter.research_status='complete' OR
       coalesce((jsonb_typeof(chapter.enrichment_payload->'topics')='array' AND chapter.enrichment_payload->'topics'<>'[]'::jsonb
        AND jsonb_typeof(chapter.research_payload->'researchOutline')='array' AND chapter.research_payload->'researchOutline'<>'[]'::jsonb),false)),false)
   INTO chapter_count,summary_count,concept_count,chapter_ai_count,basic_count,deep_count,indexing_enriched
   FROM libri.chapters chapter WHERE chapter.library_id=p_library_id AND chapter.book_id=book_row.id;
   SELECT count(*)::int INTO fragment_count FROM libri.source_chunks chunk WHERE chunk.library_id=p_library_id AND chunk.book_id=book_row.id AND chunk.chunk_type='ocr' AND NOT chunk.is_archived;
   SELECT count(*)::int,max(note.updated_at) INTO note_count,latest_note FROM libri.notes note WHERE note.library_id=p_library_id AND note.book_id=book_row.id;
   SELECT count(*)::int,coalesce(bool_or(nullif(btrim(person.bio),'') IS NOT NULL AND
     coalesce(nullif(btrim(person.links->>'website'),''),nullif(btrim(person.links->>'youtube'),''),nullif(btrim(person.links->>'twitter'),''),nullif(btrim(person.links->>'wikipedia'),'')) IS NOT NULL),false)
   INTO author_count,author_enriched FROM libri.book_people relation JOIN libri.people person ON person.library_id=relation.library_id AND person.id=relation.person_id
   WHERE relation.library_id=p_library_id AND relation.book_id=book_row.id AND relation.role='author';
   SELECT count(*)::int,count(*) FILTER (WHERE source.source_type='podcast_episode')::int INTO source_count,podcast_count
   FROM libri.source_book_links link JOIN libri.sources source ON source.library_id=link.library_id AND source.id=link.source_id
   WHERE link.library_id=p_library_id AND link.book_id=book_row.id AND source.source_type NOT IN ('scanned_image','uploaded_document','youtube_video');
   SELECT count(DISTINCT edge.from_youtube_video_id)::int INTO video_count FROM libri.entity_edges edge
   WHERE edge.library_id=p_library_id AND edge.to_book_id=book_row.id AND edge.status<>'rejected' AND edge.from_youtube_video_id IS NOT NULL
     AND edge.relationship_type IN ('video.references_book','video.explains_book','video.author_interview');
   SELECT count(*) FILTER (WHERE artifact.artifact_type<>'book_analysis' AND artifact.chapter_id IS NULL AND artifact.status NOT IN ('rejected','failed'))::int,
     count(*) FILTER (WHERE artifact.artifact_type='book_analysis')::int
   INTO book_ai_count,analysis_count FROM libri.derived_artifacts artifact WHERE artifact.library_id=p_library_id AND artifact.book_id=book_row.id AND artifact.is_current;
   SELECT artifact.* INTO analysis_row FROM libri.derived_artifacts artifact WHERE artifact.library_id=p_library_id AND artifact.book_id=book_row.id
     AND artifact.artifact_type='book_analysis' AND artifact.is_current ORDER BY artifact.version DESC,artifact.generated_at DESC,artifact.id DESC LIMIT 1;
   synthesis_count := book_ai_count + CASE WHEN analysis_row.id IS NOT NULL AND analysis_row.status NOT IN ('failed','rejected') THEN 1 ELSE 0 END;
   analysis_outdated := analysis_row.id IS NOT NULL AND (analysis_row.status='outdated' OR latest_note>analysis_row.generated_at
     OR analysis_row.input_snapshot->'noteCount' IS DISTINCT FROM to_jsonb(note_count));
   target_fragments := greatest(12,least(80,round(coalesce(book_row.page_count,300)*0.08)::int));
   fragment_coverage := least(fragment_count::numeric/target_fragments,1);
   chapter_ai_coverage := CASE WHEN chapter_count>0 THEN chapter_ai_count::numeric/chapter_count ELSE 0 END;
   points := jsonb_build_object(
     'hasCover',CASE WHEN book_row.indexing->'hasCover'='true'::jsonb THEN 2 ELSE 0 END,
     'hasToc',CASE WHEN book_row.indexing->'hasToc'='true'::jsonb THEN 3 ELSE 0 END,
     'chaptersExtracted',CASE WHEN book_row.indexing->'chaptersExtracted'='true'::jsonb THEN 10 ELSE 0 END,
     'hasAnyChapter',CASE WHEN chapter_count>0 THEN 2 ELSE 0 END,
     'chapterSummaries',CASE WHEN chapter_count>0 THEN round(summary_count::numeric/chapter_count*15,2) ELSE 0 END,
     'chapterConcepts',CASE WHEN chapter_count>0 THEN round(concept_count::numeric/chapter_count*10,2) ELSE 0 END,
     'hasFragments',CASE WHEN fragment_count>0 THEN 5 ELSE 0 END,
     'fragmentCoverageDepth',round(fragment_coverage*10,2),
     'hasBookLevelAiContent',CASE WHEN synthesis_count>0 THEN 5 ELSE 0 END,
     'chapterAiContent',round(chapter_ai_coverage*10,2),
     'externalSources',round(least(source_count::numeric/5,1)*8,2),
     'youtubeVideos',round(least(video_count::numeric/3,1)*5,2),
     'podcasts',round(least(podcast_count::numeric/2,1)*5,2),
     'authorEnriched',CASE WHEN author_enriched THEN 3 ELSE 0 END,
     'hasIsbn',CASE WHEN coalesce(nullif(btrim(book_row.isbn10),''),nullif(btrim(book_row.isbn13),'')) IS NOT NULL THEN 2 ELSE 0 END,
     'hasPageCount',CASE WHEN book_row.page_count>0 THEN 2 ELSE 0 END,
     'hasYear',CASE WHEN book_row.year IS NOT NULL THEN 1 ELSE 0 END,
     'hasNotes',CASE WHEN note_count>0 THEN 2 ELSE 0 END);
   SELECT greatest(0,least(100,round(sum(value::numeric))))::int INTO score_value FROM jsonb_each_text(points);
   tier_value := CASE WHEN score_value<=14 THEN 'STUB' WHEN score_value<=34 THEN 'LOW' WHEN score_value<=59 THEN 'MEDIUM' WHEN score_value<=84 THEN 'HIGH' ELSE 'EXPERT' END;
   counts := jsonb_build_object('chapters',chapter_count,'fragments',fragment_count,'externalSources',source_count,'linkedVideos',video_count,'linkedPodcasts',podcast_count,
     'notes',note_count,'authors',author_count,'chaptersWithSummary',summary_count,'chaptersWithConcepts',concept_count,'chaptersWithAiContent',chapter_ai_count,
     'bookLevelAiContent',book_ai_count,'bookAnalyses',analysis_count,'bookSynthesisRecords',synthesis_count,'targetFragmentCount',target_fragments);
   gaps := '[]'::jsonb;
   missing_summary := greatest(0,chapter_count-summary_count); missing_concepts := greatest(0,chapter_count-concept_count); missing_deep := greatest(0,basic_count-deep_count);
   IF chapter_count=0 THEN gaps:=gaps||jsonb_build_object('area','chapters','message','No chapters extracted — scan TOC.','priority','high'); END IF;
   IF missing_summary>0 THEN gaps:=gaps||jsonb_build_object('area','chapter_research','message',format('%s/%s chapters are missing summaries.',missing_summary,chapter_count),'priority',CASE WHEN missing_summary>chapter_count/2.0 THEN 'high' ELSE 'medium' END); END IF;
   IF missing_concepts>0 THEN gaps:=gaps||jsonb_build_object('area','key_concepts','message',format('%s/%s chapters are missing key concepts.',missing_concepts,chapter_count),'priority','medium'); END IF;
   IF missing_deep>0 THEN gaps:=gaps||jsonb_build_object('area','deep_enrichment','message',format('%s/%s researched chapters lack deep enrichment.',missing_deep,basic_count),'priority','low'); END IF;
   IF fragment_count=0 THEN gaps:=gaps||jsonb_build_object('area','fragments','message','No OCR fragments captured yet — scan pages.','priority','high');
   ELSIF fragment_coverage<0.45 THEN gaps:=gaps||jsonb_build_object('area','fragment_coverage','message','Fragment coverage depth is still thin relative to page count.','priority','medium'); END IF;
   IF synthesis_count=0 THEN gaps:=gaps||jsonb_build_object('area','book_ai_content','message','No book-level synthesis exists yet.','priority','medium'); END IF;
   IF analysis_outdated THEN gaps:=gaps||jsonb_build_object('area','book_analysis_stale','message','Latest structured book analysis is outdated.','priority','medium'); END IF;
   IF chapter_count>0 AND chapter_ai_coverage<0.4 THEN gaps:=gaps||jsonb_build_object('area','chapter_ai_content','message','Chapter-level AI content coverage is low.','priority','medium'); END IF;
   IF source_count=0 THEN gaps:=gaps||jsonb_build_object('area','external_sources','message','No external sources linked yet.','priority','low'); END IF;
   IF video_count=0 THEN gaps:=gaps||jsonb_build_object('area','videos','message','No YouTube videos linked.','priority','low'); END IF;
   IF podcast_count=0 THEN gaps:=gaps||jsonb_build_object('area','podcasts','message','No podcast/interview sources linked.','priority','low'); END IF;
   book_id:=book_row.id;
   completeness:=jsonb_build_object('score',score_value,'tier',tier_value,'breakdown',points||jsonb_build_object('counts',counts),'gaps',gaps,'computedAt',floor(extract(epoch FROM statement_timestamp())*1000));
   RETURN NEXT;
 END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_book_completeness(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_book_completeness(uuid,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
RESET statement_timeout;
RESET lock_timeout;
