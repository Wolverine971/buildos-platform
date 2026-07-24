export type SearchTokenizationOptions = {
	preserveUnderscores?: boolean;
};

/** Tokenize search text while allowing callers to preserve their identifier semantics. */
export function tokenizeSearchText(
	value: string,
	options: SearchTokenizationOptions = {}
): string[] {
	const delimiter = options.preserveUnderscores === false ? /[^a-z0-9]+/ : /[^a-z0-9_]+/;
	return value
		.trim()
		.toLowerCase()
		.split(delimiter)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

/** Convert the shared 220-point search score scale to a bounded confidence. */
export function confidenceFromScore(score: number): number {
	if (score <= 0) return 0;
	return Math.min(0.95, Math.max(0.35, Number((score / 220).toFixed(2))));
}
