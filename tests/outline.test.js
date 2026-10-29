// Structure du document : questions de la vue « Structure », zones
// repliables et texte de la barre d'etat.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseGift } from "../src/gift.js";
import { findBlocks, foldingRanges, questionOutline, statusSummary } from "../src/outline.js";

const outline = (source) => questionOutline(source, parseGift(source).questions);

describe("Structure du document GIFT", () => {
  it("donne une entree par question, directives comprises", () => {
    const source = "// points: 2\nQuel protocole ? {\n\t=TCP\n\t~UDP\n}\n\nLa Terre est ronde. {T}";

    expect(outline(source)).toEqual([
      expect.objectContaining({ name: "Question 1 · Choix multiples", startLine: 0, endLine: 4, selectionLine: 1 }),
      expect.objectContaining({ name: "Question 2 · Vrai / Faux", startLine: 6, endLine: 6, selectionLine: 6 }),
    ]);
    expect(outline(source)[0].detail).toBe("2 pts · Quel protocole ?");
  });

  it("garde le titre ::...:: comme detail", () => {
    expect(outline("::Réseau 1:: Quel protocole ? {=TCP ~UDP}")[0].detail).toBe("1 pt · Réseau 1");
  });

  it("ne coupe pas une question sur une ligne vide d'un bloc de code", () => {
    const source = "// code: python3\n// solution:\n```\ndef f():\n\n    return 1\n```\nÉcrivez f. {}";
    const { blocks, fences } = findBlocks(source);

    expect(blocks).toEqual([{ startLine: 0, endLine: 7 }]);
    expect(fences).toEqual([{ startLine: 2, endLine: 6 }]);
  });

  it("replie les questions de plusieurs lignes et les blocs de code", () => {
    const source = "Q1 ? {\n=a\n~b\n}\n\nUne ligne. {T}\n\n// code: python3\n// solution:\n```\nx = 1\n```\nÉcrivez x. {}";

    expect(foldingRanges(source)).toEqual([
      { startLine: 0, endLine: 3 },
      { startLine: 7, endLine: 12 },
      { startLine: 9, endLine: 11 },
    ]);
  });

  it("resume les questions, les points et les erreurs", () => {
    expect(statusSummary(parseGift("// points: 2\nQuel protocole ? {=TCP ~UDP}\n\nVrai. {T}"))).toBe("2 questions · 3 pts");
    expect(statusSummary(parseGift("Combien ? {#4}"))).toMatch(/· 1 erreur$/);
    expect(statusSummary(parseGift(""))).toBe("0 question · 0 pt");
  });

  it("lit l'exemple sans erreur, avec une question de chaque type", () => {
    const source = readFileSync(new URL("../examples/exemple.gift", import.meta.url), "utf8");
    const parsed = parseGift(source);

    expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(new Set(parsed.questions.map((question) => question.type))).toEqual(
      new Set(["multiple_choice", "true_false", "text", "code", "cloze", "grid", "drag_text"])
    );
  });
});
