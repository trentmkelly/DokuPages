import { describe, expect, it } from "vitest";
import {
  extractRssFeedRequests,
  fetchRssFeed,
  parseRssAggregationParams,
  parseRssFeedXml
} from "../src/wiki/rss";

describe("RSS feed aggregation", () => {
  it("parses DokuWiki RSS aggregation parameters", () => {
    expect(parseRssAggregationParams("5 author date desc 1h")).toMatchObject({
      max: 5,
      author: true,
      date: true,
      details: true,
      refresh: 3600
    });
    expect(parseRssAggregationParams("rev by detail nosort 3m")).toMatchObject({
      max: 8,
      reverse: true,
      author: true,
      details: true,
      nosort: true,
      refresh: 600
    });
  });

  it("extracts unique feed URLs with the shortest refresh interval", () => {
    const requests = extractRssFeedRequests(
      "{{rss>https://example.com/feed.xml 5 2h }} {{rss>https://example.com/feed.xml 5 15m }}"
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://example.com/feed.xml",
      params: { refresh: 900 }
    });
  });

  it("parses RSS and Atom feed items", () => {
    const rss = parseRssFeedXml(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>RSS item</title>
            <link>https://example.com/rss</link>
            <author>Ada</author>
            <pubDate>Fri, 08 May 2026 12:00:00 GMT</pubDate>
            <description><![CDATA[<p>RSS <strong>details</strong></p>]]></description>
          </item>
        </channel>
      </rss>`);
    const atom = parseRssFeedXml(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Atom item</title>
          <link href="https://example.com/atom" rel="alternate" />
          <author><name>Grace</name></author>
          <updated>2026-05-08T13:00:00Z</updated>
          <summary>Atom details</summary>
        </entry>
      </feed>`);

    expect(rss[0]).toMatchObject({
      title: "RSS item",
      link: "https://example.com/rss",
      author: "Ada",
      publishedAt: "2026-05-08T12:00:00.000Z",
      description: "<p>RSS <strong>details</strong></p>"
    });
    expect(atom[0]).toMatchObject({
      title: "Atom item",
      link: "https://example.com/atom",
      author: "Grace",
      publishedAt: "2026-05-08T13:00:00.000Z",
      description: "Atom details"
    });
  });

  it("fetches and parses remote feeds with RSS accept headers", async () => {
    const calls: RequestInit[] = [];
    const result = await fetchRssFeed("https://example.com/feed.xml", {
      now: new Date("2026-05-08T12:00:00Z"),
      fetcher: async (_input, init) => {
        calls.push(init ?? {});
        return new Response(
          `<rss version="2.0"><channel><item><title>Fetched</title><link>https://example.com/item</link></item></channel></rss>`,
          { status: 200 }
        );
      }
    });

    expect(result).toMatchObject({
      ok: true,
      url: "https://example.com/feed.xml",
      fetchedAt: "2026-05-08T12:00:00.000Z",
      items: [{ title: "Fetched", link: "https://example.com/item" }]
    });
    expect(calls[0].headers).toMatchObject({
      accept: expect.stringContaining("application/rss+xml")
    });
  });
});
