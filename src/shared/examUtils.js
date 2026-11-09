export function extractExamsFromResponse(responseData) {
  if (Array.isArray(responseData?.exams)) return responseData.exams;
  return [];
}

export function computeTotalPointsFromQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return 0;
  }
  return questions.reduce((total, question) => {
    return total + (question.points || 0);
  }, 0);
}

export function formatExamState(state, exam = null) {
  if (state === "results_published" || (state === "graded" && exam && exam.actions?.canPublishResults === false)) {
    return "Résultats publiés";
  }
  const map = {
    in_preparation: "en préparation",
    published: "publié",
    completed: "Terminé",
    graded: "Corrigé",
    archived: "archivé",
  };
  return map[state] || state || "-";
}

// Types de questions, dans l'ordre des menus (meme liste que le backend :
// backend/utils/questionTypes.js).
export const QUESTION_TYPE_VALUES = ["multiple_choice", "true_false", "text", "code", "cloze", "grid", "drag_text", "drag_image"];

export function formatQuestionType(type) {
  const map = {
    multiple_choice: "Choix multiples",
    true_false: "Vrai / Faux",
    text: "Réponse texte",
    code: "Code",
    cloze: "Texte à trous",
    grid: "Grille",
    drag_text: "Glisser-déposer sur texte",
    drag_image: "Glisser-déposer sur image",
  };
  return map[type] || type || "Type";
}

// Enonce affiche dans les listes.
export function formatQuestionLabel(question) {
  return question?.label || "";
}

export function formatDate(dateValue) {
  if (!dateValue) return "Date à venir";
  try {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Date à venir";

    const day = date.getDate();
    const monthNames = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day} ${month} ${year}, ${hours} h ${minutes}`;
  } catch (error) {
    return "Date à venir";
  }
}

export const canPublishExam = (exam) => Boolean(exam?.actions?.canPublish);
export const canTerminateExam = (exam) => Boolean(exam?.actions?.canTerminate);
// Publie : on corrige deja les copies remises pendant que d'autres groupes ecrivent.
export const canCorrectExam = (exam) =>
  Boolean(exam?.actions?.canCorrect && ["published", "completed"].includes(exam?.status));
export const canPublishExamResults = (exam) => Boolean(exam?.actions?.canPublishResults && exam?.status === "graded");

export function areResultsPublished(exam) {
  if (!exam) return false;
  return exam.status === "results_published" || (exam.status === "graded" && exam.actions?.canPublishResults === false);
}

export function canArchiveExam(exam) {
  if (!exam || exam.status === "published" || exam.status === "archived") {
    return false;
  }
  return true;
}

export function canEditExam(exam) {
  if (exam?.actions && typeof exam.actions.canEdit === "boolean") {
    return exam.actions.canEdit;
  }
  return exam?.status === "in_preparation";
}

export function getEditTooltip(exam) {
  return canEditExam(exam) ? "Modifier l'examen" : "Impossible de modifier un examen publié";
}

export function getArchiveTooltip(exam) {
  if (canArchiveExam(exam)) {
    return "Archiver";
  }
  if (exam?.status === "published") {
    return "Impossible d'archiver un examen publié";
  }
  if (exam?.status === "archived") {
    return "Cet examen est déjà archivé";
  }
  return "Archivage indisponible";
}

export function getExamLifecycleAction(exam) {
  if (canPublishExam(exam)) {
    return { label: "Publier", variant: "glass-success" };
  }
  if (canTerminateExam(exam)) {
    return { label: "Terminer", variant: "glass-success" };
  }
  if (canCorrectExam(exam)) {
    return { label: "Corriger", variant: "glass-info" };
  }
  return null;
}

export function generateRandomId() {
  return Math.random().toString(36).slice(2, 9);
}
