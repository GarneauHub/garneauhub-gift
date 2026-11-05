// Lecture et ecriture du format GIFT (Moodle) pour les questions d'un examen
// (#19). Le resultat sert a la fois aux erreurs soulignees dans l'editeur, a
// l'apercu en direct et a l'enregistrement : une seule source de verite.
//
// L'analyse de la syntaxe est faite par gift-parser-ide (le parseur de
// l'extension VS Code « GIFT Format »). Ce module ajoute ce qui est propre a
// GarneauHub :
//   - les questions de code (langage, solution, tests), en commentaires
//     aussi : voir « Questions de code » plus bas ;
//   - les points : GIFT n'en a pas, ils s'ecrivent dans un commentaire
//     « // points: 2 » juste avant la question (1 point par defaut). Le
//     fichier reste un fichier GIFT valide pour Moodle ;
//   - les types de questions qu'un examen sait enregistrer (vrai / faux,
//     choix multiples a une bonne reponse, reponse texte avec sa reponse
//     attendue ; pas de developpement {}) et les memes regles
//     de validation que le serveur ;
//   - le texte a trous et la grille (#156), annonces par « // type: » : voir
//     « Texte a trous et grille » plus bas ;
//   - des messages en francais, places au bon endroit dans le document.
import { parser as giftSyntaxParser } from "gift-parser-ide";
import { getOptionLabelError, getQuestionLabelError } from "./examValidation.js";
import { buildFileAnswers, getQuestionFilesError } from "./questionFiles.js";
import {
  IMAGE_KEY_PATTERN,
  QUESTION_PART_TYPES,
  SCORING,
  blankMarker,
  hasBlankMarkers,
  isPartQuestionType,
  normalizeAnswer,
  validateQuestionDetails,
} from "./questionParts.js";

// L'export (questions -> GIFT) est dans giftExport.js, sans dependance npm,
// pour que le backend puisse aussi l'utiliser (archives de session, #177).
import { DEFAULT_PROTOTYPE_NAME, GIFT_DEFAULT_POINTS, getCodeFiles, questionsToGift } from "./giftExport.js";

export { GIFT_DEFAULT_POINTS, getCodeFiles, questionsToGift };

export const GIFT_SEVERITY = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
};

const SPECIAL_CHARACTERS = "~=#{}:";

// Position du premier caractere non echappe parmi `characters`, ou -1.
function findUnescaped(text, characters, from = 0) {
  for (let index = from; index < text.length; index++) {
    if (text[index] === "\\") {
      index++;
      continue;
    }
    if (characters.includes(text[index])) return index;
  }
  return -1;
}

// Le parseur refuse un « : » seul dans un texte (il faudrait ecrire « \: »),
// alors qu'on en ecrit partout en francais (« Vrai ou faux : ... »). On les
// echappe pour lui. Sont laisses tels quels : les « :: » du titre et le « : »
// d'une reponse numerique ({#3:1}), qui font partie de la syntaxe.
// Retourne le texte modifie et les positions des « \ » ajoutes, pour pouvoir
// replacer les erreurs dans le texte d'origine.
function escapeLoneColons(source) {
  const inserted = [];
  let text = "";
  let inNumericalAnswer = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      text += source.slice(index, index + 2);
      index++;
    } else if (source.startsWith("::", index)) {
      text += "::";
      index++;
    } else if (character === ":" && !inNumericalAnswer) {
      inserted.push(text.length);
      text += "\\:";
    } else {
      if (character === "{") inNumericalAnswer = source.slice(index + 1).trimStart().startsWith("#");
      if (character === "}") inNumericalAnswer = false;
      text += character;
    }
  }
  return { text, inserted };
}

// Ou sont l'enonce, le bloc de reponses et chaque reponse dans le texte d'une
// question : le parseur donne le contenu, pas les positions.
function locateParts(text) {
  const leading = text.length - text.trimStart().length;
  const whole = [leading, text.trimEnd().length];
  const open = findUnescaped(text, "{");
  const close = open === -1 ? -1 : findUnescaped(text, "}", open + 1);
  if (open === -1 || close === -1) return { whole, open, stem: whole, answers: whole, choices: [] };

  const stem = text.slice(0, open).trim() ? [leading, text.slice(0, open).trimEnd().length] : [open, open + 1];
  const starts = [];
  for (let index = findUnescaped(text, "=~", open + 1); index !== -1 && index < close; index = findUnescaped(text, "=~", index + 1)) {
    starts.push(index);
  }
  const choices = starts.map((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1] : close;
    return [start, start + Math.max(text.slice(start, end).trimEnd().length, 1)];
  });
  return { whole, open, stem, answers: [open, close + 1], choices };
}

const describeFound = (found) => (found === "\n" ? "une fin de ligne" : `« ${found} »`);

// Erreur de syntaxe du parseur (en anglais, « Expected ... but ... found »)
// -> message pour l'enseignant.
function translateSyntaxError(error) {
  const expected = (error.expected || []).map((expectation) => expectation.text ?? expectation.description ?? "");
  const { found } = error;

  if (found === null || found === undefined) {
    return expected.includes("}")
      ? "Accolade « { » jamais fermée : ajoutez « } » à la fin des réponses."
      : "Question incomplète.";
  }
  if (expected.includes("(blank lines separator)") && found === "{") {
    return "Deuxième bloc de réponses { } : séparez les questions par une ligne vide. Pour un texte à trous, écrivez chaque trou {:SA: réponse} ou {:MC: =bonne ~mauvaise}.";
  }
  if (expected.includes("(blank lines separator)")) {
    return `Texte inattendu après la question (${describeFound(found)}). Séparez les questions par une ligne vide ; pour écrire un caractère spécial dans un texte, mettez « \\ » devant.`;
  }
  if (expected.includes(":: Title ::")) {
    return "Titre mal formé : écrivez « ::Titre:: » avant l'énoncé.";
  }
  if (expected.some((description) => description.includes("{T} or {F}"))) {
    return "Bloc de réponses invalide. Écrivez {T} ou {F}, {=bonne ~mauvaise}, {=réponse attendue} ou {}.";
  }
  if (SPECIAL_CHARACTERS.includes(found)) {
    return `« ${found} » est un caractère spécial en GIFT : pour l'écrire dans un texte, mettez « \\ » devant (\\${found}). Sinon, il manque peut-être un texte ou une accolade juste avant.`;
  }
  return `Syntaxe GIFT invalide : ${describeFound(found)} n'est pas attendu ici.`;
}

