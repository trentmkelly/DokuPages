import { healthResponse } from "../../src/http/health";
import type { Env } from "../../src/env";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return healthResponse(env);
};
