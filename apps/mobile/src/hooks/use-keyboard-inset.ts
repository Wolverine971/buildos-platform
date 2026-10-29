// apps/mobile/src/hooks/use-keyboard-inset.ts
import {
	type ComponentRef,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState
} from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type View } from 'react-native';

import { measuredBarOverlap, screenBottomOverlap } from '@/lib/keyboard-lift';

export type KeyboardOverlapOptions = {
	/**
	 * Rise only while true, e.g. while this bar's own input has focus, so another field's
	 * keyboard (the Workspace search) leaves the bar docked. Default true.
	 */
	active?: boolean;
	/**
	 * The bar rests on the screen's bottom edge (the reader's full-height form sheet). Skips
	 * `measureInWindow`, which inside a native modal measures from the sheet's top, not the
	 * window's.
	 */
	restsOnScreenBottom?: boolean;
};

/**
 * How far to lift a bar pinned near the bottom of the screen so it rides on top of the iOS
 * keyboard. Measured from where the bar actually sits, so it is right above a tab bar as well
 * as at the screen edge. Android resizes the window itself (adjustResize), so this stays 0
 * there.
 */
export function useKeyboardOverlap(
	ref: RefObject<ComponentRef<typeof View> | null>,
	{ active = true, restsOnScreenBottom = false }: KeyboardOverlapOptions = {}
): number {
	const [lift, setLift] = useState(0);
	/** How far the keyboard covers the bar's resting spot (0 while it is down). */
	const overlap = useRef(0);
	/** The lift last asked for. */
	const target = useRef(0);
	/** The lift in the committed layout, which is what `measureInWindow` sees. */
	const committed = useRef(0);
	const activeRef = useRef(active);

	useLayoutEffect(() => {
		committed.current = lift;
	}, [lift]);

	const draw = useCallback((value: number, duration: number) => {
		if (value === target.current) return;
		LayoutAnimation.configureNext({
			duration: duration || 250,
			update: { type: LayoutAnimation.Types.keyboard }
		});
		target.current = value;
		setLift(value);
	}, []);

	// Focus can arrive before or after the keyboard's event; either way the bar moves on the
	// keyboard's curve.
	useEffect(() => {
		activeRef.current = active;
		draw(active ? overlap.current : 0, 0);
	}, [active, draw]);

	useEffect(() => {
		if (Platform.OS !== 'ios') return;
		const update = (value: number, duration: number) => {
			overlap.current = value;
			if (activeRef.current) draw(value, duration);
		};
		const show = Keyboard.addListener('keyboardWillShow', (event) => {
			const keyboardTop = event.endCoordinates.screenY;
			if (restsOnScreenBottom) {
				update(
					screenBottomOverlap(Dimensions.get('window').height, keyboardTop),
					event.duration
				);
				return;
			}
			const view = ref.current;
			if (!view) {
				update(event.endCoordinates.height, event.duration);
				return;
			}
			view.measureInWindow((_x: number, y: number, _width: number, height: number) => {
				update(measuredBarOverlap(y + height, committed.current, keyboardTop), event.duration);
			});
		});
		const hide = Keyboard.addListener('keyboardWillHide', (event) => update(0, event.duration));
		return () => {
			show.remove();
			hide.remove();
		};
	}, [ref, restsOnScreenBottom, draw]);

	return lift;
}
