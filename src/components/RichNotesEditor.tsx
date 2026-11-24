import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  CheckSquare,
  Code,
  Compass,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pin,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Strikethrough,
  Table,
  Trash2,
  Underline,
} from 'lucide-react';
import {
  AiDailyPrompt,
  NoteFontFamily,
  NoteFontSize,
  NoteNotebook,
  RichNote,
  filterNotes,
} from '../utils/selfImprovementEngine';
import { useI18n } from '../i18n/LocaleProvider';

export interface DailyPromptContext {
  cleanStreakDays: number;
  longestCleanStreakDays: number;
  urgeVictories: number;
  todayHabitPercent: number;
  habitsCompletedToday: number;
  habitsTotal: number;
  focusSessionsToday: number;
  focusMinutesToday: number;
  whyIStarted: string;
  goals: Array<{
    title: string;
    category: string;
    progressPercent: number;
    targetDate: string;
  }>;
}

interface RichNotesEditorProps {
  notes: RichNote[];
  selectedNoteId: string | null;
  promptContext: DailyPromptContext;
  onSelectNote: (id: string) => void;
  onCreateNote: (notebook: NoteNotebook, title?: string, htmlContent?: string) => void;
  onUpdateNote: (
    noteId: string,
    patch: Partial<Pick<RichNote, 'title' | 'notebook' | 'fontFamily' | 'fontSize' | 'htmlContent' | 'pinned'>>
  ) => void;
  onDeleteNote: (noteId: string) => void;
}

const NOTEBOOKS: Array<NoteNotebook | 'All'> = [
  'All',
  'Diary',
  'Goals & Vision',
  'Urge Reflection',
  'Notes',
];

const FONT_CLASS: Record<NoteFontFamily, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};

const SIZE_STYLE: Record<NoteFontSize, string> = {
  sm: '14px',
  base: '16px',
  lg: '20px',
  xl: '24px',
};

