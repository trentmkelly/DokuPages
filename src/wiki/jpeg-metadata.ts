export interface ParsedJpegMetadata {
  format: "JPEG";
  width: number | null;
  height: number | null;
  tags: Record<string, string | string[]>;
  display: JpegMetadataDisplayField[];
}

export interface JpegMetadataDisplayField {
  key: string;
  label: string;
  type: "date" | "text" | "textarea";
  value: string;
}

interface JpegMetadataField {
  key: string;
  label: string;
  type: "date" | "text" | "textarea";
  tags: string[];
}

const JPEG_METADATA_FIELDS: JpegMetadataField[] = [
  { key: "img_title", label: "Title", type: "text", tags: ["Iptc.Headline", "Xmp.dc.title"] },
  { key: "img_date", label: "Date", type: "date", tags: ["Date.EarliestTime"] },
  { key: "img_fname", label: "Filename", type: "text", tags: ["File.Name"] },
  {
    key: "img_caption",
    label: "Caption",
    type: "textarea",
    tags: [
      "Iptc.Caption",
      "Xmp.dc.description",
      "Exif.UserComment",
      "Exif.TIFFImageDescription",
      "Exif.TIFFUserComment"
    ]
  },
  {
    key: "img_artist",
    label: "Photographer",
    type: "text",
    tags: ["Iptc.Byline", "Xmp.dc.creator", "Exif.TIFFArtist", "Exif.Artist", "Iptc.Credit"]
  },
  {
    key: "img_copyr",
    label: "Copyright",
    type: "text",
    tags: ["Iptc.CopyrightNotice", "Xmp.dc.rights", "Exif.TIFFCopyright", "Exif.Copyright"]
  },
  { key: "img_format", label: "Format", type: "text", tags: ["File.Format"] },
  { key: "img_fsize", label: "File size", type: "text", tags: ["File.NiceSize"] },
  { key: "img_width", label: "Width", type: "text", tags: ["File.Width"] },
  { key: "img_height", label: "Height", type: "text", tags: ["File.Height"] },
  { key: "img_camera", label: "Camera", type: "text", tags: ["Simple.Camera"] },
  {
    key: "img_keywords",
    label: "Keywords",
    type: "text",
    tags: ["Iptc.Keywords", "Xmp.dc.subject", "Exif.Category"]
  }
];

const IPTC_DATASET_TAGS: Record<number, string> = {
  15: "Iptc.Category",
  25: "Iptc.Keywords",
  55: "Iptc.DateCreated",
  60: "Iptc.TimeCreated",
  80: "Iptc.Byline",
  105: "Iptc.Headline",
  110: "Iptc.Credit",
  116: "Iptc.CopyrightNotice",
  120: "Iptc.Caption"
};

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

const textDecoder = new TextDecoder();

export function parseJpegMetadata(
  id: string,
  body: ArrayBuffer,
  mimeType: string | null
): ParsedJpegMetadata | null {
  if (!isJpegMedia(id, mimeType)) return null;

  const bytes = new Uint8Array(body);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const tags: Record<string, string | string[]> = {};
  let width: number | null = null;
  let height: number | null = null;
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (bytes[offset] === 0xff) offset += 1;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) break;

    const length = readUint16BE(bytes, offset);
    const segmentStart = offset + 2;
    const segmentEnd = offset + length;
    if (length < 2 || segmentEnd > bytes.length) break;

    const segment = bytes.subarray(segmentStart, segmentEnd);
    if (SOF_MARKERS.has(marker) && segment.length >= 5) {
      height = readUint16BE(segment, 1);
      width = readUint16BE(segment, 3);
    } else if (marker === 0xe1) {
      parseApp1Segment(segment, tags);
    } else if (marker === 0xed) {
      parseIptcSegment(segment, tags);
    }

    offset = segmentEnd;
  }

  const exifWidth = numericTag(tags["Exif.PixelXDimension"]);
  const exifHeight = numericTag(tags["Exif.PixelYDimension"]);
  width = width ?? exifWidth;
  height = height ?? exifHeight;

  setTag(tags, "File.Name", mediaName(id));
  setTag(tags, "File.Format", "JPEG");
  setTag(tags, "File.NiceSize", formatByteLength(bytes.byteLength));
  if (width) setTag(tags, "File.Width", String(width));
  if (height) setTag(tags, "File.Height", String(height));
  setCombinedIptcDate(tags);
  setSimpleCamera(tags);

  return {
    format: "JPEG",
    width,
    height,
    tags,
    display: buildDisplayFields(tags)
  };
}

