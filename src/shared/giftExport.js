// Export GIFT : questions d'un examen -> texte GIFT.
//
// Separe de giftParser.js (qui le re-exporte) parce que ce fichier n'a AUCUNE
// dependance npm : le backend l'importe aussi pour archiver les examens d'une
// session au format GIFT (#177, backend/utils/sessionArchive.js). Il ne doit
// donc importer que des modules purs (questionParts.js, questionFiles.js).
import { parseFileAnswers } from "./questionFiles.js";
import {
  BLANK_MARKER,
  QUESTION_PART_TYPES,
  SCORING,
  hasBlankMarkers,
  isDragQuestionType,
  isPartQuestionType,
} from "./questionParts.js";

export const GIFT_DEFAULT_POINTS = 1;
// Meme valeur que DEFAULT_PROTOTYPE_NAME cote serveur.
export const DEFAULT_PROTOTYPE_NAME = "nodejs";

function escapeGift(text) {
  return (text || "")
    .replace(/[\\~=#{}:]/g, "\\$&")
    .replace(/\r\n?|\n/g, "\\n");
}

// Code -> bloc Markdown. La cloture est plus longue que toute ligne ``` du code.
function fenceBlock(text, info = "") {
  const longest = Math.max(2, ...(text.match(/^[ \t]*`{3,}/gm) || []).map((run) => run.trim().length));
  const marker = "`".repeat(longest + 1);
  return [`${marker}${info}`, ...text.split("\n"), marker];
}

const escapeColumn = (column) => column.replace(/\|/g, "\\|");

// Fichiers d'une question de code a plusieurs fichiers, avec leur solution :
// [{ name, starter, solution }] ([] pour une question a un seul fichier).
export function getCodeFiles(question) {
  const answers = parseFileAnswers(question.correct_answer) || {};
  return (question.files || []).map((file) => ({
    name: file.name,
    starter: file.starter || "",
    solution: typeof answers[file.name] === "string" ? answers[file.name] : "",
  }));
}

function codeQuestionToGift(question, prototypes) {
  const prototype = prototypes?.find((candidate) => candidate.id === question.prototype_id);
  const language = prototype?.name || DEFAULT_PROTOTYPE_NAME;
  const lines = [`// code: ${language}`];
  const codeBlock = (text) => fenceBlock(text, language);

  const files = getCodeFiles(question);
  if (files.length) {
    files.forEach((file) => {
      if (file.starter) lines.push(`// starter ${file.name}:`, ...codeBlock(file.starter));
      lines.push(`// solution ${file.name}:`, ...(file.solution ? codeBlock(file.solution) : []));
    });
  } else if ((question.correct_answer || "").trim()) {
    lines.push("// solution:", ...codeBlock(question.correct_answer.trim()));
  }

  (question.tests || []).forEach((test) => {
    const code = (test.code || "").trim();
    const expected = (test.expected || "").trim();
    if (!code.includes("\n") && !expected.includes("\n") && !code.includes("=>")) {
      lines.push(`// test: ${code} => ${expected}`);
      return;
    }
    lines.push("// test:", ...codeBlock(code));
    if (expected.includes("\n")) lines.push("// =>", ...fenceBlock(expected));
    else lines.push(`// => ${expected}`);
  });
  return lines;
}

// Trou d'un texte a trous -> {:MC: =bonne ~mauvaise} ou {:SA: reponse | autre}.
const escapeClozeAnswer = (text, special) =>
  (text || "").replace(special, "\\$&").replace(/\r\n?|\n/g, "\\n");
const clozeBlankToGift = (blank) =>
  blank?.kind === "choice"
    ? `{:MC: ${blank.options.map((option) => `${option.is_correct ? "=" : "~"}${escapeClozeAnswer(option.label, /[\\{}=~]/g)}`).join(" ")}}`
    : `{:SA: ${(blank?.answers || []).map((answer) => escapeClozeAnswer(answer, /[\\{}|=~]/g)).join(" | ")}}`;

// Directives d'un texte a trous ou d'une grille (« // notation: » seulement
// si ce n'est pas la notation par defaut).
function partQuestionDirectives(question) {
  const details = question.details || {};
  const lines = [];
  // Texte a trous : ses trous {:SA: } / {:MC: } suffisent, pas de « // type: ».
  if (question.type === QUESTION_PART_TYPES.DRAG_TEXT) lines.push("// type: glisser-texte");
  else if (question.type === QUESTION_PART_TYPES.DRAG_IMAGE) {
    lines.push("// type: glisser-image", `// image: ${details.image}`);
    (details.zones || []).forEach((zone) => lines.push(`// zone: ${zone.x}, ${zone.y} => ${zone.answer}`));
  } else if (question.type === QUESTION_PART_TYPES.GRID) {
    lines.push(`// type: ${details.multiple ? "grille-multiple" : "grille"}`);
    lines.push(`// colonnes: ${(details.columns || []).map(escapeColumn).join(" | ")}`);
  }
  // L'enonce, sur une ligne (le texte avec ses trous suit les directives).
  if (hasBlankMarkers(question.type)) lines.push(`// énoncé: ${(question.label || "").replace(/\s+/g, " ").trim()}`);
  if (details.scoring === SCORING.ALL_OR_NOTHING) lines.push("// notation: tout-ou-rien");
  return lines;
}

// Questions d'un examen -> texte GIFT.
// prototypes : voir parseGift (pour ecrire le langage des questions de code).
export function questionsToGift(questions, prototypes = null) {
  const blocks = (questions || []).map((question) => {
    let label = escapeGift(question.label);
    const lines = [`// points: ${question.points || GIFT_DEFAULT_POINTS}`];
    let answers = "{}";
    if (isPartQuestionType(question.type)) lines.push(...partQuestionDirectives(question));
    if (question.type === QUESTION_PART_TYPES.CLOZE) {
      // Les trous sont dans le texte : pas de bloc de reponses a la fin.
      const blanks = question.details?.blanks || [];
      label = escapeGift(question.details?.text).replace(BLANK_MARKER, (marker, number) => clozeBlankToGift(blanks[Number(number) - 1]));
      return `${lines.join("\n")}\n${label}`;
    }
    // Glisser-deposer : les etiquettes attendues dans le texte (ou dans les
    // directives « // zone: »), les intrus dans le bloc { } final.
    if (isDragQuestionType(question.type)) {
      const { blanks = [], distractors = [] } = question.details || {};
      if (question.type === QUESTION_PART_TYPES.DRAG_TEXT) {
        label = escapeGift(question.details?.text).replace(BLANK_MARKER, (marker, number) => `[[${escapeGift(blanks[Number(number) - 1])}]]`);
      }
      const block = distractors.length ? ` {${distractors.map((item) => `~${escapeGift(item)}`).join(" ")}}` : "";
      return `${lines.join("\n")}\n${label}${block}`;
    }
    if (question.type === QUESTION_PART_TYPES.GRID) {
      const { columns = [], rows = [] } = question.details || {};
      const pairs = rows.flatMap((row) => row.answers.map((column) => `\t=${escapeGift(row.label)} -> ${escapeGift(columns[column])}`));
      // Colonnes qu'aucune ligne n'utilise : deja dans « // colonnes: ».
      answers = `{\n${pairs.join("\n")}\n}`;
    } else if (question.type === "code") {
      lines.push(...codeQuestionToGift(question, prototypes));
    } else if (question.type === "true_false") {
      answers = (question.correct_answer || "").toLowerCase() === "vrai" ? "{T}" : "{F}";
    } else if (question.type === "multiple_choice") {
      const choices = (question.choices || []).map(
        (choice) => `\t${choice.is_correct ? "=" : "~"}${escapeGift(choice.label)}`
      );
      answers = `{\n${choices.join("\n")}\n}`;
    } else if ((question.correct_answer || "").trim()) {
      answers = `{=${escapeGift(question.correct_answer.trim())}}`;
    }
    return `${lines.join("\n")}\n${label} ${answers}`;
  });
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}
