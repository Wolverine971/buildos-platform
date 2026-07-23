// apps/web/src/sharp.d.ts
declare module 'sharp' {
	type WebpOptions = {
		quality?: number;
	};

	type ResizeOptions = {
		fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
	};

	type Metadata = {
		width?: number;
		height?: number;
	};

	type SharpInstance = {
		metadata(): Promise<Metadata>;
		webp(options?: WebpOptions): SharpInstance;
		resize(width?: number, height?: number, options?: ResizeOptions): SharpInstance;
		toBuffer(): Promise<Buffer>;
	};

	export default function sharp(input: Buffer | Uint8Array): SharpInstance;
}
