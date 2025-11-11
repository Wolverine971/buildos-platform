/**
 * Ensures CommonJS consumers of `brace-expansion` receive a callable export
 * even when pnpm overrides resolve to the modern ESM build (v4+).
 */
try {
	const bracePath = require.resolve('brace-expansion');
	const loaded = require(bracePath);

	if (typeof loaded !== 'function') {
		const fallback = typeof loaded?.default === 'function' ? loaded.default : null;

		if (fallback) {
			const shim = (...args) => fallback(...args);
			Object.assign(shim, fallback);
			shim.default = fallback;

			const cacheEntry = require.cache[bracePath];
			if (cacheEntry) {
				cacheEntry.exports = shim;
			}
		}
	}
} catch (error) {
	console.warn('[brace-expansion-shim] Failed to normalize export:', error?.message ?? error);
}
