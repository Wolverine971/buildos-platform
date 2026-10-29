// apps/mobile/src/hooks/use-keyboard-inset.ts
import { type ComponentRef, type RefObject, useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type View } from 'react-native';

/**
 * How far the iOS keyboard covers a bar pinned near the bottom of the screen, so the bar can
 * ride on top of it. Measured from where the bar actually sits, so it is right above a tab bar
 * as well as at the screen edge. Android resizes the window itself (adjustResize), so this
 * stays 0 there.
 */
export function useKeyboardOverlap(ref: RefObject<ComponentRef<typeof View> | null>): number {
	const [overlap, setOverlap] = useState(0);
	const current = useRef(0);

	useEffect(() => {
		if (Platform.OS !== 'ios') return;
		const apply = (value: number, duration: number) => {
			if (value === current.current) return;
			LayoutAnimation.configureNext({
				duration: duration || 250,
				update: { type: LayoutAnimation.Types.keyboard }
			});
			current.current = value;
			setOverlap(value);
		};
		const show = Keyboard.addListener('keyboardWillShow', (event) => {
			const keyboardTop = event.endCoordinates.screenY;
			const view = ref.current;
			if (!view) {
				apply(event.endCoordinates.height, event.duration);
				return;
			}
			view.measureInWindow((_x: number, y: number, _width: number, height: number) => {
				// The bar is already lifted by the current overlap; its resting bottom is lower.
				const restingBottom = y + height + current.current;
				apply(Math.max(0, restingBottom - keyboardTop), event.duration);
			});
		});
		const hide = Keyboard.addListener('keyboardWillHide', (event) => apply(0, event.duration));
		return () => {
			show.remove();
			hide.remove();
		};
	}, [ref]);

	return overlap;
}
