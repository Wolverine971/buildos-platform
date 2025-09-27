-- scripts/supabase/increment_question_display_count.sql
-- Function to increment the display count for project questions

CREATE OR REPLACE FUNCTION increment_question_display_count(question_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE project_questions
  SET 
    shown_to_user_count = shown_to_user_count + 1,
    updated_at = NOW()
  WHERE id = ANY(question_ids);
END;
$$;