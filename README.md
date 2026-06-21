# Batch File Obfuscator / Deobfuscator

A pair of scripts for obfuscating and reversing Windows batch (.bat/.cmd) files using the classic `%var:~offset,length%` substring trick.

## Note
I saw this originally while strolling through because i was curious and wondering if batch obfuscators were possible. In fact i did see one. I had to basically rewrite some parts from scratch because it wasnt very clear/broken in the original repo (i totally forgot where it is, its in a different language though).
*This is not 100% mine* but the deobfuscator was made by me and parts of the obfuscator was too

## Files

- `obfuscator.js` - takes a batch script and scrambles it into an unreadable but functionally identical version. Originally found online and improved on.
- `deobfuscator.js` - reverses output produced by `obfuscator.js` back to (close to) the original source.
- `project.html` - the interface used to drive `obfuscator.js` in the browser.

## How the obfuscation works

Batch has a feature where `%variable:~offset,length%` pulls a substring out of a variable. For example:

```bat
set "x=abcdefg"
echo %x:~2,1%
```

This prints `c`, the character at offset 2.

`batchfileObfuscate()` abuses this on every pass:

1. Picks a random 3 to 5 character variable name built from an alphabet full of accented and unicode characters, so the name itself looks like nonsense.
2. Shuffles the real character set (`@`, space, digits, upper and lowercase letters) into a random order and stores it in that variable via a `set "VAR=shuffled"` line at the top of the output.
3. Builds a lookup table mapping every character to a `%VAR:~index,1%` reference.
4. Walks the original script character by character and swaps each eligible character for its lookup token.
5. About 5 percent of the time, tacks on a bogus `%garbage%` reference right after a real substitution. This decoy is exactly 7 characters long and resolves to nothing at runtime; it exists purely to throw off pattern matching.

Two pieces of state tracking keep the substitution from breaking the script:

- `inLabel` skips substitution right after a `:` at the start of a line, so labels like `:start` survive intact.
- `inVar` skips substitution while inside an existing `%var%` or `!var!` reference, so the script's own variables are not mangled.

The `passes` argument lets you obfuscate the output again, nesting substitutions inside substitutions. The final pass also prepends a stray byte plus `@cls`, likely to clear the screen and hide the setup noise if the file is run directly.

## How the deobfuscation works

The obfuscation is reversible by design. `cmd.exe` has to resolve it back to literal characters to run it, so the key always ships inside the file itself.

`batchfileDeobfuscate()` undoes it pass by pass:

1. Find the injected `@set "VAR=alphabet"` line and pull out the variable name and the shuffled alphabet.
2. Replace every `%VAR:~index,1%` token in the body with `alphabet[index]`.
3. If a real token is immediately followed by a 7 character `%xxxxxxx%` wrapper, drop it. That fixed length is what makes a decoy distinguishable from a real adjacent token; a generic wildcard match is not safe here, since two real tokens often sit right next to each other too.
4. Repeat until no more `set` lines are found, since each pass wraps the previous pass's output as plain text.
5. Run one final safety sweep for any stray decoy token that ended up isolated.

### Usage

```bash
node deobfuscator.js obfuscated.bat output.bat
```

Or as a module:

```js
const { batchfileDeobfuscate } = require('./deobfuscator.js');
const { result, passesUndone } = batchfileDeobfuscate(obfuscatedScript);
```

## Notes and gotchas found while building the deobfuscator

- **Decoy tokens cannot be told apart by content alone.** They are sliced from an alphabet that includes plain a-z and A-Z, so a decoy can occasionally be pure ASCII and look like a real token. The only reliable signal is the fixed 7 character length plus its position directly after a real token.
- **Multi-pass obfuscation can bury a decoy token inside the next pass's alphabet string.** An outer pass treats the inner pass's `set` line as ordinary text and obfuscates it too, so a decoy occasionally lands between the `=` and the closing quote of the alphabet definition. The deobfuscator strips it from the alphabet before indexing into it, otherwise every `alphabet[index]` lookup downstream comes out wrong.
- **Obfuscation makes a file easier to flag, not harder.** Heavy `%var:~x,y%` chains are a well known heuristic trigger for Defender and most EDR products, so this is "speed bump" obfuscation rather than anything resistant to detection.
- **The technique has a hard ceiling.** No external dependencies, no compiled binary, no native crypto. Every trick has to be reversible by the same interpreter that runs the script, so it can always be undone with patience and a text editor, or just by letting `cmd.exe` expand it for you and capturing the output.

## Testing

The deobfuscator was checked against the obfuscator across several hundred randomized runs (varying pass count, script content, and the obfuscator's internal randomness) with exact string matches against the original source. Test scripts covered labels, `!delayedexpansion!` variables, special characters, and plain linear scripts with no labels at all.
