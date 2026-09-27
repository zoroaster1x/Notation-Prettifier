/*
 * Notation Prettifier, an Obsidian plugin that renders rough math notation as
 * LaTeX in the editor and reading view and can bake the LaTeX into the note.
 *
 * Copyright (C) 2026 Zoroaster1x
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Notation Prettifier tests: the conversion engine, offline, against the
 * notation habits found in real optometry notes.
 *
 *   bun test/convert.mjs
 */

import {
  bakeText,
  bakeTextAsync,
  candidateRegex,
  detectShortcutMatches,
  detectSpans,
  protectedRanges,
  shortcutMapFor,
} from "../src/engine.js";
import {
  DEFAULT_SHORTCUTS_TEXT,
  compileRules,
  compileShortcuts,
  mathWordsFor,
  shortcutTokenRegex,
} from "../src/rules.js";

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log("ok   " + name);
  } else {
    fail++;
    console.log("FAIL " + name + (detail ? "  -> " + detail : ""));
  }
}
function eq(name, actual, expected) {
  check(name, actual === expected, JSON.stringify(actual) + " != " + JSON.stringify(expected));
}

const baseSettings = {
  groups: {
    shortcuts: true,
    scripts: true,
    greek: true,
    operators: true,
    functions: true,
    units: true,
    xMultiply: true,
  },
  shortcutsText: DEFAULT_SHORTCUTS_TEXT,
  customRulesText: "",
};

function options(settings, overrides) {
  const merged = Object.assign({}, baseSettings, settings);
  const shortcuts = compileShortcuts(merged);
  return Object.assign(
    {
      rules: compileRules(merged),
      shortcuts,
      mathWords: mathWordsFor(merged),
      shortcutToken: shortcutTokenRegex(shortcuts),
      displayFormulaLines: false,
    },
    overrides || {}
  );
}

function bake(text, settings, overrides) {
  return bakeText(text, options(settings, overrides));
}

console.log("--- the note that started it all");
eq(
  "paraxial relationship line",
  bake(
    'When doing step-along raytracing, we use the "Fundamental Paraxial Relationship" (which is **L^\' (Vergence after the surface) = L (Vergence before the surface) + F (Power)** )'
  ).text,
  'When doing step-along raytracing, we use the "Fundamental Paraxial Relationship" (which is **$L\'$ (Vergence after the surface) $= L$ (Vergence before the surface) + F (Power)** )'
);
eq(
  "Snell line",
  bake("Derived from approximate Snell's law = n^(i) = n^(')i^(')").text,
  "Derived from approximate Snell's law $= n^{i} = n'i'$"
);

console.log("--- degree shortcut");
eq("degree in prose", bake("Turn 5<degrees>").text, "Turn 5\u00b0");
eq("degree in a formula", bake("x = 30<degrees>").text, "$x = 30\u00b0$");
eq("html safe degree in prose", bake("Turn 5[deg]").text, "Turn 5\u00b0");
eq("html safe degrees in a formula", bake("x = 30[degrees]").text, "$x = 30\u00b0$");

console.log("--- Symbols Prettifier arrow and sign shortcuts");
eq("arrow in prose", bake("Miosis -> constricted pupil").text, "Miosis \u2192 constricted pupil");
eq("left arrow in a formula", bake("A <- B").text, "$A \\leftarrow B$");
eq("both arrows", bake("a <-> b").text, "$a \\leftrightarrow b$");
eq("less or equal typed <=", bake("x <= y").text, "$x \\Leftarrow y$");
eq("greater or equal", bake("y >= z").text, "$y \\geq z$");
eq("not equal", bake("p != q").text, "$p \\neq q$");
eq("identical", bake("u === v").text, "$u \\equiv v$");
eq("plus minus", bake("n +- m").text, "$n \\pm m$");
eq("en dash in prose", bake("rough -- dash").text, "rough \u2013 dash");
eq("thematic break untouched", bake("---").text, "---");
eq("setext marker untouched", bake("Heading\n===").text, "Heading\n===");

