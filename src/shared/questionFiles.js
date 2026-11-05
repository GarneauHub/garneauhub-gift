// Fichiers attendus d'une question de code (issue #105).
// Memes regles que backend/utils/questionFiles.js : le serveur revalide
// toujours, ceci sert seulement a afficher l'erreur sous le champ.

export const MAX_QUESTION_FILES = 5;
const MAX_FILE_NAME_LENGTH = 64;
const FILE_NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

// Nom propose dans le champ selon le langage de l'editeur du prototype.
const EXAMPLE_FILE_NAMES = {
  python: "main.py",
  shell: "script.sh",
  csharp: "Program.cs",
  javascript: "index.js",
};

export const exampleFileName = (editorLanguage) =>
  EXAMPLE_FILE_NAMES[editorLanguage] || EXAMPLE_FILE_NAMES.javascript;

// --- Reponse attendue d'une question a plusieurs fichiers ---
// Stockee dans correct_answer sous forme d'objet JSON { "main.py": "..." }.
// Une ancienne reponse en texte simple (question a un seul fichier) n'est
// pas un objet JSON : on renvoie alors null.
export function parseFileAnswers(correctAnswer) {
  if (!correctAnswer || typeof correctAnswer !== "string") return null;
  try {
    const parsed = JSON.parse(correctAnswer);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Contenu d'un fichier dans un objet { nom: contenu }, ou null s'il manque.
// Object.hasOwn : un fichier nomme __proto__ ou toString reste un nom ordinaire.
export function getFileContent(contents, name) {
  const value = contents && Object.hasOwn(contents, name) ? contents[name] : null;
  return typeof value === "string" ? value : null;
}

// Vue de correction : le code commente par le prof, fichier par fichier.
// Le commentaire a le meme format { nom: contenu } que la reponse de l'eleve ;
// un fichier pas encore commente affiche le code de l'eleve.
export function getCommentedFiles(files, answerText, comment) {
  const studentFiles = parseFileAnswers(answerText);
  const commentedFiles = parseFileAnswers(comment);
  return Object.fromEntries(files.map(({ name }) => [
    name,
    getFileContent(commentedFiles, name) ?? getFileContent(studentFiles, name) ?? "",
  ]));
}

// Construit correct_answer a partir des fichiers ({ name, solution }).
export const buildFileAnswers = (files) =>
  JSON.stringify(Object.fromEntries(files.map((file) => [file.name, file.solution || ""])));

// Repasse en un seul fichier (le prof a retire tous les fichiers) : on garde
// la reponse du premier fichier plutot que l'objet JSON.
export function toSingleFileAnswer(correctAnswer) {
  const answers = parseFileAnswers(correctAnswer);
  if (!answers) return correctAnswer || "";
  const [firstAnswer = ""] = Object.values(answers);
  return typeof firstAnswer === "string" ? firstAnswer : "";
}

// Probleme d'un nom seul (deja sans espaces autour), ou "" s'il est valide.
function getFileNameError(name) {
  if (!name) return "Chaque fichier doit avoir un nom.";
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return `Le nom « ${name} » dépasse ${MAX_FILE_NAME_LENGTH} caractères.`;
  }
  if (!FILE_NAME_PATTERN.test(name) || name.includes("..") || name.endsWith(".")) {
    return `Le nom « ${name} » est invalide : lettres, chiffres, _ - et . seulement, sans dossier.`;
  }
  return "";
}

// Retourne le premier probleme de la liste, ou "" si elle est valide.
export function getQuestionFilesError(files) {
  if (files.length > MAX_QUESTION_FILES) {
    return `Une question ne peut pas demander plus de ${MAX_QUESTION_FILES} fichiers.`;
  }
  const seenNames = new Set();
  for (const file of files) {
    const name = (file.name || "").trim();
    const error = getFileNameError(name);
    if (error) return error;
    const key = name.toLowerCase();
    if (seenNames.has(key)) return `Le fichier « ${name} » est en double.`;
    seenNames.add(key);
  }
  return "";
}

// Fichiers a enregistrer. Une ligne sans nom et sans contenu est ignoree,
// comme une option vide (le prof a clique « Ajouter un fichier » pour rien).
// Sans nom mais avec du code (de depart ou reponse attendue), on refuse :
// ce code serait perdu sans que le prof le sache.
// Retourne { files, error } : les fichiers nommes, et le premier probleme ("" sinon).
export function getFilesToSave(files) {
  const namedFiles = [];
  for (const file of files || []) {
    const name = (file.name || "").trim();
    if (name) {
      namedFiles.push({ ...file, name });
    } else if ((file.starter || "").trim() || (file.solution || "").trim()) {
      return { files: [], error: "Un fichier sans nom contient du code : donnez-lui un nom ou retirez-le." };
    }
  }
  return { files: namedFiles, error: getQuestionFilesError(namedFiles) };
}

// Validation en direct : l'erreur de chaque nom, affichee sous son champ
// pendant que le prof tape ("" = valide). Un nom vide n'est pas signale
// (le prof est peut-etre en train de l'ecrire) : getQuestionFilesError le
// refuse a l'enregistrement.
export function getFileNameErrors(files) {
  const counts = new Map();
  for (const file of files) {
    const key = (file.name || "").trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return files.map((file) => {
    const name = (file.name || "").trim();
    if (!name) return "";
    return getFileNameError(name)
      || (counts.get(name.toLowerCase()) > 1 ? `Le fichier « ${name} » est en double.` : "");
  });
}
