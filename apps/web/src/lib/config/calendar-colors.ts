// apps/web/src/lib/config/calendar-colors.ts
/**
 * Google Calendar color definitions
 * These are all 24 colors available in Google Calendar API for calendars
 * Client-safe constants that can be imported anywhere
 */

export type GoogleColorId =
	| '1'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '10'
	| '11'
	| '12'
	| '13'
	| '14'
	| '15'
	| '16'
	| '17'
	| '18'
	| '19'
	| '20'
	| '21'
	| '22'
	| '23'
	| '24';

export const GOOGLE_CALENDAR_COLORS: Record<
	GoogleColorId,
	{ name: string; hex: string; bg: string; text: string }
> = {
	'1': { name: 'Cocoa', hex: '#ac725e', bg: 'bg-[#ac725e]', text: 'text-white' },
	'2': { name: 'Flamingo', hex: '#d06b64', bg: 'bg-[#d06b64]', text: 'text-white' },
	'3': { name: 'Tomato', hex: '#f83a22', bg: 'bg-[#f83a22]', text: 'text-white' },
	'4': { name: 'Tangerine', hex: '#fa573c', bg: 'bg-[#fa573c]', text: 'text-white' },
	'5': { name: 'Pumpkin', hex: '#ff7537', bg: 'bg-[#ff7537]', text: 'text-white' },
	'6': { name: 'Mango', hex: '#ffad46', bg: 'bg-[#ffad46]', text: 'text-gray-900' },
	'7': { name: 'Eucalyptus', hex: '#42d692', bg: 'bg-[#42d692]', text: 'text-gray-900' },
	'8': { name: 'Basil', hex: '#16a765', bg: 'bg-[#16a765]', text: 'text-white' },
	'9': { name: 'Pistachio', hex: '#7bd148', bg: 'bg-[#7bd148]', text: 'text-gray-900' },
	'10': { name: 'Avocado', hex: '#b3dc6c', bg: 'bg-[#b3dc6c]', text: 'text-gray-900' },
	'11': { name: 'Citron', hex: '#fbe983', bg: 'bg-[#fbe983]', text: 'text-gray-900' },
	'12': { name: 'Banana', hex: '#fad165', bg: 'bg-[#fad165]', text: 'text-gray-900' },
	'13': { name: 'Sage', hex: '#92e1c0', bg: 'bg-[#92e1c0]', text: 'text-gray-900' },
	'14': { name: 'Peacock', hex: '#9fe1e7', bg: 'bg-[#9fe1e7]', text: 'text-gray-900' },
	'15': { name: 'Cobalt', hex: '#9fc6e7', bg: 'bg-[#9fc6e7]', text: 'text-gray-900' },
	'16': { name: 'Blueberry', hex: '#4986e7', bg: 'bg-[#4986e7]', text: 'text-white' },
	'17': { name: 'Lavender', hex: '#9a9cff', bg: 'bg-[#9a9cff]', text: 'text-white' },
	'18': { name: 'Wisteria', hex: '#b99aff', bg: 'bg-[#b99aff]', text: 'text-white' },
	'19': { name: 'Graphite', hex: '#c2c2c2', bg: 'bg-[#c2c2c2]', text: 'text-gray-900' },
	'20': { name: 'Birch', hex: '#cabdbf', bg: 'bg-[#cabdbf]', text: 'text-gray-900' },
	'21': { name: 'Beetroot', hex: '#cca6ac', bg: 'bg-[#cca6ac]', text: 'text-gray-900' },
	'22': { name: 'Cherry Blossom', hex: '#f691b2', bg: 'bg-[#f691b2]', text: 'text-gray-900' },
	'23': { name: 'Grape', hex: '#cd74e6', bg: 'bg-[#cd74e6]', text: 'text-white' },
	'24': { name: 'Amethyst', hex: '#a47ae2', bg: 'bg-[#a47ae2]', text: 'text-white' }
} as const;

export const DEFAULT_CALENDAR_COLOR: GoogleColorId = '16'; // Peacock blue
