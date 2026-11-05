// Suggestions de l'editeur GIFT selon la position du curseur, comme
// l'IntelliSense de Visual Studio : apres « // », les directives qui
// conviennent a la question ; apres « // type: », les types offerts ; dans un
// bloc { }, les formes de reponses. En debut de ligne, les modeles de
// questions (giftSnippets.js). Partage par le site (giftMonaco.js) et
// l'extension VS Code (garneauhub-giftformat) : memes suggestions partout.
import { findFence } from "./giftCodeAssist.js";
import { GIFT_COMPLETION_SNIPPETS, GIFT_QUESTION_TYPES, renderSnippet } from "./giftSnippets.js";

// Caracteres qui ouvrent la liste sans Ctrl+Espace. Une suggestion n'est
// offerte apres eux que dans une directive ou un bloc de reponses : jamais en
// pleine phrase.
export const GIFT_TRIGGER_CHARACTERS = ["/", " ", ":", "{"];

// Types de questions annonces par « // type: » (memes cles que
// BASE_TYPE_DIRECTIVES et PART_TYPE_DIRECTIVES, giftParser.js).
const QUESTION_TYPES = GIFT_QUESTION_TYPES.map((entry) => entry.type);
const TYPE_ALIASES = { qcm: "choix-multiples", vf: "vrai-faux" };
const PART_TYPES = ["cloze", "grille", "grille-multiple", "glisser-texte", "glisser-image"];
const GRID_TYPES = ["grille", "grille-multiple"];
const DRAG_TYPES = ["glisser-texte", "glisser-image"];

// Directives : `for` = types de questions ou elle sert (tous si absent ;
// « code » = question de code), `once` = une seule par question.
// `retrigger` : la liste se rouvre apres l'insertion, pour choisir la valeur.
const DIRECTIVES = [
  {
    name: "points",
    once: true,
    detail: "Points de la question",
    documentation: "Un entier positif. Sans cette ligne, la question vaut 1 point.\n\n```gift\n// points: 2\n```",
    insertText: "points: ${1:2}",
  },
  {
    name: "type",
    once: true,
    detail: "Type de question",
    documentation: `Le type de la question : ${QUESTION_TYPES.map((type) => `\`${type}\``).join(", ")}. Dans une question vide, choisir le type écrit son modèle.\n\n\`\`\`gift\n// type: choix-multiples\n\`\`\``,
    insertText: "type: ",
    retrigger: true,
  },
  {
    name: "notation",
    once: true,
    for: PART_TYPES,
    detail: "Notation d'un texte à trous, d'une grille ou d'un glisser-déposer",
    documentation: "`partielle` (par défaut) : les points sont répartis. `tout-ou-rien` : tout doit être juste.",
    insertText: "notation: ",
    retrigger: true,
  },
  {
    name: "colonnes",
    once: true,
    for: GRID_TYPES,
    detail: "Colonnes d'une grille",
    documentation: "Séparées par « | ». Sans cette ligne, les colonnes sont celles des réponses, dans l'ordre.\n\n```gift\n// colonnes: Physique | Réseau | Transport\n```",
    insertText: "colonnes: ${1:Colonne 1} | ${2:Colonne 2}",
  },
  {
    name: "énoncé",
    once: true,
    for: ["cloze", "glisser-texte"],
    detail: "Énoncé d'un texte à trous ou d'un glisser-déposer sur texte",
    documentation: "Séparé du texte à trous. Sans cette ligne, un énoncé par défaut.\n\n```gift\n// énoncé: Complétez avec les protocoles du cours 3.\n```",
    insertText: "énoncé: ${1:Complétez le texte.}",
  },
  {
    name: "image",
    once: true,
    for: ["glisser-image"],
    detail: "Image d'un glisser-déposer sur image",
    documentation: "La clé d'une image téléversée avec le bouton « Glisser sur image » de l'éditeur du site.",
    insertText: "image: ${1:clé de l'image}",
  },
  {
    name: "zone",
    for: ["glisser-image"],
    detail: "Zone d'un glisser-déposer sur image",
    documentation: "Le centre de la zone, en % de la largeur et de la hauteur de l'image, puis l'étiquette attendue.\n\n```gift\n// zone: 25, 40 => Routeur\n```",
    insertText: "zone: ${1:50}, ${2:50} => ${3:Étiquette}",
  },
  {
    name: "code",
    once: true,
    for: ["code"],
    detail: "Langage d'une question de code",
    documentation: "Le prototype qui exécute le code (par défaut : nodejs).\n\n```gift\n// code: python3\n```",
    insertText: "code: ",
    retrigger: true,
  },
  {
    name: "solution",
    for: ["code"],
    detail: "Solution d'une question de code",
    documentation: "Le code de la solution, dans un bloc Markdown. Plusieurs fichiers : « // solution utils.py: ».",
    insertText: "solution:\n```${1:python}\n${2:code}\n```",
  },
  {
    name: "starter",
    for: ["code"],
    detail: "Code de départ de l'élève (un fichier)",
    documentation: "Le nom du fichier est obligatoire.\n\n```gift\n// starter main.py:\n```",
    insertText: "starter ${1:main.py}:\n```${2:python}\n${3:code}\n```",
  },
  {
    name: "test",
    for: ["code"],
    detail: "Test d'une question de code",
    documentation: "Le code à exécuter, puis le résultat attendu après « => ».\n\n```gift\n// test: print(somme(2, 3)) => 5\n```",
    insertText: "test: ${1:code} => ${2:résultat attendu}",
  },
];

