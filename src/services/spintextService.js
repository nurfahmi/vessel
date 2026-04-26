/**
 * Spintext Service
 * Parses {option1|option2|option3} and randomly picks one per occurrence.
 * Supports nested spintext: {Hello|{Hi|Hey}} {world|there}
 */

function spin(text) {
  if (!text) return text;
  // Process from innermost brackets outward
  let result = text;
  let maxIterations = 10; // prevent infinite loops
  while (result.includes('{') && maxIterations-- > 0) {
    result = result.replace(/\{([^{}]+)\}/g, (match, group) => {
      const options = group.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
}

module.exports = { spin };
