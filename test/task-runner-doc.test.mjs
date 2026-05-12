import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const docPath = fileURLToPath(new URL("../docs/task-runner.md", import.meta.url));

describe("task runner replacement documentation", () => {
  it("maps every upstream TaskRunner job to a Pages replacement", () => {
    const doc = readFileSync(docPath, "utf8");

    for (const expected of [
      "INDEXER_TASKS_RUN",
      "runIndexer()",
      "runSitemapper()",
      "sendDigest()",
      "runTrimRecentChanges(false)",
      "runTrimRecentChanges(true)",
      "/lib/exe/taskrunner.php",
      "/lib/exe/indexer.php",
      "/api/tasks/email-digests",
      "npm run cache:warm"
    ]) {
      expect(doc).toContain(expected);
    }
  });
});
