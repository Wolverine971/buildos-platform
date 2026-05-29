// docs/founder/job-applications/red-rover-2026-05/redroverdetour.js
const formatTheCode = (unformattedCode, sort) => {
	const numOfOpeningParens = unformattedCode.split('(').length;
	const numOfClosingParens = unformattedCode.split(')').length;
	if (numOfOpeningParens !== numOfClosingParens) {
		console.log('invalid code format');
		return null;
	}

	// {start: number, end: number: sliceStr}
	let slicesToAssemble = [];

	const findNestedPart = (str) => {
		// let separated = str.split(',')
		let openingParen = str.lastIndexOf('(');
		let closingPart = str.slice(openingParen);
		let closingParen = closingPart.indexOf(')') + openingParen;
		let sliceToPush = str.slice(openingParen + 1, closingParen);
		slicesToAssemble.push({ sliceStr: sliceToPush, start: openingParen, end: closingParen });

		let nextSliceToParse = str.slice(0, openingParen) + str.slice(closingParen + 1);
		if (nextSliceToParse.indexOf('(') !== -1) {
			findNestedPart(nextSliceToParse);
		}
	};
	findNestedPart(unformattedCode);
	if (sort) {
		let sortedArrs = [];
		slicesToAssemble.forEach((slice) => {
			let sortedSliceStr = slice.sliceStr
				.split(',')
				.map((e) => e.trim())
				.sort()
				.join(', ');
			sortedArrs.push({ sliceStr: sortedSliceStr, ...slice });
		});
		debugger;
		slicesToAssemble = sortedArrs;
	}

	// now time to assemble
	// create the formatting as it should go from back to front
	const findBeforeWord = (currentSlice, parenToStartAt) => {
		let firstWord = currentSlice.sliceStr.split(',')[0];
		// here is where i need to search a substring
		let start = currentSlice.start;
		let endOfCurrentArr = currentSlice.end;
		const subSection = unformattedCode.slice(0, start - 1);
		const startIndex = subSection.lastIndexOf(',');
		const beforeWord = subSection.slice(startIndex + 2).trim();

		numberOfParensToLeft = subSection.split('(').length;
		numberOfParensToRight = unformattedCode.slice(endOfCurrentArr).split(')').length;

		const numberOfIntentions = Math.min(numberOfParensToLeft, numberOfParensToRight);
		// console.log(beforeWord)
		return { beforeWord, numberOfIntentions };
	};

	let fullyFormattedCode = '';
	for (let i = slicesToAssemble.length - 1; i >= 0; i--) {
		let currentSlice = slicesToAssemble[i];
		let { beforeWord, numberOfIntentions } = findBeforeWord(currentSlice, i);

		// let levelOfNesting = slicesToAssemble.length - i
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

		let startWordIndex = currentSlice.start;
		let startOfSplice = currentSlice.end;

		fullyFormattedCode =
			fullyFormattedCode.slice(0, startOfSplice) +
			spliceableString.join('') +
			'\n' +
			fullyFormattedCode.slice(startOfSplice + 1);
		console.log(fullyFormattedCode);
	}

	return fullyFormattedCode;
};

formatTheCode(
	'(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId, test(f2, f1, f3))',
	false
);

formatTheCode(
	'(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId, test(f2, f1, f3))',
	true
);
formatTheCode(
	'(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId, test(f2, f1, f3))',
	false
);

// "(
// id,
//     name,
//     email,
//     type(
//         id,
//         name,
//         test,
//         stso,
//         customFields(
//             c1,
//             c2,
//             c3
//         )
//     ),
//     externalId,
//     sfsefe4,
//     fsdfds,
//     test(
//         sd,
//         fffffeeeee
//     ),
//     test,
//     poop,
//     name
// ) "
