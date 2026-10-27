// Suggestions pendant la frappe : celles de l'editeur du site
// (giftCompletions.js), selon la position du curseur. Dans un bloc de code,
// rien : VS Code y propose celles du langage du bloc.
import { GIFT_SNIPPETS } from "./gift.js";

export { GIFT_TRIGGER_CHARACTERS, getGiftCompletions, isInsideAnswers } from "./gift.js";

// Boutons « Ajouter » du site, pour la commande « Ajouter une question ».
// Sans « Glisser sur image » : son image se televerse sur le site.
export const INSERTABLE_SNIPPETS = GIFT_SNIPPETS.filter((snippet) => !snippet.needsImage);

// Separateur a mettre avant un modele ajoute a la fin du document : une
// ligne vide entre deux questions (memes regles que insertGiftSnippet).
export function separatorBefore(content) {
  if (!content.trim()) return "";
  if (/\n\s*\n\s*$/.test(content)) return "";
  if (content.endsWith("\n")) return "\n";
  return "\n\n";
}
