import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./router";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
  }),
);

app.listen(port, () => {
  console.log(`tRPC server listening on http://localhost:${port}`);
});
