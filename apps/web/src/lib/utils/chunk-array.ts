/** Split an array into ordered copies containing at most `size` items. */
export function chunkArray<T>(values: readonly T[], size: number): T[][] {
	if (!Number.isInteger(size) || size <= 0) {
		throw new RangeError('chunkArray size must be a positive integer');
	}

	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}
