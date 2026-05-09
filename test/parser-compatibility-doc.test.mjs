import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const parserDocPath = fileURLToPath(new URL("../docs/parser.md", import.meta.url));
const upstreamParserModes = [
  "Acronym",
  "Camelcaselink",
  "Code",
  "Emaillink",
  "Entity",
  "Eol",
  "Externallink",
  "File",
  "Filelink",
  "Footnote",
  "Formatting",
  "Header",
  "Hr",
  "Internallink",
  "Linebreak",
  "Listblock",
  "Media",
  "Multiplyentity",
  "Nocache",
  "Notoc",
  "Plugin",
  "Preformatted",
  "Quote",
  "Quotes",
  "Rss",
  "Smiley",
  "Table",
  "Unformatted",
  "Windowssharelink",
  "Wordblock"
];

describe("parser compatibility documentation", () => {
  it("defines an explicit tested subset for every upstream parser mode", () => {
    const doc = readFileSync(parserDocPath, "utf8");

    expect(doc).toContain("## Parser Mode Compatibility Subset");
    expect(doc).toContain("test/render.test.ts");
    expect(doc).toContain("test/syntax-fixture.test.mjs");
    expect(doc).toContain("test/wordblock.test.ts");

    for (const mode of upstreamParserModes) {
      expect(doc, mode).toMatch(
        new RegExp(
          String.raw`\| \`${mode}\`\s+\| (native|partial|policy|deferred|unsupported)\s+\|`
        )
      );
    }
  });
});
