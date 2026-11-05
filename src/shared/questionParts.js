// Questions a plusieurs parties (#156) : texte a trous (cloze), grille et
// glisser-deposer sur texte ou sur image.
// Memes regles que backend/utils/questionParts.js : le serveur revalide
// toujours, ceci sert aux erreurs du formulaire et de l'editeur GIFT, a la
// passation et a la correction affichee.
//
// Tout ce qui est propre au type est dans questions.details (JSON) :
//   cloze      : { scoring, text: "Le protocole [[1]] est fiable.",
//                  blanks: [{ kind: "choice", options: [{ label, is_correct }] }
//                         | { kind: "text", answers: ["127.0.0.1", ...] }] }
//                text : le texte, avec un repere [[1]], [[2]]... par trou.
//                L'enonce (label) est separe, comme pour les autres types.
//   grid       : { scoring, multiple, columns: ["Physique", ...],
//                  rows: [{ label: "Routeur", answers: [2] }] }
//                answers : index des bonnes colonnes de la ligne. multiple =
//                false : une seule par ligne (boutons radio) ; true : cases a cocher.
//   drag_text  : { scoring, text, blanks: ["7", "Transport"], distractors: ["Réseau"] }
//                Un repere [[n]] par trou dans text, comme le cloze ;
//                blanks : l'etiquette attendue dans chaque trou.
//   drag_image : { scoring, image: "3f9a...-reseau.png", distractors: [...],
//                  zones: [{ x: 25, y: 40, answer: "Routeur" }] }
//                x, y : centre de la zone, en % de la largeur et de la hauteur
//                de l'image (independant de la taille d'affichage).
// Glisser-deposer : les etiquettes a placer sont les bonnes reponses plus
// les intrus (distractors) ; une etiquette se place une fois (deux trous qui
// attendent « Réseau » donnent deux etiquettes « Réseau »).
// scoring : "partial" (points repartis entre les parties) ou
// "all_or_nothing" (tout doit etre juste).
//
// Reponse de l'eleve (student_answers.answer_text), en JSON :
//   cloze, drag_text, drag_image : ["TCP", ""]  (un texte par trou ou par
//                                  zone, "" si vide)
//   grid                         : [[2], [0, 1], []]  (colonnes cochees, ligne par ligne)

export const QUESTION_PART_TYPES = {
  CLOZE: "cloze",
  GRID: "grid",
  DRAG_TEXT: "drag_text",
  DRAG_IMAGE: "drag_image",
};

export const isPartQuestionType = (type) => Object.values(QUESTION_PART_TYPES).includes(type);

export const isDragQuestionType = (type) =>
  type === QUESTION_PART_TYPES.DRAG_TEXT || type === QUESTION_PART_TYPES.DRAG_IMAGE;

// Types dont le texte (details.text) contient les reperes [[n]].
export const hasBlankMarkers = (type) =>
  type === QUESTION_PART_TYPES.CLOZE || type === QUESTION_PART_TYPES.DRAG_TEXT;

export const SCORING = {
  PARTIAL: "partial",
  ALL_OR_NOTHING: "all_or_nothing",
};

export const MAX_PARTS = 50;
export const MAX_PART_LABEL_LENGTH = 255;
// Texte d'un texte a trous ou d'un glisser-deposer sur texte (meme limite
// que l'enonce).
export const MAX_BLANK_TEXT_LENGTH = 1000;
export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 10;
export const MAX_DISTRACTORS = 20;
// Cle d'une image de question (voir questionImageController.js) : 16
// caracteres hexadecimaux, puis le nom du fichier d'origine, simplifie.
export const IMAGE_KEY_PATTERN = /^[a-f0-9]{16}(?:-[a-z0-9_.-]{1,60})?$/;
// student_answers.answer_text est une colonne TEXT (65 535 octets en MySQL).
const MAX_ANSWER_LENGTH = 60000;

// Repere d'un trou dans l'enonce : [[1]] pour le premier.
export const BLANK_MARKER = /\[\[(\d+)\]\]/g;
export const blankMarker = (index) => `[[${index + 1}]]`;

