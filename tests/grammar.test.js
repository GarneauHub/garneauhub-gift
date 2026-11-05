// Coloration (grammaire TextMate) : a jour avec son script et avec le site.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FENCE_LANGUAGES } from "../src/shared/giftCodeAssist.js";
import { FENCE_GRAMMARS, grammar } from "../scripts/grammar.mjs";

const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf-8"));

// VS Code (Oniguruma) comprend les groupes (?i:...), pas le RegExp de Node :
// on les remplace par (?:...) avec le drapeau i (le reste du motif ne contient
// pas de lettres sensibles a la casse).
const toJsRegExp = (pattern) => new RegExp(pattern.replaceAll("(?i:", "(?:"), "i");

describe("Grammaire GIFT", () => {
  it("syntaxes/gift.tmLanguage.json est a jour (npm run build)", () => {
    expect(readJson("../syntaxes/gift.tmLanguage.json")).toEqual(JSON.parse(JSON.stringify(grammar)));
  });

  it("reconnait les memes langages de blocs de code que le site", () => {
    const names = FENCE_GRAMMARS.flatMap((language) => language.names).sort();

    expect(names).toEqual(FENCE_LANGUAGES.flatMap((language) => language.names).sort());
  });

  it("declare chaque langage de bloc dans package.json", () => {
    const [contribution] = readJson("../package.json").contributes.grammars;

    expect(Object.values(contribution.embeddedLanguages).sort()).toEqual(FENCE_GRAMMARS.map((language) => language.id).sort());
  });

  it("reconnait les directives de GarneauHub", () => {
    const directive = toJsRegExp(grammar.repository.directive.patterns[0].match);

    expect(directive.test("// points: 2")).toBe(true);
    expect(directive.test("// énoncé: Complétez le texte.")).toBe(true);
    expect(directive.test("// solution main.py:")).toBe(true);
    expect(directive.test("// Points = 3")).toBe(true);
    expect(directive.test("// simple commentaire")).toBe(false);
  });
});
