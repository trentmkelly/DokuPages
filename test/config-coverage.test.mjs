import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOKUWIKI_CONFIG_COVERAGE,
  DOKUWIKI_CONFIG_KEYS,
  configCoverageCounts,
  coverageStatusForDokuWikiConfigKey
} from "../src/config-coverage";

describe("DokuWiki config coverage map", () => {
  it("maps every upstream conf/dokuwiki.php setting to an explicit status", () => {
    const upstreamKeys = extractDokuWikiConfigKeys(
      readFileSync("../dokuwiki/conf/dokuwiki.php", "utf8")
    );
    const mappedKeys = DOKUWIKI_CONFIG_COVERAGE.map((entry) => entry.key);

    expect(mappedKeys).toEqual(upstreamKeys);
    expect(new Set(mappedKeys).size).toBe(mappedKeys.length);
    expect(DOKUWIKI_CONFIG_COVERAGE).toHaveLength(115);
    expect(DOKUWIKI_CONFIG_COVERAGE.every((entry) => Boolean(entry.status))).toBe(true);
    expect(configCoverageCounts()).toEqual({
      implemented: 75,
      imported_metadata_only: 6,
      intentionally_unsupported: 31,
      not_yet_evaluated: 3
    });
  });

  it("classifies representative implemented, metadata-only, unsupported, and unevaluated settings", () => {
    expect(DOKUWIKI_CONFIG_KEYS).toContain("trustedproxies");
    expect(coverageStatusForDokuWikiConfigKey("useacl")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("rss_type")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("updatecheck")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("trustedproxies")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("realip")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("remote")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("remoteuser")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("remotecors")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("usewordblock")).toBe("implemented");
    expect(coverageStatusForDokuWikiConfigKey("savedir")).toBe("intentionally_unsupported");
    expect(coverageStatusForDokuWikiConfigKey("securecookie")).toBe("not_yet_evaluated");
  });
});

function extractDokuWikiConfigKeys(source) {
  return [...source.matchAll(/^\s*\$conf((?:\[['"][^'"]+['"]\])+)/gm)].map((match) =>
    [...match[1].matchAll(/\[['"]([^'"]+)['"]\]/g)].map((part) => part[1]).join(".")
  );
}
