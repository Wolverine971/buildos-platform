// apps/web/src/lib/utils/return-refresh.ts
//
// "Catch up when the person comes back" without refetching on every alt-tab: the
// callback runs only when the page returns (focus, or the tab shown again) after
// being away for a while. Changes made on this page already arrive through
// mutation events; this is for changes made elsewhere (another device, an agent).

/** Away for at least this long before a return refreshes anything. */
export const RETURN_REFRESH_AWAY_MS = 60_000;

export function onReturnAfterAway(
	onReturn: () => void,
	options: { awayMs?: number; now?: () => number } = {}
): () => void {
	const awayMs = options.awayMs ?? RETURN_REFRESH_AWAY_MS;
	const now = options.now ?? (() => Date.now());
	let leftAt: number | null = null;

	const leave = () => {
		leftAt ??= now();
	};
	const back = () => {
		if (leftAt === null) return;
		const away = now() - leftAt;
		leftAt = null;
		if (away >= awayMs) onReturn();
	};
	const visibility = () => (document.visibilityState === 'hidden' ? leave() : back());

	window.addEventListener('blur', leave);
	window.addEventListener('focus', back);
	document.addEventListener('visibilitychange', visibility);
	return () => {
		window.removeEventListener('blur', leave);
		window.removeEventListener('focus', back);
		document.removeEventListener('visibilitychange', visibility);
	};
}
