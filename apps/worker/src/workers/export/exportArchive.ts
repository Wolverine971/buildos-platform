// apps/worker/src/workers/export/exportArchive.ts
//
// Streams files into zip parts with fflate. Output chunks are kept only for the
// part being written; when the next file would push the part past its cap, the
// part is closed and handed to `onPart` (the upload), then a fresh zip starts.
// Each part is a complete zip. Memory stays near one part plus one file.
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';

export type ArchivePart = { index: number; bytes: Uint8Array; fileCount: number };

// Beyond the file data, each entry costs a local header (30), a data descriptor
// (16) and a central directory record (46), the first and last with the name.
const ENTRY_OVERHEAD_BYTES = 92;
const CENTRAL_RECORD_BYTES = 46;
const END_RECORD_BYTES = 22;

export class PartedZipWriter {
	private zip: Zip | null = null;
	private chunks: Uint8Array[] = [];
	private emitted = 0;
	private centralDirectory = 0;
	private files = 0;
	private partIndex = 0;
	private failure: Error | null = null;
	readonly parts: Array<{ index: number; bytes: number; files: number }> = [];

	constructor(
		private readonly options: {
			maxPartBytes: number;
			onPart: (part: ArchivePart) => Promise<void>;
		}
	) {}

	/** Text is deflated; already-compressed media (audio, images) is stored as is. */
	async addFile(
		path: string,
		data: string | Uint8Array,
		options: { compress?: boolean } = {}
	): Promise<void> {
		const bytes = typeof data === 'string' ? strToU8(data) : data;
		const nameBytes = strToU8(path).length;
		const worstCase = bytes.length + ENTRY_OVERHEAD_BYTES + 2 * nameBytes;
		if (
			this.zip &&
			this.files > 0 &&
			this.emitted + this.centralDirectory + worstCase + END_RECORD_BYTES >
				this.options.maxPartBytes
		) {
			await this.closePart();
		}

		const zip = this.zip ?? this.openPart();
		const entry =
			options.compress === false
				? new ZipPassThrough(path)
				: new ZipDeflate(path, { level: 6 });
		zip.add(entry);
		entry.push(bytes, true);
		this.centralDirectory += CENTRAL_RECORD_BYTES + nameBytes;
		this.files += 1;
		if (this.failure) throw this.failure;
	}

	async finish(): Promise<{ partCount: number; totalBytes: number }> {
		if (this.zip) await this.closePart();
		return {
			partCount: this.parts.length,
			totalBytes: this.parts.reduce((total, part) => total + part.bytes, 0)
		};
	}

	private openPart(): Zip {
		this.partIndex += 1;
		this.chunks = [];
		this.emitted = 0;
		this.centralDirectory = 0;
		this.files = 0;
		const zip = new Zip((error, data) => {
			if (error) {
				this.failure = error;
				return;
			}
			this.chunks.push(data);
			this.emitted += data.length;
		});
		this.zip = zip;
		return zip;
	}

	private async closePart(): Promise<void> {
		const zip = this.zip;
		if (!zip) return;
		zip.end();
		this.zip = null;
		if (this.failure) throw this.failure;

		const bytes = new Uint8Array(this.emitted);
		let offset = 0;
		for (const chunk of this.chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		this.chunks = [];
		this.parts.push({ index: this.partIndex, bytes: bytes.length, files: this.files });
		await this.options.onPart({ index: this.partIndex, bytes, fileCount: this.files });
	}
}
