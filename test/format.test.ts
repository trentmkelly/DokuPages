import { describe, expect, it } from "vitest";
import {
  formatDokuWikiDate,
  formatDokuWikiFileSize,
  formatDokuWikiInteger,
  formatDokuWikiRelativeDate
} from "../src/wiki/format";

describe("DokuWiki formatting helpers", () => {
  it("matches upstream filesize_h byte-size output", () => {
    expect(formatDokuWikiFileSize(1023)).toBe("1023\u00A0B");
    expect(formatDokuWikiFileSize(1024)).toBe("1\u00A0KB");
    expect(formatDokuWikiFileSize(1536)).toBe("1.5\u00A0KB");
    expect(formatDokuWikiFileSize(10 * 1024)).toBe("10\u00A0KB");
    expect(formatDokuWikiFileSize(1024 * 1024)).toBe("1\u00A0MB");
  });

  it("renders DokuWiki strftime-compatible date and time tokens", () => {
    expect(
      formatDokuWikiDate(
        "%F %T %R %D %a %b %u %w %j %z %Z %%",
        new Date("2026-01-02T03:04:05.000Z")
      )
    ).toBe("2026-01-02 03:04:05 03:04 01/02/2026 Fri Jan 5 5 002 +0000 UTC %");
  });

  it("applies locale-sensitive day, month, and fuzzy age strings", () => {
    const date = new Date("2026-01-02T03:04:05.000Z");

    expect(formatDokuWikiDate("%A %B", date, { language: "de" })).toBe("Freitag Januar");
    expect(formatDokuWikiRelativeDate(date, new Date("2026-01-12T03:04:05.000Z"), "de")).toBe(
      "vor 10 Tagen"
    );
  });

  it("formats DokuWiki integer placeholders without locale grouping", () => {
    expect(formatDokuWikiInteger(1234567)).toBe("1234567");
  });
});
