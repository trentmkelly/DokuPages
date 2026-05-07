import { handleRequest } from "../src/app";
import type { Env } from "../src/env";
import { withRequestObservability } from "../src/http/observability";

export const onRequest: PagesFunction<Env> = async (context) => {
  return withRequestObservability(context.request, () =>
    handleRequest(context.request, context.env, () => context.next())
  );
};
