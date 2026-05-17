'use client';

import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';

// Simple JSON syntax highlighter
function highlightJSON(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // strings
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
      // Check if it's a key (followed by :)
      return `<span class="json-string">${match}</span>`;
    })
    // numbers
    .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="json-number">$1</span>')
    // booleans & null
    .replace(/\b(true|false|null)\b/g, '<span class="json-bool">$1</span>');
}

export function CodeEditor() {
  const scene = useEditorStore((s) => s.scene);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<'scene.json' | 'elements'>('scene.json');

  const sceneJSON = useMemo(() => JSON.stringify(scene, null, 2), [scene]);

  const elementEntries = useMemo(
    () => Object.entries(scene.elements).map(([id, el]) => ({ id, name: el.name, type: el.type })),
    [scene.elements],
  );

  const startEditing = useCallback(() => {
    setEditText(sceneJSON);
    setEditing(true);
    setError(null);
  }, [sceneJSON]);

  const applyChanges = useCallback(() => {
    try {
      const parsed = JSON.parse(editText);
      useEditorStore.getState().loadScene(parsed);
      setEditing(false);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [editText]);

  return (
    <div className="absolute inset-0 z-10 flex" style={{ backgroundColor: '#0D0D0E' }}>
      {/* File tree sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-white/10 p-2 overflow-y-auto" style={{ backgroundColor: '#121214' }}>
        <p className="text-[10px] text-white/30 uppercase tracking-wider px-2 mb-2 font-semibold">Explorer</p>

        {/* scene.json */}
        <button
          onClick={() => { setActiveFile('scene.json'); setEditing(false); }}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
            activeFile === 'scene.json' ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          scene.json
        </button>

        {/* Elements list */}
        <button
          onClick={() => { setActiveFile('elements'); setEditing(false); }}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors mt-0.5 ${
            activeFile === 'elements' ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          elements ({elementEntries.length})
        </button>

        {/* Individual element files */}
        {activeFile === 'elements' && elementEntries.map((el) => (
          <button
            key={el.id}
            onClick={() => {
              useEditorStore.getState().setSelectedIds([el.id]);
            }}
            className="flex items-center gap-2 w-full px-2 py-1 pl-6 rounded-md text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-[#8b7ec8]/50 flex-shrink-0" />
            {el.name}
            <span className="text-white/20 ml-auto text-[10px]">{el.type}</span>
          </button>
        ))}
      </div>

      {/* Code area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center h-9 border-b border-white/10 px-2 gap-1" style={{ backgroundColor: '#0D0D0E' }}>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-t-md text-xs text-white/80 border-b border-orange-500">
            <svg className="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            {activeFile}
          </div>
          <div className="flex-1" />
          {!editing && activeFile === 'scene.json' && (
            <button
              onClick={startEditing}
              className="px-2.5 py-1 rounded text-[10px] font-medium bg-[#8b7ec8]/20 text-[#8b7ec8] hover:bg-[#8b7ec8]/30 transition-colors"
            >
              Edit
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-1.5">
              {error && <span className="text-[10px] text-red-400 mr-2">{error}</span>}
              <button
                onClick={() => { setEditing(false); setError(null); }}
                className="px-2.5 py-1 rounded text-[10px] font-medium bg-white/5 text-white/50 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyChanges}
                className="px-2.5 py-1 rounded text-[10px] font-medium bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Code content */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed" style={{ backgroundColor: '#0a0a0f' }}>
          <style>{`
            .json-string { color: #a5d6ff; }
            .json-number { color: #79c0ff; }
            .json-bool { color: #ff7b72; }
          `}</style>

          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              spellCheck={false}
              className="w-full h-full bg-transparent text-white/80 font-mono text-xs leading-relaxed resize-none outline-none border-none p-0"
              style={{ tabSize: 2 }}
            />
          ) : (
            <div className="flex">
              {/* Line numbers */}
              <div className="pr-4 text-right select-none text-white/15 flex-shrink-0" style={{ minWidth: '3ch' }}>
                {sceneJSON.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Code */}
              <pre
                className="text-white/70 flex-1 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: highlightJSON(sceneJSON) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
