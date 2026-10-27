// Extension VS Code « GarneauHub GIFT » : le format GIFT de l'editeur du site
// dans VS Code. La coloration est dans syntaxes/ (grammaire TextMate) ; ce
// fichier ajoute les erreurs soulignees, les modeles de questions et
// l'apercu de l'examen.
import * as vscode from "vscode";
import { GIFT_SEVERITY, parseGift } from "./gift.js";
import { GIFT_TRIGGER_CHARACTERS, INSERTABLE_SNIPPETS, getGiftCompletions, separatorBefore } from "./completions.js";
import { renderPreview } from "./previewHtml.js";

const LANGUAGE_ID = "gift";
// Delai apres la derniere frappe avant de relire le document (ms).
const PARSE_DELAY = 200;

const SEVERITIES = {
  [GIFT_SEVERITY.ERROR]: vscode.DiagnosticSeverity.Error,
  [GIFT_SEVERITY.WARNING]: vscode.DiagnosticSeverity.Warning,
  [GIFT_SEVERITY.INFO]: vscode.DiagnosticSeverity.Information,
};

const isGift = (document) => document?.languageId === LANGUAGE_ID;

// Lignes et colonnes de parseGift : a partir de 1, fin exclue (comme Monaco).
const toRange = (diagnostic) => new vscode.Range(
  diagnostic.startLine - 1, diagnostic.startColumn - 1, diagnostic.endLine - 1, diagnostic.endColumn - 1
);

export function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  const timers = new Map();
  const preview = createPreview(context);

  // Une lecture par modification : elle sert aux erreurs et a l'apercu.
  const update = (document) => {
    if (!isGift(document)) return;
    const parsed = parseGift(document.getText());
    diagnostics.set(document.uri, parsed.diagnostics.map((diagnostic) => {
      const item = new vscode.Diagnostic(toRange(diagnostic), diagnostic.message, SEVERITIES[diagnostic.severity]);
      item.source = "GIFT";
      return item;
    }));
    preview.refresh(document, parsed);
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
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleUpdate(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    // L'apercu suit le fichier GIFT actif, comme l'apercu Markdown.
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (isGift(editor?.document)) preview.follow(editor.document, parseGift(editor.document.getText()));
    }),
    vscode.languages.registerCompletionItemProvider(LANGUAGE_ID, { provideCompletionItems }, ...GIFT_TRIGGER_CHARACTERS),
    vscode.commands.registerCommand("garneauhubGift.insertQuestion", insertQuestion),
    vscode.commands.registerCommand("garneauhubGift.showPreview", () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!isGift(document)) {
        vscode.window.showInformationMessage("Ouvrez un fichier .gift pour voir l'aperçu de l'examen.");
        return;
      }
      preview.show(document, parseGift(document.getText()));
    }),
  );

  vscode.workspace.textDocuments.forEach(update);
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
