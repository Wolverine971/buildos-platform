# scripts/migration-rehearsal/test_rehearse.py
"""Offline tests for the migration rehearsal. No hosted credentials or network calls.

Run: python3 -m unittest discover -s scripts/migration-rehearsal -v
"""
from pathlib import Path
import io
import json
import shutil
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rehearse  # noqa: E402


class PrepareDump(unittest.TestCase):
    def test_comments_out_platform_statements_only(self):
        dump = '\n'.join([
            'CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";',
            'CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";',
            'GRANT ALL ON FUNCTION "extensions"."algorithm_sign"("signables" "text") TO "anon";',
            'GRANT ALL ON FUNCTION "public"."do_thing"() TO "anon";',
            'CREATE EVENT TRIGGER "issue_graphql_placeholder" ON "sql_drop"',
            "         WHEN TAG IN ('DROP EXTENSION')",
            '   EXECUTE FUNCTION "extensions"."set_graphql_placeholder"();',
            'CREATE TRIGGER "t" BEFORE UPDATE ON "public"."x" FOR EACH ROW EXECUTE FUNCTION "public"."f"();',
        ])
        lines = rehearse.prepare_dump(dump).splitlines()
        live = [line for line in lines if not line.startswith('--')]
        self.assertEqual(live, [
            'CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";',
            'GRANT ALL ON FUNCTION "public"."do_thing"() TO "anon";',
            'CREATE TRIGGER "t" BEFORE UPDATE ON "public"."x" FOR EACH ROW EXECUTE FUNCTION "public"."f"();',
        ])


class Diff(unittest.TestCase):
    def test_added_removed_changed(self):
        before = [{'kind': 'function', 'id': 'public.a()', 'info': {'security_definer': True, 'grants': None}},
                  {'kind': 'table', 'id': 'public.gone', 'info': {}}]
        after = [{'kind': 'function', 'id': 'public.a()', 'info': {'security_definer': False, 'grants': None}},
                 {'kind': 'column', 'id': 'public.users.x', 'info': {'type': 'text'}}]
        changes = {(c['op'], c['id']): c for c in rehearse.diff_fingerprints(before, after)}
        self.assertEqual(set(changes), {('~', 'public.a()'), ('-', 'public.gone'), ('+', 'public.users.x')})
        self.assertEqual(changes[('~', 'public.a()')]['fields'],
                         {'security_definer': {'from': True, 'to': False}})

    def test_client_executable(self):
        self.assertEqual(rehearse.client_executable(None), ['PUBLIC (default ACL)'])
        self.assertEqual(rehearse.client_executable(['=X/postgres', 'anon=X/postgres', 'service_role=X/postgres']),
                         ['PUBLIC', 'anon'])
        self.assertEqual(rehearse.client_executable(['service_role=X/postgres', 'postgres=X/postgres']), [])


class Findings(unittest.TestCase):
    sizes = {'public.users': {'rows': 125, 'bytes': 1}, 'public.tasks': {'rows': 650, 'bytes': 1}}

    def findings(self, *changes):
        return rehearse.risk_findings(list(changes), self.sizes)

    def test_exposed_definer_function(self):
        [finding] = self.findings({'op': '+', 'kind': 'function', 'id': 'public.f()',
                                   'detail': {'security_definer': True, 'grants': ['anon=X/postgres'],
                                              'config': ['search_path=""']}})
        self.assertTrue(finding.startswith('SECURITY') and 'anon' in finding)

    def test_unchanged_exposure_is_not_reported(self):
        body_only = {'op': '~', 'kind': 'function', 'id': 'public.f()',
                     'fields': {'body_md5': {'from': 'a', 'to': 'b'}},
                     'after': {'security_definer': True, 'grants': None, 'config': None}}
        self.assertEqual(self.findings(body_only), [])

    def test_regrant_to_anon_on_existing_definer_is_reported(self):
        regrant = {'op': '~', 'kind': 'function', 'id': 'public.f()',
                   'fields': {'grants': {'from': ['service_role=X/postgres'], 'to': ['anon=X/postgres']}},
                   'after': {'security_definer': True, 'grants': ['anon=X/postgres']}}
        self.assertEqual(len(self.findings(regrant)), 1)

    def test_new_server_only_function_gets_a_grant_note(self):
        [note] = self.findings({'op': '+', 'kind': 'function', 'id': 'public.g()',
                                'detail': {'security_definer': False, 'grants': ['service_role=X/postgres'],
                                           'returns': 'integer'}})
        self.assertTrue(note.startswith('NOTE') and 'GRANT EXECUTE' in note)
        self.assertEqual(self.findings({'op': '+', 'kind': 'function', 'id': 'public.t()',
                                        'detail': {'grants': ['service_role=X/postgres'], 'returns': 'trigger'}}), [])

    def test_narrowing_exposure_is_not_reported(self):
        narrowed = {'op': '~', 'kind': 'function', 'id': 'public.f()',
                    'fields': {'grants': {'from': None, 'to': ['authenticated=X/postgres']}},
                    'after': {'security_definer': True, 'grants': ['authenticated=X/postgres']}}
        self.assertEqual(self.findings(narrowed), [])

    def test_not_null_column_on_populated_table(self):
        [finding] = self.findings({'op': '+', 'kind': 'column', 'id': 'public.users.x',
                                   'detail': {'type': 'text', 'not_null': True, 'default': None}})
        self.assertIn('~125 rows', finding)

    def test_not_null_with_default_or_empty_table_is_fine(self):
        self.assertEqual(self.findings(
            {'op': '+', 'kind': 'column', 'id': 'public.users.x',
             'detail': {'type': 'text', 'not_null': True, 'default': "''::text"}},
            {'op': '+', 'kind': 'column', 'id': 'public.new_table.x',
             'detail': {'type': 'text', 'not_null': True, 'default': None}}), [])

    def test_unique_index_and_rls_disable(self):
        found = self.findings(
            {'op': '+', 'kind': 'index', 'id': 'public.i',
             'detail': {'def': 'CREATE UNIQUE INDEX i ON public.tasks USING btree (id)'}},
            {'op': '~', 'kind': 'table', 'id': 'public.users',
             'fields': {'rls': {'from': True, 'to': False}}, 'after': {'rls': False}})
        self.assertTrue(any('duplicates' in f for f in found))
        self.assertTrue(any('DISABLED' in f for f in found))


