-- packages/shared-types/src/functions/increment_question_display_count.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.increment_question_display_count(question_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE project_questions
  SET 
    shown_to_user_count = shown_to_user_count + 1,
    updated_at = NOW()
  WHERE id = ANY(question_ids);
END;
$function$
