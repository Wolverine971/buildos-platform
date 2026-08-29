import assert from 'node:assert/strict';
import test from 'node:test';
import { referencesLibri, validateLibriMigration } from './check-libri-migration-scope.mjs';

const filename = '20260829010000_libri_foundation.sql';
const safeTimeouts = `set lock_timeout = '5s';
set statement_timeout = '60s';`;

test('accepts an additive, schema-qualified Libri migration', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
-- libri-allow-public: queue_type:alter
-- libri-allow-storage: buckets:insert, objects:policy
${safeTimeouts}
create schema if not exists libri;
create table libri.books (id uuid primary key);
create index if not exists libri_books_id_idx on libri.books(id);
alter table libri.books enable row level security;
alter type public.queue_type add value if not exists 'libri_research';
insert into storage.buckets (id, name, public) values ('libri-assets', 'libri-assets', false);
create policy libri_assets_read on storage.objects for select using (bucket_id = 'libri-assets');`
	);
	assert.deepEqual(failures, []);
});

test('rejects changes to a BuildOS public table', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
alter table public.users add column libri_debug boolean;`
	);
	assert.match(failures.join('\n'), /public\.users/);
});

test('rejects unqualified mutation targets', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
create table books (id uuid primary key);`
	);
	assert.match(failures.join('\n'), /schema-qualified/);
});

test('accepts UPDATE clauses inside Libri policies and foreign keys', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
create table libri.books (
  id uuid primary key,
  owner_id uuid references auth.users(id) on update cascade
);
create policy books_update on libri.books for update to authenticated
using (owner_id = auth.uid());`
	);
	assert.deepEqual(failures, []);
});

test('rejects a Libri migration without bounded DDL timeouts', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
create table libri.books (id uuid primary key);`
	);
	assert.match(failures.join('\n'), /lock_timeout/);
	assert.match(failures.join('\n'), /statement_timeout/);
});

test('rejects SECURITY DEFINER functions', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
create function libri.unsafe() returns void language sql security definer as 'select';`
	);
	assert.match(failures.join('\n'), /SECURITY DEFINER/);
});

test('still rejects standalone unqualified DML', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
update books set title = 'unsafe';`
	);
	assert.match(failures.join('\n'), /schema-qualified/);
});

test('rejects destructive DDL without an explicit review header', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
drop table libri.books;`
	);
	assert.match(failures.join('\n'), /destructive DDL is forbidden/);
});

test('rejects non-Libri additions to the shared queue enum', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
-- libri-allow-public: queue_type:alter
alter type public.queue_type add value if not exists 'unscoped_research';`
	);
	assert.match(failures.join('\n'), /starts with 'libri_'/);
});

test('rejects storage mutations that were not declared in the header', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
insert into storage.buckets (id, name, public) values ('libri-assets', 'libri-assets', false);`
	);
	assert.match(failures.join('\n'), /storage\.buckets/);
});

test('rejects object-only allowlists because permissions must be operation-specific', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
-- libri-allow-public: queue_type
${safeTimeouts}
alter type public.queue_type add value if not exists 'libri_research';`
	);
	assert.match(failures.join('\n'), /object:operation/);
});

test('does not let a public allowlist authorize a different operation', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
-- libri-allow-public: users:grant
${safeTimeouts}
delete from public.users;`
	);
	assert.match(failures.join('\n'), /cannot delete public\.users/);
});

test('rejects GRANT and REVOKE outside Libri without operation-specific review', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
grant update on public.users to authenticated;`
	);
	assert.match(failures.join('\n'), /cannot grant public\.users/);
});

test('rejects quoted identifiers that bypass lowercase target parsing', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
alter table "public"."users" add column libri_debug boolean;`
	);
	assert.match(failures.join('\n'), /quoted identifiers/);
});

test('allows double quotes inside SQL string literals', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
create table libri.payloads (
  id uuid primary key,
  body jsonb not null default '{"safe":true}'::jsonb
);`
	);
	assert.deepEqual(failures, []);
});

test('rejects mutations hidden in a CTE', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
with changed as (
  update public.users set deleted_at = now() returning id
)
select count(*) from changed;`
	);
	assert.match(failures.join('\n'), /cannot update public\.users/);
});

test('rejects mutations inside a dollar-quoted function body', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
create function libri.unsafe() returns void
language plpgsql
as $$
begin
  delete from public.users;
end;
$$;`
	);
	assert.match(failures.join('\n'), /cannot delete public\.users/);
	assert.match(failures.join('\n'), /cross-schema references inside routine bodies/);
});

test('rejects dynamic SQL and unverifiable DO blocks', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
do $$
begin
  execute 'delete from public.users';
end;
$$;`
	);
	assert.match(failures.join('\n'), /dynamic SQL/);
	assert.match(failures.join('\n'), /unsupported or unverifiable SQL statement/);
});

test('rejects global DDL', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
alter role authenticated set statement_timeout = '0';`
	);
	assert.match(failures.join('\n'), /global\/database DDL/);
});

test('rejects policy changes outside Libri without a policy allowlist', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
-- libri-allow-destructive: reviewed
${safeTimeouts}
drop policy users_read on public.users;`
	);
	assert.match(failures.join('\n'), /cannot policy public\.users/);
});

test('detects unmarked migrations that reference Libri', () => {
	assert.equal(referencesLibri('alter table libri.books add column notes text;'), true);
	assert.equal(referencesLibri("select 'libri.books is only text';"), false);
});

test('rejects SELECT and COMMENT statements whose effects are not safely classified', () => {
	const selectFailures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
select public.rebuild_users();`
	);
	const commentFailures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
comment on table public.users is 'unsafe';`
	);
	assert.match(selectFailures.join('\n'), /unsupported or unverifiable SQL statement/);
	assert.match(commentFailures.join('\n'), /unsupported or unverifiable SQL statement/);
});

test('rejects read-only WITH statements that can hide function calls', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
with result as (select public.rebuild_users())
select * from result;`
	);
	assert.match(failures.join('\n'), /WITH statements must contain/);
});

test('rejects cross-schema calls hidden in policy predicates', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
create policy books_read on libri.books
for select to authenticated
using (public.can_read_everything());`
	);
	assert.match(failures.join('\n'), /unclassified cross-schema reference/);
});

test('rejects Libri dependencies on BuildOS domain tables', () => {
	const failures = validateLibriMigration(
		filename,
		`-- libri-migration: true
${safeTimeouts}
create table libri.unsafe_reference (
  id uuid primary key,
  buildos_user_id uuid references public.users(id)
);`
	);
	assert.match(failures.join('\n'), /unclassified cross-schema reference/);
});
