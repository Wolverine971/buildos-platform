// apps/mobile/src/lib/chunked-storage.ts
type KeyStore = {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
};

type Manifest = { generation: string; count: number };

const CHUNK_CHARS = 400;

/**
 * iOS keychain storage (expo-secure-store) rejects values over ~2 KB, and a Supabase session
 * with user metadata can exceed that. Values are split into chunks of at most 400 characters
 * (≤1,600 UTF-8 bytes) under generation-stamped keys; the manifest is written last, so an
 * interrupted refresh leaves the previous session readable. Native I/O is serialized so a
 * read or sign-out cannot interleave with a multi-chunk write.
 */
export function createChunkedStorage(store: KeyStore) {
	const chunkKey = (key: string, manifest: Manifest, index: number) =>
		`${key}.${manifest.generation}.${index}`;

	const readManifest = async (key: string): Promise<Manifest | null> => {
		const raw = await store.getItem(key);
		if (!raw) return null;
		let value: Manifest;
		try {
			value = JSON.parse(raw) as Manifest;
		} catch {
			await store.removeItem(key);
			return null;
		}
		if (
			!value ||
			!/^[a-z0-9-]+$/.test(value.generation) ||
			!Number.isInteger(value.count) ||
			value.count < 1 ||
			value.count > 1000
		) {
			await store.removeItem(key);
			return null;
		}
		return value;
	};

	const clean = async (key: string, manifest: Manifest | null) => {
		if (!manifest) return;
		await Promise.allSettled(
			Array.from({ length: manifest.count }, (_, i) =>
				store.removeItem(chunkKey(key, manifest, i))
			)
		);
	};

	const storage = {
		async getItem(key: string) {
			const manifest = await readManifest(key);
			if (!manifest) return null;
			const chunks = await Promise.all(
				Array.from({ length: manifest.count }, (_, i) =>
					store.getItem(chunkKey(key, manifest, i))
				)
			);
			if (chunks.some((chunk) => chunk === null)) {
				await store.removeItem(key);
				await clean(key, manifest);
				return null;
			}
			return chunks.join('');
		},
		async setItem(key: string, value: string) {
			const previous = await readManifest(key);
			const characters = Array.from(value);
			const manifest: Manifest = {
				generation: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
				count: Math.max(1, Math.ceil(characters.length / CHUNK_CHARS))
			};
			try {
				for (let i = 0; i < manifest.count; i++) {
					await store.setItem(
						chunkKey(key, manifest, i),
						characters.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS).join('')
					);
				}
				await store.setItem(key, JSON.stringify(manifest));
			} catch (error) {
				await clean(key, manifest);
				throw error;
			}
			await clean(key, previous);
		},
		async removeItem(key: string) {
			const previous = await readManifest(key);
			await store.removeItem(key);
			await clean(key, previous);
		}
	};

	let pending: Promise<unknown> = Promise.resolve();
	function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const result = pending.then(operation);
		pending = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	return {
		getItem: (key: string) => serialize(() => storage.getItem(key)),
		setItem: (key: string, value: string) => serialize(() => storage.setItem(key, value)),
		removeItem: (key: string) => serialize(() => storage.removeItem(key))
	};
}
