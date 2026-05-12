import { healthResponse } from "../../src/http/health";
import { getRuntimeConfig } from "../../src/config";
import { withRequestObservability } from "../../src/http/observability";
import type { Env } from "../../src/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const config = getRuntimeConfig(env);
  return withRequestObservability(request, async () => healthResponse(env), {
    dontLog: config.dontLog
  });
};
