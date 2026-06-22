import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port and looks at the dist folder when building.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // es2019 transpiles optional chaining / nullish coalescing / logical
    // assignment down so the web build also runs on older browsers (e.g. the
    // Safari/Chrome that macOS 10.12 caps out at). Harmless for the Tauri webview.
    target: "es2019",
    outDir: "dist",
  },
});
