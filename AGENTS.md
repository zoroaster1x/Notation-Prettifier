# AGENTS.md

Rules for any agent working in this repository. Read this before touching anything.

## 1. What this is

Notation Prettifier is an Obsidian plugin that reads rough math notation in a
note (`L^' = L + F`, `i_1^'`, `sqrt r^2-y^2`, `(1/25^2)x1000`, `5<degrees>`) and
draws it as LaTeX in Live Preview and Reading view. Three commands bake the
LaTeX into the note source. It also carries the arrow and sign shortcuts of
Symbols Prettifier, which it replaces.

The plugin never edits a note on its own. Live Preview and Reading view only
draw; the bake commands change text because the reader asked for it, and the
only other file written is the plugin's own `data.json`.

## 2. Hard rules

* **Read only unless commanded.** Tests read notes, they never write them. The
  corpus run must stay read only.
* **No personal data in tracked files.** No home paths, user names, vault
  names, course codes, institution names or document names. `test/privacy.mjs`
  fails the run when a tracked file looks like it carries one, and it takes
  extra patterns from the gitignored `.testenv`.
* **No em dashes** in text written here, including docs, commits and comments.
  Rewrite the sentence with a comma, a colon, a semicolon, or a full stop.
* **Every pattern and setting is documented in the README.** The README is the
  manual: built-in rules, shortcuts, settings, custom rule format and limits.
  When a rule or a setting changes, change the README in the same commit.
* **Verify before claiming done.** Run the suites that cover the change and
  report measured numbers, not intentions.

## 3. Build and run

`bun` is the runtime here, `node` may not be installed.

```bash
bun esbuild.config.mjs production   # builds main.js from src/main.js
bun test/convert.mjs                # engine: notation, rules, edge cases
bun test/smoke.mjs                  # the built bundle under an Obsidian stub
bun test/privacy.mjs                # tracked files carry no personal data
bun test/corpus.mjs                 # every note in NP_TEST_FOLDER, read only
```

`test/corpus.mjs` needs `NP_TEST_FOLDER` in the gitignored `.testenv` (copy
`.testenv.example`). Without it the run prints a notice and exits zero.

## 4. Test suites

| Suite | Covers |
|---|---|
| `test/convert.mjs` | the conversion engine: the two headline note lines, optometry notation, arrows and signs, degree shortcuts, protected regions, display math, group toggles, custom rules, custom shortcuts, idempotency, delimiter balance |
| `test/smoke.mjs` | the built bundle loads, registers the editor extension, the reading processor, four commands and the settings tab; renders a formula, an arrow glyph and a degree sign under linkedom; drives the live decoration builder and the commands |
| `test/privacy.mjs` | no home paths, emails, hostnames or local patterns in tracked files |
| `test/corpus.mjs` | every `.md` in the configured folder bakes, stays idempotent, keeps its line count, keeps every protected region verbatim, has paired delimiters and balanced braces, plus a DOM pass over converted lines |

`test/harness.mjs` gives linkedom the Obsidian element helpers, `Text.splitText`
and the `createEl` extensions, so the reading view and settings run outside
Obsidian without mocks inside the plugin code.

## 5. Layout

```
src/main.js       entry: settings, commands, preview modal
src/rules.js      rule packs, shortcuts, parsing of the settings textareas
src/engine.js     protected regions, tokenizer, formula detection, bake
src/editor.js     CodeMirror 6 live preview: math widgets and glyph widgets
src/reading.js    reading view: walks blocks, replaces text nodes in place
src/settings.js   the settings tab and its defaults
styles.css        widget and settings styles
test/stubs/       obsidian and @codemirror stubs used by the smoke test
```

## 6. Format knowledge worth keeping

These cost real time to find. They are handled in the current code, so treat
them as regressions to avoid.

* A formula span is earned, not guessed. A relation (`=`, an arrow, a
  comparison with operands on both sides) or a prime or script on a symbol-like
  base qualifies it. `L'`, `F_0`, `i_1`, `n^(i)` and `x^2` qualify. Ordinary
  words never start a span and never qualify one.
