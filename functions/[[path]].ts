import { handleRequest } from "../src/app";
import { getRuntimeConfig } from "../src/config";
import type { Env } from "../src/env";
import { withRequestObservability } from "../src/http/observability";

export const onRequest: PagesFunction<Env> = async (context) => {
  const config = getRuntimeConfig(context.env);
  return withRequestObservability(
    context.request,
    () => handleRequest(context.request, context.env, () => context.next()),
    { dontLog: config.dontLog }
  );
};
