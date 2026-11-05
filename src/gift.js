// Code de l'editeur GIFT du site (copie dans src/shared) : l'extension et le site
// lisent le GIFT de la meme facon (memes erreurs, memes types de questions).
// esbuild l'integre a dist/extension.js (voir esbuild.mjs).
export { GIFT_SEVERITY, getCodeFiles, parseGift } from "./shared/giftParser.js";
export { GIFT_COMPLETION_SNIPPETS, GIFT_SNIPPETS, renderSnippet } from "./shared/giftSnippets.js";
export { findFence } from "./shared/giftCodeAssist.js";
export { GIFT_TRIGGER_CHARACTERS, getGiftCompletions, isInsideAnswers } from "./shared/giftCompletions.js";
export { getCorrectPartsAnswer, isDragQuestionType } from "./shared/questionParts.js";
export { formatQuestionType } from "./shared/examUtils.js";
