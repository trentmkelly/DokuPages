import { describe, expect, it } from "vitest";
import {
  buildPostImportContentReview,
  summarizeImportManifest
} from "../scripts/post-import-content-review.mjs";

describe("post-import production content review", () => {
  const manifest = {
    generatedAt: "2026-05-12T00:00:00.000Z",
    sourceRoot: "/srv/dokuwiki-production",
    pages: [{ id: "wiki:welcome" }, { id: "projects:alpha" }, { id: "incidents:2026:may" }],
    pageRevisions: [{ revisionId: "projects:alpha@2026-05-01T00:00:00.000Z" }],
    pageMetadata: [{ subjectId: "projects:alpha" }],
    mediaObjects: [
      { role: "current", mediaId: "projects:diagram.png" },
      { role: "old", mediaId: "projects:diagram.png", revisionId: "media-rev-1" }
    ],
    mediaMetadata: [{ subjectId: "projects:diagram.png" }],
    customLanguageFiles: [{ relativePath: "en/login.txt" }],
    customTemplateFiles: [{ relativePath: "pages/_template.txt" }]
  };

  it("summarizes non-starter production content from the hash manifest", () => {
    expect(summarizeImportManifest(manifest)).toMatchObject({
      pageCount: 3,
      pageRevisionCount: 1,
      currentMediaCount: 1,
      oldMediaRevisionCount: 1,
      customLanguageFileCount: 1,
      customTemplateFileCount: 1,
      representativePages: ["projects:alpha", "incidents:2026:may"],
      representativeMedia: ["projects:diagram.png"]
    });
  });

  it("generates an operator checklist that captures production-only gaps", () => {
    const markdown = buildPostImportContentReview({
      manifest,
      baseUrl: "https://wiki.example.com",
      generatedAt: "2026-05-12T01:00:00.000Z"
    });

    expect(markdown).toContain("# Post-Import Production Content Review");
    expect(markdown).toContain("Pages target: https://wiki.example.com");
    expect(markdown).toContain("  - projects:alpha");
    expect(markdown).toContain("  - projects:diagram.png");
    expect(markdown).toContain(
      "- [ ] Open representative non-starter pages in the Pages deployment"
    );
    expect(markdown).toContain(
      "- [ ] Add every confirmed parity gap to CHECKLIST_2.md or the issue tracker"
    );
  });
});
