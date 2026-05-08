import { describe, expect, it } from "vitest";
import {
  applyPageTemplate,
  pageTemplateCandidates,
  renderDokuWikiDateFormat
} from "../src/wiki/page-template";
import type { AuthPrincipal } from "../src/auth/principal";

const cleanOptions = {
  deaccent: 1,
  fnencode: "url",
  sepchar: "_",
  useslash: false
} as const;

describe("page templates", () => {
  it("matches DokuWiki namespace template lookup order", () => {
    expect(pageTemplateCandidates("wiki:deep:new_page", cleanOptions)).toEqual([
      "wiki:deep:_template",
      "wiki:deep:__template",
      "wiki:__template",
      "__template"
    ]);
    expect(pageTemplateCandidates("start", cleanOptions)).toEqual(["__template"]);
  });

  it("applies upstream page template replacements", () => {
    const principal: AuthPrincipal = {
      type: "user",
      isAuthenticated: true,
      id: "user:kiwi",
      username: "kiwi",
      displayName: "Kiwi Person",
      email: "kiwi@example.test",
      groups: ["user"]
    };

    const rendered = applyPageTemplate(
      [
        "@ID@",
        "@NS@",
        "@CURNS@",
        "@!CURNS@",
        "@!!CURNS@",
        "@!CURNS!@",
        "@FILE@",
        "@!FILE@",
        "@!FILE!@",
        "@PAGE@",
        "@!PAGE@",
        "@!!PAGE@",
        "@!PAGE!@",
        "@USER@",
        "@NAME@",
        "@MAIL@",
        "@DATE@",
        "%A"
      ].join("|"),
      "wiki:deep:new_page",
      {
        dateFormat: "%Y/%m/%d %H:%M",
        now: new Date("2026-05-08T12:34:56.000Z"),
        pageIdCleanOptions: cleanOptions,
        principal
      }
    );

    expect(rendered).toBe(
      [
        "wiki:deep:new_page",
        "wiki:deep",
        "deep",
        "Deep",
        "Deep",
        "DEEP",
        "new_page",
        "New_page",
        "NEW_PAGE",
        "new page",
        "New page",
        "New Page",
        "NEW PAGE",
        "kiwi",
        "Kiwi Person",
        "kiwi@example.test",
        "2026/05/08 12:34",
        "Friday"
      ].join("|")
    );
  });

  it("uses anonymous identity blanks and configured separator characters", () => {
    const rendered = applyPageTemplate("@PAGE@|@USER@|@NAME@|@MAIL@", "wiki:new-page", {
      pageIdCleanOptions: { ...cleanOptions, sepchar: "-" }
    });

    expect(rendered).toBe("new page|||");
  });

  it("renders common DokuWiki strftime tokens in templates", () => {
    expect(
      renderDokuWikiDateFormat(
        "%F %T %R %D %a %b %u %w %j %%",
        new Date("2026-01-02T03:04:05.000Z")
      )
    ).toBe("2026-01-02 03:04:05 03:04 01/02/26 Fri Jan 5 5 002 %");
  });
});