// Details d'une nouvelle question de ce type (formulaire).
export function createDefaultDetails(type) {
  if (type === QUESTION_PART_TYPES.CLOZE) return { scoring: SCORING.PARTIAL, text: "", blanks: [] };
  if (type === QUESTION_PART_TYPES.GRID) {
    return { scoring: SCORING.PARTIAL, multiple: false, columns: ["", ""], rows: [{ label: "", answers: [] }] };
  }
  if (type === QUESTION_PART_TYPES.DRAG_TEXT) return { scoring: SCORING.PARTIAL, text: "", blanks: [], distractors: [] };
  if (type === QUESTION_PART_TYPES.DRAG_IMAGE) return { scoring: SCORING.PARTIAL, image: null, zones: [], distractors: [] };
  return null;
}

// Ajoute le repere du trou `index` dans le texte, a la place de la selection
// [start, end] (ou au curseur). Une espace est ajoutee si le repere touche un
// mot. Retourne { text, selected (texte remplace), caret (apres le repere) }.
export function insertBlankMarker(text, start, end, index) {
  const source = text || "";
  const before = source.slice(0, start);
  const after = source.slice(end);
  const marker = blankMarker(index);
  const spaceBefore = before && !/\s$/.test(before) ? " " : "";
  const spaceAfter = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
  return {
    text: `${before}${spaceBefore}${marker}${spaceAfter}${after}`,
    selected: source.slice(start, end).trim(),
    caret: before.length + spaceBefore.length + marker.length,
  };
}

// Retire le repere du trou `index` ; les trous suivants sont renumerotes.
export function removeBlankMarker(text, index) {
  return (text || "").replace(BLANK_MARKER, (marker, number) => {
    const position = Number(number) - 1;
    if (position === index) return "";
    return position > index ? blankMarker(position - 1) : marker;
  }).replace(/ {2,}/g, " ");
}

// Texte coupe aux reperes : [{ text } | { blank: index }].
export function splitBlankText(text) {
  const source = text || "";
  const pieces = [];
  let last = 0;
  for (const match of source.matchAll(BLANK_MARKER)) {
    if (match.index > last) pieces.push({ text: source.slice(last, match.index) });
    pieces.push({ blank: Number(match[1]) - 1 });
    last = match.index + match[0].length;
  }
  if (last < source.length) pieces.push({ text: source.slice(last) });
  return pieces;
}

