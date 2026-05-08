import bcrypt from "bcryptjs";
import unixCrypt from "unix-crypt-td-js";
import { bytesToHex, md5Bytes, md5Hex, utf8Bytes } from "../crypto/md5";

const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
const MAX_WORKERS_PBKDF2_ITERATIONS = 100_000;
const DEFAULT_ITERATIONS = MAX_WORKERS_PBKDF2_ITERATIONS;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const DOKUWIKI_UNUSABLE_PASSWORD = "!unusable";
const CRYPT64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export interface PasswordHashOptions {
  iterations?: number;
  salt?: Uint8Array;
}

export interface PasswordVerificationResult {
  ok: boolean;
  needsRehash: boolean;
  format: string | null;
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {}
): Promise<string> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError("Password hash iterations must be a positive integer.");
  }
  if (iterations > MAX_WORKERS_PBKDF2_ITERATIONS) {
    throw new RangeError(
      `Password hash iterations must be ${MAX_WORKERS_PBKDF2_ITERATIONS} or fewer for Cloudflare Workers.`
    );
  }
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
  return (await verifyPasswordDetailed(password, encodedHash)).ok;
}

export async function verifyPasswordDetailed(
  password: string,
  encodedHash: string
): Promise<PasswordVerificationResult> {
  if (isNativePasswordHash(encodedHash)) {
    return {
      ok: await verifyNativePassword(password, encodedHash),
      needsRehash: false,
      format: PASSWORD_HASH_ALGORITHM
    };
  }

  const legacy = await verifyDokuWikiPassword(password, encodedHash);
  return {
    ok: legacy.ok,
    needsRehash: legacy.ok,
    format: legacy.format
  };
}

async function verifyNativePassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  if (parsed.iterations > MAX_WORKERS_PBKDF2_ITERATIONS) return false;

  const actual = await derivePasswordHash(password, parsed.salt, parsed.iterations);
  return constantTimeEqual(actual, parsed.hash);
}

