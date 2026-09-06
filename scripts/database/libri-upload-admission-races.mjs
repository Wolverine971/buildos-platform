// Invoked only inside the SQL runner's newly created disposable database, after
// its matching fixture. No hosted connection lookup, flags, or fallback exists.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const uploadAdmissionContract =
	'20260906184227_libri_private_image_upload_admission.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const book = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const owner = '11111111-1111-4111-8111-111111111111';
const editor = '22222222-2222-4222-8222-222222222222';
const declaration = JSON.stringify({
	filename: 'page.jpeg',
	mimeType: 'image/jpeg',
	byteSize: 1024,
	sha256: 'a'.repeat(64),
	imageType: 'page'
});
const reserve = (key, file = declaration) =>
	`SELECT (libri.reserve_image_upload('${library}', '${book}', '${key}', '${file}'::jsonb)).id;`;
const identity = (user) => `SET ROLE authenticated; SET request.jwt.claim.sub = '${user}';`;

export async function verifyUploadAdmissionRaces(connectionArgs) {
	const args = [
		'-X',
		'-q',
		'-A',
		'-t',
		'-v',
		'ON_ERROR_STOP=1',
		'-v',
		'VERBOSITY=verbose',
		...connectionArgs
	];
	const query = (sql) =>
		execFileSync('psql', [...args, '-c', sql], {
			encoding: 'utf8',
			timeout: 10_000,
			stdio: 'pipe'
		}).trim();
	function session(name) {
		const child = spawn('psql', args, {
			env: { ...process.env, PGAPPNAME: name },
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 10_000
		});
		let stdout = '',
			stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		// Resolve (never reject) so a failed contender is handled even while waiting
		// for the lock barrier. Process limits prevent an orphan session on failure.
		const done = new Promise((resolve) => {
			child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
			child.on('close', (code) => resolve({ code, stdout, stderr }));
		});
		child.stdin.on('error', () => {});
		return { child, done, output: () => stdout };
	}
	async function until(predicate, message) {
		const deadline = Date.now() + 1500;
		while (Date.now() < deadline) {
			if (predicate()) return;
			await delay(20);
		}
		throw new Error(message);
	}
	async function race(label, holderSql, contenderSql, expectedError, commitHolder = true) {
		const holder = session('libri_upload_holder');
		let contender;
		try {
			holder.child.stdin.write(`BEGIN; ${holderSql}\nSELECT 'HOLDER_READY';\n`);
			await until(
				() => holder.output().includes('HOLDER_READY'),
				`${label}: holder did not reach barrier`
			);
			contender = session('libri_upload_contender');
			contender.child.stdin.end(`${contenderSql}\n`);
			// Prove overlap by observing the second real backend waiting on a lock,
			// not by assuming two quickly scheduled requests were concurrent.
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name = 'libri_upload_contender' AND wait_event_type = 'Lock'"
					) === '1',
				`${label}: contender did not wait on the admission lock`
			);
			holder.child.stdin.end(commitHolder ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const [first, second] = await Promise.all([holder.done, contender.done]);
			assert.equal(first.code, 0, `${label}: holder failed: ${first.stderr}`);
			if (expectedError) {
				assert.notEqual(second.code, 0, `${label}: contender unexpectedly succeeded`);
				assert.match(
					second.stderr,
					new RegExp(`ERROR:\\s+${expectedError}:`),
					`${label}: wrong SQLSTATE: ${second.stderr}`
				);
			} else assert.equal(second.code, 0, `${label}: contender failed: ${second.stderr}`);
			console.log(`  ✓ ${label} (observed real overlapping transactions)`);
			return [first, second];
		} finally {
			for (const item of [holder, contender].filter(Boolean)) {
				if (item.child.exitCode === null) item.child.kill('SIGTERM');
				await item.done;
			}
		}
	}
	query('DELETE FROM libri.image_upload_intents');
	await race(
		'cross-requester pending quota',
		identity(owner) + reserve('race_quota_first'),
		identity(editor) + reserve('race_quota_other'),
		'53000'
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '1');
	query('DELETE FROM libri.image_upload_intents');
	query('UPDATE libri.image_upload_controls SET max_pending = 10, max_daily = 1');
	await race(
		'cross-requester daily quota',
		identity(owner) + reserve('race_daily_first'),
		identity(editor) + reserve('race_daily_other'),
		'53000'
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '1');
	query('DELETE FROM libri.image_upload_intents');
	query('UPDATE libri.image_upload_controls SET max_pending = 1, max_daily = 50');
	await race(
		'rolled-back reservation releases capacity',
		identity(owner) + reserve('race_abort_first'),
		identity(editor) + reserve('race_abort_other'),
		undefined,
		false
	);
	assert.equal(
		query('SELECT idempotency_key FROM libri.image_upload_intents'),
		'race_abort_other'
	);
	query('DELETE FROM libri.image_upload_intents');
	const [first, second] = await race(
		'same-key idempotent reservation',
		identity(owner) + reserve('race_same_key___'),
		identity(owner) + reserve('race_same_key___')
	);
	assert.equal(
		first.stdout.trim().split('\n')[0],
		second.stdout.trim(),
		'concurrent retries must return the same ID'
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '1');
	const intent = query('SELECT id FROM libri.image_upload_intents');
	const submit =
		identity(owner) +
		`SELECT (libri.submit_image_upload('${library}', '${intent}')).submitted_at;`;
	const [submittedFirst, submittedSecond] = await race(
		'duplicate submission is idempotent',
		submit,
		submit
	);
	assert.equal(submittedFirst.stdout.trim().split('\n')[0], submittedSecond.stdout.trim());
	assert.equal(query('SELECT status FROM libri.image_upload_intents'), 'awaiting_verification');
	query('DELETE FROM libri.image_upload_intents');
	await race(
		'same-key conflicting declaration',
		identity(owner) + reserve('race_conflict___'),
		identity(owner) +
			reserve('race_conflict___', declaration.replace('page.jpeg', 'other.jpeg')),
		'22023'
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '1');
	query('DELETE FROM libri.image_upload_intents');
	await race(
		'membership revoked before admission',
		`UPDATE libri.library_members SET role = 'viewer' WHERE library_id = '${library}' AND user_id = '${owner}';`,
		identity(owner) + reserve('race_revoked____'),
		'42501'
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '0');
	query(
		`UPDATE libri.library_members SET role = 'owner' WHERE library_id = '${library}' AND user_id = '${owner}';`
	);
	await race(
		'disable switch wins before admission',
		`UPDATE libri.image_upload_controls SET admission_enabled = false WHERE library_id = '${library}';`,
		identity(owner) + reserve('race_disabled___'),
		'42501'
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_intents'), '0');
}
