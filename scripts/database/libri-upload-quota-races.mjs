// Disposable SQL runner only. Never connects to a hosted or caller-named database.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
export const uploadQuotaContract = '20260910170101_libri_unissued_upload_quota_settlement.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const upload = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const user = '11111111-1111-4111-8111-111111111111';
const request = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const release = `SET ROLE service_role; SELECT libri.release_unissued_image_upload_slot('${library}','${upload}');`;
const reserve = `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false);
 SELECT (libri.reserve_image_upload('${library}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','quota_concurrent_new',
 '{"filename":"page.png","imageType":"page","mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')).quota_policy_version;`;
const expire =
	"UPDATE libri.image_upload_intents SET created_at=statement_timestamp()-interval '3 hours',signing_deadline=statement_timestamp()-interval '170 minutes',expires_at=statement_timestamp()-interval '45 minutes';";
function assertDisposableConnection(connectionArgs) {
	if (connectionArgs.length === 2 && connectionArgs[0] === '-d') {
		const url = new URL(connectionArgs[1]);
		assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
		assert.ok(
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
			'Quota tests require loopback CI PostgreSQL'
		);
		assert.match(
			url.pathname,
			/^\/buildos_sql_contract_\d+_\d+$/,
			'Quota tests require a runner-created disposable database'
		);
		assert.equal(url.search, '');
		assert.equal(url.hash, '');
		return;
	}
	assert.equal(connectionArgs.length, 6);
	const [hostOption, socket, userOption, user, databaseOption, database] = connectionArgs;
	assert.equal(hostOption, '-h');
	assert.ok(
		socket.startsWith('/') &&
			socket.includes('/buildos-sql-contract-') &&
			socket.endsWith('/socket')
	);
	assert.equal(userOption, '-U');
	assert.equal(user, 'postgres');
	assert.equal(databaseOption, '-d');
	assert.equal(database, 'postgres');
}

