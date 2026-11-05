// Aide a l'ecriture du code dans les blocs Markdown de l'editeur GIFT
// (« ```python » ... « ``` », voir giftParser.js) : le langage du bloc, ses
// mots-cles et des modeles de base, comme VS Code sans extension. Rien n'est
// genere : ce sont des listes fixes et les mots deja ecrits dans le bloc.
import { FENCE_OPEN, closesFence } from "./giftParser.js";

// Langage Monaco -> noms acceptes apres « ``` » (dont les noms des
// prototypes Jobe : python3, nodejs, bash, csharp...).
export const FENCE_LANGUAGES = [
  { id: "python", names: ["python", "python3", "py"] },
  { id: "javascript", names: ["javascript", "js", "nodejs", "node"] },
  { id: "typescript", names: ["typescript", "ts"] },
  { id: "shell", names: ["bash", "sh", "shell"] },
  { id: "csharp", names: ["csharp", "cs", "c#"] },
  { id: "c", names: ["c"] },
  { id: "cpp", names: ["cpp", "c++"] },
  { id: "java", names: ["java"] },
  { id: "php", names: ["php"] },
  { id: "sql", names: ["sql"] },
];

// Premier mot apres « ``` » -> langage Monaco, ou null.
export function resolveFenceLanguage(tag) {
  const name = (tag || "").trim().toLowerCase();
  return FENCE_LANGUAGES.find((language) => language.names.includes(name))?.id || null;
}

const FENCE_TAG = /^(?:`{3,}|~{3,})\s*([^\s`]*)/;

// Le curseur (ligne `lineIndex`, a partir de 0) est-il dans un bloc ? Retourne
// { language, from, to } (lignes du code, sans les « ``` ») ou null. Memes
// regles d'ouverture et de fermeture que le parseur.
export function findFence(lines, lineIndex) {
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (fence) {
      if (closesFence(trimmed, fence.marker)) {
        if (lineIndex < index) return { language: fence.language, from: fence.from, to: index - 1 };
        fence = null;
      }
    } else if (index >= lineIndex) {
      return null;
    } else {
      const opening = FENCE_OPEN.exec(trimmed);
      if (opening) fence = { marker: opening[1], language: resolveFenceLanguage(FENCE_TAG.exec(trimmed)[1]), from: index + 1 };
    }
  }
  return fence ? { language: fence.language, from: fence.from, to: lines.length - 1 } : null;
}

// Mots-cles de secours, si Monaco ne donne pas les siens (voir giftMonaco.js).
export const FALLBACK_KEYWORDS = {
  python: [
    "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
    "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or",
    "pass", "raise", "return", "try", "while", "with", "yield", "print", "len", "range", "input", "int", "str", "float",
    "list", "dict", "set", "tuple", "bool", "abs", "min", "max", "sum", "sorted", "enumerate", "zip", "isinstance",
  ],
  javascript: [
    "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete", "do", "else", "export",
    "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "let", "new", "null", "of",
    "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "undefined", "var", "while", "yield",
    "console", "require", "module", "exports",
  ],
  shell: [
    "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "in", "function", "return",
    "local", "export", "echo", "printf", "read", "exit", "shift", "test",
  ],
  csharp: [
    "abstract", "bool", "break", "case", "catch", "char", "class", "const", "continue", "decimal", "default", "do",
    "double", "else", "enum", "false", "finally", "float", "for", "foreach", "if", "in", "int", "interface", "internal",
    "long", "namespace", "new", "null", "object", "out", "override", "private", "protected", "public", "readonly", "ref",
    "return", "static", "string", "struct", "switch", "this", "throw", "true", "try", "using", "var", "virtual", "void",
    "while", "Console",
  ],
};

