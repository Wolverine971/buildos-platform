-- packages/shared-types/src/functions/unaccent.sql
-- unaccent(text)
-- Remove accents from text
-- Source: PostgreSQL unaccent extension function

-- This is a built-in function from the unaccent extension
-- Removes diacritical marks (accents) from characters

CREATE OR REPLACE FUNCTION unaccent(text)
RETURNS text
LANGUAGE c
IMMUTABLE STRICT PARALLEL SAFE
AS 'MODULE_PATHNAME', 'unaccent_lexize';

-- Note: The actual unaccent() function is provided by the unaccent extension.
-- This is the function signature reference.
--
-- Example usage:
-- SELECT unaccent('Hôtel') -> 'Hotel'
-- SELECT unaccent('café') -> 'cafe'
-- SELECT unaccent('naïve') -> 'naive'
--
-- This is commonly used for accent-insensitive searching:
-- WHERE unaccent(title) ILIKE unaccent('%search_term%')
--
-- To use this function, ensure the unaccent extension is enabled:
-- CREATE EXTENSION IF NOT EXISTS unaccent;
