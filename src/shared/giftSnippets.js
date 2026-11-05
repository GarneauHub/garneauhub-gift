// Modeles de questions GIFT (syntaxe des snippets Monaco, la meme que celle
// de VS Code) (#19).
//
// GIFT_QUESTION_TYPES      : chaque type de question et son modele par defaut.
// GIFT_SNIPPETS            : les boutons « Ajouter » de l'editeur.
// GIFT_COMPLETION_SNIPPETS : ce que l'editeur propose pendant la frappe. Les
//   prefixes sont ceux de l'extension VS Code « GIFT Format » (vscode-gift),
//   pour garder les memes reflexes : mcq, mc2 a mc6, saq, mwq, tfq...
//   chacun avec sa forme longue (« multiple choice question ») et sa variante
//   avec titre (mcqt, « multiple choice question title »).
//
// Seuls les types de questions que GarneauHub sait enregistrer sont offerts :
// pas de reponses multiples ponderees (mcqm), d'association (maq : c'est le
// bouton « Grille », qui en reprend la syntaxe), de
// numerique (nq), de categorie (cat), de description (des) ni de
// developpement (ess) : une question texte donne sa reponse attendue.

// Chaque question a son type (« // type: », voir giftParser.js) et chaque type
// son modele par defaut. `template` : le texte qui suit la ligne
// « // type: », champs numerotes a partir de 1. Il sert aux boutons
// « Ajouter », aux raccourcis (qcm, vf...) et a la suggestion « // type: »
// (giftCompletions.js) : choisir un type dans une question vide ecrit son
// modele.
export const GIFT_QUESTION_TYPES = [
  {
    id: "qcm",
    type: "choix-multiples",
    label: "Choix multiples",
    description: "Une bonne réponse (=) et des mauvaises (~)",
    template: "${1:Énoncé de la question} {\n\t=${2:Bonne réponse}\n\t~${3:Mauvaise réponse}\n\t~${4:Mauvaise réponse}\n\\}\n",
  },
  {
    id: "vf",
    type: "vrai-faux",
    label: "Vrai / Faux",
    description: "{T} pour vrai, {F} pour faux",
    template: "${1:Affirmation à évaluer} {${2|T,F|}\\}\n",
  },
  {
    id: "texte",
    type: "texte",
    label: "Réponse texte",
    description: "La réponse attendue entre les accolades (=)",
    template: "${1:Énoncé de la question} {=${2:Réponse attendue}\\}\n",
  },
  {
    // Question de code : propre a GarneauHub, tout est en commentaires
    // (voir « Questions de code » dans giftParser.js).
    id: "code",
    type: "code",
    label: "Code",
    description: "Langage, solution et tests validés sur Jobe",
    template: "// code: ${1|nodejs,python3,bash,csharp|}\n// solution:\n```${1}\n${2:const somme = (a, b) => a + b;}\n```\n// test: ${3:console.log(somme(2, 3))} => ${4:5}\n${5:Énoncé de la question} {\\}\n",
  },
  {
    // Texte a trous et grille (#156) : voir giftParser.js.
    id: "cloze",
    type: "cloze",
    label: "Texte à trous",
    description: "Un trou par bloc { } : {:SA: réponse} (réponse courte) ou {:MC: =bonne ~mauvaise} (menu)",
    template: "${1:Le protocole} {:MC: =${2:TCP} ~${3:UDP}\\} ${4:est orienté connexion. L'adresse de boucle locale est} {:SA: ${5:127.0.0.1}\\}.\n",
  },
  {
    id: "grille",
    type: "grille",
    label: "Grille",
    description: "Une ligne « =Élément -> Colonne » par bonne réponse (une colonne par ligne)",
    template: "// colonnes: ${1:Physique | Réseau | Transport}\n${2:À quelle couche appartient chaque élément ?} {\n\t=${3:Routeur} -> ${4:Réseau}\n\t=${5:Modem} -> ${6:Physique}\n\t=${7:TCP} -> ${8:Transport}\n\\}\n",
  },
  {
    id: "grille-multiple",
    type: "grille-multiple",
    label: "Grille, plusieurs colonnes par ligne",
    description: "Une ligne répétée ajoute une bonne colonne (cases à cocher)",
    template: "// colonnes: ${1:Client | Serveur}\n${2:Qui envoie chaque message ?} {\n\t=${3:Requête HTTP} -> ${4:Client}\n\t=${5:Réponse HTTP} -> ${6:Serveur}\n\t=${7:Paquet TCP} -> ${4:Client}\n\t=${7:Paquet TCP} -> ${6:Serveur}\n\\}\n",
  },
  {
    id: "glisser-texte",
    type: "glisser-texte",
    label: "Glisser sur texte",
    description: "Étiquettes attendues entre [[ ]] dans le texte, intrus (~) à la fin",
    template: "${1:Le modèle OSI compte} [[${2:7}]] ${3:couches ; TCP est dans la couche} [[${4:Transport}]]. {~${5:Réseau} ~${6:5}\\}\n",
  },
  {
    // L'editeur du site demande d'abord l'image, la televerse, puis remplace
    // IMAGE_KEY_PLACEHOLDER par sa cle (voir GiftEditorPanel.vue). Ailleurs
    // (suggestion « // type: »), la cle est un champ a remplir.
    id: "glisser-image",
    type: "glisser-image",
    label: "Glisser sur image",
    description: "Téléverser une image, puis placer les zones (« // zone: x, y => étiquette »)",
    needsImage: true,
    template: "// image: ${1:clé de l'image}\n// zone: ${2:30}, ${3:40} => ${4:Routeur}\n// zone: ${5:70}, ${6:40} => ${7:Modem}\n${8:Placez les étiquettes sur l'image.} {~${9:Commutateur}\\}\n",
  },
];