export function dokuMediaMetadataToJpegMetadata(
  id: string,
  byteLength: number,
  metadata: unknown
): ParsedJpegMetadata | null {
  const root = objectValue(metadata);
  if (Object.keys(root).length === 0) return null;

  const tags: Record<string, string | string[]> = {};
  const exif = objectValue(caseInsensitiveValue(root, "Exif"));
  const iptc = objectValue(caseInsensitiveValue(root, "Iptc"));
  const xmp = objectValue(caseInsensitiveValue(root, "Xmp"));

  copyLegacyFields(exif, "Exif", tags);
  copyLegacyFields(iptc, "Iptc", tags);
  copyLegacyFields(xmp, "Xmp", tags);

  setTag(tags, "File.Name", mediaName(id));
  setTag(tags, "File.Format", "JPEG");
  setTag(tags, "File.NiceSize", formatByteLength(byteLength));
  setLegacyAlias(tags, exif, "ImageDescription", "Exif.TIFFImageDescription");
  setLegacyAlias(tags, exif, "Artist", "Exif.Artist");
  setLegacyAlias(tags, exif, "TIFFArtist", "Exif.TIFFArtist");
  setLegacyAlias(tags, exif, "Copyright", "Exif.Copyright");
  setLegacyAlias(tags, exif, "TIFFCopyright", "Exif.TIFFCopyright");
  setLegacyAlias(tags, exif, "UserComment", "Exif.UserComment");
  setLegacyAlias(tags, exif, "TIFFUserComment", "Exif.TIFFUserComment");
  setLegacyAlias(tags, exif, "PixelXDimension", "Exif.PixelXDimension");
  setLegacyAlias(tags, exif, "PixelYDimension", "Exif.PixelYDimension");
  setLegacyAlias(tags, exif, "Title", "Iptc.Headline");
  setLegacyAlias(tags, iptc, "Headline", "Iptc.Headline");
  setLegacyAlias(tags, iptc, "Caption", "Iptc.Caption");
  setLegacyAlias(tags, iptc, "Byline", "Iptc.Byline");
  setLegacyAlias(tags, iptc, "Credit", "Iptc.Credit");
  setLegacyAlias(tags, iptc, "CopyrightNotice", "Iptc.CopyrightNotice");
  setLegacyAlias(tags, iptc, "Keywords", "Iptc.Keywords");

  const width = numericTag(tags["Exif.PixelXDimension"]);
  const height = numericTag(tags["Exif.PixelYDimension"]);
  if (width) setTag(tags, "File.Width", String(width));
  if (height) setTag(tags, "File.Height", String(height));
  setCombinedIptcDate(tags);
  setSimpleCamera(tags);

  const display = buildDisplayFields(tags);
  if (display.length === 0) return null;

  return {
    format: "JPEG",
    width,
    height,
    tags,
    display
  };
}

function isJpegMedia(id: string, mimeType: string | null): boolean {
  const type = mimeType?.toLowerCase() ?? "";
  const lowerId = id.toLowerCase();
  return type === "image/jpeg" || lowerId.endsWith(".jpg") || lowerId.endsWith(".jpeg");
}

function copyLegacyFields(
  source: Record<string, unknown>,
  prefix: string,
  tags: Record<string, string | string[]>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" || typeof value === "number") {
      setTag(tags, `${prefix}.${key}`, String(value));
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" || typeof entry === "number") {
          setTag(tags, `${prefix}.${key}`, String(entry), true);
        }
      }
    }
  }
}

function setLegacyAlias(
  tags: Record<string, string | string[]>,
  source: Record<string, unknown>,
  sourceKey: string,
  targetKey: string
): void {
  if (tags[targetKey]) return;

  const value = caseInsensitiveValue(source, sourceKey);
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" || typeof entry === "number") {
        setTag(tags, targetKey, String(entry), true);
      }
    }
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    setTag(tags, targetKey, String(value));
  }
}

function caseInsensitiveValue(source: Record<string, unknown>, key: string): unknown {
  const lowerKey = key.toLowerCase();
  for (const [candidateKey, value] of Object.entries(source)) {
    if (candidateKey.toLowerCase() === lowerKey) return value;
  }
  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseApp1Segment(segment: Uint8Array, tags: Record<string, string | string[]>): void {
  if (asciiPrefix(segment, "Exif\0\0")) {
    parseExif(segment.subarray(6), tags);
    return;
  }

  const text = decodeText(segment);
  if (text.includes("http://ns.adobe.com/xap/1.0/") || text.includes("<x:xmpmeta")) {
    parseXmp(text, tags);
  }
}

function parseExif(tiff: Uint8Array, tags: Record<string, string | string[]>): void {
  if (tiff.length < 8) return;

  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!littleEndian && !bigEndian) return;

  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (readUint16(view, 2, littleEndian) !== 42) return;

  parseIfd(view, readUint32(view, 4, littleEndian), littleEndian, tags, new Set());
}

