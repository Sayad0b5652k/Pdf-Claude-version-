// Vercel Node function: runs the Express app (built by `npm run build` into dist/server-fn.cjs)
const { appPromise } = require("../dist/server-fn.cjs");
module.exports = async (req, res) => {
  const app = await appPromise;
  return app(req, res);
};
