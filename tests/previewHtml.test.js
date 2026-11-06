// Apercu de l'examen : le resultat de parseGift (le parseur du site) en HTML.
import { describe, it, expect } from "vitest";
import { parseGift } from "../src/gift.js";
import { renderPreview } from "../src/previewHtml.js";

const render = (source) => renderPreview(parseGift(source), { nonce: "abc" });

describe("Apercu de l'examen", () => {
  it("resume le nombre de questions et le total des points", () => {
    const html = render("// points: 2\nQuel protocole ? {=TCP ~UDP}\n\nLa Terre est ronde. {T}");

    expect(html).toContain("2 questions · 3 points");
    expect(html).toContain("Question 1");
    expect(html).toContain("Choix multiples");
    expect(html).toContain('data-line="2"');
  });

  it("marque la bonne reponse d'un choix multiple et d'un vrai / faux", () => {
    const html = render("Quel protocole ? {=TCP ~UDP}\n\nLa Terre est ronde. {T}");

    expect(html).toMatch(/<li class="correct">\s*<span class="mark" aria-hidden="true">●<\/span>\s*TCP/);
    expect(html).toMatch(/<li class="correct">\s*<span class="mark" aria-hidden="true">●<\/span>\s*Vrai/);
  });

  it("remplit les trous d'un texte a trous avec les bonnes reponses", () => {
    const html = render("Le protocole {:MC: =TCP ~UDP} est fiable. L'adresse locale est {:SA: 127.0.0.1}.");

    expect(html).toContain('<span class="blank">TCP</span>');
    expect(html).toContain('<span class="blank">127.0.0.1</span>');
    expect(html).toContain("Notation partielle");
  });

  it("montre toutes les options d'un menu et les autres réponses acceptées", () => {
    const html = render("Le protocole {:MC: ~UDP =TCP ~ICMP} est fiable. La boucle locale est {:SA: 127.0.0.1 | localhost}.");

    expect(html).toContain('<span class="option">UDP</span><span class="blank">TCP</span><span class="visually-hidden"> (bonne réponse)</span><span class="option">ICMP</span>');
    expect(html).toContain('<span class="blank">127.0.0.1</span><span class="alternatives"> ou <span class="option">localhost</span></span>');
  });

  it("coche les bonnes colonnes d'une grille", () => {
    const html = render("// type: grille\n// colonnes: Physique | Réseau\nCouche ? {\n\t=Routeur -> Réseau\n\t=Modem -> Physique\n}");

    expect(html).toContain('<th scope="col">Réseau</th>');
    expect(html).toContain('<th scope="row">Routeur</th><td></td><td><span class="correct">●</span></td>');
  });

  it("montre la solution et les tests d'une question de code", () => {
    const html = render("// code: python3\n// solution:\n```python\nprint(5)\n```\n// test: main() => 5\nAffichez 5. {}");

    expect(html).toContain("python3 · solution :");
    expect(html).toContain("<pre>print(5)</pre>");
    expect(html).toContain("<code>main()</code> <span aria-hidden=\"true\">→</span> <code>5</code>");
  });

  it("signale une question a corriger et liste les problemes", () => {
    const html = render("Combien ? {#4}");

    expect(html).toContain("À corriger (ligne 1)");
    expect(html).toContain('class="problem error"');
    expect(html).toContain("erreur à corriger");
  });

  it("echappe le HTML des questions", () => {
    const html = render("Que fait <script>alert(1)</script> ? {=rien ~tout}");

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
