// Fresh disposable PostgreSQL only. No environment credentials or hosted fallback.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibriUploadProcessing } from '../src/workers/libri/uploadProcessing';
import { createLibriUploadDownloadAuthorizer } from '../src/workers/libri/uploadDownloadAuthorizer';
import { createLibriUploadImageDownloader } from '../src/workers/libri/uploadImageDownload';
import { createLibriUploadImageVerifier } from '../src/workers/libri/uploadImageVerifier';
import { type LibriPublicationPorts } from '../src/workers/libri/uploadPublication';
import { createLibriUploadPublicationTransport } from '../src/workers/libri/uploadPublicationTransport';
import { createLibriUploadPublicationBroker } from '../../web/src/lib/server/libri/upload-publication';
import { signLibriUploadDownload } from '../../web/src/lib/server/libri/upload-download-signing';
import { createLibriUploadCleanupExecutor } from '../../web/src/lib/server/libri/upload-cleanup';

const available = ['initdb', 'pg_ctl', 'psql'].every(
	(cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available) throw new Error('CI must provide disposable PostgreSQL tools');
const describePostgres = available ? describe : describe.skip;
const libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const userId = '11111111-1111-4111-8111-111111111111';
const bookId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const origin = 'https://iwifjtlebphefldmwbkh.supabase.co';
const brokerUrl = 'https://build-os.com/api/internal/libri/uploads/download';
const brokerToken = 'disposable-broker-token-abcdefghijklmnopqrstuvwxyz';

describePostgres(
	'Libri upload claim to authorized verified bytes on real restricted PostgreSQL roles',
	() => {
		let temporary = '',
			dataDir = '',
			socket = '';
		let admin: Pool, worker: Pool, service: Pool;
		let bytes: Buffer;
		beforeAll(async () => {
			temporary = mkdtempSync('/tmp/buildos-libri-upload-pg-');
			dataDir = join(temporary, 'data');
			socket = join(temporary, 'socket');
			mkdirSync(socket);
			execFileSync(
				'initdb',
				[
					'-D',
					dataDir,
					'--no-locale',
					'--encoding=UTF8',
					'--auth=trust',
					'--username=postgres'
				],
				{ stdio: 'pipe', timeout: 20_000 }
			);
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-o',
					`-F -c listen_addresses='' -c unix_socket_directories='${socket}'`,
					'-l',
					join(temporary, 'postgres.log'),
					'-w',
					'start'
				],
				{ stdio: 'pipe', timeout: 20_000 }
			);
			const root = resolve(process.cwd(), '../..');
			const psql = [
				'-h',
				socket,
				'-U',
				'postgres',
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1'
			];
			for (const file of [
				'supabase/tests/fixtures/libri_images_private_storage_base.sql',
				'scripts/database/provision-libri-worker-role.sql',
				'scripts/database/provision-libri-frontend-reader-role.sql',
				'supabase/migrations/20260906184227_libri_private_image_upload_admission.sql',
				'supabase/migrations/20260906201700_libri_upload_processing_leases.sql',
				'supabase/migrations/20260907015150_libri_upload_download_authorization.sql',
				'supabase/migrations/20260907041707_libri_upload_publication_contract.sql',
				'supabase/migrations/20260907043724_libri_upload_claim_deadline_refresh.sql',
				'supabase/migrations/20260907154152_libri_upload_retirement_tombstones.sql',
				'supabase/migrations/20260908192820_libri_upload_cleanup_leases.sql'
			])
				execFileSync('psql', [...psql, '-f', resolve(root, file)], {
					stdio: 'pipe',
					timeout: 20_000
				});
			admin = new Pool({ host: socket, database: 'postgres', user: 'postgres', max: 1 });
			await admin.query('GRANT USAGE ON SCHEMA libri TO libri_worker');
			worker = new Pool({ host: socket, database: 'postgres', user: 'libri_worker', max: 1 });
			service = new Pool({
				host: socket,
				database: 'postgres',
				user: 'postgres',
				options: '-c role=service_role',
				max: 1
			});
			expect((await worker.query('SELECT current_user')).rows[0].current_user).toBe(
				'libri_worker'
			);
			expect((await service.query('SELECT current_user')).rows[0].current_user).toBe(
				'service_role'
			);
			await admin.query('INSERT INTO auth.users(id) VALUES($1)', [userId]);
			await admin.query(
				"INSERT INTO libri.libraries(id,slug,name,created_by) VALUES($1,'upload-integration','Upload integration',$2)",
				[libraryId, userId]
			);
			await admin.query(
				"INSERT INTO libri.library_members(library_id,user_id,role) VALUES($1,$2,'owner')",
				[libraryId, userId]
			);
			await admin.query(
				"INSERT INTO libri.books(id,library_id,title) VALUES($1,$2,'Fixture')",
				[bookId, libraryId]
			);
			await admin.query('INSERT INTO libri.image_upload_controls(library_id) VALUES($1)', [
				libraryId
			]);
			bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: 'red' } })
				.png()
				.toBuffer();
		}, 60_000);
		beforeEach(async () => {
			// Only this test's newly created database is addressable through this socket.
			await admin.query(
				'DELETE FROM libri.image_upload_cleanup_checks; DELETE FROM libri.image_upload_cleanup_targets; DELETE FROM libri.image_upload_retirements'
			);
			await admin.query(
				'DELETE FROM libri.image_upload_publications; DELETE FROM libri.images; DELETE FROM libri.source_book_links; DELETE FROM libri.sources; DELETE FROM storage.objects'
			);
			await admin.query(
				'DELETE FROM libri.image_upload_processing; DELETE FROM libri.image_upload_intents'
			);
			await admin.query(
				"UPDATE libri.library_members SET role='owner'; UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true,cleanup_enabled=false"
			);
		});
		afterAll(async () => {
			await Promise.all([admin?.end(), worker?.end(), service?.end()]);
			if (dataDir)
				spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], {
					stdio: 'ignore',
					timeout: 20_000
				});
			if (temporary.startsWith('/tmp/buildos-libri-upload-pg-'))
				rmSync(temporary, { recursive: true, force: true });
		});
		it.each([
			'valid',
			'already_absent',
			'disabled',
			'delete_outage',
			'late_arrival',
			'kill_before_delete',
			'stale_fence',
			'lost_finish'
		])('cleans only a retired target through real service-role SQL: %s', async (scenario) => {
			const declaration = {
				filename: 'page.png',
				imageType: 'page',
				mimeType: 'image/png',
				byteSize: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex')
			};
			const user = await admin.connect();
			let uploadId: string;
			try {
				await user.query('BEGIN; SET LOCAL ROLE authenticated');
				await user.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userId]);
				uploadId = (
					await user.query(
						'SELECT (libri.reserve_image_upload($1,$2,$3,$4::jsonb)).id AS id',
						[libraryId, bookId, randomUUID(), JSON.stringify(declaration)]
					)
				).rows[0].id;
				await user.query('COMMIT');
			} catch (cause) {
				await user.query('ROLLBACK');
				throw cause;
			} finally {
				user.release();
			}
			await admin.query(
				"UPDATE libri.image_upload_intents SET created_at=statement_timestamp()-interval '3 hours',signing_deadline=statement_timestamp()-interval '170 minutes',expires_at=statement_timestamp()-interval '45 minutes'"
			);
			expect(
				(
					await service.query('SELECT libri.retire_image_upload($1,$2) AS receipt', [
						libraryId,
						uploadId
					])
				).rows[0].receipt.target_count
			).toBe(1);
			await admin.query(
				"UPDATE libri.image_upload_retirements SET retired_at=statement_timestamp()-interval '28 hours',inspect_after=statement_timestamp()-interval '1 hour'"
			);
			if (scenario !== 'disabled')
				await admin.query('UPDATE libri.image_upload_controls SET cleanup_enabled=true');
			const target = (
				await admin.query('SELECT id,object_path FROM libri.image_upload_cleanup_targets')
			).rows[0];
			const object = {
				id: randomUUID(),
				name: target.object_path,
				bucket_id: 'libri-assets',
				version: 'fixture-version'
			};
			let removed = false,
				deleteCalls = 0,
				infoCalls = 0;
			const provider: typeof fetch = async (input, init) => {
				const url = new URL(String(input));
				expect(url.origin).toBe(origin);
				const body = init?.body ? JSON.parse(String(init.body)) : undefined;
				const base = body ? [body.p_library_id, body.p_target_id, body.p_lease_token] : [];
				if (url.pathname.endsWith('/claim_image_upload_cleanup'))
					return Response.json(
						(
							await service.query(
								'SELECT libri.claim_image_upload_cleanup($1,$2,$3) AS receipt',
								base
							)
						).rows[0].receipt
					);
				if (url.pathname.endsWith('/authorize_image_upload_cleanup'))
					return Response.json(
						(
							await service.query(
								'SELECT libri.authorize_image_upload_cleanup($1,$2,$3,$4) AS receipt',
								[...base, body.p_generation]
							)
						).rows[0].receipt
					);
				if (url.pathname.endsWith('/finish_image_upload_cleanup')) {
					const result = (
						await service.query(
							'SELECT libri.finish_image_upload_cleanup($1,$2,$3,$4,$5) AS receipt',
							[...base, body.p_generation, body.p_outcome]
						)
					).rows[0].receipt;
					if (scenario === 'lost_finish' && body.p_outcome === 'absent')
						throw new Error('Simulated lost committed reply');
					return Response.json(result);
				}
				if (url.pathname === '/storage/v1/bucket/libri-assets')
					return Response.json({ id: 'libri-assets', public: false });
				if (
					url.pathname === '/storage/v1/object/libri-assets' &&
					init?.method === 'DELETE'
				) {
					deleteCalls++;
					expect(body).toEqual({ prefixes: [target.object_path] });
					if (scenario === 'delete_outage')
						return Response.json({ code: 'InternalError' }, { status: 503 });
					removed = true;
					return Response.json([object]);
				}
				if (url.pathname === `/storage/v1/object/info/libri-assets/${target.object_path}`) {
					infoCalls++;
					if (infoCalls === 1 && scenario === 'kill_before_delete')
						await admin.query(
							'UPDATE libri.image_upload_controls SET cleanup_enabled=false'
						);
					if (infoCalls === 1 && scenario === 'stale_fence')
						await admin.query(
							'UPDATE libri.image_upload_cleanup_checks SET generation=generation+1,lease_token=$1',
							[randomUUID()]
						);
					if (scenario === 'already_absent' || (removed && scenario !== 'late_arrival'))
						return Response.json(
							{ code: 'NoSuchKey', statusCode: '404' },
							{ status: 400 }
						);
					return Response.json(object);
				}
				throw new Error('Unexpected cleanup request');
			};
			const executor = createLibriUploadCleanupExecutor({
				enabled: true,
				url: origin,
				serviceKey: 'disposable-service-fixture',
				fetchImpl: provider
			});
			const execution = executor.run({
				libraryId,
				targetId: target.id,
				leaseToken: randomUUID(),
				signal: new AbortController().signal
			});
			if (['kill_before_delete', 'stale_fence', 'lost_finish'].includes(scenario))
				await expect(execution).rejects.toThrow(
					scenario === 'lost_finish' ? 'outcome unknown' : 'unavailable'
				);
			else
				expect((await execution).status).toBe(
					scenario === 'disabled'
						? 'unclaimed'
						: ['delete_outage', 'late_arrival'].includes(scenario)
							? 'unavailable'
							: 'absent'
				);
			const checks = (
				await admin.query(
					'SELECT status,last_outcome FROM libri.image_upload_cleanup_checks'
				)
			).rows;
			if (scenario === 'disabled') expect(checks).toHaveLength(0);
			else
				expect(checks[0].status).toBe(
					['kill_before_delete', 'stale_fence'].includes(scenario)
						? 'leased'
						: ['delete_outage', 'late_arrival'].includes(scenario)
							? 'retry_wait'
							: 'absent'
				);
			expect(deleteCalls).toBe(
				['already_absent', 'disabled', 'kill_before_delete', 'stale_fence'].includes(
					scenario
				)
					? 0
					: 1
			);
			expect(
				(await admin.query('SELECT status FROM libri.image_upload_intents')).rows[0].status
			).toBe('cleanup_pending');
			expect(
				(
					await admin.query(
						'SELECT count(*)::integer AS n FROM libri.image_upload_cleanup_targets'
					)
				).rows[0].n
			).toBe(1);
			expect(
				(await admin.query('SELECT count(*)::integer AS n FROM libri.images')).rows[0].n
			).toBe(0);
		});
		it.each([
			'valid',
			'revoked_member',
			'disabled',
			'replaced_lease',
			'changed_bytes',
			'storage_outage'
		])('enforces the complete admission/claim/sign/verify boundary: %s', async (scenario) => {
			const declaration = {
				filename: 'page.png',
				imageType: 'page',
				mimeType: 'image/png',
				byteSize: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex')
			};
			const user = await admin.connect();
			let uploadId: string;
			try {
				await user.query('BEGIN; SET LOCAL ROLE authenticated');
				await user.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userId]);
				uploadId = (
					await user.query(
						'SELECT (libri.reserve_image_upload($1,$2,$3,$4::jsonb)).id AS id',
						[libraryId, bookId, randomUUID(), JSON.stringify(declaration)]
					)
				).rows[0].id;
				await user.query('SELECT libri.submit_image_upload($1,$2)', [libraryId, uploadId]);
				await user.query('COMMIT');
			} catch (cause) {
				await user.query('ROLLBACK');
				throw cause;
			} finally {
				user.release();
			}
			const processing = createLibriUploadProcessing(worker);
			expect(await processing.listCandidates(libraryId)).toEqual([uploadId]);
			const claim = await processing.claim({ libraryId, uploadId, leaseToken: randomUUID() });
			if (!claim) throw new Error('Expected actual worker claim');
			let rpcCalls = 0;
			const provider = async (input: string | URL | Request, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body));
				if (
					new URL(String(input)).pathname ===
					'/rest/v1/rpc/authorize_image_upload_download'
				) {
					rpcCalls++;
					const result = await service.query(
						'SELECT libri.authorize_image_upload_download($1,$2,$3,$4) AS receipt',
						[body.p_library_id, body.p_upload_id, body.p_lease_token, body.p_attempt]
					);
					return Response.json(result.rows[0].receipt);
				}
				if (scenario === 'storage_outage')
					return Response.json({ error: 'Unavailable' }, { status: 503 });
				if (scenario === 'revoked_member')
					await admin.query("UPDATE libri.library_members SET role='viewer'");
				if (scenario === 'disabled')
					await admin.query(
						'UPDATE libri.image_upload_controls SET processing_enabled=false'
					);
				if (scenario === 'replaced_lease')
					await admin.query(
						'UPDATE libri.image_upload_processing SET attempt=2,lease_token=$1',
						[randomUUID()]
					);
				const token = `header.${Buffer.from(JSON.stringify({ url: `libri-assets/${claim.objectPath}`, exp: Math.floor(Date.now() / 1000) + body.expiresIn })).toString('base64url')}.signature`;
				return Response.json({
					signedURL: `/object/sign/libri-assets/${claim.objectPath}?token=${token}`
				});
			};
			const authorize = createLibriUploadDownloadAuthorizer({
				endpointUrl: brokerUrl,
				storageOrigin: origin,
				bearerToken: brokerToken,
				fetchImpl: (input, init) =>
					signLibriUploadDownload(new Request(input, init), {
						enabled: true,
						url: origin,
						brokerToken,
						serviceKey: 'server-only-test-key',
						fetchImpl: provider
					})
			});
			const fetchImage = vi.fn(
				async () =>
					new Response(
						new Uint8Array(
							scenario === 'changed_bytes' ? Buffer.alloc(bytes.length) : bytes
						),
						{ headers: { 'Content-Type': 'image/png' } }
					)
			);
			const downloader = createLibriUploadImageDownloader({
				storageOrigin: origin,
				authorize,
				verifier: createLibriUploadImageVerifier(),
				fetchImpl: fetchImage
			});
			const result = downloader.downloadAndVerify({
				claim,
				signal: new AbortController().signal
			});
			if (scenario === 'valid') expect((await result).bytes).toEqual(bytes);
			else {
				await expect(result).rejects.toMatchObject({
					code:
						scenario === 'changed_bytes'
							? 'sha256_mismatch'
							: 'download_authorization_unavailable'
				});
				expect(
					await processing.fail({
						...claim,
						failureCode:
							scenario === 'changed_bytes' ? 'invalid_image' : 'storage_unavailable'
					})
				).toBe(scenario !== 'replaced_lease');
			}
			expect(rpcCalls).toBe(scenario === 'storage_outage' ? 1 : 2);
			expect(fetchImage).toHaveBeenCalledTimes(
				['valid', 'changed_bytes'].includes(scenario) ? 1 : 0
			);
			expect(
				(await admin.query('SELECT count(*)::integer AS count FROM libri.images')).rows[0]
					.count
			).toBe(0);
			expect(
				(await admin.query('SELECT count(*)::integer AS count FROM storage.objects'))
					.rows[0].count
			).toBe(0);
			expect(
				(await admin.query('SELECT status FROM libri.image_upload_intents')).rows[0].status
			).toBe('awaiting_verification');
		});

		it.each(['published', 'revoked', 'unknown_commit', 'failed_storage', 'rollback'])(
			'publishes verified bytes through real SQL roles without unsafe compensation: %s',
			async (scenario) => {
				const declaration = {
					filename: 'page.png',
					imageType: 'page',
					mimeType: 'image/png' as const,
					byteSize: bytes.length,
					sha256: createHash('sha256').update(bytes).digest('hex')
				};
				const actor = await admin.connect();
				let uploadId: string;
				try {
					await actor.query('BEGIN; SET LOCAL ROLE authenticated');
					await actor.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [
						userId
					]);
					uploadId = (
						await actor.query(
							'SELECT (libri.reserve_image_upload($1,$2,$3,$4::jsonb)).id AS id',
							[libraryId, bookId, randomUUID(), JSON.stringify(declaration)]
						)
					).rows[0].id;
					await actor.query('SELECT libri.submit_image_upload($1,$2)', [
						libraryId,
						uploadId
					]);
					await actor.query('COMMIT');
				} catch (cause) {
					await actor.query('ROLLBACK');
					throw cause;
				} finally {
					actor.release();
				}
				const processing = createLibriUploadProcessing(worker);
				const claim = await processing.claim({
					libraryId,
					uploadId,
					leaseToken: randomUUID()
				});
				if (!claim) throw new Error('Expected actual worker claim');
				const verified = await createLibriUploadImageVerifier().verify({
					body: new Response(new Uint8Array(bytes)).body!,
					declaration,
					signal: new AbortController().signal
				});
				const fence = [libraryId, uploadId, claim.leaseToken, claim.attempt];
				const objectId = randomUUID();
				let savedCompletion: unknown[] = [];
				const createObject = vi.fn<LibriPublicationPorts['createObject']>(async (input) => {
					expect(input.upsert).toBe(false);
					expect(input.bytes).toEqual(bytes);
					if (scenario === 'failed_storage') throw new Error('Simulated Storage outage');
					// Disposable Storage metadata plus the asserted owned byte payload, not hosted Storage.
					await admin.query(
						'INSERT INTO storage.objects(id,bucket_id,name) VALUES($1,$2,$3)',
						[objectId, input.publication.bucketId, input.publication.objectPath]
					);
					if (scenario === 'revoked')
						await admin.query("UPDATE libri.library_members SET role='viewer'");
					return { objectPath: input.publication.objectPath };
				});
				const ports: LibriPublicationPorts = {
					prepare: async (input) =>
						(
							await service.query(
								'SELECT libri.prepare_image_upload_publication($1,$2,$3,$4,$5::jsonb) AS receipt',
								[...fence, JSON.stringify(input.verified)]
							)
						).rows[0].receipt,
					createObject,
					finalize: async (input) => {
						savedCompletion = [
							...fence,
							input.publicationId,
							objectId,
							JSON.stringify(input.verified)
						];
						const connection = await service.connect();
						try {
							await connection.query('BEGIN');
							const result = (
								await connection.query(
									'SELECT libri.finalize_image_upload_publication($1,$2,$3,$4,$5,$6,$7::jsonb) AS receipt',
									savedCompletion
								)
							).rows[0].receipt;
							if (scenario === 'rollback')
								throw new Error('Simulated failed transaction');
							await connection.query('COMMIT');
							if (scenario === 'unknown_commit')
								throw new Error('Simulated lost commit response');
							return result;
						} catch (cause) {
							await connection.query('ROLLBACK');
							throw cause;
						} finally {
							connection.release();
						}
					}
				};
				let preparedRow: Record<string, unknown>;
				const broker = createLibriUploadPublicationBroker();
				const endpointUrl = 'https://build-os.com/api/internal/libri/uploads/publish';
				const { bytes: _owned, ...metadata } = verified;
				const providerFetch: typeof fetch = async (input, init) => {
					const url = new URL(String(input));
					const headers = new Headers(init?.headers);
					expect(url.origin).toBe(origin);
					expect(headers.get('authorization')).toBe('Bearer fixture-service-only');
					const body = init?.body ? JSON.parse(String(init.body)) : undefined;
					if (url.pathname.endsWith('/authorize_image_upload_download'))
						return Response.json(
							(
								await service.query(
									'SELECT libri.authorize_image_upload_download($1,$2,$3,$4) AS receipt',
									[
										body.p_library_id,
										body.p_upload_id,
										body.p_lease_token,
										body.p_attempt
									]
								)
							).rows[0].receipt
						);
					if (url.pathname.endsWith('/prepare_image_upload_publication')) {
						preparedRow = (await ports.prepare({
							claim,
							verified: body.p_verified,
							signal: init!.signal!
						})) as Record<string, unknown>;
						return Response.json(preparedRow);
					}
					if (url.pathname.startsWith('/storage/v1/object/upload/sign/')) {
						expect(headers.get('x-upsert')).toBe('false');
						const payload = {
							url: 'libri-assets/' + preparedRow.object_path,
							upsert: false,
							exp: Math.floor(Date.now() / 1000) + 7200
						};
						const token =
							Buffer.from('{}').toString('base64url') +
							'.' +
							Buffer.from(JSON.stringify(payload)).toString('base64url') +
							'.signature';
						return Response.json({
							url:
								'/object/upload/sign/libri-assets/' +
								preparedRow.object_path +
								'?token=' +
								token
						});
					}
					if (url.pathname === '/rest/v1/image_upload_publications')
						return Response.json(
							(
								await service.query(
									'SELECT id,status,storage_object_id,verified_metadata FROM libri.image_upload_publications WHERE id=$1 AND library_id=$2 AND upload_id=$3 AND lease_token=$4 AND attempt=$5',
									[
										url.searchParams.get('id')!.slice(3),
										url.searchParams.get('library_id')!.slice(3),
										url.searchParams.get('upload_id')!.slice(3),
										url.searchParams.get('lease_token')!.slice(3),
										Number(url.searchParams.get('attempt')!.slice(3))
									]
								)
							).rows
						);
					if (url.pathname.startsWith('/storage/v1/object/info/')) {
						const row = (
							await admin.query(
								'SELECT id,name,bucket_id FROM storage.objects WHERE name=$1',
								[preparedRow.object_path]
							)
						).rows[0];
						return Response.json({
							...row,
							version: 'one',
							size: bytes.length,
							content_type: 'image/png',
							cache_control: 'max-age=0'
						});
					}
					if (url.pathname.startsWith('/storage/v1/object/authenticated/'))
						return new Response(new Uint8Array(bytes), {
							headers: { 'content-type': 'image/png' }
						});
					if (url.pathname.endsWith('/finalize_image_upload_publication')) {
						expect(body.p_storage_object_id).toBe(objectId);
						return Response.json(
							await ports.finalize({
								claim,
								publicationId: body.p_publication_id,
								verified: body.p_verified,
								signal: init!.signal!
							})
						);
					}
					throw Error('Unexpected provider endpoint');
				};
				const publisher = createLibriUploadPublicationTransport({
					endpointUrl,
					bearerToken: brokerToken,
					fetchImpl: async (input, init) => {
						const url = new URL(String(input));
						if (url.href === endpointUrl) {
							const body = JSON.parse(String(init?.body));
							expect(body).not.toHaveProperty('storageObjectId');
							return broker(new Request(endpointUrl, init), {
								enabled: true,
								url: origin,
								serviceKey: 'fixture-service-only',
								brokerToken,
								fetchImpl: providerFetch
							});
						}
						expect(url.origin).toBe(origin);
						expect(init?.method).toBe('PUT');
						expect(url.pathname).toBe(
							'/storage/v1/object/upload/sign/libri-assets/' + preparedRow.object_path
						);
						const headers = new Headers(init?.headers);
						expect(headers.has('authorization')).toBe(false);
						expect(headers.has('apikey')).toBe(false);
						expect(headers.get('x-upsert')).toBe('false');
						expect(headers.get('cache-control')).toBe('max-age=0');
						await createObject({
							publication: {
								publicationId: String(preparedRow.publication_id),
								libraryId,
								uploadId,
								bookId,
								leaseToken: claim.leaseToken,
								attempt: claim.attempt,
								bucketId: 'libri-assets',
								objectPath: String(preparedRow.object_path)
							},
							bytes: Buffer.from(init!.body as Uint8Array),
							verified: metadata,
							upsert: false,
							signal: init!.signal!
						});
						return Response.json({ Key: 'libri-assets/' + preparedRow.object_path });
					}
				});
				const result = publisher.publish({
					claim,
					verified,
					signal: new AbortController().signal
				});
				if (scenario === 'published') expect((await result).alreadyPublished).toBe(false);
				else
					await expect(result).rejects.toMatchObject({
						code: 'publication_outcome_unknown',
						mayHaveWrittenObject: true
					});
				expect(createObject).toHaveBeenCalledOnce();
				const committed = ['published', 'unknown_commit'].includes(scenario);
				const pub = (await admin.query('SELECT * FROM libri.image_upload_publications'))
					.rows[0];
				expect(pub.status).toBe(committed ? 'published' : 'prepared');
				expect(pub.followup_status).toBe(committed ? 'pending' : null);
				expect(
					(await admin.query('SELECT count(*)::integer AS n FROM libri.images')).rows[0].n
				).toBe(committed ? 1 : 0);
				expect(
					(await admin.query('SELECT count(*)::integer AS n FROM libri.sources')).rows[0]
						.n
				).toBe(committed ? 1 : 0);
				expect(
					(await admin.query('SELECT count(*)::integer AS n FROM storage.objects'))
						.rows[0].n
				).toBe(scenario === 'failed_storage' ? 0 : 1);
				if (committed) {
					expect(
						await processing.claim({ libraryId, uploadId, leaseToken: randomUUID() })
					).toBeNull();
					expect(
						await processing.fail({ ...claim, failureCode: 'storage_unavailable' })
					).toBe(false);
					const again = (
						await service.query(
							'SELECT libri.finalize_image_upload_publication($1,$2,$3,$4,$5,$6,$7::jsonb) AS receipt',
							savedCompletion
						)
					).rows[0].receipt;
					expect(again.already_published).toBe(true);
					expect(again.image_id).toBe(pub.id);
					expect(createObject).toHaveBeenCalledOnce();
				}
				expect(
					(await admin.query('SELECT status FROM libri.image_upload_intents')).rows[0]
						.status
				).toBe('awaiting_verification');
			}
		);
	}
);
