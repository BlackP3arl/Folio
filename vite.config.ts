import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    target: "es2022",
    // pdf.js alone is ~800 KB minified; it is one library and can't usefully be split further.
    chunkSizeWarningLimit: 1200,
  },
});
