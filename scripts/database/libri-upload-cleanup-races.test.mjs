import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyUploadCleanupRaces } from './libri-upload-cleanup-races.mjs';
import { verifyUploadQuotaRaces } from './libri-upload-quota-races.mjs';
// Every case must reject before spawning psql or making any connection.
for (const args of [
	['-d', 'postgres://postgres:fixture@db.example.org/buildos_sql_contract_1_2'],
	['-d', 'postgres://postgres:fixture@localhost/postgres'],
	['-d', 'postgres://postgres:fixture@localhost/buildos_sql_contract_1_2?host=db.example.org'],
	['-h', '/tmp/other/socket', '-U', 'postgres', '-d', 'postgres'],
	['-h', '/tmp/buildos-sql-contract-fixture/socket', '-U', 'postgres', '-d', 'production'],
	[]
])
	test('cleanup runner rejects non-disposable connection ' + JSON.stringify(args), async () => {
		await assert.rejects(verifyUploadCleanupRaces(args));
		await assert.rejects(verifyUploadQuotaRaces(args));
	});