* A symbol-like base is a single letter, a number, an already scripted symbol,
  or a lowercase variable-like word (`dxF`, `dxL`, `dF`). All-caps
  abbreviations (`SS`, `LR`), capitalised words (`Mgmt`, `Lasers`, `AaD`) and
  units (`mm`) are not script bases. Without that rule
  `Course_AT_12_Topic_SS.pptx` and `AB_12CD_34` turn into math.
* Once a relation is inside the span, a short word welded to a math token on
  either side extends it: `dxF` in `(F_1+F_2-dxF_1xF_2)`, `hf` in `ΔE=hf=hc/λ`.
  The three letter limit is what keeps `↔sphere-cylinder` and
  `+ equivalent-lens/scale-drawing` out.
* Comparisons qualify only with operands on both sides, so `n > 1.7` wraps but
  `< 700-1000` and `<40` in prose do not. Arrows are held to the same rule, so
  `30→50` wraps but `endothelium→TM` does not.
* A word after `_` or `^` extends the span only when the base is symbol-like,
  or a relation is already present, and the word is 1 to 6 letters. Longer
  words on a number base (`16_Lasers`) break the span.
* `x` between digits or after `)` or a script close is multiplication
  (`25^2x6.5`, `(1/25^2)x1000`, `120x10^-3`). `x` before `(` after a capital is
  multiplication too (`F_LMx((n'-1)/0.523)`), which is why the x group runs
  before the subscript group: otherwise `F_LMx` becomes `F_{LMx}`.
* `--` becomes an en dash (Symbols Prettifier behaviour), so an en dash must
  stay an operator inside a formula or `a--b=...` splits into two spans. The
  operators group maps U+2013 and U+2014 back to `-`.
* Two control words can glue when the source had no space: `·tan` becomes
  `\cdottan`, one unknown command. `convertSpan` inserts a space between a
  known command name and a following ASCII letter. A generic
  `\\[A-Za-z]+(?=[A-Za-z])` regex does not work: it backtracks and splits the
  command itself.
* Protected regions: YAML frontmatter, fenced code, inline code, `$...$` and
  `$$...$$`, wikilinks (`[[...]]`), markdown links, bare URLs, footnote refs,
  thematic break lines, setext `===` lines and markdown table separator rows.
  The table row and thematic break protection is not cosmetic: the `--` and
  `===` shortcuts would otherwise turn `|---|---|` into en dashes and `===`
  into `≡`.
* Bake must copy protected text back verbatim between free segments. A first
  version rebuilt the line from free segments only and deleted every wikilink
  and inline code span.
* `bakeText` returns `{ text, count }` and keeps the line count. The display
  upgrade (`$$...$$` for a formula-only line) keeps leading whitespace so an
  indented formula in a list stays indented.
* Shortcuts are literals, applied to plain text and inside formulas. The
  operators group runs after them, so `->` becomes a unicode arrow in prose and
  `\to` inside a formula. Shortcut order matters: `<->` before `<-` and `->`,
  `<=>` before `<=`.
* The reading view replaces text nodes in place with `splitText`, working from
  the last match to the first, so bold, links and list markers around a formula
  are not disturbed. Code, pre and MathJax containers are skipped.
* The live layer never edits the document. It replaces a range with a widget
  while the cursor is elsewhere and shows the raw text when the selection
  intersects the range, exactly like Symbols Prettifier.
* Settings changes call `refreshEditors`, which dispatches an empty
  transaction to every open editor so the decorations rebuild with the new
  rules.

## 7. Verification discipline

* The corpus is the reference. Run it over real notes before and after a rule
  change and keep the failure count at zero. Report the numbers with their
  conditions: files, lines, formulas wrapped, milliseconds.
* A rule change that raises the conversion count but mangles a file name, a
  table or prose is a regression, not a win. Read the `--show` samples after
  every change to the detection rules.
* Idempotency and protected region preservation are non-negotiable invariants.

## 8. Commits

* Subject: plain and descriptive, no `feat:` or `docs:` prefixes, no emoji.
* Body: terse bullets with a component prefix, one line each, only when the
  change needs one.
* One logical change per commit. Push only when asked, and then push.
