import { PhotonImage, SamplingFilter, crop, resize } from "@cf-wasm/photon";
import type { CurrentMedia, MediaRevision } from "./media-service";
import { type RequestedMediaSize, requestedMediaSizeFromUrl } from "./media-token";

export type MediaDerivativeStatus =
  | "not-requested"
  | "generated"
  | "original"
  | "unsupported"
  | "failed";

export interface MediaDerivativeResult {
  status: MediaDerivativeStatus;
  body?: Uint8Array;
  mimeType?: string;
  width?: number;
  height?: number;
  operation?: "resize" | "crop";
}

const MAX_DOKUWIKI_IMAGE_DIMENSION = 2000;
const DOKUWIKI_JPEG_QUALITY = 70;

export async function generateMediaDerivative(
  media: CurrentMedia | MediaRevision,
  body: ArrayBuffer,
  size: RequestedMediaSize
): Promise<MediaDerivativeResult> {
  const expectedStatus = expectedMediaDerivativeStatus(media, size);
  if (expectedStatus !== "generated") return { status: expectedStatus };

  let inputImage: PhotonImage | null = null;
  let croppedImage: PhotonImage | null = null;
  let outputImage: PhotonImage | null = null;

  try {
    inputImage = PhotonImage.new_from_byteslice(new Uint8Array(body));
    const dimensions = targetMediaDerivativeDimensions(
      inputImage.get_width(),
      inputImage.get_height(),
      size
    );

    if (!dimensions) return { status: "original" };

    if (dimensions.operation === "crop") {
      const cropBox = centerCropBox(
        inputImage.get_width(),
        inputImage.get_height(),
        dimensions.width,
        dimensions.height
      );
      croppedImage = crop(inputImage, cropBox.x1, cropBox.y1, cropBox.x2, cropBox.y2);
      outputImage = resize(
        croppedImage,
        dimensions.width,
        dimensions.height,
        SamplingFilter.Lanczos3
      );
    } else {
      outputImage = resize(
        inputImage,
        dimensions.width,
        dimensions.height,
        SamplingFilter.Lanczos3
      );
    }

    return {
      status: "generated",
      body: encodeMediaDerivative(outputImage, media.mimeType),
      mimeType: outputMimeType(media.mimeType),
      width: dimensions.width,
      height: dimensions.height,
      operation: dimensions.operation
    };
  } catch {
    return { status: "failed" };
  } finally {
    outputImage?.free();
    croppedImage?.free();
    inputImage?.free();
  }
}

export function expectedMediaDerivativeStatus(
  media: CurrentMedia | MediaRevision,
  size: RequestedMediaSize
): MediaDerivativeStatus {
  if (!size.requested) return "not-requested";
  if (!isPhotonResizableMime(media.mimeType)) return "unsupported";
  if (size.width > MAX_DOKUWIKI_IMAGE_DIMENSION || size.height > MAX_DOKUWIKI_IMAGE_DIMENSION) {
    return "original";
  }
  return "generated";
}

export function mediaDerivativeCacheKey(size: RequestedMediaSize): string {
  if (!size.requested) return "";
  return `w${size.width || 0}-h${size.height || 0}`;
}

export function mediaDerivativeHeaders(
  media: CurrentMedia | MediaRevision,
  status: MediaDerivativeStatus
): Record<string, string> {
  const generated = status === "generated";
  const resizePolicy = status === "not-requested" ? "original" : status;

  return {
    "x-dokuwiki-thumbnail-policy": generated ? "generated" : "original",
    "x-dokuwiki-resize-policy": resizePolicy,
    "x-dokuwiki-exif-policy": media.mimeType === "image/jpeg" ? "not-parsed" : "n/a"
  };
}

export function hasRequestedMediaSize(url: URL): boolean {
  return requestedMediaSizeFromUrl(url).requested;
}

function isPhotonResizableMime(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

function targetMediaDerivativeDimensions(
  originalWidth: number,
  originalHeight: number,
  size: RequestedMediaSize
): { width: number; height: number; operation: "resize" | "crop" } | null {
  if (originalWidth <= 0 || originalHeight <= 0) return null;

  const width = size.width;
  const height = size.height;
  const dimensions =
    width > 0 && height > 0
      ? { width, height, operation: "crop" as const }
      : resizeDimensions(originalWidth, originalHeight, width, height);

  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > MAX_DOKUWIKI_IMAGE_DIMENSION ||
    dimensions.height > MAX_DOKUWIKI_IMAGE_DIMENSION
  ) {
    return null;
  }

  return dimensions;
}

function resizeDimensions(
  originalWidth: number,
  originalHeight: number,
  requestedWidth: number,
  requestedHeight: number
): { width: number; height: number; operation: "resize" } {
  if (requestedWidth > 0) {
    return {
      width: requestedWidth,
      height: Math.max(1, Math.round((originalHeight * requestedWidth) / originalWidth)),
      operation: "resize"
    };
  }

  return {
    width: Math.max(1, Math.round((originalWidth * requestedHeight) / originalHeight)),
    height: requestedHeight,
    operation: "resize"
  };
}

function centerCropBox(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number
): { x1: number; y1: number; x2: number; y2: number } {
  const originalRatio = originalWidth / originalHeight;
  const targetRatio = targetWidth / targetHeight;

  if (originalRatio > targetRatio) {
    const cropWidth = Math.max(1, Math.round(originalHeight * targetRatio));
    const x1 = Math.max(0, Math.floor((originalWidth - cropWidth) / 2));
    return { x1, y1: 0, x2: x1 + cropWidth, y2: originalHeight };
  }

  const cropHeight = Math.max(1, Math.round(originalWidth / targetRatio));
  const y1 = Math.max(0, Math.floor((originalHeight - cropHeight) / 2));
  return { x1: 0, y1, x2: originalWidth, y2: y1 + cropHeight };
}

function encodeMediaDerivative(image: PhotonImage, mimeType: string): Uint8Array {
  if (mimeType === "image/jpeg") return image.get_bytes_jpeg(DOKUWIKI_JPEG_QUALITY);
  if (mimeType === "image/webp") return image.get_bytes_webp();
  return image.get_bytes();
}

function outputMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "image/jpeg";
  if (mimeType === "image/webp") return "image/webp";
  return "image/png";
}
