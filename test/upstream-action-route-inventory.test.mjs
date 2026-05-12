import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const upstreamActionDir = resolve(repoRoot, "../dokuwiki/inc/Action");
const appTestPath = resolve(repoRoot, "test/app.test.ts");

describe("upstream DokuWiki action route inventory", () => {
  it("keeps route parity cases aligned with every concrete upstream action class", () => {
    expect(routeCaseNamesFromAppTest()).toEqual(upstreamActionClassNames());
  });
});

function upstreamActionClassNames() {
  return readdirSync(upstreamActionDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.replace(/\.php$/, ""))
    .filter((name) => !name.startsWith("Abstract"))
    .sort();
}

function routeCaseNamesFromAppTest() {
  const source = readFileSync(appTestPath, "utf8");
  const start = source.indexOf("function upstreamActionRouteCases()");
  const end = source.indexOf("\nfunction draftActionForm()", start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  const routeCaseSource = source.slice(start, end);
  return [...routeCaseSource.matchAll(/\[\s*"([^"]+)"\s*,\s*\{/g)].map((match) => match[1]).sort();
}
