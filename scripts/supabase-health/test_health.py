# scripts/supabase-health/test_health.py
"""Offline guard tests: no network, credentials, database, or paid models."""
import datetime as dt
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import health


class HealthGuards(unittest.TestCase):
    def test_every_database_request_explicitly_read_only(self):
        with patch.object(health, 'management', return_value=[]) as send:
            health.query('a'*20, "SELECT current_setting('transaction_read_only')")
        path, body = send.call_args.args
        self.assertEqual(path, '/v1/projects/'+'a'*20+'/database/query')
        self.assertIs(body['read_only'], True)
        self.assertTrue(body['query'].startswith('BEGIN READ ONLY;'))
        self.assertTrue(body['query'].endswith(';\nCOMMIT;'))

    def test_cross_project_metrics_key_never_sent(self):
        with patch.object(health, 'env_values', return_value={'SUPABASE_URL':'https://'+'b'*20+'.supabase.co','PRIVATE_SUPABASE_SERVICE_KEY':'secret'}), patch.object(health, 'request') as send:
            with self.assertRaises(ValueError):
                health.metrics('a'*20, 'unused')
        send.assert_not_called()

    def test_sql_and_secret_redaction(self):
        original = "SELECT 'private email', $$private prompt$$; -- private comment\n"
        result = health.sql_shape(original)
        self.assertNotIn('private', result)
        self.assertEqual(health.redact({'jwt_secret':'canary','nested':['sbp_123456']}), {'jwt_secret':'[REDACTED]','nested':['[REDACTED]']})

    def snapshot(self, time, counter, boot=1, scrape=None):
        rows=[{'name':'node_vmstat_pswpin','labels':{},'value':counter}, {'name':'node_boot_time_seconds','labels':{},'value':boot}]
        if scrape is not None:
            rows.append({'name':'node_time_seconds','labels':{},'value':scrape})
        return {'collected_at':time,'metrics':rows}

    def test_rate_and_reset_are_not_confused(self):
        a=self.snapshot('2026-09-24T00:00:00+00:00',100)
        b=self.snapshot('2026-09-24T00:05:00+00:00',700)
        self.assertEqual(health.paging_rate(a,b)['rates'][0]['per_second'],2)
        b['metrics'][0]['value']=50
        self.assertIsNone(health.paging_rate(a,b)['rates'][0]['per_second'])
        b['metrics'][0]['value']=700
        b['metrics'][1]['value']=2
        self.assertTrue(health.paging_rate(a,b)['restarted'])
        self.assertIsNone(health.paging_rate(a,b)['rates'][0]['per_second'])

    def test_cached_snapshot_is_not_a_valid_zero_rate(self):
        a=self.snapshot('2026-09-24T00:00:00+00:00',100,scrape=50)
        b=self.snapshot('2026-09-24T00:05:00+00:00',100,scrape=50)
        self.assertIsNone(health.paging_rate(a,b)['rates'][0]['per_second'])

    def test_compressed_output_redacts_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'baseline.json.gz'
            health.save(path, {'password':'canary'})
            with gzip.open(path,'rt') as f:
                self.assertEqual(json.load(f),{'password':'[REDACTED]'})


if __name__ == '__main__':
    unittest.main()
