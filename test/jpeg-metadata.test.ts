import { describe, expect, it } from "vitest";
import { dokuMediaMetadataToJpegMetadata, parseJpegMetadata } from "../src/wiki/jpeg-metadata";

describe("parseJpegMetadata", () => {
  it("extracts DokuWiki mediameta fields from EXIF TIFF data", () => {
    const parsed = parseJpegMetadata(
      "wiki:camera.jpg",
      jpeg([
        segment(0xe1, [
          ...ascii("Exif\0\0"),
          ...tiffWithAsciiEntries([
            [0x010e, "EXIF caption"],
            [0x010f, "Nikon"],
            [0x0110, "D850"],
            [0x013b, "Alice Example"],
            [0x8298, "CC BY-SA"]
          ])
        ]),
        sof0(640, 480)
      ]),
      "image/jpeg"
    );

    expect(parsed).toMatchObject({
      format: "JPEG",
      width: 640,
      height: 480
    });
    expect(parsed?.tags).toMatchObject({
      "Exif.TIFFImageDescription": "EXIF caption",
      "Exif.TIFFArtist": "Alice Example",
      "Exif.TIFFCopyright": "CC BY-SA",
      "Simple.Camera": "Nikon D850",
      "File.Name": "camera.jpg"
    });
    expect(parsed?.display).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Caption", value: "EXIF caption" }),
        expect.objectContaining({ label: "Photographer", value: "Alice Example" }),
        expect.objectContaining({ label: "Copyright", value: "CC BY-SA" }),
        expect.objectContaining({ label: "Camera", value: "Nikon D850" })
      ])
    );
  });

  it("extracts DokuWiki mediameta fields from IPTC records", () => {
    const parsed = parseJpegMetadata(
      "wiki:press.jpeg",
      jpeg([
        segment(0xed, [
          ...ascii("Photoshop 3.0\0"),
          ...iptcRecord(105, "IPTC headline"),
          ...iptcRecord(120, "IPTC caption"),
          ...iptcRecord(80, "Reporter"),
          ...iptcRecord(116, "Copyright holder"),
          ...iptcRecord(55, "20260508"),
          ...iptcRecord(60, "123456"),
          ...iptcRecord(25, "alpha"),
          ...iptcRecord(25, "beta")
        ]),
        sof0(320, 240)
      ]),
      "image/jpeg"
    );

    expect(parsed?.tags).toMatchObject({
      "Iptc.Headline": "IPTC headline",
      "Iptc.Caption": "IPTC caption",
      "Iptc.Byline": "Reporter",
      "Iptc.CopyrightNotice": "Copyright holder",
      "Date.EarliestTime": "2026-05-08 12:34:56"
    });
    expect(parsed?.tags["Iptc.Keywords"]).toEqual(["alpha", "beta"]);
    expect(parsed?.display).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Title", value: "IPTC headline" }),
        expect.objectContaining({ label: "Date", value: "2026-05-08 12:34:56" }),
        expect.objectContaining({ label: "Keywords", value: "alpha, beta" })
      ])
    );
  });

  it("adapts imported DokuWiki media meta rows for detail display", () => {
    const parsed = dokuMediaMetadataToJpegMetadata("wiki:legacy.jpg", 2048, {
      Exif: {
        Title: "Legacy title",
        PixelXDimension: "1024",
        PixelYDimension: "768"
      },
      Iptc: {
        Caption: "Legacy caption",
        Keywords: ["one", "two"]
      }
    });

    expect(parsed?.tags).toMatchObject({
      "Iptc.Headline": "Legacy title",
      "Iptc.Caption": "Legacy caption",
      "File.Width": "1024",
      "File.Height": "768"
    });
    expect(parsed?.display).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Title", value: "Legacy title" }),
        expect.objectContaining({ label: "Caption", value: "Legacy caption" }),
        expect.objectContaining({ label: "Keywords", value: "one, two" })
      ])
    );
  });
});

function jpeg(segments: number[][]): ArrayBuffer {
  return bytes([0xff, 0xd8, ...segments.flat(), 0xff, 0xd9]);
}

function segment(marker: number, data: number[]): number[] {
  const length = data.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...data];
}

function sof0(width: number, height: number): number[] {
  return segment(0xc0, [
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0
  ]);
}

function iptcRecord(dataset: number, value: string): number[] {
  const data = ascii(value);
  return [0x1c, 0x02, dataset, (data.length >> 8) & 0xff, data.length & 0xff, ...data];
}

function tiffWithAsciiEntries(entries: Array<[number, string]>): number[] {
  const count = entries.length;
  const fixedLength = 8 + 2 + count * 12 + 4;
  const values: number[] = [];
  const output = new Uint8Array(fixedLength);
  const view = new DataView(output.buffer);

  output[0] = 0x49;
  output[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, count, true);

  entries.forEach(([tag, rawValue], index) => {
    const entry = 10 + index * 12;
    const value = ascii(`${rawValue}\0`);
    view.setUint16(entry, tag, true);
    view.setUint16(entry + 2, 2, true);
    view.setUint32(entry + 4, value.length, true);

    if (value.length <= 4) {
      output.set(value, entry + 8);
    } else {
      view.setUint32(entry + 8, fixedLength + values.length, true);
      values.push(...value);
    }
  });

  return [...output, ...values];
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function bytes(value: number[]): ArrayBuffer {
  return new Uint8Array(value).buffer;
}
