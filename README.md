# Notation Prettifier

Type rough math notation in Obsidian and read it back as real math. `L^' = L + F` becomes `$L' = L + F$`, `n^(i) = n^(')i^(')` becomes `$n^{i} = n'i'$`, `sqrt r^2-y^2` becomes `$\sqrt{r^{2}-y^{2}}$`, and `5<degrees>` becomes `5°`. It works while you type in Live Preview, in Reading view, and on demand through bake commands that write the LaTeX into the note.

It also carries the whole arrow and sign map of **Symbols Prettifier** (`->` to `→`, `<=` to `⇐`, `--` to `–`, and the rest), so it replaces that plugin instead of sitting beside it.

Everything runs offline. There is no API key, no model, no network request, and no telemetry. The rules are regular expressions you can read, test and extend in the settings tab without touching the source.

**[What it does](#what-it-does)** · **[Install](#installing)** · **[Commands](#commands)** · **[Built-in rules](#built-in-rules)** · **[Text shortcuts](#text-shortcuts)** · **[Custom rules](#custom-formula-rules)** · **[Settings](#settings)** · **[Performance](#performance)** · **[Known limits](#known-limits)** · **[Tests](#testing)** · **[Funding](#funding)** · **[License](#license)**

---

## What it does

Real notes mix prose, formulas and machine identifiers. The plugin is built so that formulas get typeset and everything else is left alone. The two lines that started this plugin:

Before:

```text
When doing step-along raytracing, we use the "Fundamental Paraxial Relationship" (which is L^' (Vergence after the surface) = L (Vergence before the surface) + F (Power))
Derived from approximate Snell's law = n^(i) = n^(')i^(')
```

After Live Preview, Reading view, or the bake command:

```text
When doing step-along raytracing, we use the "Fundamental Paraxial Relationship" (which is $L'$ (Vergence after the surface) $= L$ (Vergence before the surface) + F (Power))
Derived from approximate Snell's law $= n^{i} = n'i'$
```

Forms seen in real optometry notes that convert as they are typed:

| You type | You see |
|---|---|
| `L^' = L + F` | `$L' = L + F$` |
| `i_1^' + d_1 = i_2` | `$i_{1}' + d_{1} = i_{2}$` |
| `n^(i) = n^(')i^(')` | `$n^{i} = n'i'$` |
| `x^(n-1)` | `$x^{n-1}$` |
| `s=r-sqrt r^2-y^2` | `$s=r-\sqrt{r^{2}-y^{2}}$` |
| `(1/25^2)x1000=1.6mm` | `$(1/25^{2})\times1000=1.6\,\text{mm}$` |
| `(20^2x-8.5)/(2000(1.5-1))=−3.4mm` | `$(20^{2}\times-8.5)/(2000(1.5-1))=-3.4\,\text{mm}$` |
| `F_T=F_LMx((n'-1)/0.523)` | `$F_{T}=F_{LM}\times((n'-1)/0.523)$` |
| `d = 360^\circ - 2a` | `$d = 360^\circ - 2a$` |
| `\frac{1}{v} + \frac{1}{u} = \frac{1}{f}` | `$\frac{1}{v} + \frac{1}{u} = \frac{1}{f}$` |
| `h'=16.67·tanθ` | `$h'=16.67\cdot\tan θ$` |
| `ΔE=hf=hc/λ` | `$ΔE=hf=hc/λ$` |
| `theta = 2`, `45° → 90°` | `$\theta = 2$`, `$45° \to 90°$` |
| `5<degrees>`, `x = 30<degrees>` | `5°`, `$x = 30°$` |
| `Miosis -> constricted pupil` | `Miosis → constricted pupil` |

And things that stay exactly as typed, on purpose: `Course_AT_12_Topic_SS.pptx`, `AB_12CD_34`, `It is 98-99% water`, `<40 rule`, `40 mg/mm^2`, `endothelium→TM`, `|---|---|`, `` `L = L + F` ``, `$L = L + F$`.

---

## Installing

1. Copy `main.js`, `manifest.json`, `styles.css` and `versions.json` into `<Vault>/.obsidian/plugins/notation-prettifier/`.
2. In Obsidian, open **Settings → Community plugins** and turn Restricted mode off.
3. Reload the installed plugins, then enable **Notation Prettifier**.
4. If **Symbols Prettifier** is enabled, turn it off: this plugin already carries its shortcuts. Leaving both on works, but both draw a widget on the same `->`.

From a source checkout:

```bash
./install.sh /path/to/YourVault
```

builds the bundle and copies the files into place. It needs `bun` or `npm`; with neither, it copies an existing `main.js`.

---

## Commands

| Command | What it does | Suggested hotkey |
|---|---|---|
| **Convert notation in the selection or line to LaTeX** | With a selection, converts just that text. With only a cursor, converts the current line. Always inline `$...$`. | `Ctrl/Cmd + Shift + L` |
| **Convert notation in the whole note to LaTeX** | Converts every line in the note. A line that is exactly one formula becomes `$$...$$`, unless you turn that off in settings. | none |
| **Preview the whole note conversion** | Opens a modal with the converted note and Apply and Cancel buttons. Nothing is written until Apply. | none |
| **Check the current line (diagnostics)** | Opens a report: the line, every formula span the engine found and its LaTeX, the shortcut matches, the editor mode, and whether the cursor is inside a span so it stays raw. Use it when a line does not render as expected. | none |
| **Toggle live preview** | Turns the live rendering on or off without opening settings. | none |

All three conversion commands go through Obsidian's normal undo, so a single `Ctrl/Cmd + Z` restores the note. The commands never run on their own; the plugin does not touch a note unless you ask.

---

## How it works

There are three layers, and the first two never modify your text.

1. **Live Preview** draws a widget over a span of rough notation while the cursor is elsewhere. The moment you stop typing, the cursor sits at the end of the span and the math appears; move the cursor inside the span and the raw text returns for editing, exactly like Symbols Prettifier. The document is untouched.
2. **Reading view** walks each rendered block and replaces the matching text nodes in place, from the last match to the first, so bold, links, list markers and table cells around a formula are not disturbed. Code blocks, inline code and existing MathJax are skipped.
3. **Bake commands** run the same engine and write the converted text back: `L^' = L + F` becomes `$L' = L + F$` in the source. Baked output is ordinary Obsidian math, so it renders with or without this plugin, exports to PDF, and survives a copy to another app.

### What counts as a formula

A run of math-looking characters is wrapped only when it earns it. That single decision is what keeps file names, tables and prose out of the math renderer.

A span qualifies when it contains:

- a **relation**: `=`, an arrow (`->`, `→`, `=>`), or a comparison (`>=`, `≤`, `!=`) whose operator has an operand on both sides, or
- a **prime or script on a symbol-like base**: `L'`, `F_0`, `i_1`, `n^(i)`, `x^2`, `mm` alone does not count.

Ordinary words never start a span and never qualify one. Once a relation is inside the span, a short word welded to a math token extends it: `dxF` in `(F_1+F_2-dxF_1xF_2)`, `hf` in `ΔE=hf=hc/λ`, `DS` in `+5.00DS`. The three-letter limit is what keeps `↔sphere-cylinder` and `+ equivalent-lens/scale-drawing` out.

A symbol-like base is a single letter, a number, an already scripted symbol, or a lowercase variable-like word (`dxF`, `dxL`, `dF`). All-caps abbreviations (`SS`, `LR`), capitalised words (`Mgmt`, `Lasers`, `AaD`) and units (`mm`) are not script bases, which is why `Course_AT_12_Topic_SS.pptx` and `AB_12CD_34` never turn into math.

### What is never touched

The engine protects these regions before it does anything:

| Region | Example |
|---|---|
| YAML frontmatter | the `---` block at the top of a note |
| Fenced code | ```` ```base ```` and ```` ```dataview ```` blocks, any language |
| Inline code | `` `L = L + F` `` |
| Inline and display math | `$L = L + F$`, `$$L = L + F$$` |
| Wikilinks and embeds | `[[Note|Alias]]`, `![[image.png\|188x188]]` |
| Markdown links | `[text](https://example.com)` |
| Bare URLs | `https://example.com/a_b` |
| Footnote references | `[^1]` |
| Thematic breaks | `---`, `***`, `- - -` |
| Setext heading markers | a line of `===` under a title |
| Markdown table separator rows | `\| --- \| :---: \|` |

The table row and thematic break protection is not cosmetic: the `--` and `===` shortcuts would otherwise turn `|---|---|` into en dashes and a `===` heading marker into `≡`.

---

## Built-in rules

Rules run in this order over the text of one formula:

1. **Text shortcuts** (the Symbols Prettifier map, plus `<degrees>`), which also run over plain text.
2. **Functions and roots**
3. **x between numbers means multiply**
4. **Primes, superscripts and subscripts**
5. **Greek letter names**
6. **Operators and relations**
7. **Units after a number**
8. **Custom formula rules**

Every group can be switched off in **Settings → Notation Prettifier → Built-in rule groups**, and each pattern is listed in the settings tab under **Built-in rule reference**.

### Functions and roots

| Pattern | Becomes | Example |
|---|---|---|
| `sin(`, `cos(`, `tan(`, `cot(`, `sec(`, `csc(`, `arcsin(`, `arccos(`, `arctan(`, `sinh(`, `cosh(`, `tanh(`, `log(`, `ln(`, `exp(` | `\sin(` and so on | `sin(x) = 0.5` becomes `$\sin(x) = 0.5$` |
| the same names followed by `^` | `\sin^` | `sin^-1(x)` becomes `$\sin^{-1}(x)$` |
| `sin θ`, `tan d` (a Greek letter or a spaced word follows) | `\sin θ`, `\tan d` | `h'=16.67·tanθ` becomes `$h'=16.67\cdot\tan θ$` |
| `sqrt(...)` | `\sqrt{...}` | `s = r - sqrt(r^2 - y^2)` becomes `$s = r - \sqrt{r^{2} - y^{2}}$` |
| `sqrt` followed by an unbracketed sum | `\sqrt{...}` over the sum | `sqrt r^2-y^2` becomes `$\sqrt{r^{2}-y^{2}}$` |

An unbracketed `sqrt` takes the sum that follows it, stopping at a top-level comma, semicolon or equals sign. `sqrt 9 + 2` becomes `$\sqrt{9} + 2$` because the sum stops at the space before the plus, and `sqrt x - 1` becomes `$\sqrt{x} - 1$`. Bracket the whole sum when in doubt: `sqrt(x^2 - y^2)`.

### x between numbers means multiply

| Pattern | Becomes | Example |
|---|---|---|
| `x` between a digit, `)`, `]` or `}` and a digit or `(` | `\times` | `25^2x6.5`, `(1/25^2)x1000`, `120x10^-3`, `(20^2x-8.5)` |
| `x` between a digit or `)` and a signed number | `\times` | `(20^2x-8.5)` |
| `x` after a capital and before `(` | `\times` | `F_LMx((n'-1)/0.523)` |

`x = 2` stays a variable. `2x + 3` stays algebra, because the `x` is not welded to a number.

### Primes, superscripts and subscripts

| You type | You get |
|---|---|
| `L^'` | `L'` |
| `L^(')`, `n^(')` | `L'`, `n'` |
| `L''` | `L''` |
| `n^(i)` | `n^{i}` |
| `x^(n-1)`, `x^(-1)`, `x^(2.5)` | `x^{n-1}`, `x^{-1}`, `x^{2.5}` |
| `x^2`, `y^n`, `x^-1` | `x^{2}`, `y^{n}`, `x^{-1}` |
| `10^1.204`, `x^10` | `10^{1.204}`, `x^{10}` |
| `x_(n)`, `d_(1)` | `x_{n}`, `d_{1}` |
| `x_1`, `i_2`, `F_0` | `x_{1}`, `i_{2}`, `F_{0}` |
| `x_10` | `x_{10}` |
| `L_next`, `F_v`, `O_c`, `i_c` | `L_{next}`, `F_{v}`, `O_{c}`, `i_{c}` |
| `F_{LM}` | `F_{LM}` (spacing normalised) |
| a curly prime `L’` or `L′` | `L'` |
| unicode scripts `10⁸`, `CO₂`, `]²` | `10^{8}`, `CO_{2}`, `]^{2}` |

### Greek letter names

| You type | You get |
|---|---|
| `alpha` `beta` `gamma` `delta` `Delta` `epsilon` `varepsilon` `zeta` `eta` `theta` `vartheta` `Theta` `iota` `kappa` `lambda` `Lambda` `mu` `nu` `xi` `Xi` `pi` `Pi` `rho` `sigma` `Sigma` `tau` `upsilon` `phi` `varphi` `Phi` `chi` `psi` `Psi` `omega` `Omega` | `\alpha` `\beta` `\gamma` `\delta` `\Delta` `\epsilon` `\varepsilon` `\zeta` `\eta` `\theta` `\vartheta` `\Theta` `\iota` `\kappa` `\lambda` `\Lambda` `\mu` `\nu` `\xi` `\Xi` `\pi` `\Pi` `\rho` `\sigma` `\Sigma` `\tau` `\upsilon` `\phi` `\varphi` `\Phi` `\chi` `\psi` `\Psi` `\omega` `\Omega` |

Greek names convert only inside a formula, so the word "delta" in prose stays a word. The group readmes list is here in the settings tab as well.

### Operators and relations

| You type | You get | You type | You get |
|---|---|---|---|
| `<=>` | `\Leftrightarrow` | `≤` | `\leq` |
| `<->` | `\leftrightarrow` | `≥` | `\geq` |
| `->` | `\to` | `≠` | `\neq` |
| `<-` | `\leftarrow` | `≡` | `\equiv` |
| `=>` | `\Rightarrow` | `±` | `\pm` |
| `<=` | `\Leftarrow` | `∓` | `\mp` |
| `=<` | `\leq` | `×` | `\times` |
| `>=` | `\geq` | `÷` | `\div` |
| `!=` | `\neq` | `·` `⋅` | `\cdot` |
| `+-` | `\pm` | `−` `–` `—` | `-` |
| `-+` | `\mp` | `%` | `\%` |
| `→` | `\to` | `⟶` | `\longrightarrow` |
| `←` | `\leftarrow` | `↔` | `\leftrightarrow` |
| `⟷` | `\longleftrightarrow` | `⇒` `⇐` `⇔` | `\Rightarrow` `\Leftarrow` `\Leftrightarrow` |

Note the Symbols Prettifier convention: `<=` is a left arrow and `=<` is less than or equal. The shortcuts table below shows the same mapping in its plain text form.

### Units after a number

A number or a closing bracket followed by a unit becomes `\,\text{unit}`. The unit list is `mm cm dm nm km um ms ns kg mg mol ml mL Hz kHz MHz rad deg dpt VA DS DC D`, plus `m` through the bracket and slash forms.

| You type | You get |
|---|---|
| `1.6mm`, `3.75 mm` | `1.6\,\text{mm}`, `3.75\,\text{mm}` |
| `+5.00DS`, `−2.00DC`, `+3.50 D` | `+5.00\,\text{DS}`, `-2.00\,\text{DC}`, `+3.50\,\text{D}` |
| `40 mg/mm^2` | `40\,\text{mg}/\text{mm}^{2}` |
| `30c/deg` | `30c/\text{deg}` |
| `20 °C` | `20^{\circ}\text{C}` |

Units convert inside a formula only, so `40 mg/mm^2` in a sentence stays plain until a relation pulls it into a formula.

---

## Text shortcuts

Shortcuts are literal text replacements. They apply to plain text, headings, list items and formula text alike, in Live Preview, Reading view and the bake commands, but never inside the protected regions listed above. This is the part that replaces Symbols Prettifier.

### Default shortcuts

| You type | You get |
|---|---|
| `<->` | `↔` |
| `<=>` | `⇔` |
| `===` | `≡` |
| `=/=` | `≠` |
| `<=` | `⇐` |
| `=>` | `⇒` |
| `->` | `→` |
| `<-` | `←` |
| `--` | `–` (en dash) |
| `!=` | `≠` |
| `=<` | `≤` |
| `>=` | `≥` |
| `+-` | `±` |
| `-+` | `∓` |
| `<degrees>`, `<degree>`, `<deg>` | `°` |
| `[degrees]`, `[degree]`, `[deg]` | `°` |

The square bracket degree forms exist because Markdown reads an angle bracket at the start of a line as an HTML tag. With **Rewrite angle bracket shortcuts as you type** on (the default), typing the closing `>` replaces `<deg>` with `°` in the document before the parser can see it, so the markdown below never breaks and no slash is needed. Turn the setting off and the source keeps `<deg>`, which works mid-line but can swallow the lines below when it starts one. `[deg]` is always safe. In Reading view the plugin also unwraps a tag element that is already in a note and puts the swallowed text back.

Inside a formula the same input becomes LaTeX instead of a glyph: `A -> B` renders from `$A \to B$`, while `Miosis ->` becomes `Miosis →` in prose. That is deliberate: prose gets the glyph, formulas get LaTeX.

Shortcut order matters. `<->` is checked before `<-` and `->`, and `<=>` before `<=`, so the longer arrow wins. The list in settings is applied top to bottom.

### Adding your own shortcuts

**Settings → Notation Prettifier → Text shortcuts → Shortcut list** holds one shortcut per line:

```text
literal => replacement
```

Lines starting with `#` are comments. The literal is plain text, not a regular expression, and every occurrence is replaced. Spaces around the replacement are trimmed.

Examples you can paste:

```text
<times> => ×
<pm> => ±
<mu> => µ
<pi> => π
<ohm> => Ω
<half> => ½
<approx> => ≈
<inf> => ∞
<therefore> => ∴
<check> => ✓
```

Because shortcuts run before the formula rules, a shortcut that produces an operator participates in formulas: with `<times> => ×`, `x = 2<times>3` becomes `$x = 2\times3$`, while `2<times>3` alone stays `2×3`.

Two cautions. A short literal like `x` would replace every x in your notes; keep the literals distinctive. And a shortcut does not run inside code, math, links or frontmatter.

---

## Custom formula rules

**Settings → Notation Prettifier → Custom formula rules** adds your own rules without editing the plugin. One per line:

```text
regular expression => replacement
```

The pattern is a JavaScript regular expression, the replacement is a JavaScript replacement string, so `$1`, `$2` refer to capture groups. The line is split at its **last** `=>`, which lets a pattern itself contain `=>` as long as the replacement does not. Lines starting with `#` are comments. An invalid pattern is reported under the box and skipped; the rest still apply.

Custom rules run after all built-in groups, inside formula spans only. To override a built-in rule, switch its group off and write the rule yourself.

### Worked examples

Read `n^(i)` as multiplication instead of a superscript (the Snell's law line):

```text
n\^\(i\) => n\,i
```

Turn simple fractions into stacked fractions, with a guard against visual acuity `6/6`:

```text
(?<![0-9])([0-9]+)/([0-9]+)(?![0-9/]) => \frac{$1}{$2}
```

Write `xx` for multiplication when `x` is not between numbers:

```text
\b([A-Za-z0-9])\s*xx\s*([A-Za-z0-9]) => $1\times$2
```

Spell `deg` as a degree sign inside formulas:

```text
\bdeg\b => ^{\circ}
```

Use `\text` for a dioptre power that must not be italic:

```text
\b([0-9.]+)D\b => $1\,\text{D}
```

Convert a call like `F(x)` to `F\left(x\right)`:

```text
\b([A-Za-z])\(([^()]*)\) => $1\left($2\right)
```

Escaping notes:

- Write a literal backslash in a pattern as `\\`. The regex `\^` (a caret) is typed `\^`.
- The replacement is literal, so `\to` inserts the four characters `\to`; only `$` is special. Write `$$` for a literal dollar sign.
- Patterns are case sensitive. Add `(?i)` at the start for case-insensitive matching when the host supports it.

### Testing a rule without committing it

**Settings → Notation Prettifier → Try it** has a sample box. Type or paste rough notation and see, live, both the rendered result and the exact source the bake command would write. Invalid custom rules are flagged with a red message directly under their box.

---

## Settings

Everything lives under **Settings → Notation Prettifier**.

| Section | Setting | Default | What it does |
|---|---|---|---|
| Behaviour | Live preview | on | Render notation as math while you type. The note text is not changed; the cursor inside a range shows the raw text again. |
| | Reading view | on | Render notation as math in Reading view and in exported HTML. |
| | Rewrite angle bracket shortcuts as you type | on | Typing `<deg>` writes the degree sign into the note immediately, so Markdown never sees a tag and cannot swallow the lines below. Turn it off to leave the source untouched; the `[deg]` forms are always safe. |
| | Display math for a line that is one formula | on | When baking, a line whose whole content is one formula becomes `$$...$$` instead of `$...$`. Applies to the note and line commands, not to a selection. |
| Built-in rule groups | Text shortcuts | on | The Symbols Prettifier map plus the degree shortcuts. The list itself is editable below. |
| | Functions and roots | on | `sin(`, `sqrt ...` and the rest. |
| | x between numbers means multiply | on | `25^2x6.5` and `F_LMx(` become `\times`. |
| | Primes, superscripts and subscripts | on | `L^'`, `i_1`, `L_next` and unicode scripts. |
| | Greek letter names | on | `theta` to `\theta` and the rest, inside formulas. |
| | Operators and relations | on | Arrows, comparisons, `\times`, `\cdot`, percent and dash normalisation. |
| | Units after a number | on | `1.6mm` to `1.6\,\text{mm}`. |
| Text shortcuts | Shortcut list | the 17 defaults | One `literal => replacement` per line. Applied to plain text and formulas. |
| Custom formula rules | Rule list | empty | One `regex => replacement` per line. Applied after the built-in groups, inside formulas. |
| Try it | Sample | empty | Type rough notation and see the render and the baked source. |
| | Built-in rule reference | collapsed | Every built-in pattern with its replacement, for copying into a custom rule. |
| | Restore defaults | button | Puts every toggle, shortcut and custom rule back to the shipped values. |

Settings apply immediately. Open editors rebuild their decorations without a reload.

### Turning individual things off

- **A whole feature**: use the toggle in **Built-in rule groups**, or the **Toggle live preview** command for the live layer only.
- **One built-in pattern**: there is no per-pattern checkbox, but the group toggles cover the families, and every pattern is listed in the reference. To replace one, switch its group off and write the pattern as a custom rule.
- **One shortcut**: delete its line in the **Shortcut list**. Deleting all lines leaves only the custom rules.
- **Everything at once**: **Restore defaults**, then switch off what you do not want.

---

## Known limits

These are honest gaps, not bugs waiting to be reported.

- **Prose inside a formula splits it.** In the headline example, `(Vergence after the surface)` is prose, so the render is `$L'$ (Vergence after the surface) $= L$ (Vergence before the surface) + F (Power)`. The plugin has no natural language understanding and does not restructure sentences.
- **`n^(i)` is read as a superscript**, giving `n^{i}`. If it means multiplication in your notes, add the custom rule shown above.
- **No AI, no network.** This is a rule engine on purpose: it is instant, free, deterministic and works offline.
- **Fractions are not automatic.** `6/6`, `20/20` and `1.5/1.6` stay as they are, because visual acuity notation uses the slash. Add the fraction custom rule if you want it.
- **`x` as multiplication is scoped** to numbers, closing brackets and the capital-before-bracket form. `2x + 3` stays algebra.
- **An unbracketed `sqrt` takes the following sum.** Bracket it when the source is ambiguous.
- **A span never crosses a line.** `L =` at the end of a line and `F` on the next are two lines.
- **Comparisons and arrows need operands on both sides.** `n > 1.7` wraps, `<40` and `endothelium→TM` do not.
- **Units convert inside formulas only.** `40 mg/mm^2` in a sentence stays plain until a relation is present.
- **Table cells are separate.** A `|` ends a span, so a formula cannot span two cells.
- **A display formula must be alone on its line.** Anything before or after it keeps the inline form.
- **Multi-letter subscripts follow the source.** `F_LM` becomes `F_{LM}`, and `F_LMx(` is read as `F_{LM}\times(`.
- **Shortcuts are literal and global.** Choose distinctive literals; a `<` or a single letter would be a bad shortcut. An angle-bracket shortcut at the start of a line can be read as an HTML tag by Markdown and swallow the lines below, which is why the plugin rewrites those shortcuts as you type by default, and why the square bracket degree forms exist.
- **A formula is drawn only when the cursor is not strictly inside it.** A cursor at either edge still draws it, so a freshly typed formula renders without moving the cursor; place the cursor inside the span to edit the raw text.
- **Obsidian loads MathJax lazily.** The plugin asks for it at startup and retries a formula render until it succeeds, so a formula never stays as raw text because the math engine was not ready yet.
- **Other decoration plugins can overlap.** Disable Symbols Prettifier; other math or decoration plugins may also draw over the same range.

---

## Performance

The live layer is built to cost about the same on a small note and a huge one.

- Only a window of 1,500 characters on each side of the viewport is tokenized, never the whole document.
- The scan for an open code fence or `$$` block before the window is cached until an edit touches that part of the document, so typing at one spot pays for it once.
- A one character class check skips pure prose lines before the tokenizer runs.
- Every converted span is memoised per raw text and configuration version, so a formula repeated in a table or a re-rendered reading view converts once.
- Baking a note longer than 200,000 characters runs in 2,000 line chunks and yields to the event loop between chunks, with a progress notice, so the UI stays responsive.

Measured with `bun test/bench.mjs` on a synthetic note with a formula every eight lines:

| Document | Cold prefix scan | Warm keystroke | Full bake |
|---|---|---|---|
| 50,000 chars, 555 lines | | | 18 ms |
| 200,000 chars, 2,217 lines | | | 44 ms |
| 1,000,000 chars, 11,084 lines | 1.3 ms | 0.37 ms | 238 ms |
| 5,000,000 chars, 55,417 lines | | | 773 ms |

A warm keystroke means the window scan and the decoration build after the prefix cache is warm, which is the common case while typing. Full bake is the explicit command path. `test/bench.mjs` reports every number and fails only on generous bounds, so a slow machine reports rather than lies.

**No WebAssembly and no worker threads, on purpose.** The work is native regular expressions over text, which the JavaScript engine runs faster than a WASM round trip would, and a CodeMirror decoration must be produced synchronously: a worker cannot answer in time for a repaint. WASM would add a build artefact and an asynchronous boundary for no measured gain. The one place a thread would help, baking a multi-megabyte note, is handled by chunked yielding instead.

---

## Testing

The synthetic suites need nothing but the repository:

```bash
bun esbuild.config.mjs production   # build main.js
bun test/convert.mjs                # the conversion engine, 71 checks
bun test/editor.mjs                 # the live window scanner, 13 checks
bun test/examples.mjs               # the documented examples in this README, 44 checks
bun test/smoke.mjs                  # the built bundle under an Obsidian stub, 56 checks
bun test/privacy.mjs                # no personal paths in tracked files
bun test/bench.mjs                  # performance report and bounds
```

`test/harness.mjs` gives linkedom the Obsidian element extensions, so the reading view, the settings tab and the preview modal run outside Obsidian with no mocks inside the plugin code.

The real-notes suite reads a folder of notes from the gitignored `.testenv`:

```bash
cp .testenv.example .testenv
# set NP_TEST_FOLDER to a folder of notes
bun test/corpus.mjs                 # every .md in the folder, read only
bun test/corpus.mjs --show 40       # also print 40 converted lines
bun test/corpus.mjs --limit 20      # a fast run over the first 20 files
```

For every file the corpus run checks: baking does not throw, baking twice gives the same text, the line count is unchanged, every protected region survives verbatim, dollar delimiters come in pairs, braces balance inside every span, and a sample of converted lines renders through the real Reading view code. It never writes to the folder.

Last run on a library of 225 old optometry notes (23,860 lines):

| Check | Result |
|---|---|
| Corpus over 225 notes, read only | 0 failures, about 0.3 s |
| Formulas wrapped | 606, across 46 files; 179 files needed no change |
| Protected regions preserved | 3,317 of 3,317 |
| Converted lines rendered through the Reading view | 300 lines, 375 inline elements, no empty formula |
| Engine checks (`test/convert.mjs`) | 71 pass, 0 fail |
| Live window scanner (`test/editor.mjs`) | 13 pass, 0 fail |
| Documented examples (`test/examples.mjs`) | 44 pass, 0 fail |
| Bundle checks (`test/smoke.mjs`) | 56 pass, 0 fail |
| Performance (`test/bench.mjs`) | 0 over bound, 0.37 ms warm keystroke on a 1 MB note |

The documented examples in this README are pinned by `test/examples.mjs`, so a rule change that disagrees with the manual fails the suite.

`.testenv` also carries `NP_PRIVACY_PATTERNS`, a comma separated list of regular expressions that must never appear in a tracked file. `test/privacy.mjs` scans `git ls-files`, so the repository stays free of vault names, course codes and document prefixes.

---

## Funding

If this plugin saves you time, consider supporting its development. Every contribution goes toward maintenance, new rule coverage and the long tail of notation that real notes contain.

**Monero (XMR):**

```
8BdxmQSniku4dBJXWPXeXvgjztmj5nmvWQqeCrVvCtYciusbAyo4rqrGCefTfQ4gGaVZmLN7VgLiYUYyBdYFEwHn1UWPjWs
```

> **Tip:** You can easily purchase Litecoin using [Cake Wallet](https://cakewallet.com/) and then, within the app, create a Monero wallet and exchange the Litecoin into it, pointed at the address above.

Crypto isn't your thing? Starring the repository, filing clear bug reports with a sample line of notation, and telling other Obsidian users about the plugin all help just as much.

---

## License

GPL-3.0-or-later. Copyright (C) 2026 Zoroaster1x. See [`LICENSE`](LICENSE).

The arrow and sign shortcut map follows Symbols Prettifier by Florian Woelki (MIT), so those shortcuts keep working after switching plugins.

---

## Appendix: every built-in pattern

The settings tab shows the same list under **Built-in rule reference**. Patterns are JavaScript regular expressions; replacements are JavaScript replacement strings.

### Functions and roots

```text
(?<!\\)\b(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp)(?=\s*[(^])  =>  \$1
(?<!\\)\b(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\s*(?=[\u0370-\u03ff])  =>  \$1 
(?<!\\)\b(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\s+(?=[A-Za-z])  =>  \$1 
\bsqrt\s*\(([^()]*)\)  =>  \sqrt{$1}
\bsqrt\s+([A-Za-z0-9][A-Za-z0-9^(){}\[\].,]*(?:\s*[-+]\s*[A-Za-z0-9][A-Za-z0-9^(){}\[\].,]*)*)  =>  \sqrt{$1}
```

### x between numbers means multiply

```text
(?<=[0-9)\]}])x(?=-?\d|\()  =>  \times
(?<=[0-9)\]}])x(?=[-+]\d)  =>  \times
(?<=[A-Z])x(?=\()  =>  \times
```

### Primes, superscripts and subscripts

```text
[\u2019\u2032]  =>  '
\^\(\s*('+)\s*\)  =>  $1
\^('+)  =>  $1
\^\(\s*([-+]?[A-Za-z0-9]{1,4})\s*\)  =>  ^{$1}
\^\(\s*([^()]{1,24}?)\s*\)  =>  ^{$1}
([A-Za-z0-9)\]}])\^(-?\d+(?:\.\d+)?)  =>  $1^{$2}
([A-Za-z0-9)\]}])\^(-?[A-Za-z0-9])  =>  $1^{$2}
([A-Za-z0-9)\]}])_\s*\(\s*([-+]?[A-Za-z0-9]{1,6})\s*\)  =>  $1_{$2}
([A-Za-z0-9)\]}])_\s*\(\s*([^()]{1,24}?)\s*\)  =>  $1_{$2}
([A-Za-z0-9)\]}])_\{\s*([^{}]{1,40}?)\s*\}  =>  $1_{$2}
([A-Za-z0-9)\]}])_([A-Za-z]{1,12})  =>  $1_{$2}
([A-Za-z0-9)\]}])_(-?\d{2,})  =>  $1_{$2}
([A-Za-z0-9)\]}])_([A-Za-z0-9])  =>  $1_{$2}
([\^_])\{\s*([^{}]{1,60}?)\s*\}  =>  $1{$2}
⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹  =>  ^{0} ^{1} ^{2} ^{3} ^{4} ^{5} ^{6} ^{7} ^{8} ^{9}
₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉  =>  _{0} _{1} _{2} _{3} _{4} _{5} _{6} _{7} _{8} _{9}
```

### Greek letter names

```text
(?<!\\)\b(alpha|beta|gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|mu|nu|xi|Xi|pi|Pi|rho|sigma|Sigma|tau|upsilon|phi|varphi|Phi|chi|psi|Psi|omega|Omega)\b  =>  \$1
```

### Operators and relations

```text
<=>  =>  \Leftrightarrow
<->  =>  \leftrightarrow
->  =>  \to
<-  =>  \leftarrow
=>  =>  \Rightarrow
<=  =>  \Leftarrow
=<  =>  \leq
>=  =>  \geq
!=  =>  \neq
\+-  =>  \pm
-\+  =>  \mp
×  =>  \times
÷  =>  \div
[·⋅]  =>  \cdot
[−–—]  =>  -
→  =>  \to
⟶  =>  \longrightarrow
←  =>  \leftarrow
↔  =>  \leftrightarrow
⟷  =>  \longleftrightarrow
⇒  =>  \Rightarrow
⇐  =>  \Leftarrow
⇔  =>  \Leftrightarrow
≤  =>  \leq
≥  =>  \geq
≠  =>  \neq
≡  =>  \equiv
±  =>  \pm
∓  =>  \mp
(?<!\\)%  =>  \%
```

### Units after a number

```text
([0-9)])\s*(mm|cm|dm|nm|km|um|ms|ns|kg|mg|mol|ml|mL|Hz|kHz|MHz|rad|deg|dpt|VA|DS|DC|D)\b  =>  $1\,\text{$2}
(/)\s*(mm|cm|dm|nm|km|um|ms|ns|kg|mg|mol|ml|mL|Hz|kHz|MHz|rad|deg|dpt|VA|DS|DC|D)\b  =>  $1\text{$2}
([0-9])\s*°\s*C\b  =>  $1^{\circ}\text{C}
```

---

## Documented examples (pinned by `test/examples.mjs`)

Every line below is checked by `bun test/examples.mjs` against the current engine.

<!-- examples:start -->
```text
L^' = L + F  ==>  $L' = L + F$
i_1^' + d_1 = i_2  ==>  $i_{1}' + d_{1} = i_{2}$
n^(i) = n^(')i^(')  ==>  $n^{i} = n'i'$
L^(') = L + F  ==>  $L' = L + F$
x^(n-1)  ==>  $x^{n-1}$
x^2 + y^10  ==>  $x^{2} + y^{10}$
10^1.204  ==>  $10^{1.204}$
F_{LM}  ==>  $F_{LM}$
L_next=L′/(1−dxL)  ==>  $L_{next}=L'/(1-dxL)$
h'=16.67·tanθ  ==>  $h'=16.67\cdot\tan θ$
tan θ = 0.5  ==>  $\tan θ = 0.5$
sqrt r^2-y^2  ==>  $\sqrt{r^{2}-y^{2}}$
s = r - sqrt(r^2 - y^2)  ==>  $s = r - \sqrt{r^{2} - y^{2}}$
d = 360^\circ - 2a  ==>  $d = 360^\circ - 2a$
\frac{1}{v} + \frac{1}{u} = \frac{1}{f}  ==>  $\frac{1}{v} + \frac{1}{u} = \frac{1}{f}$
(1/25^2)x1000=1.6mm  ==>  $(1/25^{2})\times1000=1.6\,\text{mm}$
(20^2x-8.5)/(2000(1.5-1))=−3.4mm  ==>  $(20^{2}\times-8.5)/(2000(1.5-1))=-3.4\,\text{mm}$
F_T=F_LMx((n'-1)/0.523)  ==>  $F_{T}=F_{LM}\times((n'-1)/0.523)$
F=(n'−n)/r  ==>  $F=(n'-n)/r$
45° → 90°  ==>  $45° \to 90°$
n > 1.7  ==>  $n > 1.7$
x <= y  ==>  $x \Leftarrow y$
x =< y  ==>  $x \leq y$
a >= b  ==>  $a \geq b$
p != q  ==>  $p \neq q$
n +- m  ==>  $n \pm m$
theta = 2  ==>  $\theta = 2$
ΔE=hf=hc/λ  ==>  $ΔE=hf=hc/λ$
Miosis -> constricted pupil  ==>  Miosis → constricted pupil
5<degrees>  ==>  5°
5[deg]  ==>  5°
x = 30<degrees>  ==>  $x = 30°$
rough -- dash  ==>  rough – dash
0.8+2.34375--3.125=0.01875  ==>  $0.8+2.34375-3.125=0.01875$
Course_AT_12_Topic_SS.pptx  ==>  Course_AT_12_Topic_SS.pptx
AB_12CD_34  ==>  AB_12CD_34
It is 98-99% water.  ==>  It is 98-99% water.
<40 rule  ==>  <40 rule
40 mg/mm^2  ==>  40 mg/mm^2
endothelium→TM/iris  ==>  endothelium→TM/iris
|---|---|  ==>  |---|---|
![[Pasted image 20250101120000.png|188x188]]  ==>  ![[Pasted image 20250101120000.png|188x188]]
`L = L + F`  ==>  `L = L + F`
$L = L + F$  ==>  $L = L + F$
[display] L = L + F  ==>  $$L = L + F$$
```
<!-- examples:end -->