export const IMAGE_KEY_PLACEHOLDER = "@IMAGE@";

// Champs d'un modele decales de `offset` : « ${1 » -> « ${2 »...
export const shiftSnippetFields = (body, offset) =>
  body.replace(/\$\{(\d+)/g, (match, index) => `\${${Number(index) + offset}`);

// Les boutons ajoutent la ligne de points (propre a GarneauHub, voir
// giftParser.js) et celle du type : c'est le modele complet d'une question.
export const GIFT_SNIPPETS = GIFT_QUESTION_TYPES.map(({ template, ...snippet }) => ({
  ...snippet,
  body: `// points: \${1:1}\n// type: ${snippet.type}\n${shiftSnippetFields(template, 1)}`
    .replace("${2:clé de l'image}", IMAGE_KEY_PLACEHOLDER),
}));

// Lignes de reponses d'une question a `count` options : la bonne, puis les
// mauvaises. Les champs sont numerotes a partir de `first`.
const optionLines = (count, first) => [
  `\t=\${${first}:Bonne réponse}`,
  ...Array.from({ length: count - 1 }, (_, index) => `\t~\${${first + 1 + index}:Mauvaise réponse}`),
];

const multipleChoice = (count) => `\${1:Question} {\n${optionLines(count, 2).join("\n")}\n\\}`;

// Mot manquant : les reponses sont au milieu de la phrase.
const missingWord = (count) => {
  const end = `\${${count + 2}:fin de la phrase}`;
  if (count >= 4) return `\${1:Début de la phrase} {\n${optionLines(count, 2).join("\n")}\n\\} ${end}`;
  const options = optionLines(count, 2).map((line) => line.trim()).join(" ");
  return `\${1:Début de la phrase} {${options}\\} ${end}`;
};

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

// Questions : { short, long, detail, type, body }. `long` est facultatif ;
// `type` : la valeur de la ligne « // type: » ajoutee devant la question.
const QUESTION_SNIPPETS = [
  { short: "mcq", long: "multiple choice question", detail: "Choix multiples, 4 options", type: "choix-multiples", body: multipleChoice(4) },
  ...range(2, 6).map((count) => ({ short: `mc${count}`, detail: `Choix multiples, ${count} options`, type: "choix-multiples", body: multipleChoice(count) })),
  { short: "saq", long: "short answer question", detail: "Réponse texte", type: "texte", body: "${1:Question} {=${2:Réponse attendue}\\}" },
  { short: "sa1", detail: "Réponse texte", type: "texte", body: "${1:Question} {=${2:Réponse attendue}\\}" },
  { short: "mwq", long: "missing word question", detail: "Mot manquant, 3 options", type: "choix-multiples", body: missingWord(3) },
  ...range(1, 6).map((count) => ({
    short: `mw${count}`,
    detail: count === 1 ? "Mot manquant, réponse texte" : `Mot manquant, ${count} options`,
    type: count === 1 ? "texte" : "choix-multiples",
    body: missingWord(count),
  })),
  { short: "tfq", long: "true false question", detail: "Vrai / Faux", type: "vrai-faux", body: "${1:Question} {${2|TRUE,FALSE|}\\}" },
];

// Variante avec titre : « ::Titre:: » devant, les autres champs decales.
const withTitle = (body) => `::\${1:Titre}::${shiftSnippetFields(body, 1)}`;
const withType = (type, body) => `// type: ${type}\n${body}`;

// Liste a plat : { prefix, detail, body, fragment }. `fragment` = bout de
// question (titre, points), pas une question complete.
export const GIFT_COMPLETION_SNIPPETS = [
  // Sans « Glisser sur image » : son image se televerse avec le bouton.
  ...GIFT_SNIPPETS.filter((snippet) => !snippet.needsImage)
    .map((snippet) => ({ prefix: snippet.id, detail: snippet.label, body: snippet.body })),
  ...QUESTION_SNIPPETS.flatMap(({ short, long, detail, type, body }) => [
    { prefix: short, detail, body: withType(type, body) },
    { prefix: `${short}t`, detail: `${detail}, avec titre`, body: withType(type, withTitle(body)) },
    ...(long
      ? [
        { prefix: long, detail, body: withType(type, body) },
        { prefix: `${long} title`, detail: `${detail}, avec titre`, body: withType(type, withTitle(body)) },
      ]
      : []),
  ]),
  { prefix: "type", detail: "Type de la question qui suit", body: `// type: \${1|${GIFT_QUESTION_TYPES.map((entry) => entry.type).join(",")}|}`, fragment: true },
  { prefix: "title", detail: "Titre de la question", body: "::${1:Titre}::", fragment: true },
  { prefix: "points", detail: "Points de la question qui suit", body: "// points: ${1:2}", fragment: true },
  { prefix: "test", detail: "Test d'une question de code", body: "// test: ${1:code} => ${2:résultat attendu}", fragment: true },
  { prefix: "notation", detail: "Notation d'un texte à trous ou d'une grille", body: "// notation: ${1|partielle,tout-ou-rien|}", fragment: true },
  { prefix: "colonnes", detail: "Colonnes d'une grille", body: "// colonnes: ${1:Colonne 1} | ${2:Colonne 2}", fragment: true },
  { prefix: "énoncé", detail: "Énoncé d'un texte à trous ou d'un glisser-déposer sur texte", body: "// énoncé: ${1:Complétez le texte.}", fragment: true },
  { prefix: "zone", detail: "Zone d'un glisser-déposer sur image (x, y en %)", body: "// zone: ${1:50}, ${2:50} => ${3:Étiquette}", fragment: true },
];

// Texte insere par un modele, sans la syntaxe des snippets (champs remplaces
// par leur valeur par defaut) : apercu dans la liste de suggestions.
// Un champ repete (« ${2} ») reprend la valeur du champ du meme numero.
export function renderSnippet(body) {
  const values = {};
  return body
    .replace(/\$\{(\d+)(?::([^}]*)|\|([^,|]*)[^}]*)\}/g, (match, index, placeholder, firstChoice) => {
      values[index] = placeholder ?? firstChoice;
      return values[index];
    })
    .replace(/\$\{(\d+)\}/g, (match, index) => values[index] ?? "")
    .replace(/\\\}/g, "}");
}