async function verifyDokuWikiPassword(
  password: string,
  encodedHash: string
): Promise<{ ok: boolean; format: string | null }> {
  if (!encodedHash || encodedHash === DOKUWIKI_UNUSABLE_PASSWORD) {
    return { ok: false, format: null };
  }

  let clear = password;
  let hash = encodedHash;
  if (hash.startsWith("U$")) {
    hash = hash.slice(1);
    clear = md5Hex(clear);
  }

  const smd5 = hash.match(/^\$1\$([^$]{0,8})\$/);
  if (smd5) {
    return {
      ok: constantTimeStringEqual(legacyMd5Crypt(clear, smd5[1], "1"), hash),
      format: "smd5"
    };
  }

  if (/^\$2[abxy]\$\d{2}\$/.test(hash)) {
    return { ok: verifyBcrypt(clear, hash), format: "bcrypt" };
  }

  if (hash.startsWith("{SSHA}")) {
    return { ok: await verifySaltedSha1(clear, hash), format: "ssha" };
  }

  if (hash.startsWith("{SMD5}")) {
    return { ok: verifyLdapSaltedMd5(clear, hash), format: "smd5" };
  }

  if (/^[0-9a-f]{32}$/i.test(hash)) {
    return { ok: constantTimeStringEqual(md5Hex(clear), hash.toLowerCase()), format: "md5" };
  }

  if (/^[0-9a-f]{40}$/i.test(hash)) {
    return {
      ok: constantTimeStringEqual(await sha1Hex(clear), hash.toLowerCase()),
      format: "sha1"
    };
  }

  if (/^[0-9a-f]{16}$/i.test(hash)) {
    return {
      ok: constantTimeStringEqual(mysqlPre41Hash(clear), hash.toLowerCase()),
      format: "mysql"
    };
  }

  if (/^\*[0-9A-F]{40}$/i.test(hash)) {
    return {
      ok: constantTimeStringEqual(await mysql411Hash(clear), hash.toUpperCase()),
      format: "my411"
    };
  }

  if (isDesCryptHash(hash)) {
    return {
      ok: constantTimeStringEqual(unixCrypt(clear, hash.slice(0, 2)), hash),
      format: "crypt"
    };
  }

  return { ok: false, format: null };
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

function isNativePasswordHash(encodedHash: string): boolean {
  return encodedHash.startsWith(`${PASSWORD_HASH_ALGORITHM}$`);
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

function verifyBcrypt(password: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

async function verifySaltedSha1(password: string, hash: string): Promise<boolean> {
  const decoded = base64ToBytesSafe(hash.slice(6));
  if (!decoded || decoded.length < 20) return false;

  const expected = decoded.slice(0, 20);
  const salt = decoded.slice(20);
  const actual = await sha1Bytes(concatBytes(utf8Bytes(password), salt));
  return constantTimeEqual(actual, expected);
}

function verifyLdapSaltedMd5(password: string, hash: string): boolean {
  const decoded = base64ToBytesSafe(hash.slice(6));
  if (!decoded || decoded.length < 16) return false;

  const expected = decoded.slice(0, 16);
  const salt = decoded.slice(16);
  const actual = md5Bytes(concatBytes(utf8Bytes(password), salt));
  return constantTimeEqual(actual, expected);
}

function legacyMd5Crypt(password: string, salt: string, magic: "1" | "apr1" = "1"): string {
  const safeSalt = salt.slice(0, 8);
  const passwordBytes = utf8Bytes(password);
  const saltBytes = utf8Bytes(safeSalt);
  const magicBytes = utf8Bytes(`$${magic}$`);
  let text = concatBytes(passwordBytes, magicBytes, saltBytes);
  let digest = md5Bytes(concatBytes(passwordBytes, saltBytes, passwordBytes));

  for (let remaining = passwordBytes.length; remaining > 0; remaining -= 16) {
    text = concatBytes(text, digest.slice(0, Math.min(16, remaining)));
  }

  for (let bits = passwordBytes.length; bits > 0; bits >>= 1) {
    text = concatBytes(text, (bits & 1) === 1 ? new Uint8Array([0]) : passwordBytes.slice(0, 1));
  }

  digest = md5Bytes(text);

  for (let index = 0; index < 1000; index += 1) {
    let next = (index & 1) === 1 ? passwordBytes : digest;
    if (index % 3) next = concatBytes(next, saltBytes);
    if (index % 7) next = concatBytes(next, passwordBytes);
    next = concatBytes(next, (index & 1) === 1 ? digest : passwordBytes);
    digest = md5Bytes(next);
  }

  const reordered: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const k = index + 6;
    let j = index + 12;
    if (j === 16) j = 5;
    reordered.unshift(digest[j]);
    reordered.unshift(digest[k]);
    reordered.unshift(digest[index]);
  }
  reordered.unshift(digest[11]);
  reordered.unshift(0);
  reordered.unshift(0);

  const encoded = bytesToBase64(new Uint8Array(reordered)).slice(2);
  const cryptText = [...encoded]
    .reverse()
    .map((char) => CRYPT64[BASE64.indexOf(char)] ?? char)
    .join("");
  return `$${magic}$${safeSalt}$${cryptText}`;
}

function mysqlPre41Hash(password: string): string {
  let nr: PhpInteger = 0x50305735n;
  let nr2: PhpInteger = 0x12345671n;
  let add: PhpInteger = 7n;

  for (const byte of utf8Bytes(password)) {
    if (byte === 0x20 || byte === 0x09) continue;
    const value = BigInt(byte);
    nr = phpXor(nr, phpAdd(phpMul(phpAdd(phpBitAnd(nr, 63n), add), value), phpLeftShift(nr, 8n)));
    nr2 = phpAdd(nr2, phpXor(phpLeftShift(nr2, 8n), nr));
    add = phpAdd(add, value);
  }

  return `${phpMaskedHex(nr)}${phpMaskedHex(nr2)}`;
}

async function mysql411Hash(password: string): Promise<string> {
  const first = await sha1Bytes(utf8Bytes(password));
  return `*${bytesToHex(await sha1Bytes(first)).toUpperCase()}`;
}

async function sha1Hex(value: string): Promise<string> {
  return bytesToHex(await sha1Bytes(utf8Bytes(value)));
}

async function sha1Bytes(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", bytesToArrayBuffer(value)));
}

function isDesCryptHash(hash: string): boolean {
  return /^[./0-9A-Za-z]{13}$/.test(hash);
}

type PhpInteger = bigint | number;
const PHP_INT_MAX = 9223372036854775807n;
const PHP_INT_MIN = -9223372036854775808n;

function phpBitAnd(left: PhpInteger, right: PhpInteger): bigint {
  return phpIntegerToBigInt(left) & phpIntegerToBigInt(right);
}

function phpXor(left: PhpInteger, right: PhpInteger): bigint {
  return BigInt.asIntN(64, phpIntegerToBigInt(left) ^ phpIntegerToBigInt(right));
}

function phpLeftShift(left: PhpInteger, right: bigint): bigint {
  return BigInt.asIntN(64, phpIntegerToBigInt(left) << right);
}

function phpMul(left: PhpInteger, right: PhpInteger): PhpInteger {
  if (typeof left === "number" || typeof right === "number") return Number(left) * Number(right);
  return phpNumericResult(left * right);
}

function phpAdd(left: PhpInteger, right: PhpInteger): PhpInteger {
  if (typeof left === "number" || typeof right === "number") return Number(left) + Number(right);
  return phpNumericResult(left + right);
}

function phpNumericResult(value: bigint): PhpInteger {
  return value > PHP_INT_MAX || value < PHP_INT_MIN ? Number(value) : value;
}

function phpMaskedHex(value: PhpInteger): string {
  return (phpIntegerToBigInt(value) & 0x7fffffffn).toString(16).padStart(8, "0");
}

function phpIntegerToBigInt(value: PhpInteger): bigint {
  return typeof value === "bigint" ? value : BigInt(Math.trunc(value));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

function constantTimeStringEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytesSafe(value: string): Uint8Array | null {
  try {
    return base64ToBytes(value);
  } catch {
    return null;
  }
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
