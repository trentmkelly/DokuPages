export type AuthEventName =
  | "login_success"
  | "login_failure"
  | "login_rate_limited"
  | "logout"
  | "profile_update";

export interface AuthEventRecord {
  level: "info";
  event: "auth_event";
  authEvent: AuthEventName;
  requestId: string | null;
  method: string;
  path: string;
  ip: string | null;
  [key: string]: unknown;
}

export type AuthEventHandler = (record: AuthEventRecord) => void;

export function emitAuthEvent(
  record: AuthEventRecord,
  handlers: AuthEventHandler[] = [consoleAuthEventHandler]
): void {
  for (const handler of handlers) {
    handler(record);
  }
}

export const consoleAuthEventHandler: AuthEventHandler = (record) => {
  console.log(JSON.stringify(record));
};
