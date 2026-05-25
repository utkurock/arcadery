'use client';

import { useEffect, useRef } from 'react';

// Fires per-game analytics events to /api/games/[slug]/event. Mount-once
// 'view' is best-effort with `keepalive: true` so the event survives a quick
// tab close. 'play_start' is signalled imperatively by the parent (it knows
// when the runtime actually enters the playing state).
//
// Owner views are dropped server-side, so callers don't need to gate them
// here — passing `isOwner` is purely an optimisation to avoid one no-op
// request per owner page load.

interface Props {
  slug: string;
  isOwner?: boolean;
}

export interface AnalyticsBeaconHandle {
  fire: (eventType: 'view' | 'play_start' | 'score_submit') => void;
}

function postEvent(slug: string, eventType: string) {
  try {
    fetch(`/api/published/${encodeURIComponent(slug)}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: eventType }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // navigator-blocked fetch — silently drop. Analytics is best-effort.
  }
}

/** Fires `view` once on mount unless the viewer is the owner. */
export function AnalyticsBeacon({ slug, isOwner }: Props) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (isOwner) return;
    postEvent(slug, 'view');
  }, [slug, isOwner]);
  return null;
}

/** Imperative helper for events the parent triggers (play_start, score_submit). */
export function fireGameEvent(slug: string, eventType: 'play_start' | 'score_submit') {
  postEvent(slug, eventType);
}
