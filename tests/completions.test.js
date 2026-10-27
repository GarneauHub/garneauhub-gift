// Modeles de questions proposes pendant la frappe et commande « Ajouter une question ».
import { describe, it, expect } from "vitest";
import { INSERTABLE_SNIPPETS, getGiftCompletions, isInsideAnswers, separatorBefore } from "../src/completions.js";

// Les cas detailles sont dans frontend/tests/utils/giftCompletions.test.js :
// ici, on verifie que l'extension reprend bien le module du site.
describe("Suggestions pendant la frappe", () => {
  it("propose les raccourcis du site en debut de ligne", () => {
    const result = getGiftCompletions(["  mc"], 0, 4);

    expect(result.from).toBe(2);
    expect(result.items.map((item) => item.label)).toEqual(expect.arrayContaining(["qcm", "mcq", "tfq", "points"]));
    expect(result.items.find((item) => item.label === "vf").documentation).toContain("{T}");
  });

  it("propose les directives apres // et les types apres // type:", () => {
    expect(getGiftCompletions(["// "], 0, 3).items.map((item) => item.label)).toContain("type");
    expect(getGiftCompletions(["// type: "], 0, 9).items.map((item) => item.label)).toContain("grille");
  });

  it("detecte le bloc de reponses", () => {
    expect(isInsideAnswers(["Question ? {", "\t=TCP", "\t~"], 2, 2)).toBe(true);
    expect(isInsideAnswers(["Question ? {=TCP}", ""], 1, 0)).toBe(false);
    expect(isInsideAnswers(["Accolade \\{ echappee "], 0, 21)).toBe(false);
  });

  it("ne propose rien dans un bloc de code", () => {
    const lines = ["// code: python3", "// solution:", "```python", "pri", "```", "Énoncé. {}"];

    expect(getGiftCompletions(lines, 3, 3)).toBeNull();
  });
});

describe("Ajouter une question", () => {
  it("offre les boutons du site sauf le glisser sur image", () => {
    const ids = INSERTABLE_SNIPPETS.map((snippet) => snippet.id);

    expect(ids).toEqual(expect.arrayContaining(["qcm", "vf", "texte", "code", "cloze", "grille", "glisser-texte"]));
    expect(ids).not.toContain("glisser-image");
  });

  it("separe le modele de la question precedente par une ligne vide", () => {
    expect(separatorBefore("")).toBe("");
    expect(separatorBefore("Q ? {T}")).toBe("\n\n");
    expect(separatorBefore("Q ? {T}\n")).toBe("\n");
    expect(separatorBefore("Q ? {T}\n\n")).toBe("");
  });
});