// Modeles de base, syntaxe des snippets Monaco : { prefix, detail, body }.
export const CODE_SNIPPETS = {
  python: [
    { prefix: "def", detail: "Fonction", body: "def ${1:nom}(${2:parametres}):\n\t${3:pass}" },
    { prefix: "if", detail: "Condition", body: "if ${1:condition}:\n\t${2:pass}" },
    { prefix: "ifelse", detail: "Condition avec else", body: "if ${1:condition}:\n\t${2:pass}\nelse:\n\t${3:pass}" },
    { prefix: "for", detail: "Boucle for", body: "for ${1:element} in ${2:sequence}:\n\t${3:pass}" },
    { prefix: "forrange", detail: "Boucle sur range", body: "for ${1:i} in range(${2:n}):\n\t${3:pass}" },
    { prefix: "while", detail: "Boucle while", body: "while ${1:condition}:\n\t${2:pass}" },
    { prefix: "class", detail: "Classe", body: "class ${1:Nom}:\n\tdef __init__(self${2:, parametres}):\n\t\t${3:pass}" },
    { prefix: "try", detail: "try / except", body: "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:erreur}:\n\t${4:pass}" },
    { prefix: "print", detail: "Afficher", body: "print(${1})" },
  ],
  javascript: [
    { prefix: "function", detail: "Fonction", body: "function ${1:nom}(${2:parametres}) {\n\t${3}\n}" },
    { prefix: "arrow", detail: "Fonction fléchée", body: "const ${1:nom} = (${2:parametres}) => ${3:valeur};" },
    { prefix: "if", detail: "Condition", body: "if (${1:condition}) {\n\t${2}\n}" },
    { prefix: "ifelse", detail: "Condition avec else", body: "if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}" },
    { prefix: "for", detail: "Boucle for", body: "for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}" },
    { prefix: "forof", detail: "Boucle for...of", body: "for (const ${1:element} of ${2:tableau}) {\n\t${3}\n}" },
    { prefix: "while", detail: "Boucle while", body: "while (${1:condition}) {\n\t${2}\n}" },
    { prefix: "class", detail: "Classe", body: "class ${1:Nom} {\n\tconstructor(${2:parametres}) {\n\t\t${3}\n\t}\n}" },
    { prefix: "trycatch", detail: "try / catch", body: "try {\n\t${1}\n} catch (${2:erreur}) {\n\t${3}\n}" },
    { prefix: "log", detail: "console.log", body: "console.log(${1});" },
  ],
  shell: [
    { prefix: "if", detail: "Condition", body: "if [ ${1:condition} ]; then\n\t${2}\nfi" },
    { prefix: "for", detail: "Boucle for", body: "for ${1:element} in ${2:liste}; do\n\t${3}\ndone" },
    { prefix: "while", detail: "Boucle while", body: "while [ ${1:condition} ]; do\n\t${2}\ndone" },
    { prefix: "function", detail: "Fonction", body: "${1:nom}() {\n\t${2}\n}" },
    { prefix: "echo", detail: "Afficher", body: "echo \"${1}\"" },
  ],
  csharp: [
    { prefix: "cw", detail: "Console.WriteLine", body: "Console.WriteLine(${1});" },
    { prefix: "if", detail: "Condition", body: "if (${1:condition})\n{\n\t${2}\n}" },
    { prefix: "for", detail: "Boucle for", body: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++)\n{\n\t${3}\n}" },
    { prefix: "foreach", detail: "Boucle foreach", body: "foreach (var ${1:element} in ${2:collection})\n{\n\t${3}\n}" },
    { prefix: "while", detail: "Boucle while", body: "while (${1:condition})\n{\n\t${2}\n}" },
    { prefix: "class", detail: "Classe", body: "public class ${1:Nom}\n{\n\t${2}\n}" },
    { prefix: "method", detail: "Méthode", body: "public static ${1:void} ${2:Nom}(${3})\n{\n\t${4}\n}" },
  ],
};
CODE_SNIPPETS.typescript = CODE_SNIPPETS.javascript;

// Suggestions pour le curseur dans un bloc : modeles, mots-cles, puis les
// mots deja ecrits dans le bloc. `currentWord` (le mot en cours de frappe)
// n'est pas propose. Retourne [{ kind: "snippet" | "keyword" | "word",
// label, detail, insertText }].
export function getCodeSuggestions({ language, keywords = null, code = "", currentWord = "" }) {
  const snippets = CODE_SNIPPETS[language] || [];
  const keywordList = keywords || FALLBACK_KEYWORDS[language] || [];
  const seen = new Set();
  const suggestions = [];
  const add = (suggestion) => {
    if (seen.has(`${suggestion.kind}:${suggestion.label}`)) return;
    seen.add(`${suggestion.kind}:${suggestion.label}`);
    suggestions.push(suggestion);
  };

  snippets.forEach((snippet) => add({ kind: "snippet", label: snippet.prefix, detail: snippet.detail, insertText: snippet.body }));
  keywordList.forEach((keyword) => add({ kind: "keyword", label: keyword, detail: "Mot-clé", insertText: keyword }));
  const keywordSet = new Set(keywordList);
  (code.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
    .filter((word) => word.length > 1 && word !== currentWord && !keywordSet.has(word))
    .forEach((word) => add({ kind: "word", label: word, detail: "Dans ce bloc", insertText: word }));
  return suggestions;
}