console.log("--- optometry notation");
eq("lista subscript", bake("- d=d_1+d_2").text, "- $d=d_{1}+d_{2}$");
eq("prime after subscript", bake("- i_1=i_1^' + d_1").text, "- $i_{1}=i_{1}' + d_{1}$");
eq("parenthesised difference", bake("- d_1=(i_1-i_1^2)").text, "- $d_{1}=(i_{1}-i_{1}^{2})$");
eq("focimeter x multiply", bake("x=(1/(F_0)^2)x1000").text, "$x=(1/(F_{0})^{2})\\times1000$");
eq(
  "dioptre per mm",
  bake("(1/25^2)x1000=1.6mm per dioptre").text,
  "$(1/25^{2})\\times1000=1.6\\,\\text{mm}$ per dioptre"
);
eq("sqrt without brackets", bake("s=r-sqrt r^2-y^2").text, "$s=r-\\sqrt{r^{2}-y^{2}}$");
eq(
  "sqrt with brackets and units",
  bake("s=120-sqrt(120)^2-30^2=3.810499614mm").text,
  "$s=120-\\sqrt{120}^{2}-30^{2}=3.810499614\\,\\text{mm}$"
);
eq(
  "word subscripts and x times",
  bake("BVP of F' = (F_1+F_2-dxF_1xF_2)/(1-dF_1)").text,
  "BVP of $F' = (F_{1}+F_{2}-dxF_{1}xF_{2})/(1-dF_{1})$"
);
eq("unicode prime and minus", bake("L_next=L\u2032/(1\u2212dxL)").text, "$L_{next}=L'/(1-dxL)$");
eq(
  "worked answer with label",
  bake("(-3)/(1-0.05(-3))=-2.60869565217 (L_2)").text,
  "$(-3)/(1-0.05(-3))=-2.60869565217 (L_{2})$"
);
eq("negative start", bake("-5/-3=1.66666666667 m_1").text, "$-5/-3=1.66666666667 m_{1}$");
eq("bare latex command", bake("d = 360^\\circ - 2a").text, "$d = 360^\\circ - 2a$");
eq(
  "bare latex text group",
  bake("D = \\frac{1}{\\text{focal length (m)}}").text,
  "$D = \\frac{1}{\\text{focal length (m)}}$"
);
eq(
  "bare latex formula line",
  bake("  \\frac{1}{v} + \\frac{1}{u} = \\frac{1}{f} \\quad \\text{and} \\quad m = -\\frac{v}{u}").text,
  "  $\\frac{1}{v} + \\frac{1}{u} = \\frac{1}{f} \\quad \\text{and} \\quad m = -\\frac{v}{u}$"
);
eq(
  "trailing arrow is left outside",
  bake("1/(10^1.20411998266)=0.0624999999994  -> **6.24%**").text,
  "$1/(10^{1.20411998266})=0.0624999999994$  \u2192 **6.24%**"
);
eq(
  "unit per unit stays plain without a relation",
  bake("Usually 40 mg/mm^2").text,
  "Usually 40 mg/mm^2"
);
eq(
  "unit per unit converts inside a formula",
  bake("d = 40 mg/mm^2").text,
  "$d = 40\\,\\text{mg}/\\text{mm}^{2}$"
);
eq(
  "negative factor in a fraction",
  bake("(20^2x-8.5)/(2000(1.5-1))=\u22123.4mm").text,
  "$(20^{2}\\times-8.5)/(2000(1.5-1))=-3.4\\,\\text{mm}$"
);

console.log("--- spaces end a script formula");
eq("space ends a script formula", bake("n^(-3) l").text, "$n^{-3}$ l");
eq("no space joins the letter", bake("n^(-3)l").text, "$n^{-3}l$");
eq("two spaces end it too", bake("n^2  x").text, "$n^{2}$  x");
eq("a relation keeps spaced operands", bake("L = L + F").text, "$L = L + F$");
eq("a function keeps a spaced argument", bake("cos \u03b8 = 0.5").text, "$\\cos \u03b8 = 0.5$");
eq("a unit keeps its space", bake("F = 2.50 D").text, "$F = 2.50\\,\\text{D}$");

