// Construit dist/extension.js : le code de l'extension et celui de l'editeur
// GIFT du site (frontend/src/utils), reunis en un seul fichier. Le site et
// l'extension partagent donc le meme parseur : une seule source de verite.
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
  // Les fichiers du frontend importent gift-parser-ide : on le prend dans
  // node_modules de l'extension si celui du frontend n'est pas installe.
  nodePaths: [path.join(root, "node_modules")],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}
