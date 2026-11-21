import React, { useMemo, useState } from 'react';
import { Check, Copy, FileCode2, FolderTree, Search } from 'lucide-react';
import {
  ANDROID_PROJECT_FILES,
  ANDROID_PROJECT_GROUPS,
  ANDROID_PROJECT_GROUP_LABELS,
  ANDROID_PROJECT_ROOT,
  AndroidProjectFile,
} from '../data/androidProjectFiles';

export const SourceExplorerView: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(ANDROID_PROJECT_FILES[0]?.id ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ANDROID_PROJECT_FILES;
    return ANDROID_PROJECT_FILES.filter(
      (file) =>
        file.name.toLowerCase().includes(q) ||
        file.path.toLowerCase().includes(q) ||
        file.summary.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const activeFile: AndroidProjectFile | undefined =
    ANDROID_PROJECT_FILES.find((file) => file.id === selectedId) ?? ANDROID_PROJECT_FILES[0];

  const handleCopy = async (file: AndroidProjectFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId((prev) => (prev === file.id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked in non-HTTPS context; ignore silently
    }
  };

  if (ANDROID_PROJECT_FILES.length === 0) {
    return (
      <div className="surface mx-auto max-w-xl p-8 text-center">
        <FolderTree className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
        <h2 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
          Native sources aren’t in this build
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          The <span className="font-mono">{ANDROID_PROJECT_ROOT}/</span> folder isn’t part of this
          checkout, so there is nothing real to show or download. Add the folder at the project root
          and this explorer fills itself from it — no placeholder code is ever displayed.
        </p>
      </div>
    );
  }

  const activeContent = activeFile.content;
  const lines = activeContent.split('\n');

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="surface p-3">
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="source-file-search" className="sr-only">
            Filter Android project files
          </label>
          <input
            id="source-file-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Filter files"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
          />
        </div>

        {filteredFiles.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No file matches “{searchQuery}”.
          </p>
        ) : (
          <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
            {ANDROID_PROJECT_GROUPS.map((group) => {
              const items = filteredFiles.filter((file) => file.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="eyebrow px-2 pb-1">
                    {ANDROID_PROJECT_GROUP_LABELS[group]} · {items.length}
                  </div>
                  <div className="space-y-px">
                    {items.map((file) => {
                      const isActive = file.id === activeFile?.id;
                      return (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setSelectedId(file.id)}
                          aria-current={isActive ? 'true' : undefined}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                            isActive
                              ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                          }`}
                        >
                          <FileCode2
                            className={`h-3.5 w-3.5 shrink-0 ${
                              isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate text-xs">{file.name}</span>
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

      <section className="surface min-w-0 overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-3.5 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-[13px] font-medium text-slate-900 dark:text-white">
              {ANDROID_PROJECT_ROOT}/{activeFile.path}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {activeFile.summary}
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{lines.length} lines</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(activeFile)}
            className="btn-quiet shrink-0 !min-h-8 !px-2.5 !text-[11px]"
          >
            {copiedId === activeFile.id ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </header>

        <div className="max-h-[64vh] overflow-auto bg-[#0a0f16] px-4 py-3 font-mono text-[11.5px] leading-6">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="hover:bg-white/[0.04]">
                  <td className="w-9 select-none pr-4 text-right align-top text-slate-600 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="whitespace-pre text-slate-200">{line || ' '}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
