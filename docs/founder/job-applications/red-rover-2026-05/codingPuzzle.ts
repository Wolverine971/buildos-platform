// docs/founder/job-applications/red-rover-2026-05/codingPuzzle.ts
type Slice = {
	sliceStr: string;
	start: number;
	end: number;
	nestedLevel: number;
};
export const formatCode = (unformattedCodeStr: string, shouldSort: boolean): string | null => {
	// small check for valid formatting, only checking for matching parens
	const numOfOpeningParens = unformattedCodeStr.split('(').length;
	const numOfClosingParens = unformattedCodeStr.split(')').length;
	if (numOfOpeningParens !== numOfClosingParens) {
		console.log('invalid code format');
		return null;
	}

	let slicesToAssemble: Slice[] = [];
	const findNestedPart = (str: string) => {
		let openingParen = str.lastIndexOf('(');
		let closingParen = str.slice(openingParen).indexOf(')') + openingParen;
		let sliceToPush = str.slice(openingParen + 1, closingParen);

		let leftSubSection = unformattedCodeStr.slice(0, openingParen);
		const numOfOpenParensToLeft = leftSubSection.split('(').length - 1;
		const numOfClosedParensToLeft = leftSubSection.split(')').length - 1;

		// const numberOfIntentions = numOfOpenParensToLeft - numOfClosedParensToLeft
		let nestedLevel = numOfOpenParensToLeft - numOfClosedParensToLeft;
		slicesToAssemble.push({
			sliceStr: sliceToPush,
			start: openingParen,
			end: closingParen,
			nestedLevel
		});

		let nextSliceToParse = str.slice(0, openingParen) + str.slice(closingParen + 1);
		if (nextSliceToParse.indexOf('(') !== -1) {
			findNestedPart(nextSliceToParse);
		}
	};
	// separate into sub slices, in order of inner most to outermost
	findNestedPart(unformattedCodeStr);
	if (shouldSort) {
		let sortedSlices: Slice[] = [];
		slicesToAssemble.forEach((slice) => {
			let sortedSliceStr = slice.sliceStr
				.split(',')
				.map((e) => e.trim())
				.sort()
				.join(', ');
			sortedSlices.push({ ...slice, sliceStr: sortedSliceStr });
		});
		slicesToAssemble = sortedSlices;
	}

	const findSpacingAndWhereToSplice = (currentSlice: Slice) => {
		let start = currentSlice.start;
		const leftSubSection = unformattedCodeStr.slice(0, start);
		const startIndex = leftSubSection.lastIndexOf(',');
		const wordBeforeCurrentSlice = leftSubSection.slice(startIndex + 2).trim();

		const numberOfIntentions = currentSlice.nestedLevel;
		return { wordBeforeCurrentSlice, numberOfIntentions: numberOfIntentions };
	};

	let formattedCodeString = '';

	// go backwards through the slices nesting inwards from outer layers to inner layers
	for (let i = slicesToAssemble.length - 1; i >= 0; i--) {
		let currentSlice = slicesToAssemble[i];
		let { wordBeforeCurrentSlice, numberOfIntentions } =
			findSpacingAndWhereToSplice(currentSlice);

		// create spacing indentation
		let spacing = '';
		for (let j = 0; j < numberOfIntentions; j++) {
			spacing += '  ';
		}

		let spliceableString = currentSlice.sliceStr.split(',').map((a) => {
			return `\n${spacing}- ${a.trim()}`;
		});

		// outermost layer
		if (i === slicesToAssemble.length - 1) {
			formattedCodeString = spliceableString.join('').replace('\n', '');
			continue;
		}

		let target = `${spacing.slice(2)}- ${wordBeforeCurrentSlice}`;
		formattedCodeString = formattedCodeString
			.split('\n')
			.map((str) => {
				if (str === target) {
					return `${str}${spliceableString.join('')}`;
				}
				return str;
			})
			.join('\n');
	}
	console.log(formattedCodeString);
	return formattedCodeString;
};

// formatCode("(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId)")
// formatCode("(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId)", true)
// formatCode("(id, name, email, type(id, name, customFields(c1, c2, c3(shoop, doop)), externalId, name, test, email(doop, shoop)), test(f2, f1, f3), tesssst)", false)
// formatCode("(id, name, email, type(id, name, customFields(c1, c2, c3(shoop, doop)), externalId, name, test, email(doop, shoop)), test(f2, f1, f3), tesssst)", true)
