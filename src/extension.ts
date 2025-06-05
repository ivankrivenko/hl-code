import * as vscode from 'vscode';

// Интерфейс для хранения данных о закладке
interface Bookmark {
  name: string;
  color: string;
  ranges: vscode.Range[];
  decoration: vscode.TextEditorDecorationType;
}

// Массив для хранения всех закладок
const bookmarks: Bookmark[] = [];

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Highlight Code" is now active!');

  // Команда для подсветки строк с формой
  let highlightDisposable = vscode.commands.registerCommand('highlightCode.highlight', async () => {
    console.log('Command highlightCode.highlight triggered!');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor!');
      return;
    }

    // Получаем все выделения
    const selections = editor.selections;
    const ranges: vscode.Range[] = [];
    for (const selection of selections) {
      if (!selection.isEmpty) {
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        ranges.push(
          new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
          )
        );
      }
    }

    if (ranges.length === 0) {
      vscode.window.showWarningMessage('No code selected!');
      return;
    }

    // Форма для выбора цвета
    const colors = [
      { label: 'Yellow', value: 'rgba(255, 255, 0, 0.3)' },
      { label: 'Red', value: 'rgba(255, 0, 0, 0.3)' },
      { label: 'Green', value: 'rgba(0, 255, 0, 0.3)' },
      { label: 'Blue', value: 'rgba(0, 0, 255, 0.3)' }
    ];
    const selectedColor = await vscode.window.showQuickPick(
      colors.map(c => c.label),
      { placeHolder: 'Select highlight color' }
    );
    if (!selectedColor) {
      vscode.window.showWarningMessage('No color selected!');
      return;
    }

    // Форма для ввода имени закладки
    const bookmarkName = await vscode.window.showInputBox({
      prompt: 'Enter bookmark name',
      placeHolder: 'Bookmark name',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Bookmark name cannot be empty';
        }
        if (bookmarks.some(b => b.name === value)) {
          return 'Bookmark name already exists';
        }
        return null;
      }
    });
    if (!bookmarkName) {
      vscode.window.showWarningMessage('No bookmark name provided!');
      return;
    }

    // Находим выбранный цвет
    const colorValue = colors.find(c => c.label === selectedColor)?.value || 'rgba(255, 255, 0, 0.3)';

    // Создаём новую декорацию
    const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: colorValue,
      isWholeLine: true
    });

    // Применяем декорацию
    editor.setDecorations(decorationType, ranges);

    // Сохраняем закладку
    bookmarks.push({
      name: bookmarkName,
      color: colorValue,
      ranges,
      decoration: decorationType
    });

    // Показываем уведомление
    vscode.window.showInformationMessage(`Bookmark "${bookmarkName}" created with ${ranges.length} line(s) highlighted!`);
  });

  // Команда для очистки всех подсветок
  let clearDisposable = vscode.commands.registerCommand('highlightCode.clearHighlights', () => {
    bookmarks.forEach(bookmark => bookmark.decoration.dispose());
    bookmarks.length = 0;
    vscode.window.showInformationMessage('All highlights cleared!');
  });

  // Регистрируем команды
  context.subscriptions.push(highlightDisposable, clearDisposable);
}

export function deactivate() {
  bookmarks.forEach(bookmark => bookmark.decoration.dispose());
  bookmarks.length = 0;
}