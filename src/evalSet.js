// mapping each post's topic to every filename prefix that counts as a correct match
// null means no image in the corpus should be considered a good enough match
const evalSet = [
    { topic: "red fox", expectedPrefixes: ["red-fox", "fox.jpg"] },
    { topic: "gray wolf", expectedPrefixes: ["gray-wolf"] },
    { topic: "dog", expectedPrefixes: ["dog"] },
    { topic: "bear", expectedPrefixes: ["bear"] },
    { topic: "deer", expectedPrefixes: ["deer"] },
    { topic: "astronomy", expectedPrefixes: null }
];

module.exports = { evalSet };