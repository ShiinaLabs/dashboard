import { fileURLToPath, URL } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  // Route-level code splitting otherwise lets Vite discover Radix packages
  // after the app has started. Re-optimizing them mid-session can load a
  // second React runtime into the lazy route chunks.
  optimizeDeps: {
    include: [
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "cmdk",
      "sonner",
    ],
  },
  // Build-time mirror of MOCK_DATA so the client can show the mock-mode
  // banner (React Router/Vite do not inline NEXT_PUBLIC_* automatically).
  define: {
    "process.env.NEXT_PUBLIC_MOCK_DATA": JSON.stringify(process.env.NEXT_PUBLIC_MOCK_DATA),
  },
});
