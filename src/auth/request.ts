import type { Env } from "../env";
import { anonymousPrincipal, type AuthPrincipal } from "./principal";

export async function resolveRequestPrincipal(request: Request, env: Env): Promise<AuthPrincipal> {
  void request;
  void env;

  return anonymousPrincipal();
}