// Valeurs de « // type: » : une par type de question, avec son modele.
const TYPE_VALUES = GIFT_QUESTION_TYPES.map((entry) => ({
  value: entry.type,
  detail: entry.label,
  documentation: entry.description,
  template: entry.template,
}));

const SCORING_VALUES = [
  { value: "partielle", detail: "Points répartis (par défaut)", documentation: "Chaque trou ou ligne juste rapporte sa part des points." },
  { value: "tout-ou-rien", detail: "Tout doit être juste", documentation: "La question vaut tous ses points ou aucun." },
];

// Nom d'une directive sans accents ni casse : « Énoncé » -> « enonce ».
const directiveKey = (name) => {
  const key = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return key === "point" ? "points" : key;
};

const DIRECTIVE_LINE = /^\s*\/\/ ?([\p{L}-]+)(?:[ \t]+[^\s:=]+)?[ \t]*[:=][ \t]*(.*)$/u;

// Directives de la question du curseur (le paragraphe, entre deux lignes
// vides), sauf celle de la ligne du curseur : Map cle -> valeur.
function questionDirectives(lines, lineIndex) {
  let first = lineIndex;
  while (first > 0 && lines[first - 1].trim()) first--;
  let last = lineIndex;
  while (last < lines.length - 1 && lines[last + 1].trim()) last++;
  const directives = new Map();
  for (let index = first; index <= last; index++) {
    const match = index === lineIndex ? null : DIRECTIVE_LINE.exec(lines[index]);
    if (match) directives.set(directiveKey(match[1]), match[2].trim());
  }
  return directives;
}

// Type de la question : une valeur de QUESTION_TYPES (« code » aussi pour
// une question avec des directives de code) ou null (pas
// encore connu).
function questionKind(directives) {
  const value = directives.get("type")?.toLowerCase();
  const type = TYPE_ALIASES[value] || value;
  if (QUESTION_TYPES.includes(type)) return type;
  if (["code", "test", "solution", "starter"].some((key) => directives.has(key))) return "code";
  return null;
}

// Le bloc { } ouvert au curseur : index de « { » dans `before` (le texte du
// paragraphe jusqu'au curseur), ou -1.
function openBraceIndex(before) {
  const opened = [];
  for (let index = 0; index < before.length; index++) {
    if (before[index] === "\\") index++;
    else if (before[index] === "{") opened.push(index);
    else if (before[index] === "}") opened.pop();
  }
  return opened.length ? opened[opened.length - 1] : -1;
}

// Le curseur est-il entre les accolades d'une question ?
export function isInsideAnswers(lines, lineIndex, character) {
  let firstLine = lineIndex;
  while (firstLine > 0 && lines[firstLine - 1].trim()) firstLine--;
  const before = [...lines.slice(firstLine, lineIndex), lines[lineIndex].slice(0, character)].join("\n");
  return openBraceIndex(before) !== -1;
}

