// apps/web/tailwind.config.js
// BuildOS "Inkprint" Design System - Tailwind Configuration

import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

/**
 * Modern color helper: uses Tailwind's <alpha-value> placeholder
 * so opacity modifiers (e.g. bg-accent/50) work with CSS variables.
 */
const hslVar = (varName) => `hsl(var(${varName}) / <alpha-value>)`;

export default {
	future: {
		hoverOnlyWhenSupported: true
	},
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			screens: {
				xs: '480px' // Extra small devices (large phones landscape)
			},

			// ============================================
			// Inkprint Color System
			// ============================================
			colors: {
				// Core semantic tokens (paper + ink + accent)
				background: hslVar('--background'),
				foreground: hslVar('--foreground'),
				border: hslVar('--border'),
				ring: hslVar('--ring'),

				// Card surfaces
				card: {
					DEFAULT: hslVar('--card'),
					foreground: hslVar('--card-foreground')
				},

				// Muted surfaces
				muted: {
					DEFAULT: hslVar('--muted'),
					foreground: hslVar('--muted-foreground')
				},

				// Accent (BuildOS signal color)
				accent: {
					DEFAULT: hslVar('--accent'),
					foreground: hslVar('--accent-foreground')
				},

				// Destructive (danger/error actions)
				destructive: {
					DEFAULT: hslVar('--destructive'),
					foreground: hslVar('--destructive-foreground')
				},

				// Warning (attention states)
				warning: {
					DEFAULT: hslVar('--warning'),
					foreground: hslVar('--warning-foreground')
				},

				// Success (positive/completed states)
				success: {
					DEFAULT: hslVar('--success'),
					foreground: hslVar('--success-foreground')
				},

				// Status colors (paired with textures per design bible)
				danger: {
					DEFAULT: hslVar('--danger'),
					foreground: hslVar('--danger-foreground')
				},
				info: {
					DEFAULT: hslVar('--info'),
					foreground: hslVar('--info-foreground')
				}
			},

			// ============================================
			// Inkprint Shadows
			// ============================================
			boxShadow: {
				ink: 'var(--shadow-ink)',
				'ink-strong': 'var(--shadow-ink-strong)',
				'ink-inner': 'var(--shadow-ink-inner)'
			},

			// ============================================
			// Typography
			// ============================================
			fontFamily: {
				// Primary font for UI/Action items
				ui: ['Inter', 'Söhne', 'GT America', 'system-ui', '-apple-system', 'sans-serif'],
				// Secondary font for notes/scratch areas
				notes: ['IBM Plex Serif', 'Literata', 'serif']
			},

			// ============================================
			// Inkprint Animation System
			// ============================================
			animation: {
				// Core ink animations
				'ink-in': 'inkIn 180ms cubic-bezier(0.4, 0, 0.2, 1)',
				'ink-out': 'inkOut 120ms cubic-bezier(0.4, 0, 0.2, 1)',

				// Utility animations
				'fade-in': 'fadeIn 200ms ease-out',
				'slide-up': 'slideUp 200ms ease-out',
				'scale-in': 'scaleIn 150ms ease-out',
				shimmer: 'shimmer 2s linear infinite'
			},

			keyframes: {
				// Ink set motion (quick settle, minimal bounce)
				inkIn: {
					'0%': { opacity: '0', transform: 'translateY(4px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				inkOut: {
					'0%': { opacity: '1', transform: 'translateY(0)' },
					'100%': { opacity: '0', transform: 'translateY(-4px)' }
				},
				fadeIn: {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				slideUp: {
					'0%': { transform: 'translateY(8px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				scaleIn: {
					'0%': { transform: 'scale(0.95)', opacity: '0' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				shimmer: {
					'0%': { backgroundPosition: '-1000px 0' },
					'100%': { backgroundPosition: '1000px 0' }
				}
			},

			// ============================================
			// Border Radius (softer rectangles)
			// ============================================
			borderRadius: {
				sm: '4px',
				DEFAULT: '6px',
				md: '8px',
				lg: '12px',
				xl: '16px',
				'2xl': '20px',
				'3xl': '24px'
			},

			// ============================================
			// Spacing (8px grid with dense options)
			// ============================================
			spacing: {
				18: '4.5rem',
				88: '22rem',
				120: '30rem',
				// Dense spacing scale for high information density
				'dense-3': '0.5rem', // 8px
				'dense-4': '0.625rem', // 10px
				'dense-5': '0.75rem', // 12px
				'dense-6': '0.875rem', // 14px
				'dense-8': '1rem', // 16px
				'dense-12': '1.5rem', // 24px
				'dense-14': '2rem', // 32px
				'dense-16': '2.25rem', // 36px
				'dense-20': '2.5rem' // 40px
			},

			// Max width for dense layouts
			maxWidth: {
				'dense-7xl': '64rem'
			},

			// ============================================
			// Transition Timing
			// ============================================
			transitionTimingFunction: {
				ink: 'cubic-bezier(0.4, 0, 0.2, 1)',
				snap: 'cubic-bezier(0.2, 1, 0.2, 1)'
			},

			// ============================================
			// Typography Plugin Configuration
			// ============================================
			typography: (theme) => ({
				DEFAULT: {
					css: {
						maxWidth: 'none',
						color: 'hsl(var(--foreground))',
						lineHeight: theme('lineHeight.relaxed'),
						a: {
							color: 'hsl(var(--accent))',
							textDecoration: 'none',
							fontWeight: theme('fontWeight.medium'),
							'&:hover': {
								textDecoration: 'underline'
							}
						},
						strong: {
							color: 'hsl(var(--foreground))',
							fontWeight: theme('fontWeight.semibold')
						},
						h1: {
							color: 'hsl(var(--foreground))',
							fontWeight: theme('fontWeight.bold')
						},
						h2: {
							color: 'hsl(var(--foreground))',
							fontWeight: theme('fontWeight.semibold')
						},
						h3: {
							color: 'hsl(var(--foreground))',
							fontWeight: theme('fontWeight.semibold')
						},
						h4: {
							color: 'hsl(var(--foreground))',
							fontWeight: theme('fontWeight.semibold')
						},
						code: {
							color: 'hsl(var(--foreground))',
							backgroundColor: 'hsl(var(--muted))',
							paddingLeft: theme('spacing.1'),
							paddingRight: theme('spacing.1'),
							paddingTop: '0.125rem',
							paddingBottom: '0.125rem',
							borderRadius: theme('borderRadius.sm'),
							fontSize: theme('fontSize.sm')[0],
							fontWeight: theme('fontWeight.medium')
						},
						'code::before': { content: 'none' },
						'code::after': { content: 'none' },
						pre: {
							backgroundColor: 'hsl(var(--muted))',
							color: 'hsl(var(--foreground))',
							borderRadius: theme('borderRadius.lg'),
							padding: theme('spacing.4')
						},
						blockquote: {
							borderLeftColor: 'hsl(var(--border))',
							color: 'hsl(var(--muted-foreground))'
						},
						hr: {
							borderColor: 'hsl(var(--border))'
						},
						'ul > li::marker': {
							color: 'hsl(var(--muted-foreground))'
						},
						'ol > li::marker': {
							color: 'hsl(var(--muted-foreground))'
						},
						thead: {
							borderBottomColor: 'hsl(var(--border))'
						},
						'tbody tr': {
							borderBottomColor: 'hsl(var(--border))'
						}
					}
				},
				invert: {
					css: {
						'--tw-prose-body': 'hsl(var(--foreground))',
						'--tw-prose-headings': 'hsl(var(--foreground))',
						'--tw-prose-links': 'hsl(var(--accent))',
						'--tw-prose-bold': 'hsl(var(--foreground))',
						'--tw-prose-counters': 'hsl(var(--muted-foreground))',
						'--tw-prose-bullets': 'hsl(var(--muted-foreground))',
						'--tw-prose-hr': 'hsl(var(--border))',
						'--tw-prose-quotes': 'hsl(var(--muted-foreground))',
						'--tw-prose-quote-borders': 'hsl(var(--border))',
						'--tw-prose-code': 'hsl(var(--foreground))',
						'--tw-prose-pre-code': 'hsl(var(--foreground))',
						'--tw-prose-pre-bg': 'hsl(var(--muted))',
						'--tw-prose-th-borders': 'hsl(var(--border))',
						'--tw-prose-td-borders': 'hsl(var(--border))'
					}
				}
			}),

			// Backdrop filters
			backdropBlur: {
				xs: '2px',
				sm: '4px',
				md: '8px',
				lg: '12px',
				xl: '16px'
			}
		}
	},

	plugins: [
		forms,
		typography,
		// Custom Inkprint utilities
		function ({ addUtilities }) {
			addUtilities({
				// Gradient text utility
				'.text-gradient': {
					'background-clip': 'text',
					'-webkit-background-clip': 'text',
					'-webkit-text-fill-color': 'transparent',
					'background-image': 'linear-gradient(to right, var(--tw-gradient-stops))'
				},
				// Scrollbar utilities
				'.scrollbar-thin': {
					'scrollbar-width': 'thin'
				},
				'.scrollbar-none': {
					'scrollbar-width': 'none',
					'&::-webkit-scrollbar': {
						display: 'none'
					}
				}
			});
		}
	]
};
