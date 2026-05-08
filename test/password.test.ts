import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, verifyPasswordDetailed } from "../src/auth/password";

describe("password hashing", () => {
  it("hashes passwords with PBKDF2-SHA256 and verifies matches", async () => {
    const hash = await hashPassword("correct horse battery staple", {
      iterations: 1_000,
      salt: new Uint8Array(16).fill(7)
    });

    expect(hash).toMatch(/^pbkdf2-sha256\$1000\$/);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("uses a random salt when none is provided", async () => {
    const first = await hashPassword("same password", { iterations: 1_000 });
    const second = await hashPassword("same password", { iterations: 1_000 });

    expect(first).not.toBe(second);
    await expect(verifyPassword("same password", first)).resolves.toBe(true);
    await expect(verifyPassword("same password", second)).resolves.toBe(true);
  });

  it("uses a Workers-compatible default iteration count", async () => {
    const hash = await hashPassword("same password", {
      salt: new Uint8Array(16).fill(3)
    });

    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    await expect(hashPassword("same password", { iterations: 100_001 })).rejects.toThrow(
      /Cloudflare Workers/
    );
  });

  it("rejects malformed hashes without throwing", async () => {
    await expect(verifyPassword("password", "")).resolves.toBe(false);
    await expect(verifyPassword("password", "bcrypt$hash")).resolves.toBe(false);
    await expect(verifyPassword("password", "pbkdf2-sha256$0$salt$hash")).resolves.toBe(false);
    await expect(
      verifyPassword(
        "password",
        "pbkdf2-sha256$100001$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
      )
    ).resolves.toBe(false);
  });

  it("verifies imported DokuWiki authplain passcrypt hashes", async () => {
    const hashes = [
      "$2y$10$usesomesillystringfore1kzg2rHWaz.ECl0R1vh1mrxeBkDbTI2",
      "$1$salt1234$U4DE1tCkda9p2NZpiBnLR0",
      "b6d4f14cc8fd48b20e3f23f5f81d9a61",
      "faeb5f917545ae86dad3e363f0c758b2ff94777c",
      "{SSHA}T76CDCLq7uPO/cZGzWtqbNtHlhtzYWx0",
      "abnd5bXd5P5B.",
      "352e590a251a7800",
      "*30496D7C6A25AB7CB42828401D94D1BB86E24CB8"
    ];

    for (const legacyHash of hashes) {
      await expect(verifyPassword("legacy password", legacyHash), legacyHash).resolves.toBe(true);
      await expect(verifyPassword("wrong password", legacyHash), legacyHash).resolves.toBe(false);
      await expect(
        verifyPasswordDetailed("legacy password", legacyHash),
        legacyHash
      ).resolves.toMatchObject({
        ok: true,
        needsRehash: true
      });
    }
  });

  it("verifies DokuWiki upgraded legacy hashes with the U prefix", async () => {
    await expect(
      verifyPassword("legacy password", "U$1$salt1234$aQ7G2HPRMxdM2Va8KPYZJ0")
    ).resolves.toBe(true);
  });
});
