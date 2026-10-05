// packages/shared-types/src/company.ts
// Public company contact details shared by the website and email senders.
export const BUILDOS_MAILING_ADDRESS_LINES = [
	'BuildOS',
	'PO Box 662',
	'Glen Burnie, MD 21061-0662'
] as const;

export const BUILDOS_MAILING_ADDRESS = BUILDOS_MAILING_ADDRESS_LINES.join(', ');
