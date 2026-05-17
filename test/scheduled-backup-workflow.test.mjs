import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("scheduled backup workflow", () => {
  it("runs the Cloudflare backup export and verifies the backup directory", async () => {
    const workflow = await readFile(".github/workflows/scheduled-backup.yml", "utf8");

    expect(workflow).toContain('cron: "17 4 * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("- name: Export Cloudflare backup");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).toContain("npm run backup:export --");
    expect(workflow).toContain("npm run backup:verify -- --backup");
    expect(workflow).not.toContain("actions/upload-artifact@v4");
  });
});
