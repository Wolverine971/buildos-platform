// apps/mobile/src/components/today/use-now.ts
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time in ms, updated as each minute turns over and when the app comes back to the
 * foreground. Drives Today's "now" line, Up next, and the day the feed is fetched for.
 */
export function useNow(stepMs = 60_000): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		// Land just after the boundary so the minute shown has really turned.
		const schedule = () => {
			clearTimeout(timer);
			timer = setTimeout(tick, stepMs - (Date.now() % stepMs) + 50);
		};
		const tick = () => {
			setNow(Date.now());
			schedule();
		};
		schedule();
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active') tick();
		});
		return () => {
			clearTimeout(timer);
			sub.remove();
		};
	}, [stepMs]);

	return now;
}
