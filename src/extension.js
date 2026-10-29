// Extension VS Code « GarneauHub GIFT » : le format GIFT de l'editeur du site
// dans VS Code. La coloration est dans syntaxes/ (grammaire TextMate) ; ce
// fichier ajoute les erreurs soulignees, les modeles de questions, la
// structure (vue « Structure », repli, barre d'etat) et l'apercu de l'examen.
import * as vscode from "vscode";
import { GIFT_SEVERITY, parseGift } from "./gift.js";
import { GIFT_TRIGGER_CHARACTERS, INSERTABLE_SNIPPETS, getGiftCompletions, separatorBefore } from "./completions.js";
import { renderPreview } from "./previewHtml.js";
import { foldingRanges, questionOutline, statusSummary } from "./outline.js";

const LANGUAGE_ID = "gift";
// Delai apres la derniere frappe avant de relire le document (ms).
const PARSE_DELAY = 200;

const SEVERITIES = {
  [GIFT_SEVERITY.ERROR]: vscode.DiagnosticSeverity.Error,
  [GIFT_SEVERITY.WARNING]: vscode.DiagnosticSeverity.Warning,
  [GIFT_SEVERITY.INFO]: vscode.DiagnosticSeverity.Information,
};

const isGift = (document) => document?.languageId === LANGUAGE_ID;

// Derniere lecture de chaque document, par version : la structure, le repli
// et la barre d'etat la reutilisent au lieu de relire le texte.
const parseCache = new Map();
const getParsed = (document) => {
  const key = document.uri.toString();
  const cached = parseCache.get(key);
  if (cached?.version === document.version) return cached.parsed;
  const parsed = parseGift(document.getText());
  parseCache.set(key, { version: document.version, parsed });
  return parsed;
};

// Lignes et colonnes de parseGift : a partir de 1, fin exclue (comme Monaco).
const toRange = (diagnostic) => new vscode.Range(
  diagnostic.startLine - 1, diagnostic.startColumn - 1, diagnostic.endLine - 1, diagnostic.endColumn - 1
);

export function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  const timers = new Map();
  const preview = createPreview(context);
  const status = createStatusBar();

  // Une lecture par modification : elle sert aux erreurs et a l'apercu.
  const update = (document) => {
    if (!isGift(document)) return;
    const parsed = getParsed(document);
    diagnostics.set(document.uri, parsed.diagnostics.map((diagnostic) => {
      const item = new vscode.Diagnostic(toRange(diagnostic), diagnostic.message, SEVERITIES[diagnostic.severity]);
      item.source = "GIFT";
      return item;
    }));
    preview.refresh(document, parsed);
    if (vscode.window.activeTextEditor?.document === document) status.show(parsed);
  };

  const scheduleUpdate = (document) => {
    if (!isGift(document)) return;
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      update(document);
    }, PARSE_DELAY));
  };

  context.subscriptions.push(
    diagnostics,
    status.item,
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleUpdate(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      parseCache.delete(document.uri.toString());
    }),
    // L'apercu suit le fichier GIFT actif, comme l'apercu Markdown.
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!isGift(editor?.document)) {
        status.hide();
        return;
      }
      const parsed = getParsed(editor.document);
      preview.follow(editor.document, parsed);
      status.show(parsed);
    }),
    vscode.languages.registerDocumentSymbolProvider(LANGUAGE_ID, { provideDocumentSymbols }),
    vscode.languages.registerFoldingRangeProvider(LANGUAGE_ID, { provideFoldingRanges }),
    vscode.languages.registerCompletionItemProvider(LANGUAGE_ID, { provideCompletionItems }, ...GIFT_TRIGGER_CHARACTERS),
    vscode.commands.registerCommand("garneauhubGift.insertQuestion", insertQuestion),
    vscode.commands.registerCommand("garneauhubGift.showPreview", () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!isGift(document)) {
        vscode.window.showInformationMessage("Ouvrez un fichier .gift pour voir l'aperçu de l'examen.");
        return;
      }
      preview.show(document, getParsed(document));
    }),
  );

  vscode.workspace.textDocuments.forEach(update);
  if (isGift(vscode.window.activeTextEditor?.document)) status.show(getParsed(vscode.window.activeTextEditor.document));
}

export function deactivate() {}

// Types de suggestions -> icones de VS Code.
const COMPLETION_KINDS = {
  snippet: vscode.CompletionItemKind.Snippet,
  directive: vscode.CompletionItemKind.Keyword,
  value: vscode.CompletionItemKind.Value,
  answer: vscode.CompletionItemKind.Snippet,
};

