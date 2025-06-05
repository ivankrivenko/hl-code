import * as vscode from 'vscode';

// Интерфейс для хранения данных о закладке (для сохранения)
interface BookmarkData {
  name: string;
  color: string;
  ranges: { start: { line: number; character: number }; end: { line: number; character: number } }[];
  fileUri: string;
}

// Интерфейс для рабочего массива закладок
interface Bookmark extends BookmarkData {
  decoration: vscode.TextEditorDecorationType;
}

// Массив для хранения всех закладок
let bookmarks: Bookmark[] = [];

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Highlight Code" is now active!');

  // Функция для преобразования сохранённых данных в рабочие закладки
  function restoreBookmarks(savedBookmarks: BookmarkData[]): Bookmark[] {
    const restored: Bookmark[] = [];
    savedBookmarks.forEach(bookmark => {
      const ranges = bookmark.ranges.map(
        r => new vscode.Range(
          new vscode.Position(r.start.line, r.start.character),
          new vscode.Position(r.end.line, r.end.character)
        )
      );
      const decoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: bookmark.color,
        isWholeLine: true
      });
      restored.push({
        name: bookmark.name,
        color: bookmark.color,
        ranges,
        fileUri: bookmark.fileUri,
        decoration
      });
    });
    return restored;
  }

  // Загружаем сохранённые закладки
  const savedBookmarks = context.workspaceState.get<BookmarkData[]>('bookmarks', []);
  bookmarks = restoreBookmarks(savedBookmarks);

  // Функция для определения типа комментария в зависимости от языка
  function getCommentMarkers(languageId: string): { start: string; end: string } {
    switch (languageId) {
      case 'html':
      case 'xml':
        return { start: '<!--', end: '-->' };
      case 'python':
      case 'ruby':
      case 'shellscript':
        return { start: '#', end: '' };
      case 'javascript':
      case 'typescript':
      case 'cpp':
      case 'c':
      case 'java':
      case 'php':
        return { start: '//', end: '' };
      default:
        return { start: '//', end: '' };
    }
  }

  // Функция для создания комментария
  function createComment(bookmarkName: string, color: string, isStart: boolean, languageId: string): string {
    const { start, end } = getCommentMarkers(languageId);
    const tag = isStart ? 'hl-code' : '/hl-code';
    return `${start} ${tag} "${bookmarkName}" ${color} ${end}`.trim();
  }

  // Функция для применения сохранённых закладок
  function applyBookmarksForDocument(document: vscode.TextDocument) {
    // Удаляем существующие декорации для этого файла
    bookmarks
      .filter(b => b.fileUri === document.uri.toString())
      .forEach(b => b.decoration.dispose());
    bookmarks = bookmarks.filter(b => b.fileUri !== document.uri.toString());

    // Сканируем документ на наличие комментариев
    const text = document.getText();
    const languageId = document.languageId;
    const { start, end } = getCommentMarkers(languageId);
    const regex = new RegExp(
      `${start.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')} hl-code "([^"]+)" (\\w+)(?: ${end.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})?\n([\\s\\S]*?)\n${start.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')} /hl-code "\\1" \\2(?: ${end.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})?`,
      'g'
    );

    const colorMap: { [key: string]: string } = {
      Yellow: 'rgba(255, 255, 0, 0.3)',
      Red: 'rgba(255, 0, 0, 0.3)',
      Green: 'rgba(0, 255, 0, 0.3)',
      Blue: 'rgba(0, 0, 255, 0.3)'
    };

    let match;
    while ((match = regex.exec(text))) {
      const bookmarkName = match[1];
      const colorLabel = match[2];
      const startLine = document.positionAt(match.index).line;
      const endLine = document.positionAt(match.index + match[0].length).line - 1;

      if (startLine < endLine) {
        const range = new vscode.Range(
          new vscode.Position(startLine + 1, 0),
          new vscode.Position(endLine, document.lineAt(endLine).text.length)
        );
        const colorValue = colorMap[colorLabel] || 'rgba(255, 255, 0, 0.3)';
        const decorationType = vscode.window.createTextEditorDecorationType({
          backgroundColor: colorValue,
          isWholeLine: true
        });

        // Применяем декорацию, если документ открыт в активном редакторе
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === document.uri.toString()) {
          editor.setDecorations(decorationType, [range]);
        }

        bookmarks.push({
          name: bookmarkName,
          color: colorValue,
          ranges: [range],
          decoration: decorationType,
          fileUri: document.uri.toString()
        });
      }
    }

    // Сохраняем обновлённые закладки
    context.workspaceState.update('bookmarks', bookmarks.map(b => ({
      name: b.name,
      color: b.color,
      ranges: b.ranges.map(r => ({
        start: { line: r.start.line, character: r.start.character },
        end: { line: r.end.line, character: r.end.character }
      })),
      fileUri: b.fileUri
    })));
  }

  // Подписываемся на открытие документов
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      applyBookmarksForDocument(document);
    })
  );

  // Подписываемся на переключение активного редактора
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document) {
        applyBookmarksForDocument(editor.document);
      }
    })
  );

  // Проверяем активный редактор при активации
  if (vscode.window.activeTextEditor) {
    applyBookmarksForDocument(vscode.window.activeTextEditor.document);
  }

  // Команда для подсветки строк с формой
  let highlightDisposable = vscode.commands.registerCommand('highlightCode.highlight', async () => {
    console.log('Command highlightCode.highlight triggered!');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor!');
      return;
    }

    const document = editor.document;
    const languageId = document.languageId;
    const selections = editor.selections;
    const ranges: vscode.Range[] = [];
    for (const selection of selections) {
      if (!selection.isEmpty) {
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        ranges.push(
          new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, document.lineAt(endLine).text.length)
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
        if (bookmarks.some(b => lift(b.name) === lift(value) && b.fileUri === document.uri.toString())) {
          return 'Bookmark name already exists in this file';
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
    const colorLabel = colors.find(c => c.value === colorValue)!.label;

    // Создаём декорацию
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
      decoration: decorationType,
      fileUri: document.uri.toString()
    });

    // Вставляем комментарии
    await editor.edit(editBuilder => {
      ranges.forEach(range => {
        const startComment = createComment(bookmarkName, colorLabel, true, languageId);
        const endComment = createComment(bookmarkName, colorLabel, false, languageId);
        editBuilder.insert(new vscode.Position(range.start.line, 0), startComment + '\n');
        editBuilder.insert(new vscode.Position(range.end.line + 1, 0), endComment + '\n');
      });
    });

    // Сохраняем закладки в workspaceState
    context.workspaceState.update('bookmarks', bookmarks.map(b => ({
      name: b.name,
      color: b.color,
      ranges: b.ranges.map(r => ({
        start: { line: r.start.line, character: r.start.character },
        end: { line: r.end.line, character: r.end.character }
      })),
      fileUri: b.fileUri
    })));

    // Показываем уведомление
    vscode.window.showInformationMessage(`Bookmark "${bookmarkName}" created with ${ranges.length} line(s) highlighted!`);
  });

  // Команда для очистки всех подсветок
  let clearDisposable = vscode.commands.registerCommand('highlightCode.clearHighlights', () => {
    bookmarks.forEach(bookmark => bookmark.decoration.dispose());
    bookmarks.length = 0;
    context.workspaceState.update('bookmarks', []);
    vscode.window.showInformationMessage('All highlights cleared!');
  });

  // Регистрируем команды
  context.subscriptions.push(highlightDisposable, clearDisposable);
}

function lift(str: string): string {
  return str.replace(/\s/g, '').toLowerCase();
}

export function deactivate(context: vscode.ExtensionContext) {
  bookmarks.forEach(bookmark => bookmark.decoration.dispose());
  bookmarks.length = 0;
  context.workspaceState.update('bookmarks', []);
}