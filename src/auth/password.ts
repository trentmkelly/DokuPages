const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
const DEFAULT_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export interface PasswordHashOptions {
  iterations?: number;
  salt?: Uint8Array;
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {}
): Promise<string> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const hash = await derivePasswordHash(password, salt, iterations);

  return [
    PASSWORD_HASH_ALGORITHM,
    String(iterations),
    bytesToBase64(salt),
    bytesToBase64(hash)
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  const actual = await derivePasswordHash(password, parsed.salt, parsed.iterations);
  return constantTimeEqual(actual, parsed.hash);
}

interface ParsedPasswordHash {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  const [algorithm, rawIterations, rawSalt, rawHash] = encodedHash.split("$");
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !rawIterations || !rawSalt || !rawHash) {
    return null;
  }

  const iterations = Number.parseInt(rawIterations, 10);
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    return null;
  }

  try {
    return {
      iterations,
      salt: base64ToBytes(rawSalt),
      hash: base64ToBytes(rawHash)
    };
  } catch {
    return null;
  }
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bytesToArrayBuffer(salt),
      iterations
    },
    key,
    HASH_BITS
  );

  return new Uint8Array(bits);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
