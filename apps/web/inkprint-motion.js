// apps/web/inkprint-motion.js
/** Canonical Inkprint motion tokens shared by Tailwind and the public CSS bundle. */
export const inkprintAnimation = {
	'ink-in': 'inkIn 180ms cubic-bezier(0.4, 0, 0.2, 1)',
	'ink-out': 'inkOut 120ms cubic-bezier(0.4, 0, 0.2, 1)'
};

export const inkprintKeyframes = {
	inkIn: {
		'0%': { opacity: '0', transform: 'translateY(4px)' },
		'100%': { opacity: '1', transform: 'translateY(0)' }
	},
	inkOut: {
		'0%': { opacity: '1', transform: 'translateY(0)' },
		'100%': { opacity: '0', transform: 'translateY(-4px)' }
	}
};
