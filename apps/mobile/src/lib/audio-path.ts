// apps/mobile/src/lib/audio-path.ts
/**
 * Recordings are stored by their path inside the app's documents folder, not by absolute
 * URI: iOS moves the app's container (a new UUID in the path) when the app updates, so an
 * absolute `file:` URI saved today can point nowhere tomorrow.
 */

function withSlash(dir: string): string {
	return dir.endsWith('/') ? dir : `${dir}/`;
}

/** `file:///…/Documents/ExpoAudio/x.m4a` → `ExpoAudio/x.m4a`; anything outside stays as is. */
export function toStoredPath(uri: string, documentsUri: string): string {
	const base = withSlash(documentsUri);
	if (uri.startsWith(base)) return uri.slice(base.length);
	// `file:/` vs `file:///` spellings of the same folder.
	const bare = (value: string) => value.replace(/^file:\/*/, '/');
	const bareUri = bare(uri);
	const bareBase = bare(base);
	if (bareUri.startsWith(bareBase)) return bareUri.slice(bareBase.length);
	return uri;
}

/** The inverse: a stored path back to a URI under today's documents folder. */
export function resolveStoredPath(path: string, documentsUri: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
	return `${withSlash(documentsUri)}${path.replace(/^\/+/, '')}`;
}