export const RichNotesEditor: React.FC<RichNotesEditorProps> = ({
  notes,
  selectedNoteId,
  promptContext,
  onSelectNote,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const { tr } = useI18n();
  const [notebookFilter, setNotebookFilter] = useState<NoteNotebook | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState<AiDailyPrompt | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const visibleNotes = useMemo(
    () => filterNotes(notes, notebookFilter, searchQuery),
    [notes, notebookFilter, searchQuery]
  );

  const activeNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? visibleNotes[0] ?? notes[0] ?? null,
    [notes, selectedNoteId, visibleNotes]
  );

  // Sync contentEditable DOM only when switching active note ID
  useEffect(() => {
    if (editorRef.current && activeNote) {
      if (editorRef.current.dataset.noteId !== activeNote.id) {
        editorRef.current.innerHTML = activeNote.htmlContent;
        editorRef.current.dataset.noteId = activeNote.id;
      }
    }
  }, [activeNote]);

  const syncHtmlFromEditor = () => {
    if (!editorRef.current || !activeNote) return;
    onUpdateNote(activeNote.id, { htmlContent: editorRef.current.innerHTML });
  };

  const runCommand = (command: string, value?: string) => {
    if (!editorRef.current || !activeNote) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    syncHtmlFromEditor();
  };

  const insertHtmlAtCursor = (html: string) => {
    if (!editorRef.current || !activeNote) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
      document.execCommand('insertHTML', false, html);
    } else {
      editorRef.current.innerHTML += html;
    }
    syncHtmlFromEditor();
  };

  const handleInsertTable = () => {
    insertHtmlAtCursor(
      `<table><thead><tr><th>${tr('Item / Trigger')}</th><th>${tr('Plan / Metric')}</th><th>${tr('Status')}</th></tr></thead>` +
        `<tbody><tr><td>${tr('Entry 1')}</td><td>${tr('Detail')}</td><td>${tr('Active')}</td></tr>` +
        `<tr><td>${tr('Entry 2')}</td><td>${tr('Detail')}</td><td>${tr('Planned')}</td></tr></tbody></table><p><br></p>`
    );
  };

  const handleAddTableRow = () => {
    if (!editorRef.current || !activeNote) return;
    const tables = editorRef.current.querySelectorAll('table');
    if (tables.length === 0) {
      handleInsertTable();
      return;
    }
    const targetTable = tables[tables.length - 1];
    const tbody = targetTable.querySelector('tbody') ?? targetTable;
    const colCount = targetTable.rows[0]?.cells.length || 3;
    const rowEl = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.textContent = tr('New cell');
      rowEl.appendChild(td);
    }
    tbody.appendChild(rowEl);
    syncHtmlFromEditor();
  };

  const handleAddTableColumn = () => {
    if (!editorRef.current || !activeNote) return;
    const tables = editorRef.current.querySelectorAll('table');
    if (tables.length === 0) {
      handleInsertTable();
      return;
    }
    const targetTable = tables[tables.length - 1];
    Array.from(targetTable.rows).forEach((row, idx) => {
      const cell = document.createElement(idx === 0 ? 'th' : 'td');
      cell.textContent = idx === 0 ? tr("Column") : tr("Value");
      row.appendChild(cell);
    });
    syncHtmlFromEditor();
  };

  const handleInsertTemplate = (type: 'diary' | 'urge') => {
    if (type === 'diary') {
      onCreateNote(
        'Diary',
        tr('Daily Reflection — {date}', { date: new Date().toISOString().slice(0, 10) }),
        `<h2>${tr('Morning & Evening Check-In')}</h2>` +
          `<p><strong>${tr('Main Goal Today:')}</strong> ${tr('Stay clean, focused, and away from mindless feeds.')}</p>` +
          `<table><thead><tr><th>${tr('Area')}</th><th>${tr('Check')}</th><th>${tr('Notes')}</th></tr></thead><tbody>` +
          `<tr><td>${tr('Focus / Work')}</td><td>${tr('Planned')}</td><td>${tr('2 deep blocks')}</td></tr>` +
          `<tr><td>${tr('Sleep & Night Rule')}</td><td>${tr('Active')}</td><td>${tr('Phone outside room')}</td></tr>` +
          '</tbody></table>'
      );
    } else {
      onCreateNote(
        'Urge Reflection',
        tr('Urge Trigger & Reset Log'),
        `<h2>${tr('Urge Pause Reflection')}</h2>` +
          `<p><em>${tr('I paused before reacting. Here is what triggered the feeling and how I redirected my energy:')}</em></p>` +
          `<ul><li><strong>${tr('Trigger / Emotion:')}</strong> </li><li><strong>${tr('Environment:')}</strong> </li><li><strong>${tr('Action Taken Instead:')}</strong> </li></ul>`
      );
    }
  };

  const handleGenerateDailyPrompt = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/notes/daily-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...promptContext,
          recentNoteTitles: notes.slice(0, 4).map((n) => n.title),
        }),
      });
      const data = (await response.json()) as Partial<AiDailyPrompt> & { error?: string };
      if (!response.ok || !data.question) {
        setAiError(data.error ?? tr('Request failed ({status}).', { status: response.status }));
        return;
      }
      setAiPrompt({
        question: data.question,
        focusTheme: data.focusTheme ?? tr("Daily Reflection"),
        goalReferenced: data.goalReferenced ?? tr('{d}-day streak', { d: promptContext.cleanStreakDays }),
        writingStarter: data.writingStarter ?? tr("Today I noticed that"),
      });
    } catch (err: unknown) {
      setAiError(
        err instanceof Error ? err.message : tr("Unable to reach AI Daily Prompt service.")
      );
    } finally {
      setAiLoading(false);
    }
  };

  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const handleInsertPromptIntoNote = () => {
    if (!aiPrompt || !activeNote) return;
    const html =
      `<blockquote><strong>${tr('AI Daily Prompt')} (${escapeHtml(aiPrompt.focusTheme)}):</strong> ${escapeHtml(aiPrompt.question)}</blockquote>` +
      `<p>${escapeHtml(aiPrompt.writingStarter)} </p>`;
    insertHtmlAtCursor(html);
  };

  const handleNewNoteFromPrompt = () => {
    if (!aiPrompt) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const html =
      `<h2>${escapeHtml(aiPrompt.focusTheme)}</h2>` +
      `<blockquote><strong>${tr('Prompt:')}</strong> ${escapeHtml(aiPrompt.question)}</blockquote>` +
      `<p>${escapeHtml(aiPrompt.writingStarter)} </p>`;
    onCreateNote('Diary', `${aiPrompt.focusTheme} — ${todayStr}`, html);
  };

  return (
    <div className="space-y-4">
      {/* AI Daily Prompt Panel */}
      <section
        aria-label={tr("AI Daily Prompt")}
        className="surface p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tr("AI Daily Prompt")}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {tr("Suggests a tailored reflection question using your")}{' '}
              <span className="font-mono tabular-nums">{promptContext.cleanStreakDays}d</span> {tr("clean streak, habit rate (")}<span dir="ltr">{promptContext.todayHabitPercent}%</span>) {tr("and active goals.")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateDailyPrompt}
            disabled={aiLoading}
            className="min-h-[38px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{aiLoading ? tr("Generating Prompt...") : aiPrompt ? tr("New AI Prompt") : tr("Suggest Daily Prompt")}</span>
          </button>
        </div>

        {aiError && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {aiError}
          </p>
        )}

        {aiPrompt && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {aiPrompt.focusTheme}{" "}{tr("· Connected to:")}{" "}{aiPrompt.goalReferenced}
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
              {aiPrompt.question}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 italic">{"\n              "}{tr("Starter: “")}{aiPrompt.writingStarter}&rdquo;
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeNote && (
                <button
                  type="button"
                  onClick={handleInsertPromptIntoNote}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap"
                >{"\n                  "}{tr("Insert into Current Note")}{"\n                "}</button>
              )}
              <button
                type="button"
                onClick={handleNewNoteFromPrompt}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
              >{"\n                "}{tr("New Diary Note from Prompt")}{"\n              "}</button>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-5 items-start">
      {/* Notes Sidebar */}
      <aside className="surface p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Notebooks & Diary")}</h3>
          <button
            type="button"
            onClick={() =>
              onCreateNote(
                notebookFilter === 'All' ? 'Diary' : notebookFilter,
                tr('Untitled Note')
              )
            }
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tr("New Note")}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => handleInsertTemplate('diary')}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
          >{"\n            "}{tr("+ Diary Template")}{"\n          "}</button>
          <button
            type="button"
            onClick={() => handleInsertTemplate('urge')}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
          >{"\n            "}{tr("+ Urge Log")}{"\n          "}</button>
        </div>

        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute start-2.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="notes-search-input" className="sr-only">{"\n            "}{tr("Search notes")}{"\n          "}</label>
          <input
            id="notes-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr("Search notes & diary...")}
            className="w-full h-8 ps-8 pe-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
          />
        </div>

        <div className="flex flex-wrap gap-1 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          {NOTEBOOKS.map((nb) => {
            const active = notebookFilter === nb;
            return (
              <button
                key={nb}
                type="button"
                onClick={() => setNotebookFilter(nb)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tr(nb)}
              </button>
            );
          })}
        </div>

        <div className="space-y-1 max-h-[440px] overflow-y-auto pe-0.5">
          {visibleNotes.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
              {tr("No notes in this view. Create a new note above.")}
            </p>
          ) : (
            visibleNotes.map((note) => {
              const selected = activeNote?.id === note.id;
              return (
                <div
                  key={note.id}
                  className={`rounded-lg border p-2.5 transition-colors ${
                    selected
                      ? 'border-sky-300 dark:border-sky-700 bg-sky-50/60 dark:bg-sky-950/50'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectNote(note.id)}
                      className="text-start min-w-0 flex-1"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {note.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {tr(note.notebook)} · <span className="tabular-nums">{note.updatedAt}</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        aria-label={
                          note.pinned
                            ? tr('Unpin {title}', { title: note.title })
                            : tr('Pin {title}', { title: note.title })
                        }
                        onClick={() => onUpdateNote(note.id, { pinned: !note.pinned })}
                        className={`p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 ${
                          note.pinned ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={tr('Delete {title}', { title: note.title })}
                        onClick={() => onDeleteNote(note.id)}
                        className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Notion-Style Rich Editor */}
      <section className="surface overflow-hidden min-w-0">
        {!activeNote ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">{"\n            "}{tr("Select or create a note to start writing.")}{"\n          "}</div>
        ) : (
          <>
            {/* Note Title & Metadata */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="active-note-title" className="sr-only">{"\n                  "}{tr("Note title")}{"\n                "}</label>
                <input
                  id="active-note-title"
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => onUpdateNote(activeNote.id, { title: e.target.value })}
                  className="flex-1 min-w-[200px] text-lg font-bold text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent focus:border-sky-500 focus:outline-none py-0.5"
                />

                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="active-note-notebook" className="sr-only">{"\n                    "}{tr("Notebook")}{"\n                  "}</label>
                  <select
                    id="active-note-notebook"
                    value={activeNote.notebook}
                    onChange={(e) =>
                      onUpdateNote(activeNote.id, {
                        notebook: e.target.value as NoteNotebook,
                      })
                    }
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="Diary">{tr("Diary")}</option>
                    <option value="Goals & Vision">{tr("Goals & Vision")}</option>
                    <option value="Urge Reflection">{tr("Urge Reflection")}</option>
                    <option value="Notes">{tr("Notes")}</option>
                  </select>
                </div>
              </div>

              {/* Formatting Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {/* Font Type */}
                <label htmlFor="editor-font-family" className="sr-only">{"\n                  "}{tr("Font type")}{"\n                "}</label>
                <select
                  id="editor-font-family"
                  aria-label={tr("Font type")}
                  value={activeNote.fontFamily}
                  onChange={(e) =>
                    onUpdateNote(activeNote.id, {
                      fontFamily: e.target.value as NoteFontFamily,
                    })
                  }
                  className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <option value="sans">{tr("Font: Sans")}</option>
                  <option value="serif">{tr("Font: Serif")}</option>
                  <option value="mono">{tr("Font: Mono")}</option>
                </select>

                {/* Font Size */}
                <label htmlFor="editor-font-size" className="sr-only">{"\n                  "}{tr("Font size")}{"\n                "}</label>
                <select
                  id="editor-font-size"
                  aria-label={tr("Font size")}
                  value={activeNote.fontSize}
                  onChange={(e) =>
                    onUpdateNote(activeNote.id, {
                      fontSize: e.target.value as NoteFontSize,
                    })
                  }
                  className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <option value="sm">{tr("Size: Small (14px)")}</option>
                  <option value="base">{tr("Size: Normal (16px)")}</option>
                  <option value="lg">{tr("Size: Large (20px)")}</option>
                  <option value="xl">{tr("Size: Heading (24px)")}</option>
                </select>

                <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden="true" />

                <button
                  type="button"
                  aria-label={tr("Bold")}
                  onClick={() => runCommand('bold')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Italic")}
                  onClick={() => runCommand('italic')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Underline")}
                  onClick={() => runCommand('underline')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Strikethrough")}
                  onClick={() => runCommand('strikeThrough')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden="true" />

                <button
                  type="button"
                  aria-label={tr("Heading 1")}
                  onClick={() => runCommand('formatBlock', 'H1')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Heading1 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Heading 2")}
                  onClick={() => runCommand('formatBlock', 'H2')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Heading2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Bullet list")}
                  onClick={() => runCommand('insertUnorderedList')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Numbered list")}
                  onClick={() => runCommand('insertOrderedList')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Quote block")}
                  onClick={() => runCommand('formatBlock', 'BLOCKQUOTE')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Insert checklist item")}
                  onClick={() =>
                    insertHtmlAtCursor(`<p><input type="checkbox" /> <span>${tr('Action item')}</span></p>`)
                  }
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Inline code")}
                  onClick={() => insertHtmlAtCursor('<code>code</code>')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={tr("Insert divider")}
                  onClick={() => runCommand('insertHorizontalRule')}
                  className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <span className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleInsertTable}
                  className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Table className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>{tr("Insert Table")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddTableRow}
                  className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >{"\n                  "}{tr("+ Row")}{"\n                "}</button>
                <button
                  type="button"
                  onClick={handleAddTableColumn}
                  className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >{"\n                  "}{tr("+ Col")}{"\n                "}</button>
              </div>
            </div>

            {/* Editable Notion-style Page */}
            <div className="p-4 sm:p-5 min-h-[420px] overflow-x-auto bg-white dark:bg-slate-900">
              <div
                ref={editorRef}
                role="textbox"
                aria-label={tr("Rich note editor")}
                aria-multiline="true"
                contentEditable
                suppressContentEditableWarning
                onInput={syncHtmlFromEditor}
                onBlur={syncHtmlFromEditor}
                style={{ fontSize: SIZE_STYLE[activeNote.fontSize] }}
                className={`kiosk-rich-editor min-h-[380px] ${FONT_CLASS[activeNote.fontFamily]}`}
              />
            </div>
          </>
        )}
      </section>
      </div>
    </div>
  );
};
