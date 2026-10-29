// Structure d'un document GIFT, pour la vue « Structure », le repli et la
// barre d'etat. Une question = un bloc de lignes qui se suivent (directives
// « // points: »... comprises), comme dans parseGift. Une ligne vide dans un
// bloc de code ``` ne coupe pas le bloc.
import { formatQuestionType } from "./gift.js";

const FENCE = /^\s*(?:\/\/\s*)?(```|~~~)/;
const LABEL_LENGTH = 60;

const splitLines = (text) => (text || "").replace(/\r\n?/g, "\n").split("\n");

// Blocs du document : { startLine, endLine } (lignes a partir de 0, fin
// incluse), et les blocs de code ``` qu'ils contiennent.
export function findBlocks(text) {
  const lines = splitLines(text);
  const blocks = [];
  const fences = [];
  let block = null;
  let fence = null;
  lines.forEach((line, index) => {
    const marker = line.match(FENCE);
    if (fence !== null) {
      if (marker) {
        fences.push({ startLine: fence, endLine: index });
        fence = null;
      }
      block.endLine = index;
      return;
    }
    if (!line.trim()) {
      block = null;
      return;
    }
    if (!block) {
      block = { startLine: index, endLine: index };
      blocks.push(block);
    }
    block.endLine = index;
    if (marker) fence = index;
  });
  return { blocks, fences };
}

const shorten = (text) => {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > LABEL_LENGTH ? `${flat.slice(0, LABEL_LENGTH - 1)}…` : flat;
};

export const formatPoints = (points) => `${points} pt${points > 1 ? "s" : ""}`;

// Une entree par question de parseGift, avec le bloc qui la contient.
export function questionOutline(text, questions) {
  const { blocks } = findBlocks(text);
  return questions.map((question, index) => {
    const line = question.line - 1;
    const block = blocks.find((item) => item.startLine <= line && line <= item.endLine) || { startLine: line, endLine: line };
    const type = question.type ? formatQuestionType(question.type) : "Type inconnu";
    return {
      name: `Question ${index + 1} · ${type}`,
      detail: [formatPoints(question.points), shorten(question.title || question.label)].filter(Boolean).join(" · "),
      valid: question.valid,
      startLine: block.startLine,
      endLine: block.endLine,
      selectionLine: line,
    };
  });
}

// Zones repliables : chaque bloc de plus d'une ligne et chaque bloc de code.
export function foldingRanges(text) {
  const { blocks, fences } = findBlocks(text);
  return [...blocks, ...fences].filter((range) => range.endLine > range.startLine);
}

// Texte de la barre d'etat : « 12 questions · 45 pts », plus les erreurs.
export function statusSummary(parsed) {
  const count = parsed.questions.length;
  const points = parsed.questions.reduce((total, question) => total + question.points, 0);
  const parts = [`${count} question${count > 1 ? "s" : ""}`, formatPoints(points)];
  if (parsed.errorCount) parts.push(`${parsed.errorCount} erreur${parsed.errorCount > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
