// Vercel Node function: runs the Express app (built by `npm run build` into dist/server-fn.cjs)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { appPromise } = require("../dist/server-fn.cjs");

export default async function handler(req, res) {
  const app = await appPromise;
  return app(req, res);
}