// Lit questions.details (chaine JSON en SQLite, objet en MySQL) : objet ou null.
export function parseQuestionDetails(value) {
  if (!value) return null;
  if (typeof value === "object") return Array.isArray(value) ? null : value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

// Comparaison d'une reponse : sans tenir compte de la casse ni des espaces
// en trop.
export const normalizeAnswer = (value) => cleanText(value).replace(/\s+/g, " ").toLowerCase();

const getLengthError = (text, what) => {
  if (!text) return `${what} : le texte est vide.`;
  if (text.length > MAX_PART_LABEL_LENGTH) return `${what} : ${MAX_PART_LABEL_LENGTH} caractères au maximum.`;
  return "";
};

const cleanScoring = (scoring) => (scoring === SCORING.ALL_OR_NOTHING ? SCORING.ALL_OR_NOTHING : SCORING.PARTIAL);

// --- Validation de la question (formulaire, GIFT et serveur) ---

// Texte avec ses reperes : non vide, et chaque trou a son repere, une seule
// fois ; aucun repere ne designe un trou qui n'existe pas. Retourne le
// message d'erreur, ou "".
function getTextError(text, count) {
  if (!text) return "Écrivez le texte, avec ses trous.";
  if (text.length > MAX_BLANK_TEXT_LENGTH) return `Texte : ${MAX_BLANK_TEXT_LENGTH} caractères au maximum.`;
  const counts = new Map();
  for (const match of text.matchAll(BLANK_MARKER)) {
    const number = Number(match[1]);
    if (number < 1 || number > count) return `Le texte contient [[${match[1]}]], mais ce trou n'existe pas.`;
    counts.set(number, (counts.get(number) || 0) + 1);
  }
  for (let index = 0; index < count; index++) {
    const found = counts.get(index + 1) || 0;
    if (!found) return `Trou ${index + 1} : le repère ${blankMarker(index)} n'est pas dans le texte.`;
    if (found > 1) return `Trou ${index + 1} : le repère ${blankMarker(index)} apparaît plusieurs fois dans le texte.`;
  }
  return "";
}

function validateCloze(rawDetails) {
  const rawBlanks = Array.isArray(rawDetails?.blanks) ? rawDetails.blanks : [];
  if (!rawBlanks.length) return { error: "Ajoutez au moins un trou au texte." };
  if (rawBlanks.length > MAX_PARTS) return { error: `Un texte à trous a au plus ${MAX_PARTS} trous.` };
  const text = cleanText(rawDetails?.text);
  const textError = getTextError(text, rawBlanks.length);
  if (textError) return { error: textError };

  const blanks = [];
  for (const [index, rawBlank] of rawBlanks.entries()) {
    const what = `Trou ${index + 1}`;
    if (rawBlank?.kind === "choice") {
      const options = [];
      for (const rawOption of Array.isArray(rawBlank.options) ? rawBlank.options : []) {
        const optionLabel = cleanText(rawOption?.label);
        const error = getLengthError(optionLabel, `${what}, option ${options.length + 1}`);
        if (error) return { error };
        options.push({ label: optionLabel, is_correct: Boolean(rawOption?.is_correct) });
      }
      if (options.length < 2) return { error: `${what} : ajoutez au moins deux options.` };
      if (options.filter((option) => option.is_correct).length !== 1) {
        return { error: `${what} : marquez une seule bonne option.` };
      }
      const labels = options.map((option) => normalizeAnswer(option.label));
      if (new Set(labels).size !== labels.length) return { error: `${what} : deux options sont identiques.` };
      blanks.push({ kind: "choice", options });
    } else if (rawBlank?.kind === "text") {
      const answers = [];
      for (const rawAnswer of Array.isArray(rawBlank.answers) ? rawBlank.answers : []) {
        const answer = cleanText(rawAnswer);
        const error = getLengthError(answer, `${what}, réponse ${answers.length + 1}`);
        if (error) return { error };
        answers.push(answer);
      }
      if (!answers.length) return { error: `${what} : ajoutez au moins une réponse acceptée.` };
      blanks.push({ kind: "text", answers });
    } else {
      return { error: `${what} : choisissez un menu déroulant ou une réponse courte.` };
    }
  }
  return { details: { scoring: cleanScoring(rawDetails?.scoring), text, blanks } };
}

function validateGrid(rawDetails) {
  const multiple = Boolean(rawDetails?.multiple);
  const columns = [];
  for (const rawColumn of Array.isArray(rawDetails?.columns) ? rawDetails.columns : []) {
    const column = cleanText(rawColumn);
    const error = getLengthError(column, `Colonne ${columns.length + 1}`);
    if (error) return { error };
    if (columns.some((other) => normalizeAnswer(other) === normalizeAnswer(column))) {
      return { error: `Deux colonnes s'appellent « ${column} ».` };
    }
    columns.push(column);
  }
  if (columns.length < MIN_GRID_COLUMNS) return { error: `Ajoutez au moins ${MIN_GRID_COLUMNS} colonnes.` };
  if (columns.length > MAX_GRID_COLUMNS) return { error: `Une grille a au plus ${MAX_GRID_COLUMNS} colonnes.` };

  const rawRows = Array.isArray(rawDetails?.rows) ? rawDetails.rows : [];
  if (!rawRows.length) return { error: "Ajoutez au moins une ligne." };
  if (rawRows.length > MAX_PARTS) return { error: `Une grille a au plus ${MAX_PARTS} lignes.` };

  const rows = [];
  for (const rawRow of rawRows) {
    const label = cleanText(rawRow?.label);
    const error = getLengthError(label, `Ligne ${rows.length + 1}`);
    if (error) return { error };
    if (rows.some((other) => normalizeAnswer(other.label) === normalizeAnswer(label))) {
      return { error: `Deux lignes s'appellent « ${label} ».` };
    }
    const rawAnswers = Array.isArray(rawRow?.answers) ? rawRow.answers : [];
    if (rawAnswers.some((answer) => !Number.isInteger(answer) || answer < 0 || answer >= columns.length)) {
      return { error: `Ligne « ${label} » : une bonne réponse désigne une colonne qui n'existe pas.` };
    }
    const answers = [...new Set(rawAnswers)].sort((a, b) => a - b);
    if (!answers.length) return { error: `Ligne « ${label} » : cochez la bonne colonne.` };
    if (!multiple && answers.length > 1) {
      return { error: `Ligne « ${label} » : une seule bonne colonne par ligne (ou permettez plusieurs réponses par ligne).` };
    }
    rows.push({ label, answers });
  }
  return { details: { scoring: cleanScoring(rawDetails?.scoring), multiple, columns, rows } };
}

// Etiquette a glisser : pas de « [[ » ni de « ]] » (ils delimitent les trous
// dans la syntaxe GIFT).
function getDragLabelError(text, what) {
  const error = getLengthError(text, what);
  if (error) return error;
  return /\[\[|\]\]/.test(text) ? `${what} : « [[ » et « ]] » ne sont pas permis.` : "";
}

// Intrus : etiquettes en trop, qui ne vont dans aucun trou ou zone. Une ligne
// vide est ignoree. Retourne { distractors } ou { error }.
function validateDistractors(rawDistractors, answers) {
  const distractors = [];
  for (const rawDistractor of Array.isArray(rawDistractors) ? rawDistractors : []) {
    const distractor = cleanText(rawDistractor);
    if (!distractor) continue;
    const error = getDragLabelError(distractor, `Intrus ${distractors.length + 1}`);
    if (error) return { error };
    if (answers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(distractor))) {
      return { error: `« ${distractor} » est déjà une bonne réponse : retirez-le des intrus.` };
    }
    distractors.push(distractor);
  }
  if (distractors.length > MAX_DISTRACTORS) return { error: `Au plus ${MAX_DISTRACTORS} intrus.` };
  return { distractors };
}

