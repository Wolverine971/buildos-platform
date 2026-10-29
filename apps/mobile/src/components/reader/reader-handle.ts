// apps/mobile/src/components/reader/reader-handle.ts

/** What the reader screen asks of a task or doc reader before it moves on or closes. */
export type ReaderHandle = {
	/**
	 * Saves anything still being typed (a title, a description, a doc body). Resolves to false
	 * when a save failed or needs the person's attention, so the reader stays put.
	 */
	flush: () => Promise<boolean>;
};
