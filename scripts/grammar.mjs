// Ecrit syntaxes/gift.tmLanguage.json, la coloration de VS Code (grammaire
// TextMate). Memes regles que le langage Monaco du site
// (giftMonaco.js du site, frontend/src/utils). Lance par « npm run build ».
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Blocs de code Markdown : memes noms que FENCE_LANGUAGES
// (src/shared/giftCodeAssist.js). `id` : langage de VS Code (voir
// embeddedLanguages dans package.json), `scope` : sa grammaire.
export const FENCE_GRAMMARS = [
  { id: "python", names: ["python", "python3", "py"], scope: "source.python" },
  { id: "javascript", names: ["javascript", "js", "nodejs", "node"], scope: "source.js" },
  { id: "typescript", names: ["typescript", "ts"], scope: "source.ts" },
  { id: "shellscript", names: ["bash", "sh", "shell"], scope: "source.shell" },
  { id: "csharp", names: ["csharp", "cs", "c#"], scope: "source.cs" },
  { id: "c", names: ["c"], scope: "source.c" },
  { id: "cpp", names: ["cpp", "c++"], scope: "source.cpp" },
  { id: "java", names: ["java"], scope: "source.java" },
  { id: "php", names: ["php"], scope: "source.php" },
  { id: "sql", names: ["sql"], scope: "source.sql" },
];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Meme liste que DIRECTIVE (src/shared/giftParser.js).
const DIRECTIVE_NAMES = String.raw`points?|code|test|solution|starter|type|notation|colonnes|image|zone|[ée]nonc[ée]`;

// La fermeture reprend le caractere de l'ouverture (``` ou ~~~), au moins
// aussi long, sans texte apres.
const FENCE_END = String.raw`^\s*(\1[\x60~]*)\s*$`;
const fenceCaptures = { 1: { name: "punctuation.definition.fence.gift" }, 2: { name: "fenced_code.block.language.gift" } };

// Le code est lu par la grammaire de son langage, ligne par ligne tant que la
// ligne n'est pas une cloture (« while », comme la grammaire Markdown de VS
// Code) : une chaine jamais fermee dans le code ne deborde pas du bloc.
const fence = ({ id, names, scope }) => ({
  name: `markup.fenced_code.block.${id}.gift`,
  begin: String.raw`^\s*(\x60{3,}|~{3,})\s*((?i:${names.map(escapeRegExp).join("|")}))\s*$`,
  beginCaptures: fenceCaptures,
  end: FENCE_END,
  endCaptures: { 1: { name: "punctuation.definition.fence.gift" } },
  patterns: [
    {
      begin: String.raw`(^|\G)(\s*)(.*)`,
      while: String.raw`(^|\G)(?!\s*([\x60~]{3,})\s*$)`,
      contentName: `meta.embedded.block.${id}`,
      patterns: [{ include: scope }],
    },
  ],
});

export const grammar = {
  $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  name: "GIFT (GarneauHub)",
  scopeName: "text.gift",
  comment: "Fichier genere par scripts/grammar.mjs : modifier le script, pas ce fichier.",
  patterns: [
    { include: "#directive" },
    { include: "#fences" },
    { include: "#comment" },
    { include: "#category" },
    { include: "#title" },
    { include: "#format" },
    { include: "#escape" },
    { include: "#drag-blank" },
    { include: "#answers" },
  ],
  repository: {
    // Directives de GarneauHub : « // points: 2 », « // solution main.py: ».
    directive: {
      patterns: [
        {
          name: "meta.directive.gift",
          match: String.raw`^\s*(//) ?((?i:${DIRECTIVE_NAMES}))((?:[ \t]+[^\s:=]+)?)[ \t]*([:=])(.*)$`,
          captures: {
            1: { name: "punctuation.definition.comment.gift" },
            2: { name: "keyword.control.directive.gift" },
            3: { name: "variable.parameter.directive.gift" },
            4: { name: "punctuation.separator.directive.gift" },
            5: { name: "string.unquoted.directive.gift" },
          },
        },
        {
          name: "meta.directive.gift",
          match: String.raw`^\s*(//) ?(=>)(.*)$`,
          captures: {
            1: { name: "punctuation.definition.comment.gift" },
            2: { name: "keyword.control.directive.gift" },
            3: { name: "string.unquoted.directive.gift" },
          },
        },
      ],
    },
    // Bloc de code apres une directive : colore comme son langage.
    fences: {
      patterns: [
        ...FENCE_GRAMMARS.map(fence),
        {
          name: "markup.fenced_code.block.gift",
          begin: String.raw`^\s*(\x60{3,}|~{3,})([^\x60]*)$`,
          beginCaptures: fenceCaptures,
          end: FENCE_END,
          endCaptures: { 1: { name: "punctuation.definition.fence.gift" } },
          contentName: "markup.raw.block.gift",
        },
      ],
    },
    comment: { name: "comment.line.double-slash.gift", match: String.raw`^\s*//.*$` },
    category: { name: "comment.line.category.gift", match: String.raw`^\s*\$(?i:CATEGORY)\s*:.*$` },
    title: {
      name: "entity.name.section.title.gift",
      match: "(::)(.*?)(::)",
      captures: { 1: { name: "punctuation.definition.title.gift" }, 3: { name: "punctuation.definition.title.gift" } },
    },
    format: { name: "storage.type.format.gift", match: String.raw`\[(?:html|markdown|plain|moodle)\]` },
    escape: { name: "constant.character.escape.gift", match: String.raw`\\.` },
    // Trou d'un glisser sur texte : [[réponse]].
    "drag-blank": {
      name: "meta.blank.gift",
      match: String.raw`(\[\[)(.*?)(\]\])`,
      captures: {
        1: { name: "punctuation.definition.blank.gift" },
        2: { name: "string.other.blank.gift" },
        3: { name: "punctuation.definition.blank.gift" },
      },
    },
    answers: {
      name: "meta.answers.gift",
      begin: String.raw`\{`,
      beginCaptures: { 0: { name: "punctuation.section.answers.begin.gift" } },
      end: String.raw`\}`,
      endCaptures: { 0: { name: "punctuation.section.answers.end.gift" } },
      patterns: [
        { include: "#comment" },
        { include: "#escape" },
        // Trou d'un texte a trous : {:SA: a | b} ou {:MC: =a ~b}.
        { name: "storage.type.cloze.gift", match: String.raw`:(?i:SA|MC):` },
        { name: "punctuation.separator.alternative.gift", match: String.raw`\|` },
        { name: "keyword.operator.match.gift", match: "->" },
        { name: "constant.language.boolean.gift", match: String.raw`\b(?i:T|TRUE|F|FALSE)\b(?=\s*[#}])` },
        { name: "keyword.operator.correct.gift", match: "=" },
        { name: "keyword.operator.wrong.gift", match: "~" },
        { name: "constant.numeric.weight.gift", match: String.raw`%-?\d+(?:[.,]\d+)?%` },
        { name: "comment.block.feedback.gift", match: String.raw`#[^=~}\\]*` },
        { name: "string.unquoted.answer.gift", match: String.raw`[^\\{}=~#%|\-]+|-` },
      ],
    },
  },
};

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(root, "syntaxes", "gift.tmLanguage.json"), `${JSON.stringify(grammar, null, 2)}\n`);
  console.log("syntaxes/gift.tmLanguage.json écrit.");
}
