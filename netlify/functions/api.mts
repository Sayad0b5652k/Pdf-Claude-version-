import type { Config, Context } from "@netlify/functions";
import type { AddressInfo } from "node:net";
// Bundle of server.ts created by `npm run build` (esbuild)
// @ts-ignore
import fnBundle from "../../dist/server-fn.cjs";
const appPromise: Promise<any> = (fnBundle as any).appPromise ?? (fnBundle as any).default?.appPromise;

// Express runs on a private local port inside the function; each request is proxied to it
// (keeps streaming/SSE and avoids the legacy Lambda handler's 4KB env limit).
let base: Promise<string> | undefined;
function start() {
  return (base ??= (async () => {
    const app = await appPromise;
    return await new Promise<string>((resolve) => {
      const srv = app.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`));
    });
  })());
}

export default async (req: Request, _ctx: Context) => {
  const u = new URL(req.url);
  const target = (await start()) + u.pathname + u.search;
  const headers = new Headers(req.headers);
  headers.delete("host");
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const r = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-ignore node fetch
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
  });
  const out = new Headers(r.headers);
  out.delete("content-encoding"); out.delete("content-length"); out.delete("transfer-encoding");
  return new Response(r.body, { status: r.status, headers: out });
};

export const config: Config = { path: "/api/*" };
