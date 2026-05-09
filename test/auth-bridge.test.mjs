import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildAuthBridgeSql, normalizeManifest } from "../scripts/sync-auth-bridge.mjs";
import { readMigrationSql } from "./support/migrations.mjs";

const migrationSql = readMigrationSql();
const backends = ["authad", "authldap", "authpdo"];

describe("external auth sync bridge", () => {
  it.each(backends)("accepts %s manifests", (backend) => {
    expect(
      normalizeManifest({
        backend,
        users: [{ username: "Kiwi", email: "kiwi@example.test" }]
      })
    ).toMatchObject({
      backend,
      users: [
        {
          username: "kiwi",
          displayName: "kiwi",
          email: "kiwi@example.test",
          groups: ["user"]
        }
      ]
    });
  });

  it("generates idempotent D1 user and group sync SQL", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(migrationSql);
    db.prepare("insert into groups (id, name, created_at) values (?, ?, ?)").run(
      "existing-group-staff",
      "staff",
      "2026-05-01T00:00:00.000Z"
    );

    const sql = buildAuthBridgeSql(
      {
        backend: "authldap",
        users: [
          {
            username: "Kiwi",
            fullName: "Kiwi Example",
            email: "kiwi@example.test",
            groups: ["@Staff", "LDAP Team"]
          },
          {
            username: "Disabled User",
            displayName: "Disabled User",
            email: "disabled@example.test",
            disabled: true
          }
        ]
      },
      { generatedAt: "2026-05-08T00:00:00.000Z" }
    );

    expect(sql).toContain("-- Backend: authldap");
    expect(sql).toContain("'ldap_team'");
    expect(sql).toContain("'staff'");

    db.exec(sql);
    db.exec(sql);

    expect(
      db
        .prepare(
          `select username, display_name, email, password_hash, is_disabled
           from users
           order by username`
        )
        .all()
    ).toEqual([
      {
        username: "disabled_user",
        display_name: "Disabled User",
        email: "disabled@example.test",
        password_hash: null,
        is_disabled: 1
      },
      {
        username: "kiwi",
        display_name: "Kiwi Example",
        email: "kiwi@example.test",
        password_hash: null,
        is_disabled: 0
      }
    ]);

    expect(
      db
        .prepare(
          `select u.username, g.id, g.name
           from users u
           join user_groups ug on ug.user_id = u.id
           join groups g on g.id = ug.group_id
           order by u.username, g.name`
        )
        .all()
    ).toEqual([
      { username: "disabled_user", id: "group:user", name: "user" },
      { username: "kiwi", id: "group:ldap_team", name: "ldap_team" },
      { username: "kiwi", id: "existing-group-staff", name: "staff" }
    ]);

    db.close();
  });
});
