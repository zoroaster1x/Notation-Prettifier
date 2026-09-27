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
 * Notation Prettifier tests: the block scanner the live layer uses to stay on
 * the viewport window.
 *
 *   bun test/editor.mjs
 */

import { openBlockAt } from "../src/engine.js";

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
function doc(text) {
  return { length: text.length, sliceString: (from, to) => text.slice(from, to) };
}

check("plain text returns the position", openBlockAt(doc("hello world"), 3) === 3);

const frontmatter = "---\ntitle: x\n---\nL = L + F";
check("inside frontmatter skips to its end", openBlockAt(doc(frontmatter), 2) === 16, String(openBlockAt(doc(frontmatter), 2)));
check("after frontmatter returns the position", openBlockAt(doc(frontmatter), 20) === 20);

const fence = "```\nL = L + F\n```\nafter";
check("inside a fence skips to the closing marker", openBlockAt(doc(fence), 5) === 17, String(openBlockAt(doc(fence), 5)));
check("after a fence returns the position", openBlockAt(doc(fence), 18) === 18);

const tildeFence = "~~~text\nL = L + F\n~~~\nafter";
check("a tilde fence is skipped too", openBlockAt(doc(tildeFence), 6) === 21, String(openBlockAt(doc(tildeFence), 6)));

const unclosed = "```\nL = L + F";
check("an unclosed fence skips to the end", openBlockAt(doc(unclosed), 5) === unclosed.length);

const display = "$$\nL = L + F\n$$\nafter";
check("inside a $$ block skips to its close", openBlockAt(doc(display), 4) === 15, String(openBlockAt(doc(display), 4)));
check("after a $$ block returns the position", openBlockAt(doc(display), 16) === 16);

const inlineDisplay = "$$L = L + F$$ after";
check("a closed $$ on one line does not block", openBlockAt(doc(inlineDisplay), 4) === 4);

const nested = "text\n```\ncode with $$ inside\n```\nafter";
check("$$ inside a fence does not flip parity", openBlockAt(doc(nested), 32) === 32, String(openBlockAt(doc(nested), 32)));

check("a position beyond the document clamps", openBlockAt(doc("abc"), 99) === 3);
check("a negative position clamps to zero", openBlockAt(doc("abc"), -5) === 0);

console.log("");
console.log("editor:", pass, "pass,", fail, "fail");
process.exit(fail ? 1 : 0);
