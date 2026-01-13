-- packages/shared-types/src/functions/show_limit.sql
-- show_limit()
-- Show the current pg_trgm similarity limit
-- Source: PostgreSQL pg_trgm extension function

-- This is a built-in function from the pg_trgm extension
-- Returns the current similarity threshold used by the % operator

CREATE OR REPLACE FUNCTION show_limit()
RETURNS real
LANGUAGE sql
AS $$
  SELECT current_setting('pg_trgm.similarity_threshold')::real;
$$;

-- Note: The actual show_limit() function is provided by the pg_trgm extension.
-- This is a wrapper that provides similar functionality.
-- The original function signature is: show_limit() -> real
-- It returns the current similarity threshold (default 0.3)
