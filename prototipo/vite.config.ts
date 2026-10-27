import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
// Genera un único index.html autocontenido (se abre sin servidor ni credenciales).
export default defineConfig({ plugins: [react(), viteSingleFile()], base: "./" });
