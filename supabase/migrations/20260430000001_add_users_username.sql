-- supabase/migrations/20260430000001_add_users_username.sql
-- apps/web/docs/features/public-pages/phase-1-ui-brief.md §PR 9 Username field
--
-- Adds an optional `username` column to `users` so someone can claim a stable
-- slug-prefix for their public pages (`/p/{username}/{slug_base}`). When NULL,
-- the existing derivation (name → email local-part → 'user') keeps working.

ALTER TABLE public.users
	ADD COLUMN IF NOT EXISTS username TEXT;

-- Unique only when set. Case-insensitive by storing + comparing lowercase.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_ci
	ON public.users (lower(username))
	WHERE username IS NOT NULL;

-- Shape constraint: 3–24 chars, lowercase alphanumeric + hyphens, cannot
-- start/end with a hyphen, no consecutive hyphens. Reserved names live on
-- the normalize_* helper (for slug_base) — we don't re-enforce them here
-- because collisions with route segments (admin, api, blogs, etc.) would
-- surface as a simple unique-index collision if someone tried.
ALTER TABLE public.users
	DROP CONSTRAINT IF EXISTS users_username_shape_check;

ALTER TABLE public.users
	ADD CONSTRAINT users_username_shape_check
	CHECK (
		username IS NULL OR
		(
			char_length(username) BETWEEN 3 AND 24 AND
			username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
		)
	);

-- Update the slug-prefix resolver to prefer the explicit username when set.
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
		NULLIF(trim(u.username), ''),
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
