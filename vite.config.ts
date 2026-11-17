import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, l'interface tourne sur le port 5173 et transmet
// les échanges temps réel et les appels /api au serveur (port 3000).
export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    // Avec Konva (carte), l'interface pèse environ 650 Ko (200 Ko compressée) : c'est normal,
    // et le navigateur ne la télécharge qu'une fois.
    chunkSizeWarningLimit: 1000,
  },
});
