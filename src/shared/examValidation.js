// Regles des formulaires d'examen et de question, partagees par la
// validation en direct (pendant la frappe) et par la validation a
// l'enregistrement. Memes regles que le serveur, qui revalide toujours :
// ceci ne sert qu'a afficher l'erreur sous le champ.
// Chaque fonction retourne le message d'erreur, ou "" si la valeur est valide.

export const EXAM_TITLE_MIN_LENGTH = 3;
export const EXAM_TITLE_MAX_LENGTH = 100;
// Enonce : la regle qui compte est celle de buildQuestionData
// (examController.js), plus stricte que le modele Question.
export const QUESTION_LABEL_MIN_LENGTH = 3;
export const QUESTION_LABEL_MAX_LENGTH = 1000;

// --- Examen ---

export function getExamTitleError(title) {
  const length = (title || "").trim().length;
  return length < EXAM_TITLE_MIN_LENGTH || length > EXAM_TITLE_MAX_LENGTH
    ? `Le titre doit contenir entre ${EXAM_TITLE_MIN_LENGTH} et ${EXAM_TITLE_MAX_LENGTH} caractères.`
    : "";
}

export function getReleaseDateError(releaseDate) {
  return !releaseDate || Number.isNaN(new Date(releaseDate).getTime())
    ? "La date de passation est obligatoire."
    : "";
}

export function getDurationError(durationMinutes) {
  const duration = Number(durationMinutes);
  return !Number.isInteger(duration) || duration <= 0
    ? "La durée doit être un entier positif (en minutes)."
    : "";
}

// --- Question ---

export function getQuestionLabelError(label) {
  const length = (label || "").trim().length;
  if (!length) return "L'énoncé est requis.";
  if (length < QUESTION_LABEL_MIN_LENGTH || length > QUESTION_LABEL_MAX_LENGTH) {
    return `L'énoncé doit contenir entre ${QUESTION_LABEL_MIN_LENGTH} et ${QUESTION_LABEL_MAX_LENGTH} caractères.`;
  }
  return "";
}

export function getPointsError(points) {
  const value = Number(points);
  return points === "" || points === null || !Number.isFinite(value) || value <= 0
    ? "Les points doivent être un nombre positif."
    : "";
}

export function getCorrectAnswerError(correctAnswer) {
  return (correctAnswer || "").trim() ? "" : "La réponse attendue est requise.";
}

// Libelle d'une option : meme regle que validateChoicePayload (serveur).
export const OPTION_LABEL_MIN_LENGTH = 3;
export const OPTION_LABEL_MAX_LENGTH = 255;

// Une option vide n'est pas une erreur : elle est ignoree a l'enregistrement.
export function getOptionLabelError(label) {
  const length = (label || "").trim().length;
  if (!length) return "";
  return length < OPTION_LABEL_MIN_LENGTH || length > OPTION_LABEL_MAX_LENGTH
    ? `Une option doit contenir entre ${OPTION_LABEL_MIN_LENGTH} et ${OPTION_LABEL_MAX_LENGTH} caractères.`
    : "";
}

// Choix multiples : au moins minOptions options remplies.
export function getOptionsError(options, minOptions = 2) {
  const filled = (options || []).filter((option) => (option.label || "").trim());
  return filled.length < minOptions ? `Ajoutez au moins ${minOptions} options.` : "";
}

// Une option remplie doit etre marquee comme correcte.
export function getCorrectOptionError(options) {
  const hasCorrect = (options || []).some((option) => option.isCorrect === true && (option.label || "").trim());
  return hasCorrect ? "" : "Marquez une option comme correcte.";
}
