-- supabase/migrations/20260428000003_add_public_page_review_admin_overrides.sql
-- Admin review decisions for flagged public page content checks.

ALTER TABLE public.onto_public_page_review_attempts
	ADD COLUMN IF NOT EXISTS admin_decision TEXT
		CHECK (admin_decision IN ('approved', 'rejected')),
	ADD COLUMN IF NOT EXISTS admin_decision_reason TEXT,
	ADD COLUMN IF NOT EXISTS admin_decision_by UUID REFERENCES public.onto_actors(id),
	ADD COLUMN IF NOT EXISTS admin_decision_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_onto_public_page_reviews_admin_decision_created
	ON public.onto_public_page_review_attempts (status, admin_decision, created_at DESC);

DROP POLICY IF EXISTS public_page_reviews_update_admin ON public.onto_public_page_review_attempts;
CREATE POLICY public_page_reviews_update_admin
	ON public.onto_public_page_review_attempts
	FOR UPDATE
	USING (is_admin())
	WITH CHECK (is_admin());
