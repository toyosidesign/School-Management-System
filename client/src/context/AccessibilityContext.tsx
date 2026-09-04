import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';

export type Prefs = {
  font: 'standard' | 'opendyslexic' | 'lexend';
  text_scale: number;
  bionic: number;
  tint: 'white' | 'blue' | 'yellow' | 'dark';
  high_targets: number;
  captions: number;
  low_sensory: number;
  focus_mode: number;
  voice_speed: number;
};

export const DEFAULT_PREFS: Prefs = {
  font: 'standard', text_scale: 100, bionic: 0, tint: 'white',
  high_targets: 0, captions: 0, low_sensory: 0, focus_mode: 0, voice_speed: 1,
};

type Value = {
  prefs: Prefs;
  set: (patch: Partial<Prefs>) => void;
  savePreset: () => Promise<void>;
  reset: () => void;
  saving: boolean;
  saved: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  speaking: boolean;
};

const Ctx = createContext<Value>(null!);
export const useAccessibility = () => useContext(Ctx);

const LOCAL_KEY = 'sms.prefs';

/**
 * The SEN engine. Preferences are applied as data-attributes on <html> so every
 * screen (desktop, tablet and mobile) adapts without a second app (PRD §3).
 * They persist locally for instant boot and sync to the server as the default preset.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') }; }
    catch { return DEFAULT_PREFS; }
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Pull the saved server-side preset once signed in.
  useEffect(() => {
    if (!getToken()) return;
    api.get('/accessibility/prefs')
      .then((p) => setPrefs((cur) => ({ ...cur, ...stripMeta(p) })))
      .catch(() => {});
  }, []);

  // Apply to the document root.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.font = prefs.font;
    root.dataset.tint = prefs.tint;
    root.dataset.targets = prefs.high_targets ? 'on' : 'off';
    root.dataset.sensory = prefs.low_sensory ? 'low' : 'normal';
    root.dataset.focus = prefs.focus_mode ? 'on' : 'off';
    root.style.setProperty('--text-scale', String((prefs.text_scale || 100) / 100));
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const set = useCallback((patch: Partial<Prefs>) => {
    setSaved(false);
    setPrefs((cur) => ({ ...cur, ...patch }));
  }, []);

  const savePreset = useCallback(async () => {
    setSaving(true);
    try {
      await api.put('/accessibility/prefs', prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const reset = useCallback(() => set(DEFAULT_PREFS), [set]);

  /* ── Text-to-speech (PRD §3.1 inline TTS) ── */
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = prefs.voice_speed || 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [prefs.voice_speed]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // Keyboard shortcut: Alt+A opens the toolbar, Alt+F toggles Focus Mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key.toLowerCase() === 'a') { e.preventDefault(); setOpen((v) => !v); }
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); set({ focus_mode: prefs.focus_mode ? 0 : 1 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.focus_mode, set]);

  return (
    <Ctx.Provider value={{ prefs, set, savePreset, reset, saving, saved, open, setOpen, speak, stopSpeaking, speaking }}>
      {children}
    </Ctx.Provider>
  );
}

function stripMeta(p: any): Partial<Prefs> {
  if (!p) return {};
  const { user_id, updated_at, ...rest } = p;
  return rest;
}
