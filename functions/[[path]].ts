import { handleRequest } from "../src/app";
import type { Env } from "../src/env";

export const onRequest: PagesFunction<Env> = async (context) => {
  return handleRequest(context.request, context.env, () => context.next());
};
