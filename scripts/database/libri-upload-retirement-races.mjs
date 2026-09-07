// Only the disposable SQL runner calls this. No hosted credentials or fallback.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const uploadRetirementContract =
	'20260907154152_libri_upload_retirement_tombstones.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const upload = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const token = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const verified =
	'{"mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":32,"height":32,"channels":3}';
const fence = `'${library}','${upload}','${token}',1`;
const prepare = `SELECT libri.prepare_image_upload_publication(${fence},'${verified}');`;
const finish = `SELECT libri.finalize_image_upload_publication(${fence},(SELECT id FROM libri.image_upload_publications WHERE attempt=1),'ffffffff-ffff-4fff-8fff-fffffffffff1','${verified}');`;
const retire = `SELECT libri.retire_image_upload('${library}','${upload}');`;
const expire =
	"UPDATE libri.image_upload_intents SET created_at=statement_timestamp()-interval '3 hours',signing_deadline=statement_timestamp()-interval '170 minutes',expires_at=statement_timestamp()-interval '45 minutes';";

export async function verifyUploadRetirementRaces(connectionArgs) {
	const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connectionArgs];
	const query = (sql) =>
		execFileSync('psql', [...args, '-c', sql], {
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 10000
		}).trim();
	const reset = () =>
		query(
			'DELETE FROM libri.image_upload_cleanup_targets; DELETE FROM libri.image_upload_retirements; DELETE FROM libri.image_upload_publications; DELETE FROM libri.images; DELETE FROM libri.source_book_links; DELETE FROM libri.sources; ' +
				"UPDATE libri.image_upload_intents SET status='awaiting_verification',created_at=statement_timestamp(),signing_deadline=statement_timestamp()+interval '10 minutes',expires_at=statement_timestamp()+interval '135 minutes'; " +
				"UPDATE libri.image_upload_processing SET status='leased',attempt=1,lease_token='" +
				token +
				"',lease_expires_at=statement_timestamp()+interval '90 seconds',last_failure=NULL; " +
				'UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true; SET ROLE service_role; ' +
				prepare
		);
	function session(name) {
		const child = spawn('psql', args, {
			env: { ...process.env, PGAPPNAME: name },
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
		throw new Error(message);
	}
	async function race(label, holderSql, { commit = true, expiry = false, validate } = {}) {
		const holder = session('libri_retirement_holder');
		let contender;
		try {
			holder.child.stdin.write('BEGIN; ' + holderSql + "\nSELECT 'READY';\n");
			await until(
				() => holder.output().includes('READY'),
				label + ': missing holder barrier'
			);
			contender = session('libri_retirement_contender');
			contender.child.stdin.end('SET ROLE service_role; ' + retire);
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name='libri_retirement_contender' AND wait_event_type='Lock'"
					) === '1',
				label + ': overlap not observed'
			);
			if (expiry) {
				assert.equal(
					query(
						"SELECT query_start < (SELECT expires_at FROM libri.image_upload_intents) FROM pg_stat_activity WHERE application_name='libri_retirement_contender'"
					),
					't'
				);
				await delay(1100);
			}
			holder.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const [first, second] = await Promise.all([holder.done, contender.done]);
			assert.equal(first.code, 0, label + ': ' + first.stderr);
			assert.equal(second.code, 0, label + ': ' + second.stderr);
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
	query(expire);
	await race(
		'duplicate retirement retains one immutable plan',
		'SET ROLE service_role; ' + retire,
		{
			validate: (out) => {
				assert.equal(JSON.parse(out).target_count, 2);
				assert.equal(query('SELECT count(*) FROM libri.image_upload_retirements'), '1');
				assert.equal(query('SELECT count(*) FROM libri.image_upload_cleanup_targets'), '2');
			}
		}
	);
	reset();
	await race(
		'lost publication success is protected before retirement',
		'SET ROLE service_role; ' + finish,
		{
			validate: (out) => {
				assert.equal(JSON.parse(out).outcome, 'published');
				assert.equal(JSON.parse(out).target_count, 1);
				assert.equal(
					query(
						"SELECT count(*) FROM libri.image_upload_cleanup_targets t JOIN libri.images i ON i.bucket_id='libri-assets' AND i.object_path=t.object_path"
					),
					'0'
				);
				assert.equal(
					JSON.parse(query('SET ROLE service_role; ' + finish)).already_published,
					true
				);
			}
		}
	);
	reset();
	await race(
		'rolled-back publication is not mistaken for a committed image',
		'SET ROLE service_role; ' + finish,
		{
			commit: false,
			validate: (out) => {
				assert.equal(out, '');
				assert.equal(query('SELECT count(*) FROM libri.image_upload_cleanup_targets'), '0');
				assert.equal(query('SELECT count(*) FROM libri.images'), '0');
			}
		}
	);
	reset();
	query(expire);
	await race(
		'rolled-back retirement can be safely reattempted',
		'SET ROLE service_role; ' + retire,
		{
			commit: false,
			validate: (out) => assert.equal(JSON.parse(out).target_count, 2)
		}
	);
	reset();
	query(
		"UPDATE libri.image_upload_intents SET created_at=statement_timestamp()-interval '135 minutes'+interval '1 second',signing_deadline=statement_timestamp()-interval '125 minutes'+interval '1 second',expires_at=statement_timestamp()+interval '1 second';"
	);
	await race(
		'retirement refreshes time after a blocking control lock',
		'SELECT library_id FROM libri.image_upload_controls FOR UPDATE;',
		{
			expiry: true,
			validate: (out) => assert.equal(JSON.parse(out).outcome, 'expired')
		}
	);
	reset();
	query(expire);
	// A stale discovery result is not authority: repeat eligibility under row locks.
	assert.equal(
		query(
			`SET ROLE service_role; SELECT count(*) FROM libri.list_image_upload_retirement_candidates('${library}');`
		),
		'1'
	);
	await race(
		'a stale candidate cannot retire a now-active upload',
		"UPDATE libri.image_upload_intents SET created_at=statement_timestamp(),signing_deadline=statement_timestamp()+interval '10 minutes',expires_at=statement_timestamp()+interval '135 minutes';",
		{
			validate: (out) => assert.equal(out, '')
		}
	);
	reset();
}
