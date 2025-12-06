// apps/web/tailwind.config.js
// import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

/** Helper: lets Tailwind's opacity API work with CSS variables */
const withOpacity = (varName) => {
	return ({ opacityValue }) =>
		opacityValue === undefined
			? `hsl(var(${varName}))`
			: `hsl(var(${varName}) / ${opacityValue})`;
};

export default {
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}'
		// Include any other paths where you have Tailwind classes
	],
	theme: {
		extend: {
			screens: {
				xs: '480px' // Extra small devices (large phones landscape)
			},
			colors: {
				background: withOpacity('--background'),
				foreground: withOpacity('--foreground'),
				border: withOpacity('--border'),
				primary: {
					50: '#eff6ff',
					100: '#dbeafe',
					200: '#bfdbfe',
					300: '#93c5fd',
					400: '#60a5fa',
					500: '#3b82f6',
					600: '#2563eb',
					700: '#1d4ed8',
					800: '#1e40af',
					900: '#1e3a8a',
					950: '#172554'
				},
				// Semantic color aliases for consistency
				success: {
					light: '#10b981',
					DEFAULT: '#059669',
					dark: '#047857'
				},
				warning: {
					light: '#f59e0b',
					DEFAULT: '#d97706',
					dark: '#b45309'
				},
				danger: {
					light: '#f43f5e',
					DEFAULT: '#e11d48',
					dark: '#be123c'
				},
				info: {
					light: '#6366f1',
					DEFAULT: '#4f46e5',
					dark: '#4338ca'
				},
				// Scratchpad Ops Design System Colors
				slate: {
					50: '#f8fafc',
					100: '#f1f5f9',
					200: '#e2e8f0',
					300: '#cbd5e1',
					400: '#94a3b8',
					500: '#3E4459', // Custom
					600: '#475569',
					700: '#2D3242', // Custom
					800: '#1e293b',
					900: '#1A1F2B', // Custom
					950: '#0f172a'
				},
				accent: {
					orange: 'var(--accent-orange)',
					blue: 'var(--accent-blue)',
					olive: 'var(--accent-olive)'
				},
				surface: {
					scratch: 'var(--surface-scratch)',
					panel: 'var(--surface-panel)',
					elevated: 'var(--surface-elevated)',
					clarity: 'var(--surface-clarity)',
					rune: '#252525'
				}
			},
			// Custom animations for our design system
			animation: {
				'slide-up': 'slideUp 0.3s ease-out',
				'slide-down': 'slideDown 0.3s ease-out',
				'fade-in': 'fadeIn 0.3s ease-out',
				'scale-in': 'scaleIn 0.2s ease-out',
				'pulse-accent': 'pulseAccent 1.4s ease-in-out infinite',
				shimmer: 'shimmer 2s linear infinite'
			},
			keyframes: {
				slideUp: {
					'0%': { transform: 'translateY(20px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				slideDown: {
					'0%': { transform: 'translateY(-20px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				fadeIn: {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				scaleIn: {
					'0%': { transform: 'scale(0.95)', opacity: '0' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				pulseAccent: {
					'0%, 100%': {
						transform: 'scale(1)',
						boxShadow: '0 0 0 0 rgba(79, 70, 229, 0.25)'
					},
					'50%': {
						transform: 'scale(1.02)',
						boxShadow: '0 0 0 14px rgba(79, 70, 229, 0.07)'
					}
				},
				shimmer: {
					'0%': { backgroundPosition: '-1000px 0' },
					'100%': { backgroundPosition: '1000px 0' }
				}
			},
			// Custom background patterns
			backgroundImage: {
				'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
				'gradient-conic':
					'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
				// Status gradients for cards
				'gradient-blue':
					'linear-gradient(to right, rgba(239, 246, 255, 0.5), rgba(219, 234, 254, 0.5))',
				'gradient-emerald':
					'linear-gradient(to right, rgba(236, 253, 245, 0.5), rgba(209, 250, 229, 0.5))',
				'gradient-amber':
					'linear-gradient(to right, rgba(255, 251, 235, 0.5), rgba(254, 243, 199, 0.5))',
				'gradient-rose':
					'linear-gradient(to right, rgba(255, 241, 242, 0.5), rgba(255, 228, 230, 0.5))',
				'gradient-purple':
					'linear-gradient(to right, rgba(245, 243, 255, 0.5), rgba(237, 233, 254, 0.5))'
			},
			// Custom shadows for depth
			boxShadow: {
				soft: '0 2px 8px -2px rgba(0, 0, 0, 0.1)',
				glow: '0 0 20px rgba(59, 130, 246, 0.5)',
				'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
				card: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
				'card-hover':
					'0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
				pressable: '0 2px 0 rgba(0,0,0,0.3)',
				subtle: '0 1px 3px rgba(0,0,0,0.08)'
			},
			// Custom border radius for modern feel
			borderRadius: {
				sm: '3px',
				DEFAULT: '4px',
				md: '6px',
				lg: '8px',
				xl: '0.75rem',
				'2xl': '1rem',
				'3xl': '1.5rem'
			},
			// Custom spacing for consistent layout
			spacing: {
				18: '4.5rem',
				88: '22rem',
				120: '30rem',
				// Dense spacing scale for ontology section (high information density)
				'dense-3': '0.5rem', // 8px  - replaces gap-3
				'dense-4': '0.625rem', // 10px - replaces gap-4, p-4, mb-4
				'dense-5': '0.75rem', // 12px - replaces gap-5, p-5, mb-5
				'dense-6': '0.875rem', // 14px - replaces gap-6, p-6, mb-6
				'dense-8': '1rem', // 16px - replaces mb-8, py-8
				'dense-12': '1.5rem', // 24px - replaces mb-12, py-12
				'dense-14': '2rem', // 32px - replaces py-14
				'dense-16': '2.25rem', // 36px - replaces py-16
				'dense-20': '2.5rem' // 40px - replaces py-20
			},
			// Max width override for dense layouts
			maxWidth: {
				'dense-7xl': '64rem' // Tighter than default 80rem for max-w-7xl
			},
			// Font family extensions - Scratchpad Ops design system
			fontFamily: {
				// Primary font for UI/Action items
				ui: [
					'Inter',
					'Söhne',
					'GT America',
					'IBM Plex Sans',
					'system-ui',
					'-apple-system',
					'sans-serif'
				],
				// Secondary font for notes/scratch areas
				notes: ['IBM Plex Serif', 'Literata', 'serif'],
				// Compatibility aliases
				display: ['Inter', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
				body: ['Inter', 'SF Pro Text', 'system-ui', '-apple-system', 'sans-serif']
			},
			typography: (theme) => ({
				DEFAULT: {
					css: {
						maxWidth: 'none',
						color: theme('colors.gray.700'),
						lineHeight: theme('lineHeight.relaxed'),
						'[class~="lead"]': {
							color: theme('colors.gray.600')
						},
						a: {
							color: theme('colors.blue.600'),
							textDecoration: 'none',
							fontWeight: theme('fontWeight.medium'),
							'&:hover': {
								color: theme('colors.blue.800'),
								textDecoration: 'underline'
							}
						},
						strong: {
							color: theme('colors.gray.900'),
							fontWeight: theme('fontWeight.semibold')
						},
						'ol[type="A"]': {
							'--list-counter-style': 'upper-alpha'
						},
						'ol[type="a"]': {
							'--list-counter-style': 'lower-alpha'
						},
						'ol[type="A" s]': {
							'--list-counter-style': 'upper-alpha'
						},
						'ol[type="a" s]': {
							'--list-counter-style': 'lower-alpha'
						},
						'ol[type="I"]': {
							'--list-counter-style': 'upper-roman'
						},
						'ol[type="i"]': {
							'--list-counter-style': 'lower-roman'
						},
						'ol[type="I" s]': {
							'--list-counter-style': 'upper-roman'
						},
						'ol[type="i" s]': {
							'--list-counter-style': 'lower-roman'
						},
						'ol[type="1"]': {
							'--list-counter-style': 'decimal'
						},
						'ol > li': {
							position: 'relative'
						},
						'ol > li::marker': {
							fontWeight: theme('fontWeight.normal'),
							color: theme('colors.gray.500')
						},
						'ul > li': {
							position: 'relative'
						},
						'ul > li::marker': {
							color: theme('colors.gray.400')
						},
						hr: {
							borderColor: theme('colors.gray.200'),
							borderTopWidth: 1,
							marginTop: theme('spacing.8'),
							marginBottom: theme('spacing.8')
						},
						blockquote: {
							fontWeight: theme('fontWeight.normal'),
							fontStyle: 'normal',
							color: theme('colors.gray.700'),
							borderLeftWidth: '0.25rem',
							borderLeftColor: theme('colors.gray.200'),
							quotes: '"\\201C""\\201D""\\2018""\\2019"',
							marginTop: theme('spacing.6'),
							marginBottom: theme('spacing.6'),
							paddingLeft: theme('spacing.4')
						},
						h1: {
							color: theme('colors.gray.900'),
							fontWeight: theme('fontWeight.bold'),
							fontSize: theme('fontSize.2xl')[0],
							lineHeight: theme('fontSize.2xl')[1].lineHeight,
							marginBottom: theme('spacing.4')
						},
						h2: {
							color: theme('colors.gray.900'),
							fontWeight: theme('fontWeight.semibold'),
							fontSize: theme('fontSize.xl')[0],
							lineHeight: theme('fontSize.xl')[1].lineHeight,
							marginTop: theme('spacing.6'),
							marginBottom: theme('spacing.3')
						},
						h3: {
							color: theme('colors.gray.900'),
							fontWeight: theme('fontWeight.semibold'),
							fontSize: theme('fontSize.lg')[0],
							lineHeight: theme('fontSize.lg')[1].lineHeight,
							marginTop: theme('spacing.5'),
							marginBottom: theme('spacing.2')
						},
						h4: {
							color: theme('colors.gray.900'),
							fontWeight: theme('fontWeight.semibold'),
							marginTop: theme('spacing.4'),
							marginBottom: theme('spacing.2')
						},
						'figure figcaption': {
							textAlign: 'center',
							fontStyle: 'italic'
						},
						code: {
							color: theme('colors.gray.800'),
							backgroundColor: theme('colors.gray.100'),
							paddingLeft: theme('spacing.1'),
							paddingRight: theme('spacing.1'),
							paddingTop: theme('spacing.0.5'),
							paddingBottom: theme('spacing.0.5'),
							borderRadius: theme('borderRadius.sm'),
							fontSize: theme('fontSize.sm')[0],
							fontWeight: theme('fontWeight.medium')
						},
						'code::before': {
							content: 'none'
						},
						'code::after': {
							content: 'none'
						},
						pre: {
							color: theme('colors.gray.200'),
							backgroundColor: theme('colors.gray.800'),
							overflowX: 'auto',
							fontWeight: theme('fontWeight.normal'),
							fontSize: theme('fontSize.sm')[0],
							lineHeight: theme('fontSize.sm')[1].lineHeight,
							marginTop: theme('spacing.4'),
							marginBottom: theme('spacing.4'),
							borderRadius: theme('borderRadius.lg'),
							paddingTop: theme('spacing.3'),
							paddingRight: theme('spacing.4'),
							paddingBottom: theme('spacing.3'),
							paddingLeft: theme('spacing.4')
						},
						'pre code': {
							backgroundColor: 'transparent',
							borderWidth: '0',
							borderRadius: '0',
							padding: '0',
							fontWeight: 'inherit',
							color: 'inherit',
							fontSize: 'inherit',
							fontFamily: 'inherit',
							lineHeight: 'inherit'
						},
						table: {
							width: '100%',
							tableLayout: 'auto',
							textAlign: 'left',
							marginTop: theme('spacing.6'),
							marginBottom: theme('spacing.6'),
							fontSize: theme('fontSize.sm')[0],
							lineHeight: theme('fontSize.sm')[1].lineHeight
						},
						thead: {
							borderBottomWidth: '1px',
							borderBottomColor: theme('colors.gray.300')
						},
						'thead th': {
							color: theme('colors.gray.900'),
							fontWeight: theme('fontWeight.semibold'),
							verticalAlign: 'bottom',
							paddingRight: theme('spacing.2'),
							paddingBottom: theme('spacing.2'),
							paddingLeft: theme('spacing.2')
						},
						'tbody tr': {
							borderBottomWidth: '1px',
							borderBottomColor: theme('colors.gray.200')
						},
						'tbody tr:last-child': {
							borderBottomWidth: '0'
						},
						'tbody td': {
							verticalAlign: 'baseline',
							paddingTop: theme('spacing.2'),
							paddingRight: theme('spacing.2'),
							paddingBottom: theme('spacing.2'),
							paddingLeft: theme('spacing.2')
						}
					}
				},
				// Add the gray variant for better color control
				gray: {
					css: {
						'--tw-prose-body': theme('colors.gray.700'),
						'--tw-prose-headings': theme('colors.gray.900'),
						'--tw-prose-lead': theme('colors.gray.600'),
						'--tw-prose-links': theme('colors.blue.600'),
						'--tw-prose-bold': theme('colors.gray.900'),
						'--tw-prose-counters': theme('colors.gray.500'),
						'--tw-prose-bullets': theme('colors.gray.400'),
						'--tw-prose-hr': theme('colors.gray.200'),
						'--tw-prose-quotes': theme('colors.gray.900'),
						'--tw-prose-quote-borders': theme('colors.gray.200'),
						'--tw-prose-captions': theme('colors.gray.500'),
						'--tw-prose-code': theme('colors.gray.900'),
						'--tw-prose-pre-code': theme('colors.gray.200'),
						'--tw-prose-pre-bg': theme('colors.gray.800'),
						'--tw-prose-th-borders': theme('colors.gray.300'),
						'--tw-prose-td-borders': theme('colors.gray.200'),
						'--tw-prose-invert-body': theme('colors.gray.300'),
						'--tw-prose-invert-headings': theme('colors.white'),
						'--tw-prose-invert-lead': theme('colors.gray.400'),
						'--tw-prose-invert-links': theme('colors.blue.400'),
						'--tw-prose-invert-bold': theme('colors.white'),
						'--tw-prose-invert-counters': theme('colors.gray.400'),
						'--tw-prose-invert-bullets': theme('colors.gray.600'),
						'--tw-prose-invert-hr': theme('colors.gray.700'),
						'--tw-prose-invert-quotes': theme('colors.gray.100'),
						'--tw-prose-invert-quote-borders': theme('colors.gray.700'),
						'--tw-prose-invert-captions': theme('colors.gray.400'),
						'--tw-prose-invert-code': theme('colors.white'),
						'--tw-prose-invert-pre-code': theme('colors.gray.300'),
						'--tw-prose-invert-pre-bg': theme('colors.gray.900'),
						'--tw-prose-invert-th-borders': theme('colors.gray.600'),
						'--tw-prose-invert-td-borders': theme('colors.gray.700')
					}
				},
				invert: {
					css: {
						'--tw-prose-body': theme('colors.gray.300'),
						'--tw-prose-headings': theme('colors.white'),
						'--tw-prose-lead': theme('colors.gray.400'),
						'--tw-prose-links': theme('colors.blue.400'),
						'--tw-prose-bold': theme('colors.white'),
						'--tw-prose-counters': theme('colors.gray.400'),
						'--tw-prose-bullets': theme('colors.gray.600'),
						'--tw-prose-hr': theme('colors.gray.700'),
						'--tw-prose-quotes': theme('colors.gray.100'),
						'--tw-prose-quote-borders': theme('colors.gray.700'),
						'--tw-prose-captions': theme('colors.gray.400'),
						'--tw-prose-code': theme('colors.white'),
						'--tw-prose-pre-code': theme('colors.gray.300'),
						'--tw-prose-pre-bg': theme('colors.gray.900'),
						'--tw-prose-th-borders': theme('colors.gray.600'),
						'--tw-prose-td-borders': theme('colors.gray.700'),
						'--tw-prose-invert-body': theme('colors.gray.200'),
						'--tw-prose-invert-headings': theme('colors.white'),
						'--tw-prose-invert-lead': theme('colors.gray.300'),
						'--tw-prose-invert-links': theme('colors.blue.400'),
						'--tw-prose-invert-bold': theme('colors.white'),
						'--tw-prose-invert-counters': theme('colors.gray.400'),
						'--tw-prose-invert-bullets': theme('colors.gray.600'),
						'--tw-prose-invert-hr': theme('colors.gray.700'),
						'--tw-prose-invert-quotes': theme('colors.gray.100'),
						'--tw-prose-invert-quote-borders': theme('colors.gray.700'),
						'--tw-prose-invert-captions': theme('colors.gray.400'),
						'--tw-prose-invert-code': theme('colors.white'),
						'--tw-prose-invert-pre-code': theme('colors.gray.300'),
						'--tw-prose-invert-pre-bg': 'rgb(0 0 0 / 50%)',
						'--tw-prose-invert-th-borders': theme('colors.gray.600'),
						'--tw-prose-invert-td-borders': theme('colors.gray.700')
					}
				},
				sm: {
					css: {
						fontSize: theme('fontSize.sm')[0],
						lineHeight: theme('fontSize.sm')[1].lineHeight,
						h1: {
							fontSize: theme('fontSize.xl')[0],
							lineHeight: theme('fontSize.xl')[1].lineHeight,
							marginBottom: theme('spacing.3')
						},
						h2: {
							fontSize: theme('fontSize.lg')[0],
							lineHeight: theme('fontSize.lg')[1].lineHeight,
							marginTop: theme('spacing.4'),
							marginBottom: theme('spacing.2')
						},
						h3: {
							fontSize: theme('fontSize.base')[0],
							lineHeight: theme('fontSize.base')[1].lineHeight,
							marginTop: theme('spacing.3'),
							marginBottom: theme('spacing.2')
						},
						h4: {
							marginTop: theme('spacing.3'),
							marginBottom: theme('spacing.1')
						},
						code: {
							fontSize: theme('fontSize.xs')[0]
						},
						pre: {
							fontSize: theme('fontSize.xs')[0],
							lineHeight: theme('fontSize.xs')[1].lineHeight,
							marginTop: theme('spacing.3'),
							marginBottom: theme('spacing.3'),
							paddingTop: theme('spacing.2'),
							paddingRight: theme('spacing.3'),
							paddingBottom: theme('spacing.2'),
							paddingLeft: theme('spacing.3')
						}
					}
				}
			}),
			// Transition timing functions
			transitionTimingFunction: {
				'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
				smooth: 'cubic-bezier(0.4, 0, 0.2, 1)'
			},
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
	// Custom plugin for gradient text and Scratchpad Ops utilities
	plugins: [
		forms,
		typography,
		// Add custom utilities
		function ({ addUtilities, theme }) {
			addUtilities({
				// Gradient text utility
				'.text-gradient': {
					'background-clip': 'text',
					'-webkit-background-clip': 'text',
					'-webkit-text-fill-color': 'transparent',
					'background-image': 'linear-gradient(to right, var(--tw-gradient-stops))'
				},
				// Glass morphism utility
				'.glass': {
					'backdrop-filter': 'blur(8px)',
					'-webkit-backdrop-filter': 'blur(8px)',
					background: 'rgba(255, 255, 255, 0.1)',
					border: '1px solid rgba(255, 255, 255, 0.2)'
				},
				'.glass-dark': {
					'backdrop-filter': 'blur(8px)',
					'-webkit-backdrop-filter': 'blur(8px)',
					background: 'rgba(0, 0, 0, 0.1)',
					border: '1px solid rgba(255, 255, 255, 0.1)'
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
				},
				// Scratchpad Ops specific utilities
				'.text-rune': {
					color: theme('colors.surface.rune'),
					'stroke-width': '2.5'
				},
				'.bg-scratchpad': {
					'background-color': 'var(--surface-scratch)'
				},
				'.bg-panel': {
					'background-color': 'var(--surface-panel)'
				},
				'.bg-clarity': {
					'background-color': 'var(--surface-clarity)'
				},
				'.bg-elevated': {
					'background-color': 'var(--surface-elevated)'
				},
				'.border-pencil': {
					'border-image':
						'linear-gradient(to right, rgba(26,31,43,0.4), rgba(26,31,43,0.6), rgba(26,31,43,0.4)) 1',
					'border-radius': '4px'
				},
				'.tactile-press': {
					transform: 'translateY(0)',
					transition: 'all 0.1s ease',
					'&:active': {
						transform: 'translateY(2px)'
					}
				}
			});
		}
	]
};
