#!/usr/bin/env node
/* global fetch */

const args = parseArgs(process.argv.slice(2));
const baseUrl = new URL(args.baseUrl ?? process.env.BASE_URL ?? "https://dokutest.pages.dev");

const checks = [
  {
    name: "health",
    path: "/api/health",
    expect: async (response) => {
      assertStatus(response, 200);
      const body = await response.json();
      assert(body.ok === true, "health response did not report ok=true");
    }
  },
  {
    name: "page render",
    path: "/wiki/wiki/welcome",
    expect: async (response) => {
      assertStatus(response, 200);
      const html = await response.text();
      assert(html.includes('id="dokuwiki__content"'), "page did not render content wrapper");
      assert(
        html.includes('<link rel="canonical" href="/wiki/wiki/welcome">'),
        "page did not include canonical link"
      );
    }
  },
  {
    name: "canonical redirect",
    path: "/wiki/Wiki/Welcome?do=edit",
    expect: async (response) => {
      assertStatus(response, 301);
      assert(
        response.headers.get("location") === "/wiki/wiki/welcome?do=edit",
        "canonical redirect location was unexpected"
      );
    }
  },
  {
    name: "sitemap",
    path: "/sitemap.xml",
    expect: async (response) => {
      assertStatus(response, 200);
      assert(
        response.headers.get("cache-control") === "public, max-age=300",
        "sitemap cache header was unexpected"
      );
      const xml = await response.text();
      assert(xml.includes("<urlset"), "sitemap did not render a urlset");
    }
  }
];

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const response = await fetch(url, { redirect: "manual" });
  await check.expect(response);
  console.log(`ok ${check.name}`);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      parsed.baseUrl = argv[++index];
    }
  }

  return parsed;
}

function assertStatus(response, expected) {
  assert(
    response.status === expected,
    `expected ${expected} from ${response.url}, received ${response.status}`
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
