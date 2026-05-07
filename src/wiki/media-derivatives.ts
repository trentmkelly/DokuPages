import type { CurrentMedia, MediaRevision } from "./media-service";

export interface MediaDerivativePolicy {
  thumbnails: "original";
  resizing: "browser-constrained-original";
  exif: "not-parsed";
}

export const MEDIA_DERIVATIVE_POLICY: MediaDerivativePolicy = {
  thumbnails: "original",
  resizing: "browser-constrained-original",
  exif: "not-parsed"
};

export function mediaDerivativeHeaders(
  media: CurrentMedia | MediaRevision,
  requestedSize: boolean
): Record<string, string> {
  return {
    "x-dokuwiki-thumbnail-policy": MEDIA_DERIVATIVE_POLICY.thumbnails,
    "x-dokuwiki-resize-policy": requestedSize
      ? MEDIA_DERIVATIVE_POLICY.resizing
      : MEDIA_DERIVATIVE_POLICY.thumbnails,
    "x-dokuwiki-exif-policy": media.mimeType === "image/jpeg" ? MEDIA_DERIVATIVE_POLICY.exif : "n/a"
  };
}

export function hasRequestedMediaSize(url: URL): boolean {
  return Boolean(url.searchParams.get("w") || url.searchParams.get("h"));
}