function provideCompletionItems(document, position, token, context) {
  const lines = document.getText().replace(/\r\n?/g, "\n").split("\n");
  const result = getGiftCompletions(lines, position.line, position.character, { triggerCharacter: context.triggerCharacter });
  if (!result) return [];
  const range = new vscode.Range(position.line, result.from, position.line, position.character);
  return result.items.map((item, index) => {
    const completion = new vscode.CompletionItem(item.label, COMPLETION_KINDS[item.kind]);
    completion.detail = item.detail;
    if (item.documentation) completion.documentation = new vscode.MarkdownString(item.documentation);
    completion.insertText = new vscode.SnippetString(item.insertText);
    completion.filterText = item.filterText;
    completion.sortText = String(index).padStart(3, "0");
    completion.range = range;
    // « type: », « notation: »... : la liste se rouvre sur les valeurs.
    if (item.retrigger) completion.command = { command: "editor.action.triggerSuggest", title: "" };
    return completion;
  });
}

// Vue « Structure », fil d'Ariane et Ctrl+Maj+O : une entree par question.
function provideDocumentSymbols(document) {
  return questionOutline(document.getText(), getParsed(document).questions).map((entry) => {
    const range = new vscode.Range(entry.startLine, 0, entry.endLine, document.lineAt(entry.endLine).text.length);
    const selection = document.lineAt(entry.selectionLine).range;
    const name = entry.valid ? entry.name : `${entry.name} (à corriger)`;
    return new vscode.DocumentSymbol(name, entry.detail, vscode.SymbolKind.Object, range, selection);
  });
}

// Repli : chaque question et chaque bloc de code ```.
function provideFoldingRanges(document) {
  return foldingRanges(document.getText()).map((range) => new vscode.FoldingRange(range.startLine, range.endLine));
}

// Barre d'etat : nombre de questions, total des points et erreurs du fichier
// GIFT actif. Un clic ouvre l'apercu.
function createStatusBar() {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.name = "GarneauHub GIFT";
  item.command = "garneauhubGift.showPreview";
  item.tooltip = "Ouvrir l'aperçu de l'examen";
  return {
    item,
    show(parsed) {
      item.text = `${parsed.errorCount ? "$(error)" : "$(checklist)"} ${statusSummary(parsed)}`;
      item.show();
    },
    hide() {
      item.hide();
    },
  };
}

// Commande « Ajouter une question » : les boutons « Ajouter » du site. Le
// modele est ajoute a la fin du document, separe par une ligne vide.
async function insertQuestion() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isGift(editor.document)) return;
  const choice = await vscode.window.showQuickPick(
    INSERTABLE_SNIPPETS.map((snippet) => ({ label: snippet.label, description: snippet.description, snippet })),
    { placeHolder: "Type de question à ajouter" }
  );
  if (!choice) return;
  const { document } = editor;
  const end = document.lineAt(document.lineCount - 1).range.end;
  const separator = separatorBefore(document.getText()).replace(/[$}\\]/g, "\\$&");
  await editor.insertSnippet(new vscode.SnippetString(separator + choice.snippet.body), end);
  editor.revealRange(new vscode.Range(end, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// Panneau d'apercu, a cote de l'editeur. Un seul a la fois : il montre le
// dernier fichier GIFT actif.
function createPreview(context) {
  let panel = null;
  let documentUri = null;

  const render = (document, parsed) => {
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    const fileName = document.uri.path.split("/").pop();
    panel.title = `Aperçu · ${fileName}`;
    panel.webview.html = renderPreview(parsed, {
      cspSource: panel.webview.cspSource,
      nonce,
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "preview.css")).toString(),
      fileName,
    });
  };

  // Clic sur une question ou un probleme : curseur a cette ligne.
  const goTo = async ({ line, column }) => {
    if (!documentUri) return;
    const document = await vscode.workspace.openTextDocument(documentUri);
    const visible = vscode.window.visibleTextEditors.find((editor) => editor.document === document);
    const editor = await vscode.window.showTextDocument(document, visible?.viewColumn ?? vscode.ViewColumn.One);
    const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, (column || 1) - 1));
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  };

  return {
    show(document, parsed) {
      documentUri = document.uri;
      if (panel) {
        panel.reveal(vscode.ViewColumn.Beside, true);
      } else {
        panel = vscode.window.createWebviewPanel("garneauhubGiftPreview", "Aperçu", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
        });
        panel.onDidDispose(() => {
          panel = null;
          documentUri = null;
        }, null, context.subscriptions);
        panel.webview.onDidReceiveMessage((message) => {
          if (message?.type === "goTo") goTo(message);
        }, null, context.subscriptions);
      }
      render(document, parsed);
    },
    follow(document, parsed) {
      if (!panel) return;
      documentUri = document.uri;
      render(document, parsed);
    },
    refresh(document, parsed) {
      if (panel && documentUri?.toString() === document.uri.toString()) render(document, parsed);
    },
  };
}
