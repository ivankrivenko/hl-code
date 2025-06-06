import * as vscode from 'vscode';
import * as path from 'path';

// Интерфейс для хранения данных о закладке (для сохранения)
interface BookmarkData {
  name: string;
  color: string;
  ranges: { start: { line: number; character: number }; end: { line: number; character: number } }[];
  fileUri: string;
}

// Интерфейс для рабочего массива закладок
interface Bookmark {
  name: string;
  color: string;
  ranges: vscode.Range[];
  decoration: vscode.TextEditorDecorationType;
  fileUri: string;
}

// Класс для представления закладки в Tree View
class BookmarkTreeItem extends vscode.TreeItem {
  constructor(
    public readonly bookmark: Bookmark,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(bookmark.name, collapsibleState);
    this.tooltip = `Bookmark: ${bookmark.name}\nFile: ${vscode.Uri.parse(bookmark.fileUri).fsPath}\nColor: ${bookmark.color}`;
    this.description = path.basename(vscode.Uri.parse(bookmark.fileUri).fsPath);
    // Устанавливаем цветную иконку
    const colorKey = bookmark.color.split(',')[0].replace('rgba(', '').toLowerCase();
    const themeColor = new vscode.ThemeColor(`charts.${colorKey === '255, 255, 0' ? 'yellow' : colorKey === '255, 0, 0' ? 'red' : colorKey === '0, 255, 0' ? 'green' : 'blue'}`);
    this.iconPath = new vscode.ThemeIcon('bookmark', themeColor);
    // Команда для перехода к закладке
    this.command = {
      command: 'highlightCode.navigateToBookmark',
      title: 'Navigate to Bookmark',
      arguments: [bookmark]
    };
  }
}

// Провайдер данных для Tree View
class BookmarkTreeDataProvider implements vscode.TreeDataProvider<BookmarkTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookmarkTreeItem | undefined | null | void> = new vscode.EventEmitter<BookmarkTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BookmarkTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private bookmarks: Bookmark[]) {}

  getTreeItem(element: BookmarkTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BookmarkTreeItem): Thenable<BookmarkTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      this.bookmarks.map(bookmark => new BookmarkTreeItem(bookmark, vscode.TreeItemCollapsibleState.None))
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateBookmarks(newBookmarks: Bookmark[]): void {
    this.bookmarks = newBookmarks;
    this.refresh();
  }
}

// Массив для хранения всех закладок
let bookmarks: Bookmark[] = [];
let treeDataProvider: BookmarkTreeDataProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Highlight Code" is now active!');

  // Инициализация Tree View
  treeDataProvider = new BookmarkTreeDataProvider(bookmarks);
  vscode.window.createTreeView('highlightCode.bookmarks', {
    treeDataProvider
  });

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
  treeDataProvider?.updateBookmarks(bookmarks);

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
      Yellow: 'rgba(255, 255, 0, 0.1)',
      Red: 'rgba(255, 0, 50, 0.1)',
      Green: 'rgba(100, 255, 0, 0.1)',
      Blue: 'rgba(0, 150, 205, 0.1)'

    };

    let match;
    while ((match = regex.exec(text))) {
      const bookmarkName = match[1];
      const colorLabel = match[2];
      const startLine = document.positionAt(match.index).line;
      const endLine = document.positionAt(match.index + match[0].length).line - 1;

      if (startLine <= endLine) {
        // Включаем строки с комментариями в диапазон подсветки
        const range = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine + 1, 0)
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

    // Обновляем Tree View
    treeDataProvider?.updateBookmarks(bookmarks);

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
      { label: 'Yellow', value: 'rgba(255, 255, 0, 0.1)' },
      { label: 'Red', value: 'rgba(255, 0, 50, 0.1)' },
      { label: 'Green', value: 'rgba(100, 255, 0, 0.1)' },
      { label: 'Blue', value: 'rgba(0, 150, 205, 0.1)' }
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

    // Корректируем диапазоны с учётом комментариев
    const adjustedRanges: vscode.Range[] = [];
    let lineOffset = 0;
    await editor.edit(editBuilder => {
      ranges.forEach(range => {
        const startComment = createComment(bookmarkName, colorLabel, true, languageId);
        const endComment = createComment(bookmarkName, colorLabel, false, languageId);
        editBuilder.insert(new vscode.Position(range.start.line + lineOffset, 0), startComment + '\n');
        editBuilder.insert(new vscode.Position(range.end.line + lineOffset + 1, 0), endComment + '\n');
        // Увеличиваем смещение для следующих диапазонов
        lineOffset += 2;
        // Создаём новый диапазон, включающий комментарии
        const adjustedRange = new vscode.Range(
          new vscode.Position(range.start.line + lineOffset - 2, 0),
          new vscode.Position(range.end.line + lineOffset, 0)
        );
        adjustedRanges.push(adjustedRange);
      });
    });

    // Применяем декорацию к скорректированным диапазонам
    editor.setDecorations(decorationType, adjustedRanges);

    // Сохраняем закладку с новым диапазоном
    bookmarks.push({
      name: bookmarkName,
      color: colorValue,
      ranges: adjustedRanges,
      decoration: decorationType,
      fileUri: document.uri.toString()
    });

    // Обновляем Tree View
    treeDataProvider?.updateBookmarks(bookmarks);

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
    vscode.window.showInformationMessage(`Bookmark "${bookmarkName}" created with ${adjustedRanges.length} line(s) highlighted!`);
  });

  // Команда для очистки всех подсветок
  let clearDisposable = vscode.commands.registerCommand('highlightCode.clearHighlights', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const document = editor.document;
      const text = document.getText();
      const languageId = document.languageId;
      const { start, end } = getCommentMarkers(languageId);
      const regex = new RegExp(
        `${start.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')} (?:hl-code|/hl-code)\\s"[^"]+"\\s\\w+\\s*(?:${end.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})?\\n?`,
        'g'
      );
      const newText = text.replace(regex, '');
      await editor.edit(editBuilder => {
        editBuilder.replace(
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
          ),
          newText
        );
      });
    }
    bookmarks.forEach(bookmark => bookmark.decoration.dispose());
    bookmarks = [];
    treeDataProvider?.updateBookmarks(bookmarks);
    context.workspaceState.update('bookmarks', []);
    vscode.window.showInformationMessage('All highlights and comments cleared!');
  });

  // Команда для перехода к закладке
  let navigateDisposable = vscode.commands.registerCommand('highlightCode.navigateToBookmark', async (bookmark: Bookmark) => {
    const uri = vscode.Uri.parse(bookmark.fileUri);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    if (bookmark.ranges.length > 0) {
      editor.revealRange(bookmark.ranges[0], vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(bookmark.ranges[0].start, bookmark.ranges[0].end);
    }
  });

  // Регистрируем команды
  context.subscriptions.push(highlightDisposable, clearDisposable, navigateDisposable);
}

function lift(str: string): string {
  return str.replace(/\s/g, '').toLowerCase();
}

export function deactivate(context: vscode.ExtensionContext) {
  bookmarks.forEach(b => b.decoration.dispose());
  bookmarks.length = 0;
  context.workspaceState.update('bookmarks', []);
}