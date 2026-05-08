export interface MimeTypeConfig {
  extension: string;
  mimeType: string;
  forceDownload: boolean;
}

interface MimeMetadataRow {
  value_json: string;
}

// Default mapping from DokuWiki's conf/mime.conf.
const DEFAULT_MIME_TYPES: MimeTypeConfig[] = [
  { extension: "jpg", mimeType: "image/jpeg", forceDownload: false },
  { extension: "jpeg", mimeType: "image/jpeg", forceDownload: false },
  { extension: "gif", mimeType: "image/gif", forceDownload: false },
  { extension: "png", mimeType: "image/png", forceDownload: false },
  { extension: "webp", mimeType: "image/webp", forceDownload: false },
  { extension: "ico", mimeType: "image/vnd.microsoft.icon", forceDownload: false },
  { extension: "mp3", mimeType: "audio/mpeg", forceDownload: false },
  { extension: "ogg", mimeType: "audio/ogg", forceDownload: false },
  { extension: "wav", mimeType: "audio/wav", forceDownload: false },
  { extension: "webm", mimeType: "video/webm", forceDownload: false },
  { extension: "ogv", mimeType: "video/ogg", forceDownload: false },
  { extension: "mp4", mimeType: "video/mp4", forceDownload: false },
  { extension: "vtt", mimeType: "text/vtt", forceDownload: false },
  { extension: "tgz", mimeType: "application/octet-stream", forceDownload: true },
  { extension: "tar", mimeType: "application/x-gtar", forceDownload: true },
  { extension: "gz", mimeType: "application/octet-stream", forceDownload: true },
  { extension: "bz2", mimeType: "application/octet-stream", forceDownload: true },
  { extension: "zip", mimeType: "application/zip", forceDownload: true },
  { extension: "rar", mimeType: "application/rar", forceDownload: true },
  { extension: "7z", mimeType: "application/x-7z-compressed", forceDownload: true },
  { extension: "pdf", mimeType: "application/pdf", forceDownload: false },
  { extension: "ps", mimeType: "application/postscript", forceDownload: true },
  { extension: "rpm", mimeType: "application/octet-stream", forceDownload: true },
  { extension: "deb", mimeType: "application/octet-stream", forceDownload: true },
  { extension: "doc", mimeType: "application/msword", forceDownload: true },
  { extension: "xls", mimeType: "application/msexcel", forceDownload: true },
  { extension: "ppt", mimeType: "application/mspowerpoint", forceDownload: true },
  { extension: "rtf", mimeType: "application/msword", forceDownload: true },
  {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    forceDownload: true
  },
  {
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    forceDownload: true
  },
  {
    extension: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    forceDownload: true
  },
  { extension: "sxw", mimeType: "application/soffice", forceDownload: true },
  { extension: "sxc", mimeType: "application/soffice", forceDownload: true },
  { extension: "sxi", mimeType: "application/soffice", forceDownload: true },
  { extension: "sxd", mimeType: "application/soffice", forceDownload: true },
  { extension: "odc", mimeType: "application/vnd.oasis.opendocument.chart", forceDownload: true },
  {
    extension: "odf",
    mimeType: "application/vnd.oasis.opendocument.formula",
    forceDownload: true
  },
  {
    extension: "odg",
    mimeType: "application/vnd.oasis.opendocument.graphics",
    forceDownload: true
  },
  {
    extension: "odi",
    mimeType: "application/vnd.oasis.opendocument.image",
    forceDownload: true
  },
  {
    extension: "odp",
    mimeType: "application/vnd.oasis.opendocument.presentation",
    forceDownload: true
  },
  {
    extension: "ods",
    mimeType: "application/vnd.oasis.opendocument.spreadsheet",
    forceDownload: true
  },
  { extension: "odt", mimeType: "application/vnd.oasis.opendocument.text", forceDownload: true },
  { extension: "svg", mimeType: "image/svg+xml", forceDownload: false }
];

const DEFAULT_MIME_TYPE_MAP = new Map(DEFAULT_MIME_TYPES.map((entry) => [entry.extension, entry]));

export function listDefaultMimeTypes(): MimeTypeConfig[] {
  return DEFAULT_MIME_TYPES.map((entry) => ({ ...entry }));
}

export function getMimeTypeForExtension(extension: string): string | null {
  return DEFAULT_MIME_TYPE_MAP.get(normalizeExtension(extension))?.mimeType ?? null;
}

export function shouldForceDownloadExtension(extension: string): boolean {
  return DEFAULT_MIME_TYPE_MAP.get(normalizeExtension(extension))?.forceDownload ?? false;
}

export async function getEffectiveMimeTypeConfig(
  db: D1Database,
  extension: string
): Promise<MimeTypeConfig> {
  const normalized = normalizeExtension(extension);
  const configured = await getMimeTypeConfig(db, normalized);
  if (configured) return configured;

  return {
    extension: normalized,
    mimeType: "application/octet-stream",
    forceDownload: true
  };
}

export async function shouldForceDownloadMedia(db: D1Database, mediaId: string): Promise<boolean> {
  return (await getEffectiveMimeTypeConfig(db, extensionFromMediaId(mediaId))).forceDownload;
}

export function extensionFromMediaId(mediaId: string): string {
  const name = mediaId.includes(":") ? mediaId.slice(mediaId.lastIndexOf(":") + 1) : mediaId;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : normalizeExtension(name.slice(dot + 1));
}

export async function getMimeTypeConfig(
  db: D1Database,
  extension: string
): Promise<MimeTypeConfig | null> {
  if (!extension) return null;

  const row = await db
    .prepare(
      `select value_json
       from metadata
       where subject_type = 'config' and subject_id = 'mime' and key = ?`
    )
    .bind(extension)
    .first<MimeMetadataRow>();

  if (!row) {
    const fallback = DEFAULT_MIME_TYPE_MAP.get(extension);
    return fallback ? { ...fallback } : null;
  }

  return parseMimeTypeConfig(row.value_json, extension);
}

function parseMimeTypeConfig(valueJson: string, extension: string): MimeTypeConfig | null {
  try {
    const parsed = JSON.parse(valueJson) as Partial<MimeTypeConfig>;
    const mimeType = typeof parsed.mimeType === "string" ? parsed.mimeType.trim() : "";
    if (!mimeType) return null;

    return {
      extension,
      mimeType,
      forceDownload: Boolean(parsed.forceDownload)
    };
  } catch {
    return null;
  }
}

function normalizeExtension(extension: string): string {
  return extension.toLowerCase().replace(/^\.+/, "");
}
