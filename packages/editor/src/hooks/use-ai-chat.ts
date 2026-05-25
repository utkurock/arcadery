'use client';

import { useState, useRef, useCallback } from 'react';
import { z } from 'zod';
import {
  SceneElementSchema,
  generateId,
  createBoxElement,
  createSphereElement,
  createTextElement,
} from '@arcadery/shared';
import { useEditorStore } from '../stores/editor-store';

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  type?: 'welcome' | 'text' | 'loading' | 'error';
}

import { GameStateConfigSchema } from '@arcadery/shared';

const GenerateResponseSchema = z.object({
  renderEngine: z.enum(['phaser', 'three']).optional(),
  elements: z.array(SceneElementSchema),
  description: z.string(),
  gameState: GameStateConfigSchema.optional(),
});

// Simple command parser — only matches exact/short commands, not natural language
function handleCommand(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Only match short, explicit commands (under 30 chars) to avoid hijacking AI prompts
  if (lower.length > 30) return null;

  // Add elements — must start with "add"
  if (/^add\s+box$/i.test(lower)) {
    const el = createBoxElement({ name: `Box ${Date.now() % 1000}` });
    useEditorStore.getState().addElement(el);
    useEditorStore.getState().setSelectedIds([el.id]);
    return `Added a box to your scene!`;
  }
  if (/^add\s+sphere$/i.test(lower)) {
    const el = createSphereElement({ name: `Sphere ${Date.now() % 1000}` });
    useEditorStore.getState().addElement(el);
    useEditorStore.getState().setSelectedIds([el.id]);
    return `Added a sphere!`;
  }
  if (/^add\s+text$/i.test(lower)) {
    const el = createTextElement({ name: `Text ${Date.now() % 1000}` });
    useEditorStore.getState().addElement(el);
    useEditorStore.getState().setSelectedIds([el.id]);
    return `Added a text element.`;
  }

  // View mode — exact match only
  if (lower === '2d' || lower === 'switch to 2d' || lower === 'switch 2d') {
    useEditorStore.getState().setViewMode('2d');
    return `Switched to 2D view.`;
  }
  if (lower === '3d' || lower === 'switch to 3d' || lower === 'switch 3d') {
    useEditorStore.getState().setViewMode('3d');
    return `Switched to 3D view.`;
  }

  // Undo/redo
  if (lower === 'undo') {
    useEditorStore.temporal.getState().undo();
    return `Undone!`;
  }
  if (lower === 'redo') {
    useEditorStore.temporal.getState().redo();
    return `Redone!`;
  }

  // Delete — exact
  if (lower === 'delete' || lower === 'remove') {
    const id = useEditorStore.getState().selectedIds[0] ?? null;
    if (id) {
      const name = useEditorStore.getState().scene.elements[id]?.name;
      useEditorStore.getState().removeElement(id);
      return `Deleted "${name}".`;
    }
    return `No element selected. Click an element first.`;
  }

  return null;
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'ai', type: 'welcome', content: '' },
  ]);

  const clearWelcome = useCallback(() => {
    setMessages((prev) => prev.filter((m) => m.type !== 'welcome'));
  }, []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => prev.filter((m) => m.id !== 'loading').concat(msg));
  }, []);

  const removeLoadingMessage = useCallback(() => {
    setMessages((prev) => prev.filter((m) => m.id !== 'loading'));
  }, []);

  const sendMessage = useCallback(async (overrideText?: string, refImage?: string | null) => {
    const text = (overrideText || input).trim();
    if (!text) return;

    // Clear welcome card and add user message
    const userMsg: ChatMessage = {
      id: (Date.now() + Math.random()).toString(),
      role: 'user',
      type: 'text',
      content: text,
    };
    setMessages((prev) => prev.filter((m) => m.type !== 'welcome').concat(userMsg));
    setInput('');

    // First meaningful message becomes the project name so the entry in My
    // Games is recognizable even if the AI call fails or the user navigates
    // away mid-generation. We only overwrite the placeholder ("Untitled
    // Scene"/"Untitled Game") so manual renames aren't clobbered.
    try {
      const currentName = useEditorStore.getState().scene.name?.trim() ?? '';
      if (!currentName || /^untitled/i.test(currentName)) {
        const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, 60);
        if (trimmed) useEditorStore.getState().setSceneName(trimmed);
      }
    } catch {}

    // Try as command first
    const commandResponse = handleCommand(text);
    if (commandResponse) {
      addMessage({
        id: (Date.now() + Math.random()).toString(),
        role: 'ai',
        type: 'text',
        content: commandResponse,
      });
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Determine mode and build context
    const state = useEditorStore.getState();
    const { selectedIds, scene } = state;
    const selectedId = selectedIds[0] ?? null;
    const mode = selectedId ? 'modify' : 'generate';
    const context = {
      selectedElement: selectedId ? scene.elements[selectedId] ?? null : null,
      elementCount: Object.keys(scene.elements).length,
      elementTypes: [...new Set(Object.values(scene.elements).map((e) => e.type))],
    };

    setIsLoading(true);

    // Add loading message
    const baseLabel = mode === 'modify' ? 'Modifying element' : 'Generating scene';
    setMessages((prev) => [
      ...prev,
      {
        id: 'loading',
        role: 'ai',
        type: 'loading',
        content: `${baseLabel}…`,
      },
    ]);

    // Live elapsed-time ticker so the user gets a sense of progress instead
    // of an indefinite "Generating scene…". After 8s we hint that we're
    // falling back to the no-schema retry path on the server.
    const startedAt = Date.now();
    const tickHandle = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === 'loading'
            ? {
                ...m,
                content:
                  elapsed < 8
                    ? `${baseLabel}… ${elapsed}s`
                    : elapsed < 15
                      ? `${baseLabel}… retrying (${elapsed}s)`
                      : `${baseLabel}… still working (${elapsed}s)`,
              }
            : m,
        ),
      );
    }, 1000);
    // Stash the handle on the controller so we clear it from any exit branch.
    const stopTicker = () => clearInterval(tickHandle);

    const doFetch = async (): Promise<{ success: boolean; description?: string; error?: string }> => {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          context,
          mode,
          // Pass the attached reference image (data URL from picker, or
          // remote asset URL from "Send to chat") so the server can hand it
          // to Claude as an image block. Omitted when null/undefined.
          ...(refImage ? { refImage } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arcadery:auth-required'));
          }
          return { success: false, error: 'Sign in to generate games.' };
        }
        if (res.status === 402) {
          const payload = await res.json().catch(() => ({} as Record<string, unknown>));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('arcadery:insufficient-credits', { detail: payload }),
            );
          }
          return {
            success: false,
            error: "You're out of credits. Top up to keep generating.",
          };
        }
        // Surface the actual server error message instead of the opaque
        // "Server error (500)" — makes AI quota/schema/model issues
        // debuggable without diving into the dev terminal.
        const detail = await res.json().catch(() => null);
        const msg =
          (detail && typeof detail.error === 'string' && detail.error) ||
          `Server error (${res.status})`;
        return { success: false, error: msg };
      }

      // Read full response text
      const reader = res.body?.getReader();
      if (!reader) return { success: false, error: 'No response stream' };

      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      // Parse SSE events from response
      let description = '';
      for (const block of fullText.split('\n\n')) {
        const line = block.trim();
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);

        let event: { type: string; text?: string; json?: string; message?: string };
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }

        if (event.type === 'error') {
          return { success: false, error: event.message ?? 'Unknown AI error' };
        }

        if (event.type === 'done' && event.json) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.json);
          } catch {
            return { success: false, error: 'Invalid JSON in AI response' };
          }

          if (mode === 'modify' && selectedId) {
            const result = SceneElementSchema.safeParse(parsed);
            if (result.success) {
              useEditorStore.getState().updateElement(selectedId, result.data);
              const el = useEditorStore.getState().scene.elements[selectedId];
              description = `I've updated the ${el?.type ?? 'element'} element.`;
            } else {
              return { success: false };
            }
          } else {
            const result = GenerateResponseSchema.safeParse(parsed);
            if (result.success) {
              // Set render engine based on AI decision
              if (result.data.renderEngine) {
                useEditorStore.getState().setRenderEngine(result.data.renderEngine);
              }

              // Map old-id → new-id so behaviors that reference element ids
              // (e.g. cameraFollowId) stay coherent after we re-id the elements.
              const idMap = new Map<string, string>();
              for (const element of result.data.elements) {
                const newId = generateId();
                idMap.set(element.id, newId);
              }

              for (const element of result.data.elements) {
                const newId = idMap.get(element.id)!;
                const withNewId = { ...element, id: newId };
                const validated = SceneElementSchema.safeParse(withNewId);
                if (validated.success) {
                  useEditorStore.getState().addElement(validated.data);
                }
              }

              if (result.data.gameState) {
                const gs = { ...result.data.gameState };
                if (gs.cameraFollowId && idMap.has(gs.cameraFollowId)) {
                  gs.cameraFollowId = idMap.get(gs.cameraFollowId);
                }
                useEditorStore.getState().setGameState(gs);
              }

              description = result.data.description;
            } else {
              return { success: false };
            }
          }
        }
      }

      return { success: true, description };
    };

    try {
      // Stop the elapsed-time ticker before we render the final state. The
      // try/finally below also guards against early-throw paths.
      const stopAndContinue = () => stopTicker();
      let result;
      try {
        result = await doFetch();
      } finally {
        stopAndContinue();
      }

      // Retry once on validation failure
      if (!result.success && !result.error) {
        try {
          result = await doFetch();
        } finally {
          stopAndContinue();
        }
        if (!result.success) {
          removeLoadingMessage();
          addMessage({
            id: (Date.now() + Math.random()).toString(),
            role: 'ai',
            type: 'error',
            content:
              "I couldn't process that request. The AI response didn't match the expected format. Please try rephrasing.",
          });
          setIsLoading(false);
          return;
        }
      }

      removeLoadingMessage();

      if (result.error) {
        addMessage({
          id: (Date.now() + Math.random()).toString(),
          role: 'ai',
          type: 'error',
          content: result.error,
        });
      } else {
        addMessage({
          id: (Date.now() + Math.random()).toString(),
          role: 'ai',
          type: 'text',
          content: result.description ?? 'Done!',
        });
      }
    } catch (err: unknown) {
      stopTicker();
      removeLoadingMessage();
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Intentional abort -- silently ignore
        setIsLoading(false);
        return;
      }
      addMessage({
        id: (Date.now() + Math.random()).toString(),
        role: 'ai',
        type: 'error',
        content: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, addMessage, removeLoadingMessage]);

  return { messages, setMessages, input, setInput, sendMessage, isLoading, clearWelcome };
}