export async function verifyUploadQuotaRaces(connectionArgs) {
	assertDisposableConnection(connectionArgs);
	const childEnv = {
		PATH: process.env.PATH,
		LANG: 'C',
		LC_ALL: 'C',
		PGPASSFILE: '/dev/null',
		PGSERVICEFILE: '/dev/null'
	};
	const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connectionArgs];
	const query = (sql) =>
		execFileSync('psql', [...args, '-c', sql], {
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 10000,
			env: childEnv
		}).trim();
	const reset = () =>
		query(`DELETE FROM libri.image_upload_issuances;
 DELETE FROM libri.image_upload_intents WHERE id<>'${upload}';
 UPDATE libri.image_upload_intents SET pending_slot_released_at=NULL,quota_policy_version=1;
 UPDATE libri.image_upload_controls SET admission_enabled=true,max_pending=1,max_daily=50;`);
	function session(name) {
		const child = spawn('psql', args, {
			env: { ...childEnv, PGAPPNAME: name },
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 15000
		});
		let stdout = '',
			stderr = '';
		child.stdout.on('data', (data) => {
			stdout += data;
		});
		child.stderr.on('data', (data) => {
			stderr += data;
		});
		child.stdin.on('error', () => {});
		const done = new Promise((resolve) => {
			child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
			child.on('close', (code) => resolve({ code, stdout, stderr }));
		});
		return { child, done, output: () => stdout };
	}
	async function until(check, message) {
		const deadline = Date.now() + 1500;
		while (Date.now() < deadline) {
			if (check()) return;
			await delay(20);
		}
		throw Error(message);
	}
	async function race(
		label,
		holderSql,
		contenderSql,
		{ validate, commit = true, expiry = false, expectedError = false } = {}
	) {
		const holder = session('libri_quota_holder');
		let contender;
		try {
			holder.child.stdin.write('BEGIN; ' + holderSql + "\nSELECT 'READY';\n");
			await until(
				() => holder.output().includes('READY'),
				label + ': missing holder barrier'
			);
			contender = session('libri_quota_contender');
			contender.child.stdin.end(contenderSql);
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name='libri_quota_contender' AND wait_event_type='Lock'"
					) === '1',
				label + ': overlap not observed'
			);
			if (expiry) {
				assert.equal(
					query(
						"SELECT query_start < (SELECT expires_at FROM libri.image_upload_intents) FROM pg_stat_activity WHERE application_name='libri_quota_contender'"
					),
					't'
				);
				await delay(1100);
			}
			holder.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const [first, second] = await Promise.all([holder.done, contender.done]);
			assert.equal(first.code, 0, label + ': ' + first.stderr);
			if (expectedError) {
				assert.notEqual(second.code, 0);
				assert.match(second.stderr, /Upload capacity exhausted/);
			} else assert.equal(second.code, 0, label + ': ' + second.stderr);
			validate?.(second.stdout.trim());
			console.log('  ✓ ' + label + ' (observed real overlapping transactions)');
		} finally {
			for (const s of [holder, contender].filter(Boolean)) {
				if (s.child.exitCode === null) s.child.kill('SIGTERM');
				await s.done;
			}
		}
	}
	reset();
	await race('simultaneous settlement preserves one timestamp', release, release, {
		validate: (out) => {
			assert.equal(out, 't');
			const stamp = query('SELECT pending_slot_released_at FROM libri.image_upload_intents');
			assert.equal(query(release), 't');
			assert.equal(
				query('SELECT pending_slot_released_at FROM libri.image_upload_intents'),
				stamp
			);
		}
	});
	reset();
	await race('rollback permits an independent settlement retry', release, release, {
		commit: false,
		validate: (out) => assert.equal(out, 't')
	});
	reset();
	await race('settlement commit releases exactly one pending admission', release, reserve, {
		validate: (out) => {
			assert.ok(out.endsWith('\n1'));
			assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '2');
			assert.equal(
				query(
					'SELECT count(*) FROM libri.image_upload_intents WHERE pending_slot_released_at IS NULL'
				),
				'1'
			);
		}
	});
	reset();
	await race('settlement rollback cannot admit beyond pending quota', release, reserve, {
		commit: false,
		expectedError: true
	});
	reset();
	await race(
		'policy changed while waiting cannot be mistaken for proven issuance accounting',
		'UPDATE libri.image_upload_intents SET quota_policy_version=0;',
		release,
		{
			validate: (out) => assert.equal(out, 'f')
		}
	);
	reset();
	// Synthetic time advance models an issued reservation that later expires. The
	// issuance and retirement RPCs, not direct ledger inserts, hold the real locks.
	query(`DELETE FROM libri.image_upload_cleanup_targets; DELETE FROM libri.image_upload_retirements;
 UPDATE libri.image_upload_intents SET status='reserved',created_at=statement_timestamp(),
 signing_deadline=statement_timestamp()+interval '10 minutes',expires_at=statement_timestamp()+interval '135 minutes';`);
	await race(
		'committing issuance evidence cannot be overlooked by queued settlement',
		`SET ROLE service_role; SELECT libri.begin_image_upload_issuance('${library}','${upload}','${user}','${request}');
 RESET ROLE; ${expire} SET ROLE service_role; SELECT libri.retire_image_upload('${library}','${upload}');`,
		release,
		{
			validate: (out) => {
				assert.equal(out, 'f');
				assert.equal(query('SELECT count(*) FROM libri.image_upload_issuances'), '1');
				assert.equal(
					query(
						'SELECT pending_slot_released_at IS NULL FROM libri.image_upload_intents'
					),
					't'
				);
			}
		}
	);
	reset();
	// Synthetic future retirement is deliberately ineligible before the deadline.
	query(`UPDATE libri.image_upload_intents SET created_at=statement_timestamp()-interval '135 minutes'+interval '1 second',
 signing_deadline=statement_timestamp()-interval '125 minutes'+interval '1 second',expires_at=statement_timestamp()+interval '1 second';
 UPDATE libri.image_upload_retirements SET retired_at=(SELECT expires_at FROM libri.image_upload_intents),
 inspect_after=(SELECT expires_at+interval '27 hours' FROM libri.image_upload_intents);`);
	await race(
		'settlement refreshes time after control lock wait',
		'SELECT library_id FROM libri.image_upload_controls FOR UPDATE;',
		release,
		{
			expiry: true,
			validate: (out) => assert.equal(out, 't')
		}
	);
}