const directiveItems = (lines, lineIndex) => {
  const directives = questionDirectives(lines, lineIndex);
  const kind = questionKind(directives);
  return DIRECTIVES
    .filter((directive) => !directive.once || !directives.has(directiveKey(directive.name)))
    .filter((directive) => !kind || !directive.for || directive.for.includes(kind))
    .map((directive) => ({
      kind: "directive",
      label: directive.name,
      detail: directive.detail,
      documentation: directive.documentation,
      insertText: directive.insertText,
      retrigger: Boolean(directive.retrigger),
    }));
};

const valueItems = (values) => values.map(({ value, detail, documentation }) => ({
  kind: "value", label: value, filterText: value, detail, documentation, insertText: value,
}));

// La question du curseur est-elle encore vide (seulement des « // points: »
// autour de la ligne « // type: ») ? Choisir un type y ecrit alors son modele.
function isEmptyQuestion(lines, lineIndex) {
  let first = lineIndex;
  while (first > 0 && lines[first - 1].trim()) first--;
  let last = lineIndex;
  while (last < lines.length - 1 && lines[last + 1].trim()) last++;
  for (let index = first; index <= last; index++) {
    if (index !== lineIndex && !/^\s*\/\/ ?points?[ \t]*[:=]/i.test(lines[index])) return false;
  }
  return true;
}

// Valeurs de « // type: ». En fin de ligne d'une question vide, chacune
// ajoute le modele de son type sous la ligne.
function typeItems(lines, lineIndex, character) {
  const withTemplate = !lines[lineIndex].slice(character).trim() && isEmptyQuestion(lines, lineIndex);
  return TYPE_VALUES.map(({ value, detail, documentation, template }) => {
    const insertText = withTemplate ? `${value}\n${template.replace(/\n$/, "")}` : value;
    return {
      kind: "value",
      label: value,
      filterText: value,
      detail: withTemplate ? `${detail} (modèle)` : detail,
      documentation: withTemplate ? `${documentation}\n\n\`\`\`gift\n// type: ${renderSnippet(insertText)}\n\`\`\`` : documentation,
      insertText,
    };
  });
}

// Formes de reponses offertes dans un bloc { }. `inside` : le texte du bloc
// avant le curseur ; `firstLine` : le curseur est sur la ligne de « { ».
function answerItems(kind, inside, firstLine) {
  const answer = (label, detail, insertText, documentation = "") => ({ kind: "answer", label, filterText: label, detail, documentation, insertText });
  const wrong = answer("~", "Mauvaise réponse", "~${1:Mauvaise réponse}");
  if (DRAG_TYPES.includes(kind)) {
    return [answer("~", "Intrus", "~${1:Intrus}", "Une étiquette qui ne va nulle part. Les bonnes réponses s'écrivent dans le texte ([[…]]) ou dans « // zone: ».")];
  }
  const gridLine = answer("= ->", "Ligne de grille : élément et sa colonne", "=${1:Élément} -> ${2:Colonne}");
  if (GRID_TYPES.includes(kind) || inside.includes("->")) return [gridLine];
  const lines = (body) => (firstLine ? `\n\t${body.join("\n\t")}\n` : body.join("\n\t"));
  // Type annonce : seulement les reponses de ce type.
  if (kind === "code") return [];
  if (kind === "vrai-faux") return inside.trim() ? [] : [answer("T", "Vrai", "T"), answer("F", "Faux", "F")];
  if (kind === "texte") return inside.trim() ? [] : [answer("=", "Réponse attendue", "=${1:Réponse attendue}")];
  if (kind === "choix-multiples" && !inside.trim()) {
    return [answer("= ~ ~", "Choix multiples", lines(["=${1:Bonne réponse}", "~${2:Mauvaise réponse}", "~${3:Mauvaise réponse}"]), "Une bonne réponse (=) et des mauvaises (~)."), wrong];
  }
  if (inside.trim()) return [answer("=", "Bonne réponse", "=${1:Bonne réponse}"), wrong];
  return [
    answer("= ~ ~", "Choix multiples", lines(["=${1:Bonne réponse}", "~${2:Mauvaise réponse}", "~${3:Mauvaise réponse}"]), "Une bonne réponse (=) et des mauvaises (~)."),
    answer("T", "Vrai", "T"),
    answer("F", "Faux", "F"),
    answer("=", "Réponse texte (ou bonne réponse)", "=${1:Réponse attendue}"),
    wrong,
    answer(":SA:", "Trou : réponse courte", ":SA: ${1:réponse}", "Texte à trous. « | » sépare les réponses acceptées : {:SA: 127.0.0.1 | localhost}."),
    answer(":MC:", "Trou : menu déroulant", ":MC: =${1:bonne} ~${2:mauvaise}", "Texte à trous : {:MC: =TCP ~UDP ~IP}."),
    { ...gridLine, insertText: lines(["=${1:Élément 1} -> ${2:Colonne 1}", "=${3:Élément 2} -> ${4:Colonne 2}"]), documentation: "Ajoutez « // type: grille » au-dessus pour plusieurs colonnes par ligne : « grille-multiple »." },
  ];
}

