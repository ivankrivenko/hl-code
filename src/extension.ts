import * as vscode from 'vscode';

let decorationType: vscode.TextEditorDecorationType | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Highlight Code" is now active!');

  let disposable = vscode.commands.registerCommand('highlightCode.highlight', () => {
    console.log('Command highlightCode.highlight triggered!');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor!');
      return;
    }
    if (editor.selection.isEmpty) {
      vscode.window.showWarningMessage('No code selected!');
      return;
    }

    // Получаем выделение
    const selection = editor.selection;

    // Создаём диапазон, охватывающий целые строки
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const range = new vscode.Range(
      new vscode.Position(startLine, 0), // Начало первой строки
      new vscode.Position(endLine, editor.document.lineAt(endLine).text.length) // Конец последней строки
    );

    // Удаляем предыдущую декорацию, если она существует
    if (decorationType) {
      decorationType.dispose();
    }

    // Создаём новую декорацию для целых строк
    decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 255, 0, 0.3)', // Желтый фон с прозрачностью
      isWholeLine: true // Подсвечивать всю строку
    });

    // Применяем декорацию к диапазону
    editor.setDecorations(decorationType, [range]);

    // Показываем уведомление
    vscode.window.showInformationMessage('Lines highlighted!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  if (decorationType) {
    decorationType.dispose();
  }
}