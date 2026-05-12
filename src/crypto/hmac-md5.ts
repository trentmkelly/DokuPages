import { bytesToHex, md5Bytes, utf8Bytes } from "./md5";

const MD5_BLOCK_BYTES = 64;

export function hmacMd5Hex(message: string, key: string): string {
  let keyBytes = utf8Bytes(key);
  if (keyBytes.length > MD5_BLOCK_BYTES) {
    keyBytes = md5Bytes(keyBytes);
  }

  const innerPad = new Uint8Array(MD5_BLOCK_BYTES);
  const outerPad = new Uint8Array(MD5_BLOCK_BYTES);
  innerPad.fill(0x36);
  outerPad.fill(0x5c);

  for (let index = 0; index < keyBytes.length; index += 1) {
    innerPad[index] ^= keyBytes[index];
    outerPad[index] ^= keyBytes[index];
  }

  return bytesToHex(
    md5Bytes(concatBytes(outerPad, md5Bytes(concatBytes(innerPad, utf8Bytes(message)))))
  );
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
