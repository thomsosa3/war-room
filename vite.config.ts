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
  // Produce relative asset paths so the bundle works inside the Tauri webview.
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