// Question du parseur -> question d'examen. `report(severity, message, range)`
// recoit une plage [debut, fin] dans le texte de la question. `isCode` : la
// question a des directives de code.
function toExamQuestion(node, parts, report, isCode) {
  const question = {
    title: (node.title || "").trim(),
    label: (node.stem?.text || "").trim(),
    type: null,
    correct_answer: null,
    choices: [],
  };
  const fail = (message, range) => report(GIFT_SEVERITY.ERROR, message, range);
  const choiceRange = (index, count) => (parts.choices.length === count ? parts.choices[index] : parts.answers);

  if (node.type === "Description") {
    fail("Question sans réponse : ajoutez un bloc { } après l'énoncé, par exemple {T} ou {=bonne ~mauvaise}.", parts.whole);
    return question;
  }
  if (node.type === "Numerical") {
    fail("Les questions numériques ({#...}) ne sont pas prises en charge.", parts.answers);
    return question;
  }
  const labelError = getQuestionLabelError(question.label);
  if (labelError) fail(labelError, parts.stem);

  const noteFeedback = (feedback, range) => {
    if (feedback) report(GIFT_SEVERITY.INFO, "Rétroaction ignorée : elle n'est pas affichée aux étudiants.", range);
  };
  noteFeedback(node.globalFeedback || node.correctFeedback || node.incorrectFeedback, parts.answers);

  if (node.type === "TF") {
    question.type = "true_false";
    question.correct_answer = node.isTrue ? "vrai" : "faux";
    return question;
  }
  if (node.type === "Essay") {
    // {} est reserve aux questions de code : une question texte donne la
    // reponse attendue.
    if (isCode) question.type = "text";
    else fail("Les questions à développement ne sont pas prises en charge : écrivez la réponse attendue entre les accolades, par exemple {=réponse}.", parts.answers);
    return question;
  }

  // Choix multiples (MC) ou reponse texte (Short).
  const choices = (node.choices || []).map((choice, index, all) => {
    const range = choiceRange(index, all.length);
    if (choice.weight !== null && choice.weight !== undefined) {
      report(GIFT_SEVERITY.WARNING, "Pondération ignorée : une question vaut tous ses points ou aucun.", range);
    }
    noteFeedback(choice.feedback, range);
    return { label: (choice.text?.text || "").trim(), isCorrect: Boolean(choice.isCorrect), weight: choice.weight, range };
  });

  let hasError = Boolean(labelError);
  const failChoice = (message, range) => {
    hasError = true;
    fail(message, range);
  };
  choices.forEach((choice) => {
    if (!choice.label) failChoice("Réponse vide : écrivez un texte après le symbole.", choice.range);
  });

  if (node.type === "Short") {
    // La correction d'une reponse texte est manuelle : la reponse attendue
    // sert de reference au correcteur, une seule suffit.
    choices.slice(1).forEach((choice) => {
      report(GIFT_SEVERITY.WARNING, "Seule la première réponse est gardée comme réponse attendue.", choice.range);
    });
    if (!hasError) {
      question.type = "text";
      question.correct_answer = choices[0]?.label || null;
    }
    return question;
  }

  const correctChoices = choices.filter((choice) => choice.isCorrect);
  if (!correctChoices.length) {
    failChoice(
      choices.some((choice) => choice.weight > 0)
        ? "Les réponses multiples pondérées ne sont pas prises en charge : marquez la seule bonne réponse avec « = »."
        : "Marquez la bonne réponse avec « = » (une seule bonne réponse par question).",
      parts.answers
    );
  }
  correctChoices.slice(1).forEach((choice) => {
    failChoice("Une seule bonne réponse (=) par question à choix multiples.", choice.range);
  });
  if (choices.length < 2) failChoice("Ajoutez au moins deux options.", parts.answers);
  choices.forEach((choice) => {
    const optionError = getOptionLabelError(choice.label);
    if (optionError) failChoice(optionError, choice.range);
  });

  question.choices = choices.map((choice) => ({ label: choice.label, is_correct: choice.isCorrect }));
  if (!hasError) {
    question.type = "multiple_choice";
    question.correct_answer = correctChoices[0].label;
  }
  return question;
}

// --- Questions de code -------------------------------------------------
// GIFT n'a pas de question de code. Comme les points, tout ce qui lui est
// propre s'ecrit dans des commentaires, juste avant une question a
// developpement ({}) : le fichier reste lisible par Moodle.
//
//   // points: 5
//   // code: python3
//   // solution:
//   //   def somme(a, b):
//   //       return a + b
//   // test: print(somme(2, 3)) => 5
//   // test:
//   //   total = somme(1, 1)
//   //   print(total)
//   // => 2
//   Écrivez une fonction somme(a, b). {}
//
// Un bloc (solution, test, resultat attendu) continue sur les lignes de
// commentaire qui suivent, jusqu'a la prochaine directive. Plusieurs
// fichiers : « // solution utils.py: » et « // starter utils.py: » (code de
// depart de l'eleve).
//
// Le code peut aussi s'ecrire dans un bloc Markdown, juste apres la
// directive. Les lignes vides y sont permises et le texte est garde tel quel :
//
//   // starter geometrie.py:
//   ```python
//   def aire_rectangle(largeur, hauteur):
//       pass
//
//   def perimetre_rectangle(largeur, hauteur):
//       pass
//   ```
const DIRECTIVE =/^(points?|code|test|solution|starter|type|notation|colonnes|image|zone|[ée]nonc[ée])(?:[ \t]+([^\s:=]+))?[ \t]*[:=][ \t]*(.*)$/i;

// Une directive suit « // » d'au plus une espace ; les lignes de contenu sont
// plus indentees, et ne sont donc jamais prises pour des directives.
function parseDirective(trimmedLine) {
  const body = trimmedLine.slice(2).replace(/^ /, "");
  if (body.startsWith("=>")) return { name: "=>", argument: "", value: body.slice(2).trim() };
  const match = DIRECTIVE.exec(body);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const aliases = { point: "points", "énoncé": "enonce", "énonce": "enonce", "enoncé": "enonce" };
  return { name: aliases[name] || name, argument: match[2] || "", value: match[3].trim() };
}

