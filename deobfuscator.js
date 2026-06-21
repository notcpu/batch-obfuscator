/**
 * batchfileDeobfuscate
 * Reverses output produced by batchfileObfuscate().
 *
 * How the obfuscator works (recap):
 *   For each pass, it prepends one line:
 *       @set "VAR=shuffledAlphabet"
 *   Then every eligible literal character downstream is replaced with:
 *       %VAR:~INDEX,1%
 *   ...where INDEX is that character's position in shuffledAlphabet.
 *   ~5% of substitutions get a bogus trailing %junk% reference appended,
 *   which resolves to nothing and is purely there to confuse pattern matching.
 *
 * To reverse a single pass:
 *   1. Find the "set" line, pull out VAR and the alphabet string.
 *   2. Walk the rest of the text. Wherever we see %VAR:~N,1%, replace it
 *      with alphabet[N]. If that token is immediately followed by a
 *      %xxxxxxx% wrapper of exactly 7 characters, that's a junk decoy
 *      insertion (always exactly 7 chars by construction) -- drop it.
 *   3. Everything else (labels, literal text, real %EXISTING_VARS%) is
 *      passed through untouched.
 *
 * If multiple passes were applied, the outer pass's "set" line + tokens
 * wrap the *previous* pass's already-obfuscated output as plain text.
 * So we just repeat the single-pass reversal until no more
 * "set "X=...";%X:~...,1%" patterns are found.
 */

function deobfuscateOnePass(script) {
  // Match the injected set line. Pattern from the obfuscator:
  //   @set "VAR=alphabet"\r\n
  // possibly preceded by the cls/BOM marker on the final pass.
  const setLineRe = /@set "([^=]+)=([^"]*)"\r?\n/;
  const match = script.match(setLineRe);

  if (!match) {
    return { result: script, changed: false };
  }

  const varName = match[1];
  let alphabet = match[2];
  const setLine = match[0];

  // Remove the set line itself from the body.
  let body = script.slice(0, match.index) + script.slice(match.index + setLine.length);

  // Token for substitutions referencing this specific var name.
  // %VAR:~INDEX,1%
  const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Junk decoy tokens are inserted by the obfuscator IMMEDIATELY after
  // a real substitution token, as a single unit:
  //   b + "%" + shuffle(stringVar1).slice(3,10) + "%"
  // That slice(3,10) is ALWAYS exactly 7 characters -- a fixed-width
  // constant we can match precisely, unlike a generic "%[^%]*%" wildcard
  // which is ambiguous with the next real token sitting right next door.
  // So: match a real token, optionally followed by exactly 7 chars
  // wrapped in %...%, and decode the real part while dropping the junk.
  const pairRe = new RegExp(`%${escapedVar}:~(\\d+),1%(?:%[^%\\r\\n]{7}%)?`, 'g');

  function alphabetAwareReplace(str, re, alpha) {
    re.lastIndex = 0;
    return str.replace(re, (full, idxStr) => {
      const idx = parseInt(idxStr, 10);
      const ch = alpha[idx];
      return ch !== undefined ? ch : full;
    });
  }

  let decoded = alphabetAwareReplace(body, pairRe, alphabet);
  alphabet = alphabetAwareReplace(alphabet, pairRe, alphabet);

  // Strip the leading marker the obfuscator adds on its final pass:
  // "\uFFFE&@cls&"
  decoded = decoded.replace(/^\uFFFE&@cls&/, '');

  return { result: decoded, changed: true };
}

function batchfileDeobfuscate(script, maxPasses = 25) {
  let current = script;
  let passesUndone = 0;

  for (let i = 0; i < maxPasses; i++) {
    const { result, changed } = deobfuscateOnePass(current);
    if (!changed) break;
    current = result;
    passesUndone++;
  }

  // Safety net: junk tokens are normally already stripped inline above
  // (positionally, glued to the real token they followed). This sweeps
  // up any stray junk-shaped token that ended up isolated, e.g. if a
  // junk insertion landed at a pass boundary in a way the positional
  // match didn't cover. Real junk is always exactly 7 chars pulled from
  // an alphabet containing accented characters; this only catches the
  // (rare) variants containing a non-ASCII character, so it's a backstop
  // rather than the primary mechanism.
  const junkTokenRe = /%[^%\r\n]{7}%/g;
  current = current.replace(junkTokenRe, (m) => (/[\u0080-\uFFFF]/.test(m) ? '' : m));

  return { result: current, passesUndone };
}

module.exports = { batchfileDeobfuscate, deobfuscateOnePass };

// CLI usage: node deobfuscator.js obfuscated.bat [output.bat]
if (require.main === module) {
  const fs = require('fs');
  const inPath = process.argv[2];
  const outPath = process.argv[3];

  if (!inPath) {
    console.error('Usage: node deobfuscator.js <obfuscated_file> [output_file]');
    process.exit(1);
  }

  const input = fs.readFileSync(inPath, 'utf8');
  const { result, passesUndone } = batchfileDeobfuscate(input);

  console.error(`[+] Undid ${passesUndone} pass(es) of obfuscation`);

  if (outPath) {
    fs.writeFileSync(outPath, result, 'utf8');
    console.error(`[+] Wrote deobfuscated script to ${outPath}`);
  } else {
    console.log(result);
  }
}
