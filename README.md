# GarneauHub GIFT (extension VS Code)

Écrire les questions d'un examen GarneauHub au format GIFT dans VS Code, avec les mêmes règles que l'éditeur GIFT du site :

- **Coloration** des fichiers `.gift` : directives (`// points:`, `// code:`, `// type:`…), réponses `=` et `~`, titres `::…::`, trous `{:SA:}` / `{:MC:}` et `[[…]]`. Le code des blocs ` ```python ` est coloré comme du Python (aussi JavaScript, TypeScript, Bash, C#, C, C++, Java, PHP et SQL).
- **Modèles de questions** : en début de ligne, tapez un raccourci (`qcm`, `vf`, `texte`, `code`, `cloze`, `grille`, `glisser-texte`, `mcq`, `tfq`, `saq`, `mwq`…) puis Tab. La commande **GarneauHub GIFT : Ajouter une question** (bouton `+` en haut de l'éditeur) ajoute un modèle complet à la fin du fichier.
- **Suggestions selon le curseur** (comme l'IntelliSense) : après `//`, les directives utiles à la question (`points`, `type`, `colonnes`…) ; après `// type:` ou `// notation:`, les valeurs offertes ; juste après `{`, les formes de réponses (`=`, `~`, `T`/`F`, `{:SA:}`, `{:MC:}`, ligne de grille). Ctrl+Espace ouvre la liste à tout moment.
- **Erreurs soulignées** : les erreurs, avertissements et notes du site, dans le texte et dans l'onglet « Problèmes » (Ctrl+Maj+M).
- **Structure** : chaque question apparaît dans la vue « Structure » et le fil d'Ariane, avec son type et ses points ; Ctrl+Maj+O pour sauter à une question. Chaque question et chaque bloc de code ``` se replient.
- **Barre d'état** : en bas à gauche, le nombre de questions, le total des points et les erreurs du fichier (« 12 questions · 45 pts »). Un clic ouvre l'aperçu.
- **Aperçu de l'examen** : Ctrl+Maj+V (ou le bouton en haut à droite de l'éditeur) ouvre l'aperçu à côté du texte : chaque question avec son type, ses points et ses bonnes réponses. Un clic sur « Question n » ou sur un problème place le curseur à la bonne ligne.

La syntaxe est décrite dans [documentation/editeur-gift](../documentation/editeur-gift/README.md).

Différences avec le site :

- **Glisser sur image** : l'image se téléverse sur le site. L'extension vérifie la question et liste ses zones, mais n'affiche pas l'image.
- **Questions de code** : le langage (`// code:`) n'est pas vérifié, car la liste des langages est sur le serveur. Les tests s'exécutent sur le site (bouton « Valider les tests »).
- Le fichier se met ensuite sur le site avec « Importer un .gift » dans l'éditeur GIFT.

## Comment ça marche

L'extension n'a **pas sa propre copie** du parseur : elle reprend le code de l'éditeur GIFT du site (`frontend/src/utils/giftParser.js`, `giftSnippets.js`, `questionParts.js`…). Au build, [esbuild](https://esbuild.github.io/) réunit ce code et celui de l'extension dans un seul fichier, `dist/extension.js`. Une règle changée sur le site est donc dans l'extension au prochain build.

| Fichier | Rôle |
|---|---|
| `package.json` | Description de l'extension pour VS Code : langage `gift`, commandes, raccourci, boutons |
| `src/extension.js` | Point d'entrée : erreurs soulignées, modèles, commande « Ajouter une question », panneau d'aperçu |
| `src/gift.js` | Ce que l'extension reprend du frontend |
| `src/outline.js` | Blocs de questions : vue « Structure », repli et texte de la barre d'état |
| `src/completions.js` | Quand proposer les modèles (pas dans `{ }` ni dans un bloc de code) |
| `src/previewHtml.js` + `media/preview.css` | Page HTML de l'aperçu (couleurs du thème de VS Code) |
| `scripts/grammar.mjs` | Écrit la coloration, `syntaxes/gift.tmLanguage.json` (ne pas modifier ce fichier à la main) |
| `language-configuration.json` | Commentaires `//` (Ctrl+/) et accolades |
| `examples/exemple.gift` | Un exemple de chaque type de question |

## Développer

Prérequis : Node.js 18 ou plus. Le frontend n'a pas besoin d'être installé.

```bash
cd garneauhub-giftformat
npm install
npm run build    # coloration + dist/extension.js
npm test         # tests (vitest)
```

**Essayer l'extension** : ouvrez le dossier `garneauhub-giftformat` dans VS Code et appuyez sur **F5**. Une deuxième fenêtre de VS Code s'ouvre avec l'extension chargée et le dossier `examples/`. Ouvrez `exemple.gift`. Après une modification du code, relancez avec Ctrl+Maj+F5. Pendant le développement, `npm run watch` refait le build à chaque sauvegarde.

## Installer sans F5

```bash
npm run package
```

Cette commande produit `garneauhub-giftformat-0.1.0.vsix`. Pour l'installer : dans VS Code, vue Extensions → menu `…` → **Installer à partir d'un VSIX…**, ou :

```bash
code --install-extension garneauhub-giftformat-0.1.0.vsix
```

Le fichier `.vsix` peut être donné aux autres enseignants. La publication sur le Marketplace de VS Code demandera un compte éditeur (champ `publisher` de `package.json`).
