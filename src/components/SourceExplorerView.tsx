import React, { useMemo, useState } from 'react';
import { Check, Copy, FileCode2, Search } from 'lucide-react';
import { ANDROID_PROJECT_FILES, AndroidProjectFile } from '../data/androidProjectFiles';

const GROUPS: AndroidProjectFile['group'][] = [
  'Manifest & Policy',
  'Kotlin Core',
  'UI & Layouts',
  'Gradle & Tests',
];

export const SourceExplorerView: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(ANDROID_PROJECT_FILES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ANDROID_PROJECT_FILES;
    return ANDROID_PROJECT_FILES.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const activeFile =
    ANDROID_PROJECT_FILES.find((f) => f.id === selectedId) ?? ANDROID_PROJECT_FILES[0];

  const handleCopy = async (file: AndroidProjectFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId((prev) => (prev === file.id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked in non-HTTPS context; ignore silently
    }
  };

  const lines = activeFile.content.split('\n');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
      {/* File Tree Sidebar */}
      <aside className="min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="relative mb-3">
          <Search
            className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="source-file-search" className="sr-only">
            Filter Android project files
          </label>
          <input
            id="source-file-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter Kotlin, XML, Gradle files..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
          />
        </div>

        {filteredFiles.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
            No files match "{searchQuery}".
          </p>
        ) : (
          <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
            {GROUPS.map((group) => {
              const items = filteredFiles.filter((f) => f.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-2 mb-1">
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((file) => {
                      const isActive = file.id === activeFile.id;
                      return (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setSelectedId(file.id)}
                          className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2 transition-colors ${
                            isActive
                              ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <FileCode2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="text-xs truncate">{file.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* Code Viewer */}
      <section className="min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{activeFile.group}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{lines.length} lines</span>
            </div>
            <h2 className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              android-kiosk-launcher/{activeFile.path}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{activeFile.summary}</p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(activeFile)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {copiedId === activeFile.id ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span>Copy File</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-950 text-slate-100 overflow-x-auto max-h-[620px] overflow-y-auto p-4 font-mono text-xs leading-6 border-t border-slate-900">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="hover:bg-slate-900/70">
                  <td className="select-none pr-4 text-right text-slate-500 w-10 align-top tabular-nums">
                    {index + 1}
                  </td>
                  <td className="whitespace-pre text-slate-100">{line || ' '}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
