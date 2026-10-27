// Apercu de l'examen (page HTML du panneau de VS Code) : pour chaque question,
// son numero, son type, ses points et ses bonnes reponses, comme l'apercu de
// l'editeur GIFT du site (GiftEditorPanel.vue). Un clic sur « Question n » ou
// sur un probleme envoie { type: "goTo", line, column } a l'extension.
import { GIFT_SEVERITY, formatQuestionType, getCodeFiles, getCorrectPartsAnswer, isDragQuestionType } from "./gift.js";

const SEVERITY_LABELS = {
  [GIFT_SEVERITY.ERROR]: "Erreur",
  [GIFT_SEVERITY.WARNING]: "Avertissement",
  [GIFT_SEVERITY.INFO]: "Note",
};

// Parties d'une question a plusieurs parties, pour la notation.
const PART_NAMES = { cloze: "trous", grid: "lignes", drag_text: "trous", drag_image: "zones" };

export const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const formatPoints = (points) => `${points} point${points > 1 ? "s" : ""}`;

function summary(questions) {
  if (!questions.length) return "";
  const points = questions.reduce((total, question) => total + question.points, 0);
  return `${questions.length} question${questions.length > 1 ? "s" : ""} · ${formatPoints(points)}`;
}

const goToAttributes = (line, column = 1) => `data-line="${line}" data-column="${column}"`;

function scoringHint(question) {
  const parts = PART_NAMES[question.type];
  return question.details?.scoring === "all_or_nothing"
    ? `<p class="hint">Tout ou rien : tous les ${parts} doivent être justes pour obtenir les points.</p>`
    : `<p class="hint">Notation partielle : les points sont répartis entre les ${parts}.</p>`;
}

// Texte avec ses reperes [[1]], [[2]]... -> texte avec la bonne reponse de
// chaque trou mise en evidence.
function fillBlanks(text, answers) {
  return escapeHtml(text).replace(/\[\[(\d+)\]\]/g, (match, number) =>
    `<span class="blank">${escapeHtml(answers[Number(number) - 1] ?? "")}</span>`
  );
}

function renderChoices(question) {
  const choices = question.type === "true_false"
    ? [
      { label: "Vrai", is_correct: question.correct_answer === "vrai" },
      { label: "Faux", is_correct: question.correct_answer === "faux" },
    ]
    : question.choices || [];
  return `<ul class="choices">${choices.map((choice) => `
    <li class="${choice.is_correct ? "correct" : ""}">
      <span class="mark" aria-hidden="true">${choice.is_correct ? "●" : "○"}</span>
      ${escapeHtml(choice.label)}${choice.is_correct ? '<span class="visually-hidden"> (bonne réponse)</span>' : ""}
    </li>`).join("")}</ul>`;
}

function renderCloze(question) {
  const answers = getCorrectPartsAnswer(question.type, question.details);
  return `<p class="parts-text">${fillBlanks(question.details?.text || "", answers)}</p>${scoringHint(question)}`;
}

function renderGrid(question) {
  const { columns = [], rows = [], multiple } = question.details || {};
  const mark = multiple ? "☑" : "●";
  const header = columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("");
  const body = rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th>${columns.map((column, index) =>
    `<td>${row.answers.includes(index) ? `<span class="correct">${mark}</span>` : ""}</td>`
  ).join("")}</tr>`).join("");
  const kind = multiple ? "<p class=\"hint\">Plusieurs réponses possibles par ligne.</p>" : "";
  return `<table class="grid"><thead><tr><td></td>${header}</tr></thead><tbody>${body}</tbody></table>${kind}${scoringHint(question)}`;
}

function renderDistractors(question) {
  const distractors = question.details?.distractors || [];
  if (!distractors.length) return "";
  return `<p class="hint">Intrus : ${distractors.map((label) => `<span class="tag">${escapeHtml(label)}</span>`).join(" ")}</p>`;
}

function renderDrag(question) {
  if (question.type === "drag_text") {
    const answers = getCorrectPartsAnswer(question.type, question.details);
    return `<p class="parts-text">${fillBlanks(question.details?.text || "", answers)}</p>${renderDistractors(question)}${scoringHint(question)}`;
  }
  // L'image est enregistree sur le site : on n'affiche que ses zones.
  const zones = question.details?.zones || [];
  return `<p class="hint">Image : <code>${escapeHtml(question.details?.image || "")}</code> (visible sur le site)</p>
    <ul class="zones">${zones.map((zone) => `<li>x ${zone.x} %, y ${zone.y} % → <span class="tag">${escapeHtml(zone.answer)}</span></li>`).join("")}</ul>
    ${renderDistractors(question)}${scoringHint(question)}`;
}

function renderCode(question) {
  const files = getCodeFiles(question);
  const language = escapeHtml(question.prototype);
  let solution;
  if (files.length) {
    solution = `<p class="hint">${language} · fichiers : ${files.map((file) => escapeHtml(file.name)).join(", ")}</p>`
      + files.map((file) => `<p class="hint">${escapeHtml(file.name)} :</p><pre>${escapeHtml(file.solution)}</pre>`).join("");
  } else if (question.correct_answer) {
    solution = `<p class="hint">${language} · solution :</p><pre>${escapeHtml(question.correct_answer)}</pre>`;
  } else {
    solution = `<p class="hint">${language} · sans solution</p>`;
  }
  const tests = (question.tests || []).length
    ? `<ul class="tests" aria-label="Tests">${question.tests.map((test) =>
      `<li><code>${escapeHtml(test.code)}</code> <span aria-hidden="true">→</span> <code>${escapeHtml(test.expected || "(rien)")}</code></li>`
    ).join("")}</ul>
    <p class="hint">Les tests s'exécutent sur le site (bouton « Valider les tests »).</p>`
    : "";
  return solution + tests;
}

