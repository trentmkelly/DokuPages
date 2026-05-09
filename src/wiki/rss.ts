import { XMLParser } from "fast-xml-parser";

export interface RssAggregationParams {
  max: number;
  reverse: boolean;
  author: boolean;
  date: boolean;
  details: boolean;
  nosort: boolean;
  refresh: number;
}

export interface RssFeedRequest {
  url: string;
  params: RssAggregationParams;
}

export interface RssFeedItem {
  title: string;
  link: string | null;
  author: string | null;
  publishedAt: string | null;
  description: string | null;
}

export interface RssFeedResult {
  ok: boolean;
  url: string;
  items: RssFeedItem[];
  fetchedAt: string;
  error?: string;
}

export type RssFeedFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_RSS_ITEM_LIMIT = 8;
const DEFAULT_RSS_REFRESH_SECONDS = 4 * 60 * 60;
const MIN_RSS_REFRESH_SECONDS = 10 * 60;
const DEFAULT_RSS_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_RSS_MAX_BYTES = 1024 * 1024;
const RSS_ACCEPT_HEADER = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml;q=0.9",
  "text/xml;q=0.8",
  "*/*;q=0.1"
].join(", ");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true
});

export function extractRssFeedRequests(source: string): RssFeedRequest[] {
  const requests = new Map<string, RssFeedRequest>();

  for (const match of source.matchAll(/\{\{rss>([^}]+)\}\}/gi)) {
    const request = parseRssFeedRequest(match[1]);
    const previous = request ? requests.get(request.url) : null;
    if (request && (!previous || request.params.refresh < previous.params.refresh)) {
      requests.set(request.url, request);
    }
  }

  return [...requests.values()];
}

export function parseRssFeedRequest(raw: string): RssFeedRequest | null {
  const body = raw.trim();
  if (!body) return null;

  const firstSpace = body.search(/\s/);
  const rawUrl = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const params = firstSpace === -1 ? "" : body.slice(firstSpace + 1);
  const url = normalizeRssFeedUrl(rawUrl);
  if (!url) return null;

  return {
    url,
    params: parseRssAggregationParams(params)
  };
}

export function parseRssAggregationParams(params: string): RssAggregationParams {
  const maxMatch = params.match(/\b(\d+)\b/);
  const refreshMatch = params.match(/\b(\d+)([dhm])\b/i);
  const refreshMultipliers: Record<string, number> = {
    d: 86_400,
    h: 3_600,
    m: 60
  };
  const refresh = refreshMatch
    ? Math.max(
        MIN_RSS_REFRESH_SECONDS,
        Number(refreshMatch[1]) * refreshMultipliers[refreshMatch[2].toLowerCase()]
      )
    : DEFAULT_RSS_REFRESH_SECONDS;

  return {
    max: maxMatch ? Number(maxMatch[1]) : DEFAULT_RSS_ITEM_LIMIT,
    reverse: /rev/.test(params),
    author: /\b(by|author)/.test(params),
    date: /\b(date)/.test(params),
    details: /\b(desc|detail)/.test(params),
    nosort: /\b(nosort)\b/.test(params),
    refresh
  };
}

