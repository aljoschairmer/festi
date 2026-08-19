import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws when imported outside a server bundle. Under
      // Vitest we *are* on the server, so it is stubbed out.
      "server-only": fileURLToPath(
        new URL("./test/serverOnlyStub.ts", import.meta.url),
      ),
    },
  },
});
