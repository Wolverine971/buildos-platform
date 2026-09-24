# scripts/supabase-health/test_preflight.py
"""Offline failure-mode tests for the read-only release check."""
import copy
import unittest

import preflight


def valid_sections():
    functions = []
    for name, (args, names) in {**preflight.MAINTENANCE, **preflight.ADMIN}.items():
        config = ['search_path=pg_catalog, public' if name in preflight.MAINTENANCE else 'search_path=""']
        if name == 'recover_dead_agentic_chat_turns':
            config.append('lock_timeout=2s')
        functions.append({'name': name, 'identity': f'{name}({args})', 'argument_names': names,
                          'definer': False, 'config': config, 'anon_execute': False,
                          'authenticated_execute': False, 'public_execute': False, 'service_execute': True})
    return {'functions': functions,
            'migrations': ['20260924000000', '20260924000100', '20260924150000', '20260924202321'],
            'cron': {'latest_status': 'success', 'seconds_since_success': 30, 'errors_last_15m': 0}}


class PreflightChecks(unittest.TestCase):
    def passes(self, sections, **kwargs):
        return all(c['passed'] for c in preflight.evaluate(sections, **kwargs))

    def test_valid_contract_passes(self):
        self.assertTrue(self.passes(valid_sections(), require_cron=True))

    def test_missing_and_ambiguous_signatures_fail(self):
        for mutation in ('missing', 'overload', 'type', 'argument'):
            with self.subTest(mutation=mutation):
                sections = valid_sections()
                if mutation == 'missing':
                    sections['functions'].pop(0)
                elif mutation == 'overload':
                    sections['functions'].append(copy.deepcopy(sections['functions'][0]))
                elif mutation == 'type':
                    sections['functions'][0]['identity'] = 'recover_dead_agentic_chat_turns(integer)'
                else:
                    sections['functions'][0]['argument_names'] = ['p_limit', 'p_workflow_handoff']
                self.assertFalse(self.passes(sections))

    def test_every_client_grant_and_missing_service_grant_fail(self):
        for grant in ('anon_execute', 'authenticated_execute', 'public_execute', 'service_execute'):
            with self.subTest(grant=grant):
                sections = valid_sections()
                sections['functions'][0][grant] = grant != 'service_execute'
                self.assertFalse(self.passes(sections))

    def test_missing_migration_definer_or_mutable_path_fail(self):
        for mutation in ('ledger', 'definer', 'path', 'lock_timeout'):
            with self.subTest(mutation=mutation):
                sections = valid_sections()
                if mutation == 'ledger':
                    sections['migrations'].pop(0)
                elif mutation == 'definer':
                    sections['functions'][0]['definer'] = True
                elif mutation == 'path':
                    sections['functions'][0]['config'] = ['lock_timeout=2s']
                else:
                    sections['functions'][0]['config'] = ['search_path=pg_catalog, public']
                self.assertFalse(self.passes(sections))

    def test_missing_stale_and_failed_cron_are_not_success(self):
        for cron in ({}, {'seconds_since_success': 301, 'latest_status': 'success', 'errors_last_15m': 0},
                     {'seconds_since_success': 30, 'latest_status': 'error', 'errors_last_15m': 1}):
            with self.subTest(cron=cron):
                sections = valid_sections()
                sections['cron'] = cron
                self.assertFalse(self.passes(sections, require_cron=True))
                self.assertTrue(self.passes(sections, require_cron=False))

    def test_removed_phase_rpc_and_pending_migration_cannot_pass_security(self):
        sections = valid_sections()
        sections['functions'].append({'name': 'batch_update_phase_dates'})
        sections['migrations'].remove('20260924202321')
        self.assertFalse(self.passes(sections))
        self.assertTrue(self.passes(sections, scope='maintenance'))


if __name__ == '__main__':
    unittest.main()