console.log("--- markdown formatting around formulas");
eq("bold around a formula", bake("**L^' = L + F**").text, "**$L' = L + F$**");
eq("italic around a formula", bake("*L^' = L + F*").text, "*$L' = L + F$*");
eq("bold italic around a formula", bake("***L^' = L + F***").text, "***$L' = L + F$***");
eq("underscore emphasis", bake("_L^' = L + F_").text, "_$L' = L + F$_");
eq("bold Snell line", bake("**n^(i) = n^(')i^(')**").text, "**$n^{i} = n'i'$**");
eq("bold in a table cell", bake("| **L^' = L + F** |").text, "| **$L' = L + F$** |");
eq("bold in a quote", bake("> **L^' = L + F**").text, "> **$L' = L + F$**");
eq(
  "a link protects its label",
  bake("[L^' = L + F](https://example.com)").text,
  "[L^' = L + F](https://example.com)"
);
eq("highlight around a formula", bake("==L^' = L + F==").text, "==$L' = L + F$==");
eq("strikethrough around a formula", bake("~~L^' = L + F~~").text, "~~$L' = L + F$~~");
eq("html mark around a formula", bake("<mark>L^' = L + F</mark>").text, "<mark>$L' = L + F$</mark>");
eq("html underline around a formula", bake("<u>L^' = L + F</u>").text, "<u>$L' = L + F$</u>");
eq(
  "html colour around a formula",
  bake('<span style="color: red">L^\' = L + F</span>').text,
  '<span style="color: red">$L\' = L + F$</span>'
);
eq(
  "coloured text plugin markup",
  bake('<span class="colored-text" style="color:#e91e63">L^\' = L + F</span>').text,
  '<span class="colored-text" style="color:#e91e63">$L\' = L + F$</span>'
);
eq("a broken line tag is protected", bake("a<br>b").text, "a<br>b");
eq("the degree shortcut still fires", bake("<deg>").text, "\u00b0");
const formatted = bake("**L^' = L + F**").text;
const innerSpans = [];
const dollarBlocks = formatted.split("$$");
for (let i = 1; i < dollarBlocks.length; i += 2) innerSpans.push(dollarBlocks[i]);
for (let i = 0; i < dollarBlocks.length; i += 2) {
  const parts = dollarBlocks[i].split("$");
  for (let j = 1; j < parts.length; j += 2) innerSpans.push(parts[j]);
}
eq(
  "formatting markers never enter a span",
  innerSpans.length > 0 && innerSpans.every((span) => span.indexOf("*") === -1 && span.indexOf("`") === -1) ? "clean" : "marker inside",
  "clean"
);

console.log("--- things that must stay plain");
eq("possessive after a number", bake("Y2's bay this week").text, "Y2's bay this week");
eq("possessive after a digit", bake("the 2's column").text, "the 2's column");
eq("common contraction", bake("don't do it").text, "don't do it");
eq("prime after a script", bake("i_1' = i_2").text, "$i_{1}' = i_{2}$");
eq("prose percentage", bake("It is composed of 98-99% water.").text, "It is composed of 98-99% water.");
eq("wikilink", bake("[[Extra/Exam_Stuff/Exam info|Exam Information]]").text, "[[Extra/Exam_Stuff/Exam info|Exam Information]]");
eq("image embed", bake("![[Pasted image 20250101120000.png|188x188]]").text, "![[Pasted image 20250101120000.png|188x188]]");
eq("annotation id", bake("AB_12CD_34").text, "AB_12CD_34");
eq("inline code", bake("`L = L + F` stays code").text, "`L = L + F` stays code");
eq("existing math", bake("$L = L + F$ stays math").text, "$L = L + F$ stays math");
eq("footnote reference", bake("A fact[^1] and x = 2").text, "A fact[^1] and $x = 2$");
eq("frontmatter", bake("---\nsource: a_b.pptx\n---\nL = 1\n").text, "---\nsource: a_b.pptx\n---\n$L = 1$\n");
eq("fenced code", bake("```\nL = 1\n```\n").text, "```\nL = 1\n```\n");
eq("prose arrows stay prose arrows", bake("the retina -> the brain").text, "the retina \u2192 the brain");

console.log("--- display math");
eq("formula line becomes display", bake("L = L + F", null, { displayFormulaLines: true }).text, "$$L = L + F$$");
eq(
  "indented formula keeps its indent",
  bake("  \\frac{a}{b} = c", null, { displayFormulaLines: true }).text,
  "  $$\\frac{a}{b} = c$$"
);
eq("inline when display is off", bake("L = L + F", null, { displayFormulaLines: false }).text, "$L = L + F$");

