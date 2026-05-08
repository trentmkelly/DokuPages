import type { AuthPrincipal } from "./principal";

const NOT_SET = "!!not set!!";

export function isDokuWikiSuperuser(principal: AuthPrincipal, superuser: string): boolean {
  return principalMatchesDokuWikiMemberList(principal, superuser);
}

export function isDokuWikiManager(
  principal: AuthPrincipal,
  superuser: string,
  manager: string
): boolean {
  return (
    principalMatchesDokuWikiMemberList(principal, superuser) ||
    principalMatchesDokuWikiMemberList(principal, manager)
  );
}

export function principalMatchesDokuWikiMemberList(
  principal: AuthPrincipal,
  memberList: string
): boolean {
  if (principal.type !== "user") return false;

  const username = normalizeMemberName(principal.username);
  const groups = new Set(principal.groups.map(normalizeMemberName));

  for (const member of parseMemberList(memberList)) {
    if (member === "@ALL") return true;

    if (member.startsWith("@")) {
      if (groups.has(normalizeMemberName(member.slice(1)))) return true;
      continue;
    }

    if (normalizeMemberName(member) === username) return true;
  }

  return false;
}

function parseMemberList(memberList: string): string[] {
  return [
    ...new Set(
      memberList
        .split(",")
        .map((member) => member.trim())
        .filter((member) => member.length > 0 && member !== NOT_SET)
    )
  ];
}

function normalizeMemberName(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}
