import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverPort = env.PORT || env.SERVER_PORT || "5002";
  const webPort = parseInt(env.WEB_PORT || "5001", 10);

  return {
    plugins: [react()],
    server: {
      port: webPort,
      proxy: {
        "/api": `http://127.0.0.1:${serverPort}`,
      },
    },
  };
});
