import { EVERYONE_ACL_SUBJECT, principalAclSubjects, type AuthPrincipal } from "../auth/principal";
import type { AclRuleRecord } from "../storage/interfaces";

export const ACL_NONE = 0;
export const ACL_READ = 1;
export const ACL_EDIT = 2;
export const ACL_CREATE = 4;
export const ACL_UPLOAD = 8;
export const ACL_DELETE = 16;

export type AclPermission =
  | typeof ACL_NONE
  | typeof ACL_READ
  | typeof ACL_EDIT
  | typeof ACL_CREATE
  | typeof ACL_UPLOAD
  | typeof ACL_DELETE;

export type AclAction = "read" | "edit" | "create" | "upload" | "delete";

export interface ResolveAclOptions {
  defaultPermission?: number;
}

const DEFAULT_PERMISSION = ACL_UPLOAD;

export function resolveAclPermission(
  rules: AclRuleRecord[],
  subjectId: string,
  principal: AuthPrincipal,
  options: ResolveAclOptions = {}
): number {
  const subjects = runtimeAclSubjects(principal);
  const expandedRules = expandAclRules(rules, principal);
  const normalizedSubjectId = normalizeAclScope(subjectId);

  const exactPermission = highestPermissionForScope(expandedRules, normalizedSubjectId, subjects);
  if (exactPermission !== null) return exactPermission;

  for (const scope of inheritedAclScopes(normalizedSubjectId)) {
    const permission = highestPermissionForScope(expandedRules, scope, subjects);
    if (permission !== null) return permission;
  }

  return options.defaultPermission ?? DEFAULT_PERMISSION;
}

export function hasAclPermission(permission: number, required: number): boolean {
  return permission >= required;
}

export function requiredAclPermission(action: AclAction): number {
  switch (action) {
    case "read":
      return ACL_READ;
    case "edit":
      return ACL_EDIT;
    case "create":
      return ACL_CREATE;
    case "upload":
      return ACL_UPLOAD;
    case "delete":
      return ACL_DELETE;
  }
}

export function resolveAclAction(
  rules: AclRuleRecord[],
  subjectId: string,
  principal: AuthPrincipal,
  action: AclAction,
  options: ResolveAclOptions = {}
): boolean {
  return hasAclPermission(
    resolveAclPermission(rules, subjectId, principal, options),
    requiredAclPermission(action)
  );
}

function runtimeAclSubjects(principal: AuthPrincipal): string[] {
  return [
    ...new Set(
      principalAclSubjects(principal).flatMap((subject) => [
        subject,
        dokuWikiAuthNameEncodedSubject(subject)
      ])
    )
  ];
}

function dokuWikiAuthNameEncodedSubject(subject: string): string {
  if (subject === EVERYONE_ACL_SUBJECT) return subject;
  if (subject.startsWith("@")) return `@${dokuWikiAuthNameEncode(subject.slice(1))}`;
  return dokuWikiAuthNameEncode(subject);
}

function dokuWikiAuthNameEncode(name: string): string {
  return [...name]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code > 0x7f) return char;
      if (
        (code >= 0x00 && code <= 0x2f) ||
        (code >= 0x3a && code <= 0x40) ||
        (code >= 0x5b && code <= 0x60) ||
        (code >= 0x7b && code <= 0x7f)
      ) {
        return `%${code.toString(16)}`;
      }

      return char;
    })
    .join("");
}

function highestPermissionForScope(
  rules: AclRuleRecord[],
  scope: string,
  subjects: string[]
): number | null {
  let permission: number | null = null;

  for (const rule of rules) {
    if (normalizeAclScope(rule.scope) !== scope) continue;
    if (!aclRuleMatchesPrincipal(rule, subjects)) continue;

    const rulePermission = clampAclPermission(rule.permission);
    permission = permission === null ? rulePermission : Math.max(permission, rulePermission);
  }

  return permission;
}

function inheritedAclScopes(subjectId: string): string[] {
  if (!subjectId.includes(":")) {
    return ["*"];
  }

  const parts = subjectId.split(":");
  parts.pop();

  const scopes: string[] = [];
  for (let index = parts.length; index > 0; index -= 1) {
    scopes.push(`${parts.slice(0, index).join(":")}:*`);
  }
  scopes.push("*");

  return scopes;
}

function aclRuleMatchesPrincipal(rule: AclRuleRecord, subjects: string[]): boolean {
  const normalizedPrincipal = normalizeAclPrincipal(rule.principalType, rule.principal);
  return subjects.includes(normalizedPrincipal);
}

function normalizeAclPrincipal(type: AclRuleRecord["principalType"], principal: string): string {
  const trimmed = principal.trim();

  if (type === "all") return EVERYONE_ACL_SUBJECT;
  if (type === "group") return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  return trimmed.replace(/^@+/, "");
}

function expandAclRules(rules: AclRuleRecord[], principal: AuthPrincipal): AclRuleRecord[] {
  return rules.flatMap((rule) => expandAclRule(rule, principal));
}

function expandAclRule(rule: AclRuleRecord, principal: AuthPrincipal): AclRuleRecord[] {
  const hasUserPlaceholder = includesAclPlaceholder(rule, "%USER%");
  const hasGroupPlaceholder = includesAclPlaceholder(rule, "%GROUP%");

  if (!hasUserPlaceholder && !hasGroupPlaceholder) {
    return [rule];
  }

  if (principal.type === "anonymous") {
    return [];
  }

  const userExpandedRule = hasUserPlaceholder
    ? replaceAclPlaceholder(
        rule,
        "%USER%",
        cleanAclIdFragment(principal.username),
        principal.username
      )
    : rule;

  if (!hasGroupPlaceholder) {
    return [userExpandedRule];
  }

  return principal.groups.map((group) =>
    replaceAclPlaceholder(userExpandedRule, "%GROUP%", cleanAclIdFragment(group), `@${group}`)
  );
}

function includesAclPlaceholder(rule: AclRuleRecord, placeholder: "%USER%" | "%GROUP%"): boolean {
  return rule.scope.includes(placeholder) || rule.principal.includes(placeholder);
}

function replaceAclPlaceholder(
  rule: AclRuleRecord,
  placeholder: "%USER%" | "%GROUP%",
  scopeReplacement: string,
  principalReplacement: string
): AclRuleRecord {
  return {
    ...rule,
    scope: rule.scope.replaceAll(placeholder, scopeReplacement),
    principal: rule.principal.replaceAll(placeholder, principalReplacement)
  };
}

function normalizeAclScope(scope: string): string {
  return scope.trim().toLowerCase();
}

function cleanAclIdFragment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/^:+|:+$/g, "");
}

function clampAclPermission(permission: number): number {
  if (!Number.isFinite(permission)) return ACL_NONE;
  if (permission < ACL_NONE) return ACL_NONE;
  if (permission > ACL_DELETE) return ACL_DELETE;

  return permission;
}