function renderAnswer(question) {
  if (!question.valid) return `<p class="invalid-note">À corriger (ligne ${question.line})</p>`;
  if (question.type === "cloze") return renderCloze(question);
  if (question.type === "grid") return renderGrid(question);
  if (isDragQuestionType(question.type)) return renderDrag(question);
  if (question.type === "multiple_choice" || question.type === "true_false") return renderChoices(question);
  if (question.type === "code") return renderCode(question);
  return `<p class="hint">Réponse attendue : ${escapeHtml(question.correct_answer)}</p>`;
}

function renderQuestion(question, index) {
  return `<article class="question${question.valid ? "" : " invalid"}">
    <header>
      <button type="button" class="link" ${goToAttributes(question.line)} title="Aller à la ligne ${question.line}">Question ${index + 1}</button>
      ${question.type ? `<span class="badge">${escapeHtml(formatQuestionType(question.type))}</span>` : ""}
      <span class="points">${formatPoints(question.points)}</span>
    </header>
    ${question.title ? `<p class="hint">${escapeHtml(question.title)}</p>` : ""}
    <p class="label">${escapeHtml(question.label || "(énoncé manquant)")}</p>
    ${renderAnswer(question)}
  </article>`;
}

function renderProblems(diagnostics) {
  if (!diagnostics.length) return "";
  return `<section class="problems" aria-label="Problèmes de format">
    <h2>Problèmes</h2>
    <ul>${diagnostics.map((diagnostic) => `<li><button type="button" class="problem ${diagnostic.severity}" ${goToAttributes(diagnostic.startLine, diagnostic.startColumn)}>
      <span class="kind">${SEVERITY_LABELS[diagnostic.severity]}</span> Ligne ${diagnostic.startLine} : ${escapeHtml(diagnostic.message)}
    </button></li>`).join("")}</ul>
  </section>`;
}

// parsed : resultat de parseGift. webview : { cspSource, nonce, styleUri,
// fileName } (le style et le script sont servis par VS Code).
export function renderPreview(parsed, { cspSource = "", nonce = "", styleUri = "", fileName = "" } = {}) {
  const { questions, diagnostics, errorCount } = parsed;
  const body = questions.length
    ? questions.map(renderQuestion).join("")
    : `<p class="hint">Écrivez une question ou utilisez « Ajouter une question ». Dans l'éditeur, tapez un raccourci en début de ligne
      (<code>mcq</code>, <code>tfq</code>, <code>saq</code>, <code>mwq</code>…) puis Tab pour insérer un modèle.</p>`;
  const status = errorCount
    ? `<p class="status error">${errorCount} erreur${errorCount > 1 ? "s" : ""} à corriger avant d'importer sur le site.</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Aperçu de l'examen</title>
</head>
<body>
  <header class="summary">
    <h1>Aperçu${fileName ? ` · ${escapeHtml(fileName)}` : ""}</h1>
    <span class="hint">${summary(questions)}</span>
  </header>
  ${status}
  <main>${body}</main>
  ${renderProblems(diagnostics)}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-line]");
      if (!target) return;
      vscode.postMessage({ type: "goTo", line: Number(target.dataset.line), column: Number(target.dataset.column) });
    });
  </script>
</body>
</html>`;
}
