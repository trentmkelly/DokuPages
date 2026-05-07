import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password";

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

  it("rejects malformed hashes without throwing", async () => {
    await expect(verifyPassword("password", "")).resolves.toBe(false);
    await expect(verifyPassword("password", "bcrypt$hash")).resolves.toBe(false);
    await expect(verifyPassword("password", "pbkdf2-sha256$0$salt$hash")).resolves.toBe(false);
  });
});
