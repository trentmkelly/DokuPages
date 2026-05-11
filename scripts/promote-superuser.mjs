#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATABASE = "dokuwiki_pages_dev";
const DEFAULT_SUPERUSER = "@admin";
const NOT_SET = "!!not set!!";

export function parseDokuWikiMemberList(memberList) {
  return [
    ...new Set(
      String(memberList || "")
        .split(",")
        .map((member) => member.trim())
        .filter((member) => member && member !== NOT_SET)
    )
  ];
}

export function resolveSuperuserPromotion(memberList, username, explicitGroup = "") {
  const normalizedUsername = normalizeMemberName(username);
  const group = explicitGroup.trim().replace(/^@+/, "");
  if (group) return { kind: "group", group: normalizeMemberName(group) };

  const members = parseDokuWikiMemberList(memberList || DEFAULT_SUPERUSER);
  const groups = members
    .filter((member) => member.startsWith("@") && normalizeMemberName(member) !== "all")
    .map((member) => normalizeMemberName(member.slice(1)));

  if (
    members.some(
      (member) => !member.startsWith("@") && normalizeMemberName(member) === normalizedUsername
    )
  ) {
    return { kind: "already_user", username };
  }

  if (groups.length > 0) {
    return { kind: "group", group: groups[0] };
  }

  return {
    kind: "unsupported",
    message:
      "SUPERUSER contains no group entry to grant. Add a group such as @admin to SUPERUSER or rerun with --group <group>."
  };
}

export function promotionSql(username, group) {
  const quotedUsername = sqlString(username);
  const normalizedGroup = normalizeMemberName(group);
  const quotedGroup = sqlString(normalizedGroup);
  const quotedGroupId = sqlString(`group:${normalizedGroup}`);

  return [
    `insert or ignore into groups (id, name, created_at) values (${quotedGroupId}, ${quotedGroup}, datetime('now'))`,
    `insert or ignore into user_groups (user_id, group_id, created_at)
       select u.id, g.id, datetime('now')
       from users u
       join groups g on lower(g.name) = lower(${quotedGroup})
       where lower(u.username) = lower(${quotedUsername})`
  ].join(";\n");
}

export function userLookupSql(username) {
  return `select id, username, is_disabled from users where lower(username) = lower(${sqlString(username)})`;
}

export function userGroupsSql(username) {
  return `select u.username, u.is_disabled, group_concat(g.name, ',') as groups
    from users u
    left join user_groups ug on ug.user_id = u.id
    left join groups g on g.id = ug.group_id
    where lower(u.username) = lower(${sqlString(username)})
    group by u.id, u.username, u.is_disabled`;
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeMemberName(value) {
  return String(value).trim().replace(/^@+/, "").toLowerCase();
}

function parseArgs(argv) {
  const options = {
    username: "",
    database: DEFAULT_DATABASE,
    superuser: process.env.SUPERUSER || DEFAULT_SUPERUSER,
    group: "",
    local: false,
    remote: false,
    preview: false,
    dryRun: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--username":
      case "--user":
        options.username = argv[++index] ?? "";
        break;
      case "--database":
        options.database = argv[++index] ?? "";
        break;
      case "--superuser":
        options.superuser = argv[++index] ?? "";
        break;
      case "--group":
        options.group = argv[++index] ?? "";
        break;
      case "--local":
        options.local = true;
        break;
      case "--remote":
        options.remote = true;
        break;
      case "--preview":
        options.preview = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (!options.username && !arg.startsWith("-")) {
          options.username = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.username) throw new Error("--username is required");
  if (!options.help && !options.database) throw new Error("--database is required");
  if ([options.local, options.remote, options.preview].filter(Boolean).length > 1) {
    throw new Error("Choose only one of --local, --remote, or --preview");
  }

  return options;
}

function usage() {
  return `Usage: node scripts/promote-superuser.mjs --username <username> [--database <db>] [--remote|--local|--preview] [--superuser <member-list>] [--group <group>] [--dry-run]

Promotes an existing D1 user to the configured DokuWiki SUPERUSER role.
When SUPERUSER contains a group such as @admin, the user is added to that group.
Default database: ${DEFAULT_DATABASE}. Default SUPERUSER: ${DEFAULT_SUPERUSER}.`;
}

async function executeD1(database, sql, options) {
  const args = ["d1", "execute", database, "--json", "--command", sql];
  if (options.local) args.push("--local");
  if (options.remote) args.push("--remote");
  if (options.preview) args.push("--preview");

  const result = await spawnBuffered("wrangler", args);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `wrangler exited with ${result.code}`);
  }

  return parseWranglerJson(result.stdout);
}

function parseWranglerJson(stdout) {
  const start = stdout.indexOf("[");
  if (start === -1) return [];
  return JSON.parse(stdout.slice(start));
}

function spawnBuffered(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function firstResult(results) {
  return results?.[0]?.results?.[0] ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const target = resolveSuperuserPromotion(options.superuser, options.username, options.group);
  const lookupSql = userLookupSql(options.username);

  if (target.kind === "unsupported") {
    throw new Error(target.message);
  }

  if (options.dryRun) {
    const payload = {
      dryRun: true,
      database: options.database,
      username: options.username,
      superuser: options.superuser,
      target,
      lookupSql,
      promotionSql: target.kind === "group" ? promotionSql(options.username, target.group) : null
    };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`Dry run for ${options.username} on ${options.database}`);
      console.log(lookupSql);
      if (payload.promotionSql) console.log(`${payload.promotionSql};`);
      else console.log("No D1 row change is needed; username already appears in SUPERUSER.");
    }
    return;
  }

  const existing = firstResult(await executeD1(options.database, lookupSql, options));
  if (!existing) {
    throw new Error(`User '${options.username}' was not found in ${options.database}.`);
  }

  if (target.kind === "group") {
    await executeD1(options.database, promotionSql(options.username, target.group), options);
  }

  const membership = firstResult(
    await executeD1(options.database, userGroupsSql(options.username), options)
  );
  const groups = String(membership?.groups ?? "")
    .split(",")
    .filter(Boolean);

  const payload = {
    ok: true,
    username: membership?.username ?? options.username,
    disabled: Boolean(membership?.is_disabled),
    superuser: options.superuser,
    target,
    groups
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (target.kind === "already_user") {
    console.log(`User '${options.username}' already matches SUPERUSER directly.`);
  } else {
    console.log(`User '${options.username}' is now a member of '${target.group}'.`);
    console.log(`Current groups: ${groups.join(", ") || "(none)"}`);
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
