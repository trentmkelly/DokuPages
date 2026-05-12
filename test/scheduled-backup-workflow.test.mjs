import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("scheduled backup workflow", () => {
  it("runs the Cloudflare backup export, verifies it, and stores an artifact", async () => {
    const workflow = await readFile(".github/workflows/scheduled-backup.yml", "utf8");

    expect(workflow).toContain('cron: "17 4 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).toContain("npm run backup:export --");
    expect(workflow).toContain("npm run backup:verify -- --backup");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("retention-days: ${{ env.BACKUP_ARTIFACT_RETENTION_DAYS }}");
  });
});
