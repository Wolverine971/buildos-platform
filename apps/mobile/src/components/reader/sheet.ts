// apps/mobile/src/components/reader/sheet.ts
// The reader sheet's resting heights, as fractions of the tallest a sheet can be. Mutable arrays
// because the navigator's option type is `number[]`; never change them in place.

/** Opens at two thirds; pull up for full height. */
export const READER_DETENTS: number[] = [0.66, 1];

/**
 * While a description or doc body is being edited. Custom detents are named by index, so the
 * open detent ("0" or "1") now resolves to full height; going back to READER_DETENTS returns the
 * sheet to where it was.
 */
export const READER_DETENTS_EDITING: number[] = [1];
