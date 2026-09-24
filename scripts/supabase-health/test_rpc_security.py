# scripts/supabase-health/test_rpc_security.py
"""Execute the focused RPC migration against disposable, socket-only PostgreSQL.

No hosted credentials, external API calls, or existing database are used.
Run: python3 -m unittest discover -s scripts/supabase-health -p test_rpc_security.py -v
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase/migrations/20260924202321_contain_legacy_admin_rpcs.sql'
FIXTURE = ROOT / 'supabase/tests/fixtures/legacy_admin_rpcs_base.sql'


@unittest.skipUnless(all(shutil.which(c) for c in ('initdb', 'pg_ctl', 'psql')), 'Local PostgreSQL required')
class LegacyRpcSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='buildos-rpc-security-', dir='/tmp')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.data = Path(cls.temp.name) / 'data'
        cls.socket = Path(cls.temp.name) / 'socket'
        cls.socket.mkdir()
        cls.run_command(['initdb', '-D', str(cls.data), '--no-locale', '--encoding=UTF8',
                         '--auth=trust', '--username=postgres'])
        cls.addClassCleanup(lambda: subprocess.run(
            ['pg_ctl', '-D', str(cls.data), 'stop', '-m', 'fast'], capture_output=True))
        cls.run_command(['pg_ctl', '-D', str(cls.data), '-l', str(Path(cls.temp.name) / 'postgres.log'),
                         '-o', f"-p 5432 -k {cls.socket} -c listen_addresses=''", '-w', 'start'])
        cls.sql(FIXTURE.read_text())
        cls.sql(MIGRATION.read_text())

    @staticmethod
    def run_command(args, **kwargs):
        result = subprocess.run(args, text=True, capture_output=True, **kwargs)
        if result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout

    @classmethod
    def sql(cls, source):
        return cls.run_command(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(cls.socket),
                               '-p', '5432', '-U', 'postgres', '-d', 'postgres'], input=source).strip()

    def test_01_phase_rpc_removed_without_removing_data(self):
        self.assertEqual(self.sql("SELECT to_regprocedure('public.batch_update_phase_dates(uuid,jsonb)') IS NULL;"), 't')
        self.assertEqual(self.sql('SELECT count(*) FROM public.phases;'), '1')

    def test_02_untrusted_roles_cannot_execute_admin_functions(self):
        for role in ('anon', 'authenticated', 'unrelated_client'):
            for call in ("public.get_subscription_overview()",
                         "public.acquire_migration_platform_lock(NULL::uuid,NULL::uuid,60)"):
                with self.subTest(role=role, call=call):
                    self.sql(f"""SET ROLE {role};
                        DO $$ BEGIN
                          PERFORM * FROM {call};
                          RAISE EXCEPTION 'unexpected permission';
                        EXCEPTION WHEN insufficient_privilege THEN NULL;
                        END $$;""")

    def test_03_service_can_read_correct_subscription_totals(self):
        self.assertEqual(self.sql("""SET ROLE service_role;
            SELECT total_subscribers=1 AND active_subscriptions=1 AND mrr=10 AND arr=120
            FROM public.get_subscription_overview();"""), 't')

    def test_04_service_lock_is_exclusive_and_returns_holder(self):
        self.assertEqual(self.sql("""BEGIN; SET LOCAL ROLE service_role;
            SELECT acquired FROM public.acquire_migration_platform_lock(
                '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006',60);
            SELECT NOT acquired AND existing_run_id='00000000-0000-0000-0000-000000000005'::uuid
                FROM public.acquire_migration_platform_lock(NULL::uuid,NULL::uuid,60);
            ROLLBACK;"""), 't\nt')

    def test_05_service_temp_tables_cannot_shadow_real_tables(self):
        self.assertEqual(self.sql("""SET ROLE service_role;
            CREATE TEMP TABLE customer_subscriptions (LIKE public.customer_subscriptions);
            CREATE TEMP TABLE subscription_plans (LIKE public.subscription_plans);
            CREATE TEMP TABLE migration_platform_lock (LIKE public.migration_platform_lock);
            SELECT total_subscribers=1 AND mrr=10 FROM public.get_subscription_overview();
            BEGIN;
            SELECT acquired FROM public.acquire_migration_platform_lock(NULL::uuid,NULL::uuid,60);
            ROLLBACK;"""), 't\nt')

    def test_06_functions_are_invokers_with_pinned_empty_search_path(self):
        self.assertEqual(self.sql("""SELECT count(*)=2 AND bool_and(NOT prosecdef
            AND proconfig @> ARRAY['search_path=""']) FROM pg_proc
            WHERE oid IN ('public.get_subscription_overview()'::regprocedure,
                'public.acquire_migration_platform_lock(uuid,uuid,integer)'::regprocedure);"""), 't')

    def test_07_migration_replay_stays_closed(self):
        self.sql(MIGRATION.read_text())
        self.test_02_untrusted_roles_cannot_execute_admin_functions()
        self.test_03_service_can_read_correct_subscription_totals()

    def test_08_unexpected_phase_dependency_aborts_without_cascade(self):
        # A dependent view simulates a caller missed by the audit. DROP RESTRICT
        # must fail and roll the complete migration back, retaining both objects.
        self.sql("""CREATE FUNCTION public.batch_update_phase_dates(uuid,jsonb)
            RETURNS integer LANGUAGE sql AS 'SELECT 1';
            CREATE VIEW public.phase_dependency AS
            SELECT public.batch_update_phase_dates(NULL::uuid, '{}'::jsonb);""")
        try:
            with self.assertRaisesRegex(AssertionError, 'other objects depend'):
                self.sql(MIGRATION.read_text())
            self.assertEqual(self.sql('SELECT * FROM public.phase_dependency;'), '1')
        finally:
            self.sql('DROP VIEW public.phase_dependency; DROP FUNCTION public.batch_update_phase_dates(uuid,jsonb);')

    def test_09_compatibility_rollback_preserves_client_containment(self):
        rollback = ROOT / 'supabase/manual/rollback_20260924202321_contain_legacy_admin_rpcs.sql'
        self.sql(rollback.read_text())
        try:
            self.test_02_untrusted_roles_cannot_execute_admin_functions()
            self.test_03_service_can_read_correct_subscription_totals()
            self.test_04_service_lock_is_exclusive_and_returns_holder()
            self.assertEqual(self.sql("""SELECT
                has_function_privilege('service_role','public.batch_update_phase_dates(uuid,jsonb)','EXECUTE')
                AND NOT has_function_privilege('anon','public.batch_update_phase_dates(uuid,jsonb)','EXECUTE')
                AND NOT has_function_privilege('authenticated','public.batch_update_phase_dates(uuid,jsonb)','EXECUTE')
                AND NOT has_function_privilege('unrelated_client','public.batch_update_phase_dates(uuid,jsonb)','EXECUTE');"""), 't')
        finally:
            self.sql(MIGRATION.read_text())


if __name__ == '__main__':
    unittest.main()
