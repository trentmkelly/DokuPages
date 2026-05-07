import { healthResponse } from "../../src/http/health";
import { withRequestObservability } from "../../src/http/observability";
import type { Env } from "../../src/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  return withRequestObservability(request, async () => healthResponse(env));
};
