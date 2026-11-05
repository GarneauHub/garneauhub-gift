// Construit dist/extension.js : le code de l'extension et celui de l'editeur
// GIFT du site (copie dans src/shared), reunis en un seul fichier.
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [path.join(root, "src", "extension.js")],
  outfile: path.join(root, "dist", "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // Fourni par VS Code au chargement de l'extension.
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