// Lignes d'un bloc -> texte : sans l'indentation commune ni les lignes vides
// du debut et de la fin.
function blockText(lines) {
  const rows = (lines || []).map((line) => line.trimEnd());
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  const indents = rows.filter((row) => row.trim()).map((row) => row.length - row.trimStart().length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return rows.map((row) => row.slice(indent)).join("\n");
}

// Ouverture et fermeture d'un bloc Markdown : la fermeture reprend le meme
// caractere, au moins aussi long, sans texte apres.
export const FENCE_OPEN = /^(`{3,}|~{3,})/;
export const closesFence = (trimmedLine, marker) =>
  /^(`{3,}|~{3,})$/.test(trimmedLine) && trimmedLine[0] === marker[0] && trimmedLine.length >= marker.length;

const newMeta = () => ({
  points: null, code: null, tests: [], solutions: [], starters: [], type: null, scoring: null, statement: null, columns: null, image: null, zones: [], errors: 0,
});

const isCodeMeta = (meta) => Boolean(
  meta.type?.base === "code" || meta.code || meta.tests.length || meta.solutions.length || meta.starters.length
);

// Directives d'une question de code -> champs de la question.
// `fail(message, lineIndex)` et `warn(message, lineIndex)` signalent un
// probleme sur la ligne de la directive.
function toCodeFields(meta, prototypes, fail, warn) {
  const fields = { prototype: (meta.code?.name || DEFAULT_PROTOTYPE_NAME).toLowerCase(), tests: [], files: null, correct_answer: null };

  const prototype = prototypes?.find((candidate) => candidate.name === fields.prototype);
  if (prototypes?.length && !prototype) {
    fail(
      `Langage « ${meta.code.name} » inconnu. Langages offerts : ${prototypes.map((candidate) => candidate.name).join(", ")}.`,
      meta.code.lineIndex
    );
  }

  meta.tests.forEach((test) => {
    const code = blockText(test.code);
    if (!code) fail("Test vide : écrivez « // test: code => résultat attendu ».", test.lineIndex);
    else if (test.expected === null) fail("Résultat attendu manquant : terminez le test par « => résultat ».", test.lineIndex);
    else fields.tests.push({ code, expected: blockText(test.expected) });
  });
  if (prototype && prototype.runnable === false && meta.tests.length) {
    warn(`Le langage « ${prototype.name} » n'est pas exécuté automatiquement : ces tests ne seront pas utilisés.`, meta.tests[0].lineIndex);
  }

  const named = [...meta.solutions, ...meta.starters].filter((entry) => entry.name);
  const unnamedSolutions = meta.solutions.filter((entry) => !entry.name);
  if (!named.length) {
    unnamedSolutions.slice(1).forEach((entry) => fail("Une seule « // solution: » par question.", entry.lineIndex));
    fields.correct_answer = blockText(unnamedSolutions[0]?.lines) || null;
    return fields;
  }

  // Plusieurs fichiers : chaque solution et chaque code de depart nomme le sien.
  unnamedSolutions.forEach((entry) => {
    fail("Cette question a des fichiers : nommez celui de cette solution, par exemple « // solution main.py: ».", entry.lineIndex);
  });
  const files = new Map();
  const collect = (entries, field) => entries.filter((entry) => entry.name).forEach((entry) => {
    const key = entry.name.toLowerCase();
    if (!files.has(key)) files.set(key, { name: entry.name, solution: null, starter: null, lineIndex: entry.lineIndex });
    const file = files.get(key);
    if (file[field] !== null) fail(`Le fichier « ${entry.name} » a déjà ${field === "solution" ? "une solution" : "un code de départ"}.`, entry.lineIndex);
    else file[field] = blockText(entry.lines);
  });
  collect(meta.solutions, "solution");
  collect(meta.starters, "starter");

  const list = [...files.values()];
  const filesError = getQuestionFilesError(list);
  if (filesError) fail(filesError, list[0].lineIndex);
  fields.files = list.map((file) => ({ name: file.name, starter: file.starter || "" }));
  fields.correct_answer = buildFileAnswers(list);
  return fields;
}

// --- Texte a trous et grille (#156) -----------------------------------
// GIFT n'a ni l'un ni l'autre. Le texte a trous a sa propre syntaxe :
//
//   // points: 3
//   Le protocole {:MC: =TCP ~UDP ~IP} est orienté connexion. La boucle
//   locale est {:SA: 127.0.0.1 | localhost}.
//
// Chaque bloc { } est un trou : {:SA: reponse} une reponse courte (corrigee
// sans tenir compte de la casse ; « | » separe les reponses acceptees),
// {:MC: =bonne ~mauvaise} un menu deroulant. Une question qui contient un tel
// bloc est un texte a trous : « // type: cloze » est facultatif.
//
// Pour la grille et le glisser-deposer, une directive annonce le type :
//
//   // type: grille            (une colonne par ligne : boutons radio)
//   // type: grille-multiple   (plusieurs colonnes par ligne : cases a cocher)
//   // colonnes: Physique | Liaison | Réseau | Transport
//   À quelle couche appartient chaque élément ? {
//     =Routeur -> Réseau
//     =TCP -> Transport
//   }
//
// La grille reprend la syntaxe d'association de GIFT (->) : une question
// d'association sans « // type: » est donc une grille a une colonne par
// ligne. En grille-multiple, une ligne repetee ajoute une bonne colonne. Sans
// « // colonnes: », les colonnes sont celles des reponses, dans l'ordre ;
// « = -> Liaison » ajoute une colonne qu'aucune ligne n'utilise.
//
// « // notation: tout-ou-rien » : tous les trous (ou toutes les lignes)
// doivent etre justes. Par defaut, « partielle » : les points sont repartis.
//
// « // énoncé: Complétez avec les protocoles du cours 3. » (texte a trous
// et glisser-deposer sur texte) : l'enonce de la question, separe du texte a
// trous comme pour les autres types. Sans cette ligne, un enonce par defaut.
const PART_TYPE_DIRECTIVES = {
  cloze: { type: QUESTION_PART_TYPES.CLOZE, multiple: false },
  grille: { type: QUESTION_PART_TYPES.GRID, multiple: false },
  "grille-multiple": { type: QUESTION_PART_TYPES.GRID, multiple: true },
  "glisser-texte": { type: QUESTION_PART_TYPES.DRAG_TEXT, multiple: false },
  "glisser-image": { type: QUESTION_PART_TYPES.DRAG_IMAGE, multiple: false },
};
// Les autres types s'annoncent aussi, pour que chaque question ait son type
// (facultatif : sans « // type: », le type se deduit des reponses). Le type
// annonce doit correspondre aux reponses.
const BASE_TYPE_DIRECTIVES = {
  "choix-multiples": "multiple_choice",
  "vrai-faux": "true_false",
  texte: "text",
  code: "code",
};
const TYPE_ALIASES = { qcm: "choix-multiples", vf: "vrai-faux" };
export const GIFT_TYPE_NAMES = [...Object.keys(BASE_TYPE_DIRECTIVES), ...Object.keys(PART_TYPE_DIRECTIVES)];
// Type d'une question analysee -> valeur de « // type: ».
const TYPE_DIRECTIVE_NAMES = {
  ...Object.fromEntries(Object.entries(BASE_TYPE_DIRECTIVES).map(([name, type]) => [type, name])),
  [QUESTION_PART_TYPES.CLOZE]: "cloze",
  [QUESTION_PART_TYPES.GRID]: "grille",
  [QUESTION_PART_TYPES.DRAG_TEXT]: "glisser-texte",
  [QUESTION_PART_TYPES.DRAG_IMAGE]: "glisser-image",
};
const SCORING_DIRECTIVES = { partielle: SCORING.PARTIAL, "tout-ou-rien": SCORING.ALL_OR_NOTHING };
const DEFAULT_STATEMENTS = {
  [QUESTION_PART_TYPES.CLOZE]: "Complétez le texte.",
  [QUESTION_PART_TYPES.DRAG_TEXT]: "Glissez les étiquettes dans le texte.",
};

// « Physique | Liaison » -> colonnes. « \| » ecrit une barre dans un nom.
function splitColumns(value) {
  const columns = [""];
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "\\" && value[index + 1] === "|") {
      columns[columns.length - 1] += "|";
      index++;
    } else if (value[index] === "|") {
      columns.push("");
    } else {
      columns[columns.length - 1] += value[index];
    }
  }
  return columns.map((column) => column.trim());
}