class Ledger(unittest.TestCase):
    def test_already_recorded_and_pending_before(self):
        files = [Path('20260926000000_new_thing.sql')]
        warnings = rehearse.ledger_warnings(files, {'20260924000000'},
                                            ['20260924000000', '20260925000000', '20260926000000'])
        self.assertEqual(len(warnings), 1)
        self.assertIn('20260925000000', warnings[0])
        warnings = rehearse.ledger_warnings([Path('20260924000000_x.sql')], {'20260924000000'}, [])
        self.assertIn('already recorded', warnings[0])


@unittest.skipUnless(all(shutil.which(c) for c in ('initdb', 'pg_ctl', 'psql')), 'Local PostgreSQL required')
class EndToEndOffline(unittest.TestCase):
    """Runs main() against a synthetic cached snapshot; never touches the network."""

    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix='buildos-rehearsal-test-'))
        self.addCleanup(shutil.rmtree, self.temp, True)
        cache = self.temp / 'cache' / 'testref'
        cache.mkdir(parents=True)
        (cache / 'schema.sql').write_text(
            'CREATE TABLE "public"."notes" ("id" "uuid" PRIMARY KEY, "body" "text");\n'
            'GRANT ALL ON TABLE "public"."notes" TO "anon";\n')
        (cache / 'meta.json').write_text(json.dumps({
            'captured_at_epoch': time.time(), 'captured_at': 'now', 'server_version': '15.8',
            'versions': ['20260101000000'], 'roles': ['anon', 'authenticated', 'service_role'],
            'tables': {'public.notes': {'rows': 10, 'bytes': 8192}}}))
        self.original_cache = rehearse.CACHE_ROOT
        rehearse.CACHE_ROOT = self.temp / 'cache'
        self.addCleanup(setattr, rehearse, 'CACHE_ROOT', self.original_cache)

    def run_main(self, *files):
        out = io.StringIO()
        with redirect_stdout(out):
            code = rehearse.main([*map(str, files), '--project-ref', 'testref'])
        return code, out.getvalue()

    def write(self, name, sql):
        path = self.temp / name
        path.write_text(sql)
        return path

    def test_passing_migration_reports_changes_and_findings(self):
        migration = self.write('20260102000000_add_flag.sql',
                               'ALTER TABLE public.notes ADD COLUMN flag boolean NOT NULL;\n'
                               'CREATE FUNCTION public.peek() RETURNS int LANGUAGE sql SECURITY DEFINER '
                               'AS $$ SELECT 1 $$;\n')
        code, output = self.run_main(migration)
        self.assertEqual(code, 0, output)
        self.assertIn('+ column     public.notes.flag', output)
        self.assertIn('NOT NULL without a default; production has ~10 rows', output)
        self.assertIn('SECURITY: public.peek() is SECURITY DEFINER and executable by PUBLIC', output)
        self.assertIn('REHEARSAL PASSED', output)

    def test_failing_migration_stops_and_exits_nonzero(self):
        broken = self.write('20260102000000_broken.sql', 'ALTER TABLE public.missing ADD COLUMN x int;\n')
        never = self.write('20260103000000_never.sql', 'CREATE TABLE public.never (id int);\n')
        code, output = self.run_main(broken, never)
        self.assertEqual(code, 1)
        self.assertIn('relation "public.missing" does not exist', output)
        self.assertNotIn('20260103000000_never.sql', output)
        self.assertIn('REHEARSAL FAILED', output)


if __name__ == '__main__':
    unittest.main()
