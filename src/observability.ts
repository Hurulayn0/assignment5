// Huriye Kayadelen, 2200005795
import type { MiddlewareHandler } from "hono";
import type { Env } from "./auth.ts";
export const requestLog: MiddlewareHandler<Env> = async (c, next) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  await next();
  if (c.res.status === 404 || c.res.status === 500) {
    const status = c.res.status;
    const body = await c.res.json();
    c.res = c.json({ ...body, requestId }, status);
  }
  c.header("x-request-id", requestId);
  console.log(
    JSON.stringify({
      method: c.req.method,
      path: c.req.routePath,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
      requestId,
    }),
  );
};