console.log("--- configuration");
const noMultiply = Object.assign({}, baseSettings, {
  groups: Object.assign({}, baseSettings.groups, { xMultiply: false }),
});
eq(
  "xMultiply off leaves the x",
  bake("(1/25^2)x1000=1.6", noMultiply).text,
  "$(1/25^{2})x1000=1.6$"
);
const noShortcuts = Object.assign({}, baseSettings, {
  groups: Object.assign({}, baseSettings.groups, { shortcuts: false }),
});
eq(
  "shortcuts off keeps -> in prose",
  bake("the retina -> the brain", noShortcuts).text,
  "the retina -> the brain"
);
eq(
  "shortcuts off still converts inside a formula",
  bake("A -> B", noShortcuts).text,
  "$A \\to B$"
);
const noScripts = Object.assign({}, baseSettings, {
  groups: Object.assign({}, baseSettings.groups, { scripts: false }),
  customRulesText: "25\\^2 => 625",
});
eq("custom rule after built-ins", bake("x=1/(25^2)", noScripts).text, "$x=1/(625)$");
const customShortcut = Object.assign({}, baseSettings, {
  shortcutsText: "<permille> => \u2030",
});
eq("custom shortcut in prose", bake("5<permille>", customShortcut).text, "5\u2030");
const customOperator = Object.assign({}, baseSettings, {
  shortcutsText: "<times> => \u00d7",
});
eq("custom operator shortcut stays text alone", bake("2<times>3", customOperator).text, "2\u00d73");
eq("custom operator shortcut in a formula", bake("x = 2<times>3", customOperator).text, "$x = 2\\times3$");

console.log("--- engine API");
const multiline = "text\n\nL = L + F\n\nmore";
const spans = detectSpans(multiline, options());
check("detectSpans finds one span", spans.length === 1, JSON.stringify(spans));
check("detectSpans raw text", spans[0] && spans[0].raw === "L = L + F", JSON.stringify(spans));
check("span does not cross lines", spans[0] && multiline.slice(spans[0].from, spans[0].to) === "L = L + F");
const prot = protectedRanges("a $x = 1$ b `y = 2` c");
check("protected ranges count", prot.length === 2, JSON.stringify(prot));
const shortcutMatches = detectShortcutMatches("before -> after", options());
check("shortcut match found", shortcutMatches.length === 1, JSON.stringify(shortcutMatches));
check(
  "shortcut match range",
  shortcutMatches[0] && shortcutMatches[0].from === 7 && shortcutMatches[0].to === 9,
  JSON.stringify(shortcutMatches)
);

console.log("--- candidate fast path");
const candidate = candidateRegex(compileShortcuts(baseSettings));
check("candidate accepts a formula line", candidate.test("L^' = L + F"));
check("candidate accepts a shortcut", candidate.test("retina -> brain"));
check("candidate rejects plain prose", !candidate.test("The cornea is the clear front window of the eye."));

console.log("--- idempotency");
const samples = [
  'When doing step-along raytracing (which is **L^\' = L + F**)',
  "Derived from approximate Snell's law = n^(i) = n^(')i^(')",
  "s=r-sqrt r^2-y^2",
  "(1/25^2)x1000=1.6mm per dioptre",
  "BVP of F' = (F_1+F_2-dxF_1xF_2)/(1-dF_1)",
  "Miosis -> constricted pupil",
  "L = L + F",
  "A fact[^1] and x = 2",
  "![[Pasted image 20250101120000.png|188x188]]",
];
let idempotent = true;
let idempotentDetail = "";
for (const sample of samples) {
  const once = bake(sample).text;
  const twice = bake(once).text;
  if (once !== twice) {
    idempotent = false;
    idempotentDetail = JSON.stringify(sample) + ": " + JSON.stringify(once) + " -> " + JSON.stringify(twice);
    break;
  }
}
check("bake is idempotent", idempotent, idempotentDetail);

console.log("--- chunked bake");
let chunked = true;
let chunkedDetail = "";
for (const sample of samples) {
  const sync = bake(sample).text;
  const asyncResult = await bakeTextAsync(sample, options());
  if (asyncResult.text !== sync) {
    chunked = false;
    chunkedDetail = JSON.stringify(sample) + ": " + JSON.stringify(sync) + " -> " + JSON.stringify(asyncResult.text);
    break;
  }
}
check("chunked bake matches the sync bake", chunked, chunkedDetail);

console.log("--- balance of delimiters in output");
let balanced = true;
let balanceDetail = "";
for (const sample of samples) {
  const out = bake(sample).text;
  const singles = out.replace(/\$\$/g, "").split("$").length - 1;
  const doubles = (out.match(/\$\$/g) || []).length;
  if (singles % 2 !== 0 || doubles % 2 !== 0) {
    balanced = false;
    balanceDetail = JSON.stringify(out);
    break;
  }
}
check("dollar delimiters come in pairs", balanced, balanceDetail);

console.log("");
console.log("convert:", pass, "pass,", fail, "fail");
process.exit(fail ? 1 : 0);