function validateDragText(rawDetails) {
  const rawBlanks = Array.isArray(rawDetails?.blanks) ? rawDetails.blanks : [];
  if (!rawBlanks.length) return { error: "Ajoutez au moins un trou au texte." };
  if (rawBlanks.length > MAX_PARTS) return { error: `Un texte a au plus ${MAX_PARTS} trous.` };
  const text = cleanText(rawDetails?.text);
  const textError = getTextError(text, rawBlanks.length);
  if (textError) return { error: textError };

  const blanks = [];
  for (const rawBlank of rawBlanks) {
    const answer = cleanText(rawBlank);
    const error = getDragLabelError(answer, `Trou ${blanks.length + 1}`);
    if (error) return { error };
    blanks.push(answer);
  }
  const { distractors, error } = validateDistractors(rawDetails?.distractors, blanks);
  if (error) return { error };
  return { details: { scoring: cleanScoring(rawDetails?.scoring), text, blanks, distractors } };
}

// Coordonnee d'une zone : un pourcentage de 0 a 100, au dixieme.
const cleanPercent = (value) => {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number * 10) / 10 : null;
};

function validateDragImage(rawDetails) {
  const image = cleanText(rawDetails?.image);
  if (!image) return { error: "Ajoutez une image." };
  if (!IMAGE_KEY_PATTERN.test(image)) return { error: "L'image est invalide : téléversez-la de nouveau." };

  const rawZones = Array.isArray(rawDetails?.zones) ? rawDetails.zones : [];
  if (!rawZones.length) return { error: "Ajoutez au moins une zone sur l'image." };
  if (rawZones.length > MAX_PARTS) return { error: `Une image a au plus ${MAX_PARTS} zones.` };

  const zones = [];
  for (const rawZone of rawZones) {
    const what = `Zone ${zones.length + 1}`;
    const x = cleanPercent(rawZone?.x);
    const y = cleanPercent(rawZone?.y);
    if (x === null || y === null) return { error: `${what} : la position doit être entre 0 et 100 %.` };
    const answer = cleanText(rawZone?.answer);
    const error = getDragLabelError(answer, what);
    if (error) return { error };
    zones.push({ x, y, answer });
  }
  const { distractors, error } = validateDistractors(rawDetails?.distractors, zones.map((zone) => zone.answer));
  if (error) return { error };
  return { details: { scoring: cleanScoring(rawDetails?.scoring), image, zones, distractors } };
}