export async function fetchRssFeed(
  url: string,
  options: {
    fetcher?: RssFeedFetcher;
    timeoutMs?: number;
    maxBytes?: number;
    now?: Date;
  } = {}
): Promise<RssFeedResult> {
  const normalizedUrl = normalizeRssFeedUrl(url);
  const fetchedAt = (options.now ?? new Date()).toISOString();
  if (!normalizedUrl) {
    return failedRssFeed(url, fetchedAt, "Unsupported or invalid feed URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("RSS feed fetch timed out."),
    options.timeoutMs ?? DEFAULT_RSS_FETCH_TIMEOUT_MS
  );

  try {
    const response = await (options.fetcher ?? fetch)(normalizedUrl, {
      headers: { accept: RSS_ACCEPT_HEADER },
      signal: controller.signal
    });

    if (!response.ok) {
      return failedRssFeed(normalizedUrl, fetchedAt, `HTTP ${response.status}`);
    }

    const xml = await response.text();
    if (xml.length > (options.maxBytes ?? DEFAULT_RSS_MAX_BYTES)) {
      return failedRssFeed(normalizedUrl, fetchedAt, "Feed response is too large.");
    }

    return {
      ok: true,
      url: normalizedUrl,
      items: parseRssFeedXml(xml),
      fetchedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed fetch failed.";
    return failedRssFeed(normalizedUrl, fetchedAt, message);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseRssFeedXml(xml: string): RssFeedItem[] {
  const document = xmlParser.parse(xml) as unknown;
  const rssChannel = objectValue(child(child(document, "rss"), "channel"));
  if (rssChannel) {
    return asArray(rssChannel.item).map(itemFromRssNode).filter(isRssFeedItem);
  }

  const rdf = objectValue(child(document, "rdf:RDF", "RDF"));
  if (rdf) {
    return asArray(rdf.item).map(itemFromRssNode).filter(isRssFeedItem);
  }

  const atomFeed = objectValue(child(document, "feed"));
  if (atomFeed) {
    return asArray(atomFeed.entry).map(itemFromAtomNode).filter(isRssFeedItem);
  }

  return [];
}

export function normalizeRssFeedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function failedRssFeed(url: string, fetchedAt: string, error: string): RssFeedResult {
  return {
    ok: false,
    url,
    items: [],
    fetchedAt,
    error
  };
}

function itemFromRssNode(value: unknown): RssFeedItem | null {
  const node = objectValue(value);
  if (!node) return null;

  return normalizeFeedItem({
    title: firstText(node, ["title"]) ?? "(no title)",
    link: firstText(node, ["link"]),
    author: firstText(node, ["author", "dc:creator", "creator", "itunes:author"]),
    publishedAt: feedDate(firstText(node, ["pubDate", "published", "updated", "dc:date"])),
    description: firstText(node, ["description", "content:encoded", "summary"])
  });
}

function itemFromAtomNode(value: unknown): RssFeedItem | null {
  const node = objectValue(value);
  if (!node) return null;

  return normalizeFeedItem({
    title: firstText(node, ["title"]) ?? "(no title)",
    link: atomLinkHref(node.link),
    author: atomAuthor(node.author) ?? atomAuthor(node.contributor),
    publishedAt: feedDate(firstText(node, ["published", "updated", "issued", "modified"])),
    description: firstText(node, ["summary", "content"])
  });
}

function normalizeFeedItem(item: RssFeedItem): RssFeedItem {
  return {
    title: item.title.trim() || "(no title)",
    link: item.link?.trim() || null,
    author: item.author?.trim() || null,
    publishedAt: item.publishedAt,
    description: item.description?.trim() || null
  };
}

function isRssFeedItem(value: RssFeedItem | null): value is RssFeedItem {
  return value !== null;
}

function firstText(node: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = textContent(node[name]);
    if (value) return value;
  }

  return null;
}

function atomAuthor(value: unknown): string | null {
  for (const author of asArray(value)) {
    const node = objectValue(author);
    const text = node ? firstText(node, ["name", "email"]) : textContent(author);
    if (text) return text;
  }

  return null;
}

function atomLinkHref(value: unknown): string | null {
  const links = asArray(value);
  const alternate = links.find((link) => {
    const node = objectValue(link);
    const rel = node ? textContent(node["@_rel"]) : null;
    return !rel || rel === "alternate";
  });

  return linkHref(alternate ?? links[0]);
}

function linkHref(value: unknown): string | null {
  const node = objectValue(value);
  if (node) return textContent(node["@_href"]) ?? textContent(node);
  return textContent(value);
}

function feedDate(value: string | null): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function child(value: unknown, ...names: string[]): unknown {
  const node = objectValue(value);
  if (!node) return undefined;

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(node, name)) return node[name];
  }

  return undefined;
}

function textContent(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = textContent(item);
      if (text) return text;
    }
    return null;
  }

  const node = objectValue(value);
  if (!node) return null;

  return (
    textContent(node["#text"]) ??
    textContent(node["#cdata"]) ??
    Object.values(node)
      .map(textContent)
      .find((text): text is string => Boolean(text)) ??
    null
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
