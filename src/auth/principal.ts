import type { UserRecord } from "../storage/interfaces";

export const EVERYONE_ACL_SUBJECT = "@ALL";
const ANONYMOUS_DISPLAY_NAME = "Anonymous";

export interface AnonymousPrincipal {
  type: "anonymous";
  isAuthenticated: false;
  id: null;
  username: null;
  displayName: string;
  email: null;
  groups: string[];
}

export interface UserPrincipal {
  type: "user";
  isAuthenticated: true;
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  groups: string[];
}

export type AuthPrincipal = AnonymousPrincipal | UserPrincipal;

export interface PrincipalAuthor {
  authorId: string | null;
  authorName: string | null;
}

export interface PublicPrincipal {
  type: AuthPrincipal["type"];
  isAuthenticated: boolean;
  username: string | null;
  displayName: string;
  groups: string[];
  aclSubjects: string[];
}

export function anonymousPrincipal(): AnonymousPrincipal {
  return {
    type: "anonymous",
    isAuthenticated: false,
    id: null,
    username: null,
    displayName: ANONYMOUS_DISPLAY_NAME,
    email: null,
    groups: []
  };
}

export function principalFromUser(user: UserRecord, groups: string[] = []): UserPrincipal {
  return {
    type: "user",
    isAuthenticated: true,
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    groups: normalizeGroups(groups)
  };
}

export function principalAclSubjects(principal: AuthPrincipal): string[] {
  const subjects = [EVERYONE_ACL_SUBJECT];

  if (principal.type === "user") {
    subjects.push(...principal.groups.map((group) => `@${group}`), principal.username);
  }

  return [...new Set(subjects)];
}

export function principalAuthor(principal: AuthPrincipal): PrincipalAuthor {
  if (principal.type === "anonymous") {
    return { authorId: null, authorName: null };
  }

  return {
    authorId: principal.id,
    authorName: principal.displayName || principal.username
  };
}

export function publicPrincipal(principal: AuthPrincipal): PublicPrincipal {
  return {
    type: principal.type,
    isAuthenticated: principal.isAuthenticated,
    username: principal.username,
    displayName: principal.displayName,
    groups: [...principal.groups],
    aclSubjects: principalAclSubjects(principal)
  };
}

function normalizeGroups(groups: string[]): string[] {
  return [
    ...new Set(
      groups.map((group) => group.trim().replace(/^@+/, "")).filter((group) => group.length > 0)
    )
  ];
}
