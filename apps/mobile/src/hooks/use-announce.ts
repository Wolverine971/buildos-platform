// apps/mobile/src/hooks/use-announce.ts
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { announcementFor, createAnnouncer } from '@/lib/announce';

function speak(message: string) {
	// Queued (iOS), so VoiceOver reading the key just tapped doesn't cut the message off.
	AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}

const announceOnce = createAnnouncer(speak);

/**
 * Speaks a status line with VoiceOver when it appears or changes to a new message. With a
 * `key`, a result shown on several screens at once is spoken only once.
 */
export function useAnnounce(message: string | null | undefined, key?: string) {
	const last = useRef<string | null>(null);
	useEffect(() => {
		const next = announcementFor(last.current, message);
		last.current = message?.trim() || null;
		if (!next) return;
		if (key) announceOnce(key, next);
		else speak(next);
	}, [message, key]);
}

/** True while VoiceOver (or TalkBack) is on. */
export function useScreenReader(): boolean {
	const [enabled, setEnabled] = useState(false);
	useEffect(() => {
		let alive = true;
		AccessibilityInfo.isScreenReaderEnabled()
			.then((on) => {
				if (alive) setEnabled(on);
			})
			.catch(() => {});
		const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);
	return enabled;
}
