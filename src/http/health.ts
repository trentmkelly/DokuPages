import type { Env } from "../env";
import { collectDiagnostics } from "./diagnostics";
import { jsonResponse } from "./responses";

export async function healthResponse(env: Env): Promise<Response> {
  const diagnostics = await collectDiagnostics(env);

  return jsonResponse({
    ok: diagnostics.ok,
    service: diagnostics.service,
    version: diagnostics.version,
    siteName: diagnostics.site.siteName,
    bindings: diagnostics.bindings,
    storage: diagnostics.storage,
    quotas: diagnostics.quotas,
    config: {
      ok: diagnostics.config.ok,
      issueCount: diagnostics.config.issues.length
    }
  });
}