// Details d'une question de ce type -> { details } nettoyes, ou { error }.
export function validateQuestionDetails(type, rawDetails) {
  const details = parseQuestionDetails(rawDetails);
  if (type === QUESTION_PART_TYPES.CLOZE) return validateCloze(details);
  if (type === QUESTION_PART_TYPES.GRID) return validateGrid(details);
  if (type === QUESTION_PART_TYPES.DRAG_TEXT) return validateDragText(details);
  if (type === QUESTION_PART_TYPES.DRAG_IMAGE) return validateDragImage(details);
  return { details: null };
}

// Glisser-deposer : l'etiquette attendue dans chaque trou ou zone.
const getDragAnswers = (details) => details?.blanks || (details?.zones || []).map((zone) => zone.answer);

// Etiquettes a placer : bonnes reponses et intrus, en ordre alphabetique
// (leur ordre ne trahit pas les reponses).
export const getDragItems = (details) =>
  [...getDragAnswers(details), ...(details?.distractors || [])].sort((a, b) => a.localeCompare(b, "fr"));

// Ce que l'eleve voit pendant l'examen : jamais les bonnes reponses.
export function getStudentDetails(type, rawDetails) {
  const details = parseQuestionDetails(rawDetails);
  if (!details) return null;
  if (type === QUESTION_PART_TYPES.CLOZE) {
    return {
      scoring: details.scoring,
      text: details.text,
      blanks: (details.blanks || []).map((blank) =>
        blank.kind === "choice"
          ? { kind: "choice", options: (blank.options || []).map((option) => ({ label: option.label })) }
          : { kind: "text" }
      ),
    };
  }
  if (type === QUESTION_PART_TYPES.GRID) {
    return {
      scoring: details.scoring,
      multiple: Boolean(details.multiple),
      columns: details.columns || [],
      rows: (details.rows || []).map((row) => ({ label: row.label })),
    };
  }
  if (type === QUESTION_PART_TYPES.DRAG_TEXT) {
    return {
      scoring: details.scoring,
      text: details.text,
      blankCount: (details.blanks || []).length,
      items: getDragItems(details),
    };
  }
  if (type === QUESTION_PART_TYPES.DRAG_IMAGE) {
    return {
      scoring: details.scoring,
      image: details.image,
      zones: (details.zones || []).map(({ x, y }) => ({ x, y })),
      items: getDragItems(details),
    };
  }
  return null;
}

// Nombre de parties (trous, lignes ou zones). Les details de l'eleve d'un
// glisser-deposer sur texte n'ont que blankCount.
function partCount(type, details) {
  if (type === QUESTION_PART_TYPES.GRID) return details?.rows?.length || 0;
  if (type === QUESTION_PART_TYPES.DRAG_IMAGE) return details?.zones?.length || 0;
  if (type === QUESTION_PART_TYPES.DRAG_TEXT) return details?.blanks?.length ?? details?.blankCount ?? 0;
  return details?.blanks?.length || 0;
}

// --- Reponse de l'eleve ---

// Reponse enregistree -> une valeur par partie, toujours de la bonne taille
// (une reponse illisible compte comme vide).
export function parsePartsAnswer(type, rawDetails, answerText) {
  const details = parseQuestionDetails(rawDetails);
  const count = partCount(type, details);
  let values = [];
  try {
    const parsed = typeof answerText === "string" && answerText ? JSON.parse(answerText) : answerText;
    if (Array.isArray(parsed)) values = parsed;
  } catch {
    values = [];
  }
  const columnCount = details?.columns?.length || 0;
  return Array.from({ length: count }, (_, index) => {
    const value = values[index];
    if (type === QUESTION_PART_TYPES.GRID) {
      return Array.isArray(value)
        ? [...new Set(value.filter((column) => Number.isInteger(column) && column >= 0 && column < columnCount))].sort((a, b) => a - b)
        : [];
    }
    return typeof value === "string" ? value : "";
  });
}

