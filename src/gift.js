// Code de l'editeur GIFT du site, repris tel quel : l'extension et le site
// lisent le GIFT de la meme facon (memes erreurs, memes types de questions).
// esbuild l'integre a dist/extension.js (voir esbuild.mjs).
export { GIFT_SEVERITY, getCodeFiles, parseGift } from "../../frontend/src/utils/giftParser.js";
export { GIFT_COMPLETION_SNIPPETS, GIFT_SNIPPETS, renderSnippet } from "../../frontend/src/utils/giftSnippets.js";
export { findFence } from "../../frontend/src/utils/giftCodeAssist.js";
export { GIFT_TRIGGER_CHARACTERS, getGiftCompletions, isInsideAnswers } from "../../frontend/src/utils/giftCompletions.js";
export { getCorrectPartsAnswer, isDragQuestionType } from "../../frontend/src/utils/questionParts.js";
export { formatQuestionType } from "../../frontend/src/utils/examUtils.js";