function parseIfd(
  view: DataView,
  offset: number,
  littleEndian: boolean,
  tags: Record<string, string | string[]>,
  visited: Set<number>
): void {
  if (visited.has(offset) || offset + 2 > view.byteLength) return;
  visited.add(offset);

  const count = readUint16(view, offset, littleEndian);
  const entriesStart = offset + 2;
  if (entriesStart + count * 12 > view.byteLength) return;

  for (let index = 0; index < count; index += 1) {
    const entry = entriesStart + index * 12;
    const tag = readUint16(view, entry, littleEndian);
    const type = readUint16(view, entry + 2, littleEndian);
    const valueCount = readUint32(view, entry + 4, littleEndian);
    const value = readExifValue(view, entry, type, valueCount, littleEndian);

    if (tag === 0x8769 && typeof value === "number") {
      parseIfd(view, value, littleEndian, tags, visited);
      continue;
    }

    applyExifTag(tags, tag, value);
  }
}

function readExifValue(
  view: DataView,
  entry: number,
  type: number,
  count: number,
  littleEndian: boolean
): string | number | null {
  const unit = exifTypeSize(type);
  if (!unit) return null;

  const byteLength = unit * count;
  const valueOffset = byteLength <= 4 ? entry + 8 : readUint32(view, entry + 8, littleEndian);
  if (valueOffset < 0 || valueOffset + byteLength > view.byteLength) return null;

  if (type === 2) {
    return decodeText(new Uint8Array(view.buffer, view.byteOffset + valueOffset, byteLength));
  }

  if (type === 7) {
    return decodeExifUserComment(
      new Uint8Array(view.buffer, view.byteOffset + valueOffset, byteLength)
    );
  }

  if (type === 3 && count > 0) return readUint16(view, valueOffset, littleEndian);
  if (type === 4 && count > 0) return readUint32(view, valueOffset, littleEndian);

  return null;
}

function exifTypeSize(type: number): number {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
    case 9:
      return 4;
    case 5:
    case 10:
      return 8;
    default:
      return 0;
  }
}

function applyExifTag(
  tags: Record<string, string | string[]>,
  tag: number,
  value: string | number | null
): void {
  if (value === null || value === "") return;

  switch (tag) {
    case 0x010e:
      setTag(tags, "Exif.TIFFImageDescription", String(value));
      break;
    case 0x010f:
      setTag(tags, "Exif.Make", String(value));
      break;
    case 0x0110:
      setTag(tags, "Exif.Model", String(value));
      break;
    case 0x013b:
      setTag(tags, "Exif.TIFFArtist", String(value));
      setTag(tags, "Exif.Artist", String(value));
      break;
    case 0x8298:
      setTag(tags, "Exif.TIFFCopyright", String(value));
      setTag(tags, "Exif.Copyright", String(value));
      break;
    case 0x9003:
      setTag(tags, "Date.EarliestTime", normalizeExifDate(String(value)));
      break;
    case 0x9286:
      setTag(tags, "Exif.UserComment", String(value));
      setTag(tags, "Exif.TIFFUserComment", String(value));
      break;
    case 0xa002:
      setTag(tags, "Exif.PixelXDimension", String(value));
      break;
    case 0xa003:
      setTag(tags, "Exif.PixelYDimension", String(value));
      break;
  }
}

function parseIptcSegment(segment: Uint8Array, tags: Record<string, string | string[]>): void {
  for (let offset = 0; offset + 5 <= segment.length; offset += 1) {
    if (segment[offset] !== 0x1c || segment[offset + 1] !== 0x02) continue;

    const dataset = segment[offset + 2];
    const length = readUint16BE(segment, offset + 3);
    const valueStart = offset + 5;
    const valueEnd = valueStart + length;
    if (valueEnd > segment.length) break;

    const tag = IPTC_DATASET_TAGS[dataset];
    if (tag) {
      setTag(
        tags,
        tag,
        decodeText(segment.subarray(valueStart, valueEnd)),
        tag === "Iptc.Keywords"
      );
    }

    offset = valueEnd - 1;
  }
}

