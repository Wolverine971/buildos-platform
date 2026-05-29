// docs/founder/job-applications/red-rover-2026-05/redrover-interview.js
const formatTheCode = (unformattedCode, sort) => {
	const numOfOpeningParens = unformattedCode.split('(').length;
	const numOfClosingParens = unformattedCode.split(')').length;
	if (numOfOpeningParens !== numOfClosingParens) {
		console.log('invalid code format');
		return null;
	}

	let nestedArraysToAssemble = [];

	const findNestedPart = (str) => {
		// let separated = str.split(',')
		let lastIndexOfParen = str.lastIndexOf('(');
		let firstIndexOfParen = str.slice(lastIndexOfParen).indexOf(')') + lastIndexOfParen;
		let sliceToPush = str.slice(lastIndexOfParen + 1, firstIndexOfParen);
		nestedArraysToAssemble.push(sliceToPush);

		let nextSliceToParse = str.slice(0, lastIndexOfParen) + str.slice(firstIndexOfParen + 1);
		if (nextSliceToParse.indexOf('(') !== -1) {
			findNestedPart(nextSliceToParse);
		}
	};
	findNestedPart(unformattedCode);
	if (sort) {
		let sortedArrs = [];
		nestedArraysToAssemble.forEach((arr) => {
			let sortedArr = arr
				.split(',')
				.map((e) => e.trim())
				.sort()
				.join(', ');
			sortedArrs.push(sortedArr);
		});
		debugger;
		nestedArraysToAssemble = sortedArrs;
	}

	// now time to assemble
	// create the formatting as it should go from back to front
	const findBeforeWord = (currentArr) => {
		let start = unformattedCode.indexOf(currentArr);
		const subSection = unformattedCode.slice(0, start - 1);
		const startIndex = subSection.lastIndexOf(',');
		const beforeWord = subSection.slice(startIndex + 2).trim();

		const numberOfIntentions = subSection.split('(').length;
		return { beforeWord };
	};

	let fullyFormattedCode = '';
	for (let i = nestedArraysToAssemble.length - 1; i >= 0; i--) {
		let currentArr = nestedArraysToAssemble[i];
		let { beforeWord } = findBeforeWord(currentArr);

		let levelOfNesting = nestedArraysToAssemble.length - i;
		let spacing = '';
		for (let j = 0; j < levelOfNesting; j++) {
			spacing += '  ';
		}
		let spliceableString = currentArr.split(',').map((a) => {
			return `\n${spacing}- ${a.trim()}`;
		});

		if (i === nestedArraysToAssemble.length - 1) {
			fullyFormattedCode = spliceableString.join('');
			continue;
		}

		// need to pattern match between unformattedCode and fullyFormattedCode
		// let start = fullyFormattedCode.indexOf(currentArr)
		// let end = fullyFormattedCode.lastIndexOf(currentArr)

		let startWordIndex = fullyFormattedCode.indexOf(beforeWord);
		let startOfSplice = startWordIndex + beforeWord.length;

		fullyFormattedCode =
			fullyFormattedCode.slice(0, startOfSplice) +
			spliceableString.join('') +
			'\n' +
			fullyFormattedCode.slice(startOfSplice + 1);
	}
	debugger;
	return fullyFormattedCode;
};
formatTheCode(
	'(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId, test(f2, f1, f3))',
	true
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