// Validation stricte de ce que l'eleve envoie (serveur) : { answerText } ou { error }.
export function validatePartsAnswer(type, rawDetails, answerText) {
  const details = parseQuestionDetails(rawDetails);
  let values;
  try {
    values = JSON.parse(answerText);
  } catch {
    return { error: "La réponse est invalide." };
  }
  const count = partCount(type, details);
  if (!Array.isArray(values) || values.length > count) return { error: "La réponse est invalide." };

  if (type === QUESTION_PART_TYPES.GRID) {
    const columnCount = details.columns.length;
    for (const value of values) {
      if (!Array.isArray(value) || value.some((column) => !Number.isInteger(column) || column < 0 || column >= columnCount)) {
        return { error: "La réponse est invalide." };
      }
      if (!details.multiple && value.length > 1) return { error: "Une seule réponse par ligne." };
    }
  } else if (values.some((value) => typeof value !== "string" || value.length > MAX_PART_LABEL_LENGTH)) {
    return { error: "La réponse est invalide." };
  } else if (isDragQuestionType(type)) {
    // Seulement les etiquettes de la question, chacune placee une fois.
    const available = new Map();
    getDragItems(details).forEach((item) => available.set(normalizeAnswer(item), (available.get(normalizeAnswer(item)) || 0) + 1));
    for (const value of values.map(normalizeAnswer).filter(Boolean)) {
      if (!available.get(value)) return { error: "Cette étiquette n'est pas disponible." };
      available.set(value, available.get(value) - 1);
    }
  }

  const cleaned = JSON.stringify(parsePartsAnswer(type, details, values));
  if (cleaned.length > MAX_ANSWER_LENGTH) return { error: "La réponse est trop longue." };
  return { answerText: cleaned };
}

// --- Correction ---

// Une valeur par partie : true si elle est juste.
export function gradePartsAnswer(type, rawDetails, answerText) {
  const details = parseQuestionDetails(rawDetails);
  const values = parsePartsAnswer(type, details, answerText);
  if (type === QUESTION_PART_TYPES.CLOZE) {
    return (details?.blanks || []).map((blank, index) => {
      const value = normalizeAnswer(values[index]);
      if (!value) return false;
      if (blank.kind === "choice") {
        return (blank.options || []).some((option) => option.is_correct && normalizeAnswer(option.label) === value);
      }
      return (blank.answers || []).some((answer) => normalizeAnswer(answer) === value);
    });
  }
  if (type === QUESTION_PART_TYPES.GRID) {
    return (details?.rows || []).map((row, index) => {
      const expected = [...row.answers].sort((a, b) => a - b);
      return values[index].length === expected.length && values[index].every((column, position) => column === expected[position]);
    });
  }
  if (isDragQuestionType(type)) {
    return getDragAnswers(details).map((answer, index) => Boolean(values[index]) && normalizeAnswer(values[index]) === normalizeAnswer(answer));
  }
  return [];
}

// Points obtenus (arrondis au centieme, comme student_answers.score).
export function scorePartsAnswer(type, rawDetails, answerText, points) {
  const details = parseQuestionDetails(rawDetails);
  const results = gradePartsAnswer(type, details, answerText);
  if (!results.length) return 0;
  const correct = results.filter(Boolean).length;
  if (details.scoring === SCORING.ALL_OR_NOTHING) return correct === results.length ? points : 0;
  return Math.round((points * correct * 100) / results.length) / 100;
}

// Bonnes reponses, au format de la reponse de l'eleve (pour les afficher) :
// la bonne option ou la premiere reponse acceptee de chaque trou, les bonnes
// colonnes de chaque ligne.
export function getCorrectPartsAnswer(type, rawDetails) {
  const details = parseQuestionDetails(rawDetails);
  if (type === QUESTION_PART_TYPES.CLOZE) {
    return (details?.blanks || []).map((blank) =>
      blank.kind === "choice"
        ? blank.options.find((option) => option.is_correct)?.label || ""
        : blank.answers[0] || ""
    );
  }
  if (type === QUESTION_PART_TYPES.GRID) {
    return (details?.rows || []).map((row) => [...row.answers]);
  }
  if (isDragQuestionType(type)) return [...getDragAnswers(details)];
  return [];
}
