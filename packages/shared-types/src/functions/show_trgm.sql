-- packages/shared-types/src/functions/show_trgm.sql
-- show_trgm(text)
-- Show trigrams for a text string
-- Source: PostgreSQL pg_trgm extension function

-- This is a built-in function from the pg_trgm extension
-- Returns an array of all trigrams in the given text

CREATE OR REPLACE FUNCTION show_trgm(text)
RETURNS text[]
LANGUAGE c
IMMUTABLE STRICT PARALLEL SAFE
AS 'MODULE_PATHNAME', 'show_trgm';

-- Note: The actual show_trgm() function is provided by the pg_trgm extension.
-- This is the function signature reference.
-- Example usage: SELECT show_trgm('hello') -> {"  h"," he","ell","hel","llo","lo "}
--
-- The function breaks down the input text into 3-character sequences (trigrams)
-- which are used for fuzzy text matching and similarity calculations.
--
-- To use this function, ensure the pg_trgm extension is enabled:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
