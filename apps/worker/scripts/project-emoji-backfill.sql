-- apps/worker/scripts/project-emoji-backfill.sql
-- Read-only input for scripts/project-emoji-backfill.ts: one person's live projects (the ones on
-- their Projects page) with the words the emoji are picked from. Holds private content; write it outside
-- the repo.
WITH me AS (
	SELECT a.id AS actor_id
	FROM public.onto_actors a
	JOIN public.users u ON u.id = a.user_id
	WHERE u.email = 'djwayne35@gmail.com'
)
SELECT
	p.id,
	p.name,
	p.description,
	(
		SELECT d.content
		FROM public.onto_documents d
		WHERE d.project_id = p.id
			AND d.deleted_at IS NULL
			AND d.archived_at IS NULL
			AND (
				d.type_key = 'document.context.project'
				OR d.props ->> 'origin' = 'start_here_template'
				OR d.title ILIKE 'start here%'
			)
		ORDER BY d.updated_at DESC NULLS LAST
		LIMIT 1
	) AS start_here
FROM public.onto_projects p
JOIN public.onto_project_members m ON m.project_id = p.id
WHERE m.actor_id = (SELECT actor_id FROM me)
	AND m.removed_at IS NULL
	AND p.deleted_at IS NULL
	AND p.archived_at IS NULL
ORDER BY p.name;
