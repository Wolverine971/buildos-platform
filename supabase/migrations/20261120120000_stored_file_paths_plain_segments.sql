-- supabase/migrations/20261120120000_stored_file_paths_plain_segments.sql
--
-- A stored file path may only be made of plain segments.
--
-- voice_notes.storage_path, onto_assets.storage_path and
-- ontology_daily_briefs.audio_storage_path name Storage objects, and signed-in users can write
-- those rows. Server code later reads the object with the service role. supabase-js joins the
-- bucket and the path into a URL as text and fetch resolves dot segments, including the encoded
-- spellings `%2e%2e` and `.%2e`. The earlier guards only refused a literal `..`, so a path such
-- as `<user>/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/users?select=*` passed them and made
-- the service-role request leave the bucket and reach the database API.
--
-- Every path the app writes is `<segment>/<segment>/…` where a segment is letters, digits,
-- `_`, `-`, and `.` after its first character: `<user>/<id>.webm`,
-- `projects/<id>/assets/<id>/original.png`, `<user>/<id>.mp3`. These constraints require that
-- shape for every writer, which rules out `.` and `..` segments in any encoding, `%`, `?`, `#`,
-- backslashes, whitespace and control characters. A brief's audio must also sit in its owner's
-- folder. All existing production rows already conform (checked 2026-11-20: 158 voice notes,
-- 6 assets, 39 brief audio files).
--
-- The same shape is enforced in code by isPlainStorageObjectPath() in @buildos/supabase-client.

ALTER TABLE public.voice_notes
	ADD CONSTRAINT voice_notes_storage_path_plain_segments
	CHECK (
		storage_path IS NULL
		OR (
			length(storage_path) <= 1024
			AND storage_path ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
		)
	);

ALTER TABLE public.onto_assets
	ADD CONSTRAINT onto_assets_storage_path_plain_segments
	CHECK (
		storage_path IS NULL
		OR (
			length(storage_path) <= 1024
			AND storage_path ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
		)
	);

ALTER TABLE public.ontology_daily_briefs
	ADD CONSTRAINT ontology_daily_briefs_audio_path_plain_owner_folder
	CHECK (
		audio_storage_path IS NULL
		OR (
			length(audio_storage_path) <= 1024
			AND audio_storage_path ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
			AND starts_with(audio_storage_path, user_id::text || '/')
		)
	);
