import * as vscode from 'vscode';

// Сохраняем декорации, чтобы удалять их при необходимости
let decorationType: vscode.TextEditorDecorationType | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Регистрация команды
  let disposable = vscode.commands.registerCommand('highlightCode.highlight', () => {
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
    const range = new vscode.Range(selection.start, selection.end);

    // Удаляем предыдущую декорацию, если она существует
    if (decorationType) {
      decorationType.dispose();
    }

    // Создаем новую декорацию с цветом фона
    decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 255, 0, 0.05)', // Желтый фон с прозрачностью
      isWholeLine: false // Применяется только к выделенному тексту
    });

    // Применяем декорацию к выделенному диапазону
    editor.setDecorations(decorationType, [range]);

    // Показываем уведомление
    vscode.window.showInformationMessage('Code highlighted!');
  });

  // Добавляем команду в подписки контекста
  context.subscriptions.push(disposable);
}

export function deactivate() {
  if (decorationType) {
    decorationType.dispose();
  }
}