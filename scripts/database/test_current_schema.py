# scripts/database/test_current_schema.py
"""Free tests for discovery, migration composition, and connection safety."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import current_schema as contracts
import pin_current_schema as pinning


class MigrationPlan(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.directory = self.root / 'supabase/migrations'
        self.directory.mkdir(parents=True)
        self.old = self.directory / '20261001000000_old.sql'
        self.old.write_text('SELECT 1;')
        self.manifest = {'cutoff_version': '20261002000000', 'late_migrations': [],
                         'absorbed_migrations': {self.old.name: hashlib.sha256(self.old.read_bytes()).hexdigest()}}

    def test_new_migrations_are_automatically_applied(self):
        new = self.directory / '20261003000000_new.sql'
        new.write_text('SELECT 2;')
        self.assertEqual(contracts.migration_plan(self.root, self.manifest), [new])

    def test_historical_unrecorded_files_are_not_blindly_replayed(self):
        late = self.directory / '20261001010000_late.sql'
        late.write_text('SELECT 2;')
        with self.assertRaisesRegex(contracts.RehearsalError, 'Unclassified historical'):
            contracts.migration_plan(self.root, self.manifest)
        self.manifest['late_migrations'] = [late.name]
        self.assertEqual(contracts.migration_plan(self.root, self.manifest), [late])

    def test_editing_or_deleting_absorbed_history_fails_closed(self):
        self.old.write_text('SELECT 3;')
        with self.assertRaisesRegex(contracts.RehearsalError, 'Baseline migration changed'):
            contracts.migration_plan(self.root, self.manifest)
        self.old.unlink()
        with self.assertRaisesRegex(contracts.RehearsalError, 'Baseline migration changed'):
            contracts.migration_plan(self.root, self.manifest)

    def test_missing_overlay_fails(self):
        self.manifest['late_migrations'] = ['missing.sql']
        with self.assertRaisesRegex(contracts.RehearsalError, 'Missing late'):
            contracts.migration_plan(self.root, self.manifest)


class DiscoveryAndSafety(unittest.TestCase):
    def test_rejects_hosted_connections_and_connection_overrides(self):
        for url in ('postgres://postgres@db.example.com/postgres',
                    'postgres://postgres@localhost/production',
                    'postgres://postgres@localhost/postgres?host=remote',
                    'http://localhost/postgres'):
            with self.subTest(url=url), self.assertRaises(contracts.RehearsalError):
                contracts.local_url(url)
        self.assertEqual(contracts.local_url('postgres://postgres@127.0.0.1:5432/postgres'),
                         'postgres://postgres@127.0.0.1:5432/postgres')

    def test_inventory_assigns_every_check_to_current_schema_runner(self):
        result = subprocess.run(['node', '--input-type=module', '-e',
            "import {inventorySqlContracts} from './scripts/database/sql-contracts.mjs'; "
            "console.log(JSON.stringify(inventorySqlContracts(process.cwd()).inventory));"],
            cwd=contracts.ROOT, capture_output=True, text=True, check=True)
        actual = {row['filename'] for row in json.loads(result.stdout)
                  if row['mode'] == 'current-schema-disposable'}
        expected = {p.name for p in (contracts.ROOT / 'supabase/tests').glob('*.check.sql')}
        self.assertTrue(expected)
        self.assertEqual(actual, expected)

    def test_pin_rejects_application_row_data(self):
        with tempfile.TemporaryDirectory() as folder:
            schema = Path(folder) / 'schema.sql'
            schema.write_text('COPY "public"."users" (id, email) FROM stdin;\n')
            with self.assertRaisesRegex(ValueError, 'Unexpected COPY payloads'):
                pinning.pin(schema, Path(folder) / 'meta.json', '20261002000000', [])

    def test_pin_omits_hosted_metadata_and_is_reproducible(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'supabase/migrations').mkdir(parents=True)
            schema = root / 'schema.sql'
            schema.write_text('COPY "private"."project_fold_table_policy" (table_name) FROM stdin;\n\\.\n')
            metadata = root / 'meta.json'
            metadata.write_text(json.dumps({'captured_at': '2026-10-25', 'server_version': '15.8',
                'roles': ['postgres'], 'project_ref': 'must-not-copy', 'tables': {'private_count': 999}}))
            fixture = root / 'fixture'
            with patch.object(pinning, 'FIXTURE', fixture), patch.object(pinning, 'ROOT', root):
                pinning.pin(schema, metadata, '20261002000000', [])
                first = (fixture / 'schema.sql.gz').read_bytes()
                pinning.pin(schema, metadata, '20261002000000', [])
                self.assertEqual(first, (fixture / 'schema.sql.gz').read_bytes())
                manifest = json.loads((fixture / 'manifest.json').read_text())
                self.assertNotIn('project_ref', manifest)
                self.assertNotIn('tables', manifest)


if __name__ == '__main__':
    unittest.main()