const snippetItems = () => GIFT_COMPLETION_SNIPPETS.map((snippet) => ({
  kind: "snippet",
  label: snippet.prefix,
  filterText: snippet.prefix,
  detail: snippet.detail,
  documentation: `\`\`\`gift\n${renderSnippet(snippet.body)}\n\`\`\``,
  insertText: snippet.body,
}));

// Suggestions a la position (ligne `lineIndex` et colonne `character`, a
// partir de 0) : { from, items } ou null. `from` : debut du texte remplace
// sur la ligne (jusqu'au curseur). `items` : { kind (snippet, directive,
// value, answer), label, filterText, detail, documentation (Markdown),
// insertText (syntaxe des snippets), retrigger }.
// options.prototypes : langages des questions de code ([{ name }]) ;
// options.triggerCharacter : le caractere tape qui a ouvert la liste.
export function getGiftCompletions(lines, lineIndex, character, { prototypes = null, triggerCharacter = null } = {}) {
  if (findFence(lines, lineIndex)) return null;
  const line = lines[lineIndex];
  const beforeCursor = line.slice(0, character);

  // Bloc de reponses { } : seulement au debut d'une reponse.
  let firstLine = lineIndex;
  while (firstLine > 0 && lines[firstLine - 1].trim()) firstLine--;
  const before = [...lines.slice(firstLine, lineIndex), beforeCursor].join("\n");
  const brace = openBraceIndex(before);
  if (brace !== -1) {
    const inside = before.slice(brace + 1);
    const onBraceLine = !inside.includes("\n");
    const current = inside.slice(inside.lastIndexOf("\n") + 1);
    const hole = /^:[A-Za-z]{0,2}:?$/.exec(inside);
    if (hole) return { from: character - inside.length, items: answerItems(null, "", true).filter((item) => item.label.startsWith(":")) };
    if (current.trim()) return null;
    return { from: character, items: answerItems(questionKind(questionDirectives(lines, lineIndex)), inside, onBraceLine) };
  }

  // Valeur d'une directive : « // type: », « // notation: », « // code: ».
  const value = /^(\s*\/\/ ?)([\p{L}]+)[ \t]*[:=][ \t]*(\S*)$/u.exec(beforeCursor);
  if (value) {
    const key = directiveKey(value[2]);
    const from = character - value[3].length;
    if (key === "type") return { from, items: typeItems(lines, lineIndex, character) };
    if (key === "notation") return { from, items: valueItems(SCORING_VALUES) };
    if (key === "code" && prototypes?.length) {
      return { from, items: valueItems(prototypes.map((prototype) => ({ value: prototype.name, detail: "Langage", documentation: "" }))) };
    }
    return null;
  }

  // Nom d'une directive, juste apres « // » (l'espace est ajoutee si elle
  // manque).
  const directive = /^(\s*\/\/ ?)([\p{L}-]*)$/u.exec(beforeCursor);
  if (directive) {
    const space = directive[1].endsWith(" ") ? "" : " ";
    const items = directiveItems(lines, lineIndex).map((item) => ({ ...item, filterText: item.label, insertText: space + item.insertText }));
    return { from: directive[1].length, items };
  }

  // Debut de ligne : modeles de questions, seulement a la demande ou en
  // tapant un mot (pas apres une espace ou une ponctuation).
  if (triggerCharacter) return null;
  return { from: line.length - line.trimStart().length, items: snippetItems() };
}
