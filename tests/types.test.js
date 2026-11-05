// Chaque question a son type (« // type: ») et chaque type son modele par
// defaut, propose par l'autocompletion.
import { describe, it, expect } from "vitest";
import { GIFT_SNIPPETS, getGiftCompletions, parseGift, renderSnippet } from "../src/gift.js";
import { questionsToGift } from "../src/shared/giftParser.js";

const typeCompletions = (lines, lineIndex = 0) =>
  getGiftCompletions(lines, lineIndex, lines[lineIndex].length).items;

describe("« // type: » pour chaque question", () => {
  it.each([
    ["choix-multiples", "Quel protocole ? {=TCP ~UDP}", "multiple_choice"],
    ["qcm", "Quel protocole ? {=TCP ~UDP}", "multiple_choice"],
    ["vrai-faux", "La Terre est ronde. {T}", "true_false"],
    ["texte", "Commande ? {=ipconfig}", "text"],
    ["code", "Écrivez une fonction. {}", "code"],
  ])("accepte « // type: %s »", (type, question, expected) => {
    const parsed = parseGift(`// type: ${type}\n${question}`);

    expect(parsed.errorCount).toBe(0);
    expect(parsed.questions[0]).toMatchObject({ type: expected, valid: true });
  });

  it("signale un type qui ne correspond pas aux réponses", () => {
    const parsed = parseGift("// type: vrai-faux\nQuel protocole ? {=TCP ~UDP}");

    expect(parsed.errorCount).toBe(1);
    expect(parsed.diagnostics[0]).toMatchObject({ startLine: 1, message: expect.stringContaining("choix-multiples") });
    expect(parsed.questions[0].valid).toBe(false);
  });

  it("refuse un type inconnu et liste les types offerts", () => {
    const { diagnostics } = parseGift("// type: essai\nLa Terre est ronde. {T}");

    expect(diagnostics[0].message).toContain("choix-multiples, vrai-faux, texte, code, cloze");
  });

  it("reste facultatif : le type se déduit des réponses", () => {
    expect(parseGift("La Terre est ronde. {T}").questions[0]).toMatchObject({ type: "true_false", valid: true });
  });

  it("est écrit pour chaque question à l'export, et se relit", () => {
    const gift = questionsToGift([
      { label: "Quel protocole ?", type: "multiple_choice", points: 1, choices: [{ label: "TCP", is_correct: true }, { label: "UDP", is_correct: false }] },
      { label: "La Terre est ronde.", type: "true_false", points: 1, correct_answer: "vrai" },
      { label: "Commande ?", type: "text", points: 1, correct_answer: "ipconfig" },
    ]);

    expect(gift).toContain("// type: choix-multiples");
    expect(gift).toContain("// type: vrai-faux");
    expect(gift).toContain("// type: texte");
    expect(parseGift(gift).errorCount).toBe(0);
  });

  it("chaque modèle des boutons annonce son type et se lit sans erreur", () => {
    GIFT_SNIPPETS.filter((snippet) => !snippet.needsImage).forEach((snippet) => {
      const parsed = parseGift(renderSnippet(snippet.body));

      expect(snippet.body).toContain(`// type: ${snippet.type}`);
      expect(parsed.errorCount, snippet.id).toBe(0);
    });
  });
});

describe("Autocomplétion du modèle de chaque type", () => {
  it("propose tous les types après « // type: »", () => {
    expect(typeCompletions(["// type: "]).map((item) => item.label)).toEqual([
      "choix-multiples", "vrai-faux", "texte", "code", "cloze", "grille", "grille-multiple", "glisser-texte", "glisser-image",
    ]);
  });

  it("propose « type » pour toutes les questions", () => {
    const labels = (lines) => getGiftCompletions(lines, 0, 3).items.map((item) => item.label);

    expect(labels(["// ", "La Terre est ronde. {T}"])).toContain("type");
  });

  it("écrit le modèle du type dans une question vide", () => {
    const items = typeCompletions(["// points: 2", "// type: "], 1);

    items.filter((item) => item.label !== "glisser-image").forEach((item) => {
      const gift = `// points: 2\n// type: ${renderSnippet(item.insertText)}`;
      const parsed = parseGift(gift);

      expect(item.insertText.startsWith(`${item.label}\n`), item.label).toBe(true);
      expect(parsed.errorCount, item.label).toBe(0);
      expect(parsed.questions[0].points).toBe(2);
    });
  });

  it("n'écrit que la valeur si la question a déjà un texte", () => {
    const item = typeCompletions(["// type: ", "La Terre est ronde. {T}"]).find((entry) => entry.label === "vrai-faux");

    expect(item.insertText).toBe("vrai-faux");
  });

  it("ne propose que les réponses du type annoncé", () => {
    const answers = (type) => getGiftCompletions([`// type: ${type}`, "Quelle réponse ? {"], 1, 18).items.map((item) => item.label);

    expect(answers("vrai-faux")).toEqual(["T", "F"]);
    expect(answers("texte")).toEqual(["="]);
    expect(answers("choix-multiples")).toEqual(["= ~ ~", "~"]);
  });
});
