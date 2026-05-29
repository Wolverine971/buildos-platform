// docs/founder/job-applications/red-rover-2026-05/redrover-coding-challenge.ts
// <!-- Using the technology of your choice, convert the following string:

// "(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId)"

// To this output:

// - id
// - name
// - email
// - type
//   - id
//   - name
//   - customFields
//     - c1
//     - c2
//     - c3
// - externalId
// And also to this output:

// - email
// - externalId
// - id
// - name
// - type
//   - customFields
//     - c1
//     - c2
//     - c3
//   - id
//   - name -->

goodarr = "c1, c2, c3", "id, name, customFields", "id, name, email, type, externalId"

split on commas

recurrsive part
get last ( 
find matching )
push inbetween to array and remove from arr
next is find inbetween and assemble

const formatTheCode = (unformattedCode) => {

let nestedArraysToAssemble = []

  const findNestedPart = (str) => {
    // let separated = str.split(',')
    let lastIndexOfParen = str.lastIndexOf('(')
    let firstIndexOfParen = str.indexOf(')')
    let sliceToPush = str.slice(lastIndexOfParen + 1, firstIndexOfParen)
    nestedArraysToAssemble.push(sliceToPush)

    let nextSliceToParse = str.slice(0, lastIndexOfParen) + str.slice(firstIndexOfParen)
    findNestedPart(nextSliceToParse)
  }
  findNestedPart(unformattedCode)

  // now time to assemble

  const cleanedCodeStrings = unformattedCode.split(',').map(str => str.replace('(', '').replace(')', '').trim())


  // create the formatting as it should go from back to front

  const findBeforeWord = (start) => {
    const subSection = unformattedCode.slice(0, start)
    const start = subSection.lastIndexOf(',')
    const beforeWord = subSection.slice(start).trim()
    return beforeWord

  }

  let fullyFormattedCode = ''
  for (let i = nestedArraysToAssemble.length; i > 0; i--){
    let currentArr = nestedArraysToAssemble[i]
    
    let levelOfNesting = nestedArraysToAssemble.length - i
    let spacing = ''
    for (let j = 0; j < levelOfNesting; j++){
      spacing += '  '
    }
    let spliceableString = currentArr.split(',').map(a => {
      return `\n${spacing}- ${a}`
    })

    // need to pattern match between unformattedCode and fullyFormattedCode
    // let start = fullyFormattedCode.indexOf(currentArr)
    // let end = fullyFormattedCode.lastIndexOf(currentArr)

    let beforeWordSubString = findBeforeWord(unformattedCode.indexOf(currentArr))

    let startWordIndex = fullyFormattedCode.indexOf(beforeWordSubString)
    let startOfSplice = startWordIndex + beforeWordSubString.length



    fullyFormattedCode = fullyFormattedCode.slice(0,start) + spliceableString + fullyFormattedCode.slice(0,start + 1)

    
  }
  return fullyFormattedCode
}

    // let beforeWord = beforeWordSubString.slice(beforeWordSubString.lastIndexOf(',', beforeWordSubString.length))

    // let afterWord = 

    // let afterWordSubString = unformattedCode.slice(0, unformattedCode.lastIndexOf(currentArr))
    // let afterWord = beforeWordSubString.slice(beforeWordSubString.lastIndexOf(',', beforeWordSubString.length))

    
  
    // splice it in place
    // fullyFormattedCode = fullyFormattedCode.slice(0,start) + spliceableString + fullyFormattedCode.slice(end)


    // need to find out where to splice

  }




  // const finalArr = []
  for (let i = 0; i < nestedArraysToAssemble.length; i++){
    let innerArr = nestedArraysToAssemble[i]

    let levelOfNesting = nestedArraysToAssemble.length - i
    let spacing = ''
    for (let j = 0; j < levelOfNesting; j++){
      spacing += '  '
    }

    let start = unformattedCode.indexOf(innerArr)
    let end = unformattedCode.lastIndexOf(innerArr)

    let spliceable = innerArr.split(',').map(a => {
      return `\n${spacing}- ${a}`
    })
    // splice it in place
    let goodSplice = unformattedCode.slice(0,start) + spliceable + unformattedCode.slice(end)


    // innerArr.split(',').forEach(a => {
    //   finalArr.push(`- ${a}`)
    // })



  }

  // go back to front and add in the next part where it should go




}



// const nestALevel = 
const getNestedLevels = (subStr) => {

}


const parseSubstring = (unformattedSubString) => {
  let skipStart = unformattedSubString.indexOf('(')
  let skipEnd = unformattedSubString.lastIndexOf(')')
  let formattedArr = []

  // recurrsive- has (, need to split up
  if (skipStart !== -1){
    let nextNestedSlice = unformattedSubString.slice(skipStart + 1, skipEnd)
    let formattedSubString = parseSubstring(nextNestedSlice)
    let indentedSubstring = formattedSubString.split('\n').map(str => ` ${str}`).join('\n')

    // insert properly
    const firstPart = unformattedSubString.slice(0, skipStart)
    const lastPart = unformattedSubString.slice(skipEnd).replace('),', '').trim()
    if(lastPart === ')' || lastPart === ''){
      formattedArr = [firstPart, indentedSubstring]
    } else {
      formattedArr = [firstPart, indentedSubstring, lastPart]
    }
    debugger
    ""
    " id, name, email, type\n  id, name, customFields\n   - c1\n   -  c2\n   -  c3\n externalId"

    return formattedArr.join('\n')

    // join('\n').split(',').join('\n')
    
  } else {
    return unformattedSubString.split(',').map(str =>{
      return `- ${str}`
    }).join('\n')
  }
} 

//   let nextNestedSlice = unformattedSubString.slice(skipStart, skipEnd)
//   let stringToFormat = unformattedSubString.slice(0, skipStart) + unformattedSubString.slice(skipEnd)

//   for (let i = 0; i < unformattedSubString.length; i++) {
//     let char = unformattedSubString[i]
//     if (i === skipStart) {
//       i = skipEnd
//       continue
//     }

//   }
// } 
// // "(id, name, email, type(id, name, customFields(c1, c2, c3)), externalId)"
// const findNestings = (unparsedString: string) => {

//   const numberOfNestings = unparsedString.split('(')
//   // ['', 'id, name, email, type', 'id, name, customFields', 'c1, c2, c3)), externalId)']

//   let chunk = []
//   numberOfNestings.forEach(strArr=>{
//     if(strArr.indexOf(')') !== -1){
//       let numberOfNestings = strArr.split(')')
      
//       chunk.push(strArr)

//     }
//   })

// }