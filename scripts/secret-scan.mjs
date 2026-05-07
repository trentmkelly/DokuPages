#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  {
    name: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/
  },
  {
    name: "aws_access_key_id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    name: "github_token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/
  },
  {
    name: "github_pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/
  },
  {
    name: "cloudflare_api_token_assignment",
    pattern: /\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CF_TOKEN)\s*=\s*["']?[A-Za-z0-9_-]{30,}/i
  },
  {
    name: "openai_api_key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: "slack_token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/
  }
];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of files) {
  const body = readFileSync(file);
  if (body.includes(0)) continue;

  const text = body.toString("utf8");
  for (const { name, pattern } of PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;

    findings.push({
      file,
      line: lineForIndex(text, match.index),
      pattern: name
    });
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} matched ${finding.pattern}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed: scanned ${files.length} tracked files.`);

function lineForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}