// Texte d'un texte a trous -> texte affiche : les lignes sont jointes (comme
// l'enonce d'une question GIFT) et les « \ » d'echappement retires.
const unescapeClozeText = (text) =>
  text
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\\(n|.)/g, (match, character) => (character === "n" ? "\n" : character));

// Debut d'un trou : « {:SA: » ou « {:MC: » (casse indifferente).
const CLOZE_BLANK = /^\{\s*:(SA|MC):/i;
const CLOZE_SYNTAX = "écrivez {:SA: réponse} pour une réponse courte, ou {:MC: =bonne ~mauvaise} pour un menu déroulant";

// Vrai si le texte contient un trou {:SA: } ou {:MC: }.
function hasClozeBlanks(text) {
  for (let open = findUnescaped(text, "{"); open !== -1; open = findUnescaped(text, "{", open + 1)) {
    if (CLOZE_BLANK.test(text.slice(open))) return true;
  }
  return false;
}

// Un bloc { } d'un texte a trous -> trou ({ kind, options | answers }), ou
// null s'il est invalide. [open, close] : position des accolades dans `text`.
function toClozeBlank(text, open, close, index, fail) {
  const what = `Trou ${index + 1}`;
  const blockRange = [open, close + 1];
  const kind = CLOZE_BLANK.exec(text.slice(open, close + 1));
  if (!kind) {
    fail(`${what} : ${CLOZE_SYNTAX}.`, blockRange);
    return null;
  }
  // Recherches limitees au contenu du bloc.
  const content = text.slice(0, close);
  const from = open + kind[0].length;
  const item = (start, end, mark = "") => ({
    mark,
    raw: text.slice(start, end).trim(),
    label: unescapeClozeText(text.slice(start, end)).trim(),
    range: [mark ? start - 1 : start, start + Math.max(text.slice(start, end).trimEnd().length, 1)],
  });

  const shortAnswer = kind[1].toUpperCase() === "SA";
  const items = [];
  if (shortAnswer) {
    for (let start = from; ; ) {
      const bar = findUnescaped(content, "|", start);
      items.push(item(start, bar === -1 ? close : bar));
      if (bar === -1) break;
      start = bar + 1;
    }
  } else {
    let start = findUnescaped(content, "=~", from);
    if (text.slice(from, start === -1 ? close : start).trim()) {
      fail(`${what} : écrivez « = » devant la bonne option et « ~ » devant les autres, par exemple {:MC: =TCP ~UDP}.`, blockRange);
      return null;
    }
    while (start !== -1) {
      const next = findUnescaped(content, "=~", start + 1);
      items.push(item(start + 1, next === -1 ? close : next, text[start]));
      start = next;
    }
  }

  let valid = true;
  items.forEach(({ raw, label, range }) => {
    if (!label) {
      valid = false;
      fail(`${what} : réponse vide, écrivez un texte.`, range);
    } else if (shortAnswer && /^[=~]/.test(raw)) {
      // Habitude de GIFT ou de Moodle ({:SA:=Physique}) : « \= » pour l'ecrire.
      valid = false;
      fail(`${what} : pas de « = » ni de « ~ » dans une réponse courte, écrivez {:SA: réponse} (« | » sépare les réponses acceptées).`, range);
    }
  });
  if (!valid) return null;

  if (shortAnswer) return { kind: "text", answers: items.map((answer) => answer.label) };

  const correct = items.filter((option) => option.mark === "=");
  if (correct.length !== 1) {
    fail(`${what} : marquez la seule bonne option avec « = ».`, correct[1]?.range || blockRange);
    return null;
  }
  return { kind: "choice", options: items.map((option) => ({ label: option.label, is_correct: option.mark === "=" })) };
}

// Texte a trous : chaque bloc { } de la question est un trou. Ce n'est pas
// du GIFT : le texte est decoupe et chaque bloc analyse ici.
// statement : l'enonce (« // énoncé: »), deja valide.
function toClozeQuestion(text, report, scoring, statement) {
  const question = {
    title: "", label: statement || DEFAULT_STATEMENTS[QUESTION_PART_TYPES.CLOZE], type: null, correct_answer: null, choices: [], details: null,
  };
  let clozeText = "";
  let errors = 0;
  const fail = (message, range) => {
    errors++;
    report(GIFT_SEVERITY.ERROR, message, range);
  };
  const leading = text.length - text.trimStart().length;
  const whole = [leading, text.trimEnd().length];

  let position = leading;
  if (text.startsWith("::", leading)) {
    const end = text.indexOf("::", leading + 2);
    if (end === -1) {
      fail("Titre mal formé : écrivez « ::Titre:: » avant l'énoncé.", whole);
      return question;
    }
    question.title = unescapeClozeText(text.slice(leading + 2, end)).trim();
    position = end + 2;
  }

  // Texte entre les trous : une accolade fermante seule est une erreur.
  const addText = (from, to) => {
    const stray = findUnescaped(text.slice(0, to), "}", from);
    if (stray !== -1) fail("« } » sans « { » : pour l'écrire dans le texte, mettez « \\ » devant (\\}).", [stray, stray + 1]);
    clozeText += unescapeClozeText(text.slice(from, to));
  };

  const blanks = [];
  for (let open = findUnescaped(text, "{", position); open !== -1; open = findUnescaped(text, "{", position)) {
    const close = findUnescaped(text, "}", open + 1);
    if (close === -1) {
      fail("Accolade « { » jamais fermée : ajoutez « } » à la fin du trou.", [open, whole[1]]);
      return question;
    }
    addText(position, open);
    clozeText += blankMarker(blanks.length);
    blanks.push(toClozeBlank(text, open, close, blanks.length, fail));
    position = close + 1;
  }
  addText(position, text.length);

  if (!blanks.length) {
    fail("Texte à trous sans trou : écrivez chaque trou entre accolades, par exemple {:SA: Physique} ou {:MC: =TCP ~UDP}.", whole);
    return question;
  }
  if (errors) return question;

  const validation = validateQuestionDetails(QUESTION_PART_TYPES.CLOZE, { scoring, text: clozeText, blanks });
  if (validation.error) {
    fail(validation.error, whole);
    return question;
  }
  question.type = QUESTION_PART_TYPES.CLOZE;
  question.details = validation.details;
  return question;
}

// Grille : la question d'association de GIFT, une paire « ligne -> colonne »
// par bonne reponse.
function toGridQuestion(node, parts, report, { multiple = false, columns: declared = null, scoring } = {}) {
  const question = {
    title: (node.title || "").trim(),
    label: (node.stem?.text || "").trim(),
    type: null,
    correct_answer: null,
    choices: [],
    details: null,
  };
  let errors = 0;
  const fail = (message, range) => {
    errors++;
    report(GIFT_SEVERITY.ERROR, message, range);
  };
  if (node.type !== "Matching") {
    fail("Une grille s'écrit avec une ligne « =Élément -> Colonne » par bonne réponse, entre les accolades.", parts.answers);
    return question;
  }
  const labelError = getQuestionLabelError(question.label);
  if (labelError) fail(labelError, parts.stem);
  if (node.globalFeedback) report(GIFT_SEVERITY.INFO, "Rétroaction ignorée : elle n'est pas affichée aux étudiants.", parts.answers);

  const columns = declared ? [...declared] : [];
  const rows = [];
  const pairs = node.matchPairs || [];
  pairs.forEach((pair, index) => {
    const range = parts.choices.length === pairs.length ? parts.choices[index] : parts.answers;
    const rowLabel = (pair.subquestion?.text || "").trim();
    const columnName = (pair.subanswer || "").trim();
    let column = columns.findIndex((candidate) => normalizeAnswer(candidate) === normalizeAnswer(columnName));
    if (column === -1) {
      if (declared) {
        fail(`« ${columnName} » n'est pas une colonne de « // colonnes: ».`, range);
        return;
      }
      columns.push(columnName);
      column = columns.length - 1;
    }
    // « = -> Colonne » : une colonne qu'aucune ligne n'utilise.
    if (!rowLabel) return;
    const row = rows.find((candidate) => normalizeAnswer(candidate.label) === normalizeAnswer(rowLabel));
    if (!row) rows.push({ label: rowLabel, answers: [column] });
    else if (multiple) row.answers.push(column);
    else fail(`« ${rowLabel} » a déjà sa colonne. Pour permettre plusieurs réponses par ligne, écrivez « // type: grille-multiple ».`, range);
  });
  if (errors) return question;

  const validation = validateQuestionDetails(QUESTION_PART_TYPES.GRID, { scoring, multiple, columns, rows });
  if (validation.error) {
    fail(validation.error, parts.answers);
    return question;
  }
  question.type = QUESTION_PART_TYPES.GRID;
  question.details = validation.details;
  return question;
}

// --- Glisser-deposer (#156) ----------------------------------------------
//
//   // type: glisser-texte
//   Le modèle OSI compte [[7]] couches ; TCP est dans la couche [[Transport]]. {~Réseau ~5}
//
// Chaque [[...]] est un trou, avec l'etiquette attendue. Le bloc { } final,
// facultatif, donne les intrus (~) : des etiquettes qui ne vont nulle part.
//
//   // type: glisser-image
//   // image: 3f9a1c2b7d4e5f60-reseau.png
//   // zone: 25, 40 => Routeur
//   // zone: 70, 40 => Modem
//   Placez les équipements sur le schéma. {~Commutateur}
//
// « // image: » : la cle d'une image televersee (bouton « Glisser sur image »
// de l'editeur). « // zone: x, y => etiquette » : le centre de la zone, en %
// de la largeur et de la hauteur de l'image (l'apercu donne la position d'un
// clic sur l'image).
const ZONE_DIRECTIVE = /^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*=>\s*(.+)$/;

// « ::Titre:: » au debut du texte -> { title, start } (start : debut de
// l'enonce), ou null si le titre n'est pas ferme.
function readTitle(text) {
  const leading = text.length - text.trimStart().length;
  if (!text.startsWith("::", leading)) return { title: "", start: leading };
  const end = text.indexOf("::", leading + 2);
  if (end === -1) return null;
  return { title: unescapeClozeText(text.slice(leading + 2, end)).trim(), start: end + 2 };
}

// Enonce d'un glisser-deposer : le texte, puis le bloc { } des intrus a la
// fin (facultatif). Retourne { title, body: [debut, fin], distractors }.
// `fail(message, range)` signale une erreur.
function readDragText(text, fail) {
  const whole = [text.length - text.trimStart().length, text.trimEnd().length];
  const titled = readTitle(text);
  if (!titled) {
    fail("Titre mal formé : écrivez « ::Titre:: » avant l'énoncé.", whole);
    return null;
  }
  const open = findUnescaped(text, "{", titled.start);
  if (open === -1) {
    const stray = findUnescaped(text, "}", titled.start);
    if (stray !== -1) fail("« } » sans « { » : pour l'écrire dans le texte, mettez « \\ » devant (\\}).", [stray, stray + 1]);
    return { title: titled.title, body: [titled.start, whole[1]], distractors: [] };
  }
  const close = findUnescaped(text, "}", open + 1);
  if (close === -1) {
    fail("Accolade « { » jamais fermée : ajoutez « } » après les intrus.", [open, whole[1]]);
    return null;
  }
  if (text.slice(close + 1).trim()) {
    fail("Le bloc { } des intrus se place à la fin de la question.", [open, close + 1]);
    return null;
  }

  // Intrus : « ~etiquette », separes par des ~ non echappes.
  const content = text.slice(open + 1, close);
  const distractors = [];
  let start = findUnescaped(content, "~=");
  if ((start === -1 ? content : content.slice(0, start)).trim()) {
    fail("Intrus : écrivez « ~ » devant chaque étiquette, par exemple {~Réseau ~5}.", [open, close + 1]);
    return null;
  }
  while (start !== -1) {
    const next = findUnescaped(content, "~=", start + 1);
    const item = unescapeClozeText(content.slice(start + 1, next === -1 ? content.length : next)).trim();
    const range = [open + 1 + start, open + 1 + (next === -1 ? content.length : next)];
    if (content[start] === "=") {
      fail("Les bonnes réponses s'écrivent dans le texte (texte : [[réponse]], image : « // zone: »). Le bloc { } ne contient que les intrus (~).", range);
      return null;
    }
    if (item) distractors.push(item);
    start = next;
  }
  return { title: titled.title, body: [titled.start, open], distractors };
}

function toDragTextQuestion(text, report, scoring, statement) {
  const question = {
    title: "", label: statement || DEFAULT_STATEMENTS[QUESTION_PART_TYPES.DRAG_TEXT], type: null, correct_answer: null, choices: [], details: null,
  };
  let dragText = "";
  let errors = 0;
  const fail = (message, range) => {
    errors++;
    report(GIFT_SEVERITY.ERROR, message, range);
  };
  const parsed = readDragText(text, fail);
  if (!parsed) return question;
  question.title = parsed.title;

  // [[etiquette]] -> repere [[n]] ; l'etiquette est la bonne reponse.
  const [from, to] = parsed.body;
  const blanks = [];
  let position = from;
  for (const match of text.slice(from, to).matchAll(/\[\[(.*?)\]\]/g)) {
    const start = from + match.index;
    const answer = unescapeClozeText(match[1]).trim();
    if (!answer) fail(`Trou ${blanks.length + 1} : écrivez l'étiquette attendue, par exemple [[Transport]].`, [start, start + match[0].length]);
    dragText += unescapeClozeText(text.slice(position, start)) + blankMarker(blanks.length);
    blanks.push(answer);
    position = start + match[0].length;
  }
  dragText += unescapeClozeText(text.slice(position, to));

  if (!blanks.length) {
    fail("Aucun trou : écrivez l'étiquette attendue entre doubles crochets dans le texte, par exemple [[Transport]].", [from, to]);
    return question;
  }
  if (errors) return question;

  const validation = validateQuestionDetails(QUESTION_PART_TYPES.DRAG_TEXT, { scoring, text: dragText, blanks, distractors: parsed.distractors });
  if (validation.error) {
    fail(validation.error, [from, text.trimEnd().length]);
    return question;
  }
  question.type = QUESTION_PART_TYPES.DRAG_TEXT;
  question.details = validation.details;
  return question;
}

// `failLine(message, lineIndex)` : erreur sur une ligne de directive.
function toDragImageQuestion(text, report, meta, failLine) {
  const question = { title: "", label: "", type: null, correct_answer: null, choices: [], details: null };
  let errors = 0;
  const fail = (message, range) => {
    errors++;
    report(GIFT_SEVERITY.ERROR, message, range);
  };
  const parsed = readDragText(text, fail);
  if (!parsed) return question;
  question.title = parsed.title;
  const [from, to] = parsed.body;
  question.label = unescapeClozeText(text.slice(from, to)).trim();
  const labelError = getQuestionLabelError(question.label);
  if (labelError) fail(labelError, [from, Math.max(to, from + 1)]);

  if (!meta.image) {
    errors++;
    failLine("Ajoutez l'image : « // image: » (bouton « Glisser sur image »).", meta.type.lineIndex);
  }
  if (!meta.zones.length) {
    errors++;
    failLine("Ajoutez au moins une zone : « // zone: 25, 40 => Étiquette ».", meta.type.lineIndex);
  }
  if (errors) return question;

  const validation = validateQuestionDetails(QUESTION_PART_TYPES.DRAG_IMAGE, {
    scoring: meta.scoring?.value,
    image: meta.image.value,
    zones: meta.zones.map(({ x, y, answer }) => ({ x, y, answer })),
    distractors: parsed.distractors,
  });
  if (validation.error) {
    fail(validation.error, [from, text.trimEnd().length]);
    return question;
  }
  question.type = QUESTION_PART_TYPES.DRAG_IMAGE;
  question.details = validation.details;
  return question;
}

// Analyse un document GIFT.
// options.prototypes : prototypes des questions de code ([{ id, name,
//   runnable }], voir GET /code/prototypes), pour verifier le langage.
// Retourne { questions, diagnostics, errorCount } :
//   questions   : une entree par question, dans l'ordre. `valid` = false si
//                 elle contient une erreur (elle n'est alors pas enregistrable).
//   diagnostics : { severity, message, startLine, startColumn, endLine,
//                 endColumn } (lignes et colonnes a partir de 1, comme Monaco).
export function parseGift(source, { prototypes = null } = {}) {
  const lines = (source || "").replace(/\r\n?/g, "\n").split("\n");
  const diagnostics = [];
  const questions = [];

  const addDiagnostic = (severity, message, startLine, startColumn, endLine, endColumn) => {
    diagnostics.push({ severity, message, startLine, startColumn, endLine, endColumn });
  };
  const addLineDiagnostic = (severity, message, lineIndex) => {
    const line = lines[lineIndex];
    const startColumn = line.length - line.trimStart().length + 1;
    addDiagnostic(severity, message, lineIndex + 1, startColumn, lineIndex + 1, Math.max(line.trimEnd().length + 1, startColumn + 1));
  };

  // Un bloc = une question : des lignes qui se suivent, sans ligne vide. Les
  // commentaires en sont retires (lineIndexes garde la ligne d'origine de
  // chaque ligne conservee). Le parseur recoit un bloc a la fois : une
  // question cassee n'empeche donc pas d'analyser les suivantes.
  let block = null;
  // Directives lues avant la question a laquelle elles s'appliquent.
  let pending = newMeta();
  // Bloc en cours (solution, test...) : les commentaires suivants s'y ajoutent.
  let continuation = null;
  // Bloc Markdown ouvert apres une directive : ses lignes vont a la
  // continuation, telles quelles.
  let fence = null;

  const flush = () => {
    if (!block) return;
    const { lineIndexes, meta } = block;
    block = null;
    const original = lineIndexes.map((lineIndex) => lines[lineIndex]);
    const text = original.join("\n");
    const parts = locateParts(text);

    // Position dans le texte du bloc -> ligne et colonne du document.
    const toPosition = (offset) => {
      const before = text.slice(0, Math.max(0, Math.min(offset, text.length))).split("\n");
      return { line: lineIndexes[before.length - 1] + 1, column: before[before.length - 1].length + 1 };
    };
    let errors = meta.errors;
    const report = (severity, message, [start, end]) => {
      if (severity === GIFT_SEVERITY.ERROR) errors++;
      const from = toPosition(start);
      const to = toPosition(Math.max(end, start + 1));
      addDiagnostic(severity, message, from.line, from.column, to.line, to.column);
    };
    const addQuestion = (question) => {
      // « // type: » annonce un type, les reponses en donnent un autre.
      const declared = meta.type && (meta.type.base || meta.type.type);
      if (declared && question.type && question.type !== declared) {
        errors++;
        addLineDiagnostic(
          GIFT_SEVERITY.ERROR,
          `Les réponses sont celles d'une question « ${TYPE_DIRECTIVE_NAMES[question.type] || question.type} », pas « ${meta.type.name} » : corrigez « // type: » ou les réponses.`,
          meta.type.lineIndex
        );
      }
      questions.push({
        ...question,
        points: meta.points?.value ?? GIFT_DEFAULT_POINTS,
        line: lineIndexes[0] + 1,
        valid: errors === 0 && question.type !== null,
      });
    };

    // Directives sans effet sur ce type de question : on le dit. Un trou
    // {:SA: } ou {:MC: } suffit a faire un texte a trous.
    const partType = meta.type?.type || (!isCodeMeta(meta) && hasClozeBlanks(text) ? QUESTION_PART_TYPES.CLOZE : null);
    const ignore = (entry, message) => {
      if (entry) addLineDiagnostic(GIFT_SEVERITY.WARNING, message, entry.lineIndex);
    };
    if (meta.type?.type && isCodeMeta(meta)) {
      errors++;
      addLineDiagnostic(GIFT_SEVERITY.ERROR, "Les directives de code (« // code: », « // test: »…) servent seulement à « // type: code ».", meta.type.lineIndex);
    }
    if (partType !== QUESTION_PART_TYPES.GRID) {
      ignore(meta.columns, "Colonnes ignorées : « // colonnes: » sert seulement aux grilles (« // type: grille »).");
    }
    if (partType !== QUESTION_PART_TYPES.DRAG_IMAGE) {
      ignore(meta.image || meta.zones[0], "Image et zones ignorées : elles servent seulement à « // type: glisser-image ».");
    }
    if (!hasBlankMarkers(partType)) {
      ignore(meta.statement, "Énoncé ignoré : « // énoncé: » sert seulement aux textes à trous et au glisser-déposer sur texte (ailleurs, l'énoncé est le texte de la question).");
    }
    if (partType === QUESTION_PART_TYPES.CLOZE) {
      addQuestion(toClozeQuestion(text, report, meta.scoring?.value, meta.statement?.value));
      return;
    }
    if (partType === QUESTION_PART_TYPES.DRAG_TEXT) {
      addQuestion(toDragTextQuestion(text, report, meta.scoring?.value, meta.statement?.value));
      return;
    }
    if (partType === QUESTION_PART_TYPES.DRAG_IMAGE) {
      addQuestion(toDragImageQuestion(text, report, meta, (message, lineIndex) => {
        errors++;
        addLineDiagnostic(GIFT_SEVERITY.ERROR, message, lineIndex);
      }));
      return;
    }

    const escaped = escapeLoneColons(text);
    const sections = giftSyntaxParser.parse(escaped.text);
    const syntaxErrors = sections.flatMap((section) => section.result[1] || []);
    const nodes = sections.flatMap((section) => section.result[0] || []);

    if (syntaxErrors.length) {
      // Une erreur de syntaxe en entraine d'autres en cascade : seule la
      // premiere est utile.
      const [error] = syntaxErrors;
      const message = translateSyntaxError(error);
      const unclosed = (error.found === null || error.found === undefined) && parts.open !== -1;
      if (unclosed) {
        report(GIFT_SEVERITY.ERROR, message, [parts.open, parts.whole[1]]);
      } else {
        // Ligne et colonne plutot que `offset`, qui n'est pas fiable.
        const { line, column } = error.location.start;
        const escapedOffset = escaped.text.split("\n").slice(0, line - 1).reduce((total, row) => total + row.length + 1, 0) + column - 1;
        const added = escaped.inserted.filter((position) => position < escapedOffset).length;
        const start = Math.max(0, Math.min(escapedOffset - added, text.length - 1));
        report(GIFT_SEVERITY.ERROR, message, [start, start + 1]);
      }
      const stemEnd = parts.open === -1 ? text.length : parts.open;
      addQuestion({ title: "", label: text.slice(0, stemEnd).replace(/\s+/g, " ").trim(), type: null, correct_answer: null, choices: [] });
      return;
    }

    nodes.forEach((node) => {
      if (partType === QUESTION_PART_TYPES.GRID || (node.type === "Matching" && !isCodeMeta(meta))) {
        addQuestion(toGridQuestion(node, parts, report, {
          multiple: meta.type?.multiple,
          columns: meta.columns?.values,
          scoring: meta.scoring?.value,
        }));
        return;
      }
      ignore(meta.scoring, "Notation ignorée : elle sert seulement aux textes à trous et aux grilles.");
      const question = toExamQuestion(node, parts, report, isCodeMeta(meta));
      if (!isCodeMeta(meta)) {
        addQuestion(question);
        return;
      }
      const onLine = (severity) => (message, lineIndex) => {
        if (severity === GIFT_SEVERITY.ERROR) errors++;
        addLineDiagnostic(severity, message, lineIndex);
      };
      const codeFields = toCodeFields(meta, prototypes, onLine(GIFT_SEVERITY.ERROR), onLine(GIFT_SEVERITY.WARNING));
      if (node.type !== "Essay") {
        report(
          GIFT_SEVERITY.ERROR,
          "Une question de code se termine par {} : la solution et les tests s'écrivent dans les commentaires « // solution: » et « // test: ».",
          parts.answers
        );
        addQuestion({ ...question, type: null });
        return;
      }
      addQuestion({ ...question, ...codeFields, type: question.type === null ? null : "code" });
    });
  };

  // Une directive s'applique a la question en cours, sinon a la suivante.
  const handleDirective = (directive, index) => {
    const meta = block ? block.meta : pending;
    const fail = (message) => {
      meta.errors++;
      addLineDiagnostic(GIFT_SEVERITY.ERROR, message, index);
    };
    continuation = null;

    if (directive.name === "points") {
      const value = Number(directive.value.replace(",", "."));
      if (!Number.isInteger(value) || value <= 0) fail("Les points doivent être un entier positif, par exemple « // points: 2 ».");
      else if (!block || !meta.points) meta.points = { value, lineIndex: index };
    } else if (directive.name === "code") {
      if (!directive.value) fail("Indiquez le langage, par exemple « // code: python3 ».");
      else meta.code = { name: directive.value, lineIndex: index };
    } else if (directive.name === "solution" || directive.name === "starter") {
      if (directive.name === "starter" && !directive.argument) {
        fail("Indiquez le fichier du code de départ, par exemple « // starter main.py: ».");
        return;
      }
      const entry = { name: directive.argument, lines: directive.value ? [directive.value] : [], lineIndex: index };
      meta[directive.name === "solution" ? "solutions" : "starters"].push(entry);
      continuation = entry.lines;
    } else if (directive.name === "test") {
      const test = { code: [], expected: null, lineIndex: index };
      meta.tests.push(test);
      // Sur une ligne : « code => resultat ». Le dernier « => » separe les
      // deux (le code peut contenir une fonction flechee).
      const arrow = directive.value.lastIndexOf("=>");
      if (arrow !== -1) {
        test.code.push(directive.value.slice(0, arrow));
        test.expected = [directive.value.slice(arrow + 2)];
      } else {
        if (directive.value) test.code.push(directive.value);
        continuation = test.code;
      }
    } else if (directive.name === "type") {
      const value = directive.value.toLowerCase();
      const name = TYPE_ALIASES[value] || value;
      if (PART_TYPE_DIRECTIVES[name]) meta.type = { ...PART_TYPE_DIRECTIVES[name], name, lineIndex: index };
      else if (BASE_TYPE_DIRECTIVES[name]) meta.type = { type: null, base: BASE_TYPE_DIRECTIVES[name], name, lineIndex: index };
      else fail(`Type « ${directive.value} » inconnu. Types offerts : ${GIFT_TYPE_NAMES.join(", ")}.`);
    } else if (directive.name === "notation") {
      const scoring = SCORING_DIRECTIVES[directive.value.toLowerCase().replace(/\s+/g, "-")];
      if (!scoring) fail("Notation inconnue : écrivez « // notation: partielle » ou « // notation: tout-ou-rien ».");
      else meta.scoring = { value: scoring, lineIndex: index };
    } else if (directive.name === "colonnes") {
      const values = splitColumns(directive.value);
      if (values.some((value) => !value)) fail("Colonne vide : séparez les noms par « | », par exemple « // colonnes: Physique | Réseau ».");
      else meta.columns = { values, lineIndex: index };
    } else if (directive.name === "enonce") {
      const labelError = getQuestionLabelError(directive.value);
      if (labelError) fail(`${labelError} Écrivez-le après « // énoncé: ».`);
      else meta.statement = { value: directive.value, lineIndex: index };
    } else if (directive.name === "image") {
      if (!IMAGE_KEY_PATTERN.test(directive.value)) {
        fail("Image inconnue : utilisez le bouton « Glisser sur image » pour téléverser l'image, qui écrit cette ligne.");
      } else {
        meta.image = { value: directive.value, lineIndex: index };
      }
    } else if (directive.name === "zone") {
      const match = ZONE_DIRECTIVE.exec(directive.value);
      const [x, y] = match ? [Number(match[1]), Number(match[2])] : [];
      if (!match || x > 100 || y > 100) {
        fail("Zone : écrivez « // zone: x, y => Étiquette », x et y en % de l'image (0 à 100). Cliquez sur l'image de l'aperçu pour connaître une position.");
      } else {
        meta.zones.push({ x, y, answer: match[3].trim(), lineIndex: index });
      }
    } else if (directive.name === "=>") {
      const test = meta.tests[meta.tests.length - 1];
      if (!test || test.expected !== null) {
        fail("« // => » doit suivre un « // test: » sans résultat attendu.");
        return;
      }
      test.expected = directive.value ? [directive.value] : [];
      continuation = test.expected;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (fence) {
      if (closesFence(trimmed, fence.marker)) fence = null;
      else fence.lines.push(line);
      return;
    }
    const opening = continuation && FENCE_OPEN.exec(trimmed);
    if (opening) {
      fence = { marker: opening[1], lines: continuation, meta: block ? block.meta : pending, lineIndex: index };
      continuation = null;
      return;
    }
    if (!trimmed) {
      flush();
      continuation = null;
      return;
    }
    if (trimmed.startsWith("//")) {
      const directive = parseDirective(trimmed);
      if (directive) handleDirective(directive, index);
      else if (continuation) continuation.push(trimmed.slice(2));
      return;
    }
    continuation = null;
    if (/^\$CATEGORY\s*:/i.test(trimmed)) {
      flush();
      addLineDiagnostic(GIFT_SEVERITY.INFO, "Catégorie ignorée : les examens n'ont pas de catégories.", index);
      return;
    }
    if (!block) {
      block = { lineIndexes: [], meta: pending };
      pending = newMeta();
    }
    block.lineIndexes.push(index);
  });
  if (fence) {
    // Tout le reste du document a ete pris pour du code.
    fence.meta.errors++;
    addLineDiagnostic(GIFT_SEVERITY.ERROR, `Bloc de code jamais fermé : ajoutez une ligne « ${fence.marker} » après le code.`, fence.lineIndex);
  }
  flush();

  // Directives en fin de document, sans question apres elles.
  const orphans = [
    pending.points, pending.code, pending.type, pending.scoring, pending.columns, pending.image, ...pending.zones,
    ...pending.tests, ...pending.solutions, ...pending.starters,
  ].filter(Boolean);
  if (orphans.length && !fence) {
    addLineDiagnostic(GIFT_SEVERITY.WARNING, "Cette ligne n'est suivie d'aucune question.", orphans[0].lineIndex);
  }

  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === GIFT_SEVERITY.ERROR).length;
  return { questions, diagnostics, errorCount };
}

// Question analysee -> corps attendu par PUT /exams/:id/questions.
export function toQuestionPayload(question, prototypes = null) {
  const payload = {
    label: question.label,
    type: question.type,
    points: question.points,
    correct_answer: question.correct_answer,
  };
  if (question.type === "multiple_choice") {
    payload.choices = question.choices.map((choice) => ({ label: choice.label, is_correct: choice.is_correct }));
  }
  if (isPartQuestionType(question.type)) payload.details = question.details;
  if (question.type === "code") {
    payload.tests = question.tests;
    payload.files = question.files;
    // null = prototype par defaut du serveur.
    payload.prototype_id = prototypes?.find((candidate) => candidate.name === question.prototype)?.id ?? null;
  }
  return payload;
}
