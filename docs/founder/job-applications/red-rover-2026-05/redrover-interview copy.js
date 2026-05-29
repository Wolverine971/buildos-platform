// docs/founder/job-applications/red-rover-2026-05/redrover-interview copy.js
const formatCode = (unformattedCode, shouldSort) => {
	// small check for valid formatting, only checking for matching parens
	const numOfOpeningParens = unformattedCode.split('(').length;
	const numOfClosingParens = unformattedCode.split(')').length;
	if (numOfOpeningParens !== numOfClosingParens) {
		console.log('invalid code format');
		return null;
	}

	let slicesToAssemble = [];
	const findNestedPart = (str) => {
		let openingParen = str.lastIndexOf('(');
		let closingParen = str.slice(openingParen).indexOf(')') + openingParen;
		let sliceToPush = str.slice(openingParen + 1, closingParen);
		slicesToAssemble.push({ sliceStr: sliceToPush, start: openingParen, end: closingParen });

		let nextSliceToParse = str.slice(0, openingParen) + str.slice(closingParen + 1);
		if (nextSliceToParse.indexOf('(') !== -1) {
			findNestedPart(nextSliceToParse);
		}
	};
	// separate into sub arrays, in order of inner most to outermost
	findNestedPart(unformattedCode);
	if (shouldSort) {
		let sortedArrs = [];
		slicesToAssemble.forEach((slice) => {
			let sortedSliceStr = slice.sliceStr
				.split(',')
				.map((e) => e.trim())
				.sort()
				.join(', ');
			sortedArrs.push({ ...slice, sliceStr: sortedSliceStr });
		});
		debugger;
		slicesToAssemble = sortedArrs;
	}

	const findPlaceToSpliceAndNestingLevel = (currentSlice) => {
		let start = currentSlice.start;
		const leftSubSection = unformattedCode.slice(0, start);
		const startIndex = leftSubSection.lastIndexOf(',');
		const wordBeforeCurrentSlice = leftSubSection.slice(startIndex + 2).trim();

		const numOfOpenParensToLeft = leftSubSection.split('(').length - 1;
		const numOfClosedParensToLeft = leftSubSection.split(')').length - 1;

		const numberOfIntentions = numOfOpenParensToLeft - numOfClosedParensToLeft;
		return { wordBeforeCurrentSlice, numberOfIntentions };
	};

	let fullyFormattedCode = '';

	// go backwards through the slices nesting inwards from outer layers to inner layers
	for (let i = slicesToAssemble.length - 1; i >= 0; i--) {
		let currentSlice = slicesToAssemble[i];
		let { wordBeforeCurrentSlice, numberOfIntentions } =
			findPlaceToSpliceAndNestingLevel(currentSlice);

		// create spacing indentation
		let spacing = '';
		for (let j = 0; j < numberOfIntentions; j++) {
			spacing += '  ';
		}

		let spliceableString = currentSlice.sliceStr.split(',').map((a) => {
			return `\n${spacing}- ${a.trim()}`;
		});

		if (i === slicesToAssemble.length - 1) {
			fullyFormattedCode = spliceableString.join('');
			continue;
		}
		let startWordIndex = fullyFormattedCode.lastIndexOf(wordBeforeCurrentSlice);
		let startOfSplice = startWordIndex + wordBeforeCurrentSlice.length;

		fullyFormattedCode =
			fullyFormattedCode.slice(0, startOfSplice) +
			spliceableString.join('') +
			'\n' +
			fullyFormattedCode.slice(startOfSplice + 1);
	}
	console.log(fullyFormattedCode);
	return fullyFormattedCode;
};

formatCode(
	'(id, name, email, type(id, name, customFields(c1, c2, c3(shoop, doop)), externalId, name, test, email(doop, shoop)), test(f2, f1, f3), tesssst)',
	false
);