function parseXmp(text: string, tags: Record<string, string | string[]>): void {
  setTag(tags, "Xmp.dc.title", firstXmpValue(text, ["dc:title", "title"]));
  setTag(tags, "Xmp.dc.description", firstXmpValue(text, ["dc:description", "description"]));
  setTag(tags, "Xmp.dc.creator", firstXmpValue(text, ["dc:creator", "creator"]));
  setTag(tags, "Xmp.dc.rights", firstXmpValue(text, ["dc:rights", "rights"]));
  setTag(tags, "Xmp.dc.subject", firstXmpValue(text, ["dc:subject", "subject"]));
  setTag(tags, "Iptc.Headline", firstXmpValue(text, ["photoshop:Headline", "Headline"]));
}

function firstXmpValue(text: string, names: string[]): string {
  for (const name of names) {
    const escapedName = name.replace(":", "\\:");
    const direct = text.match(
      new RegExp(`<${escapedName}[^>]*>([\\s\\S]*?)</${escapedName}>`, "i")
    );
    if (direct) return cleanXmlText(direct[1]);
  }

  return "";
}

function cleanXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function setCombinedIptcDate(tags: Record<string, string | string[]>): void {
  if (tags["Date.EarliestTime"]) return;

  const date = stringTag(tags["Iptc.DateCreated"]);
  if (!/^\d{8}$/.test(date)) return;

  const time = stringTag(tags["Iptc.TimeCreated"]).replace(/[+-]\d{4}$/, "");
  const normalizedTime = /^\d{6}$/.test(time)
    ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
    : "00:00:00";
  setTag(
    tags,
    "Date.EarliestTime",
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${normalizedTime}`
  );
}

function setSimpleCamera(tags: Record<string, string | string[]>): void {
  if (tags["Simple.Camera"]) return;

  const make = stringTag(tags["Exif.Make"]);
  const model = stringTag(tags["Exif.Model"]);
  const camera = [make, model].filter(Boolean).join(" ");
  if (camera) setTag(tags, "Simple.Camera", camera);
}

function buildDisplayFields(tags: Record<string, string | string[]>): JpegMetadataDisplayField[] {
  return JPEG_METADATA_FIELDS.flatMap((field) => {
    const value = firstTagValue(tags, field.tags);
    return value ? [{ ...field, value }] : [];
  });
}

function firstTagValue(tags: Record<string, string | string[]>, names: string[]): string {
  for (const name of names) {
    const value = stringTag(tags[name]);
    if (value) return value;
  }

  return "";
}

function stringTag(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.map(cleanMetadataText).filter(Boolean).join(", ");
  return cleanMetadataText(value ?? "");
}

function numericTag(value: string | string[] | undefined): number | null {
  const parsed = Number.parseInt(stringTag(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function setTag(
  tags: Record<string, string | string[]>,
  key: string,
  value: string | number | null | undefined,
  append = false
): void {
  const text = cleanMetadataText(String(value ?? ""));
  if (!text) return;

  if (append) {
    const existing = tags[key];
    tags[key] = Array.isArray(existing)
      ? [...existing, text]
      : existing
        ? [existing, text]
        : [text];
    return;
  }

  tags[key] = text;
}

function decodeExifUserComment(value: Uint8Array): string {
  if (value.length >= 8) {
    const prefix = ascii(value.subarray(0, 8));
    const body = value.subarray(8);
    if (prefix.startsWith("ASCII")) return decodeText(body);
    if (prefix.startsWith("UNICODE")) return decodeUtf16Be(body);
  }

  return decodeText(value);
}

function decodeText(value: Uint8Array): string {
  const decoded = textDecoder.decode(value).replace(/\0+$/g, "").trim();
  return decoded.includes("\uFFFD") ? decodeLatin1(value).replace(/\0+$/g, "").trim() : decoded;
}

function decodeLatin1(value: Uint8Array): string {
  return [...value].map((byte) => String.fromCharCode(byte)).join("");
}

function decodeUtf16Be(value: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset + 1 < value.length; offset += 2) {
    text += String.fromCharCode((value[offset] << 8) | value[offset + 1]);
  }
  return text.replace(/\0+$/g, "").trim();
}

function cleanMetadataText(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 10 || code === 13 || code === 9 || code >= 32;
    })
    .join("")
    .trim();
}

function normalizeExifDate(value: string): string {
  return value.replace(/^(\d{4}):(\d{2}):(\d{2})\s+/, "$1-$2-$3 ");
}

function formatByteLength(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}

function mediaName(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

function asciiPrefix(value: Uint8Array, prefix: string): boolean {
  if (value.length < prefix.length) return false;
  return ascii(value.subarray(0, prefix.length)) === prefix;
}

function ascii(value: Uint8Array): string {
  return [...value].map((byte) => String.fromCharCode(byte)).join("");
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint16(offset, littleEndian);
}

function readUint32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint32(offset, littleEndian);
}
