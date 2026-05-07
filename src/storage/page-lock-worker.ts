export { PageLockObject } from "./page-lock-object";

export default {
  fetch(): Response {
    return new Response("Page lock worker is running.", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff"
      }
    });
  }
};
