import { describe, expect, it, vi } from "vitest";
import { consoleAuthEventHandler, emitAuthEvent, type AuthEventRecord } from "../src/auth/events";

describe("auth event replacement hooks", () => {
  const record: AuthEventRecord = {
    level: "info",
    event: "auth_event",
    authEvent: "login_success",
    requestId: "request-1",
    method: "POST",
    path: "/api/auth/login",
    ip: "203.0.113.10",
    userId: "user-1",
    username: "alice"
  };

  it("dispatches auth events to native handlers", () => {
    const handled: AuthEventRecord[] = [];

    emitAuthEvent(record, [(event) => handled.push(event)]);

    expect(handled).toEqual([record]);
  });

  it("preserves the structured console auth event sink", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      consoleAuthEventHandler(record);

      expect(log).toHaveBeenCalledWith(JSON.stringify(record));
    } finally {
      log.mockRestore();
    }
  });
});
