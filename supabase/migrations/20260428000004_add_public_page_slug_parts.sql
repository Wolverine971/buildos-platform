-- supabase/migrations/20260428000004_add_public_page_slug_parts.sql
-- Add frozen slug prefix/base fields and helper functions for public page URLs.

ALTER TABLE public.onto_public_pages
	ADD COLUMN IF NOT EXISTS slug_prefix TEXT,
	ADD COLUMN IF NOT EXISTS slug_base TEXT;

ALTER TABLE public.onto_public_pages
	DROP CONSTRAINT IF EXISTS onto_public_pages_slug_prefix_format;

ALTER TABLE public.onto_public_pages
	ADD CONSTRAINT onto_public_pages_slug_prefix_format
	CHECK (
		slug_prefix IS NULL
		OR slug_prefix ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
	);

ALTER TABLE public.onto_public_pages
	DROP CONSTRAINT IF EXISTS onto_public_pages_slug_base_format;

ALTER TABLE public.onto_public_pages
	ADD CONSTRAINT onto_public_pages_slug_base_format
	CHECK (
		slug_base IS NULL
		OR slug_base ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
	);

CREATE OR REPLACE FUNCTION public.normalize_onto_public_page_slug_part(
	p_input TEXT,
	p_max_length INTEGER,
	p_fallback TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
	normalized TEXT;
	fallback_value TEXT;
BEGIN
	normalized := lower(trim(COALESCE(p_input, '')));
	normalized := regexp_replace(normalized, '[^a-z0-9\s-]+', '', 'g');
	normalized := regexp_replace(normalized, '[\s-]+', '-', 'g');
	normalized := regexp_replace(normalized, '(^-|-$)', '', 'g');

	IF p_max_length IS NOT NULL AND p_max_length > 0 THEN
		normalized := left(normalized, p_max_length);
		normalized := regexp_replace(normalized, '-+$', '', 'g');
	END IF;

	IF normalized = '' THEN
		fallback_value := NULLIF(trim(COALESCE(p_fallback, '')), '');
		IF fallback_value IS NULL THEN
			RETURN '';
		END IF;

		RETURN public.normalize_onto_public_page_slug_part(
			fallback_value,
			p_max_length,
			NULL
		);
	END IF;

	RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_onto_public_page_slug_prefix(
	p_actor_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	resolved_name TEXT;
BEGIN
	SELECT COALESCE(
		NULLIF(trim(a.name), ''),
		NULLIF(trim(u.name), ''),
		NULLIF(split_part(COALESCE(a.email, u.email, ''), '@', 1), ''),
		'user'
	)
	INTO resolved_name
	FROM public.onto_actors a
	LEFT JOIN public.users u ON u.id = a.user_id
	WHERE a.id = p_actor_id;

	RETURN public.normalize_onto_public_page_slug_part(
		COALESCE(resolved_name, 'user'),
		24,
		'user'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_onto_public_page_slug(
	p_slug_prefix TEXT,
	p_slug_base TEXT,
	p_exclude_page_id UUID DEFAULT NULL
)
RETURNS TABLE (
	slug_prefix TEXT,
	slug_base TEXT,
	slug TEXT,
	deduped BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	normalized_prefix TEXT;
	normalized_base TEXT;
	candidate_base TEXT;
	candidate_slug TEXT;
	base_core TEXT;
	suffix INTEGER := 1;
	suffix_text TEXT;
BEGIN
	normalized_prefix := NULLIF(
		public.normalize_onto_public_page_slug_part(p_slug_prefix, 24, NULL),
		''
	);
	normalized_base := public.normalize_onto_public_page_slug_part(p_slug_base, 48, 'page');

	LOOP
		IF suffix = 1 THEN
			candidate_base := normalized_base;
		ELSE
			suffix_text := '-' || suffix::TEXT;
			base_core := normalized_base;

			IF char_length(base_core) + char_length(suffix_text) > 48 THEN
				base_core := left(base_core, 48 - char_length(suffix_text));
				base_core := regexp_replace(base_core, '-+$', '', 'g');
				IF base_core = '' THEN
					base_core := 'page';
				END IF;
			END IF;

			candidate_base := base_core || suffix_text;
		END IF;

		candidate_slug := CASE
			WHEN normalized_prefix IS NULL THEN candidate_base
			ELSE normalized_prefix || '-' || candidate_base
		END;

		EXIT WHEN NOT EXISTS (
			SELECT 1
			FROM public.onto_public_pages p
			WHERE p.deleted_at IS NULL
				AND lower(p.slug) = lower(candidate_slug)
				AND (p_exclude_page_id IS NULL OR p.id <> p_exclude_page_id)
		);

		suffix := suffix + 1;

		IF suffix > 500 THEN
			RAISE EXCEPTION 'Unable to suggest available public page slug';
		END IF;
	END LOOP;

	RETURN QUERY
	SELECT
		normalized_prefix,
		candidate_base,
		candidate_slug,
		suffix > 1;
END;
$$;

WITH derived AS (
	SELECT
		p.id,
		NULLIF(public.resolve_onto_public_page_slug_prefix(p.created_by), '') AS derived_prefix
	FROM public.onto_public_pages p
)
UPDATE public.onto_public_pages p
SET
	slug_prefix = COALESCE(p.slug_prefix, derived.derived_prefix),
	slug_base = COALESCE(
		p.slug_base,
		CASE
			WHEN COALESCE(p.slug_prefix, derived.derived_prefix) IS NOT NULL
				AND lower(p.slug) LIKE lower(COALESCE(p.slug_prefix, derived.derived_prefix) || '-%')
			THEN substring(
				p.slug
				FROM char_length(COALESCE(p.slug_prefix, derived.derived_prefix)) + 2
			)
			ELSE p.slug
		END
	)
FROM derived
WHERE derived.id = p.id;
