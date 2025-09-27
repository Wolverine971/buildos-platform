// src/lib/utils/pgvector.ts
export function toVectorLiteral(vec: number[]): string {
	// Normalise first if you like
	const norm = Math.hypot(...vec);
	const v = vec.map((x) => x / norm); // ← remove this line if you don’t want cosine‑unit vectors
	return `[${v.join(',')}]`; // pgvector literal format
}
