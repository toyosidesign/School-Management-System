import { useMemo } from 'react';
import { useAccessibility } from '../context/AccessibilityContext';
import Icon from './Icon';

/**
 * Renders body text through the reading engine: Bionic Reading when enabled,
 * plain text otherwise. Never applies to short labels, only prose.
 */
export function Readable({ text, className = '' }: { text: string; className?: string }) {
  const { prefs } = useAccessibility();

  const html = useMemo(() => {
    if (!prefs.bionic || !text) return null;
    return text
      .split(/(\s+)/)
      .map((token) => {
        if (!/\w/.test(token)) return escapeHtml(token);
        const cut = Math.max(1, Math.ceil(token.length * 0.42));
        return `<b>${escapeHtml(token.slice(0, cut))}</b>${escapeHtml(token.slice(cut))}`;
      })
      .join('');
  }, [text, prefs.bionic]);

  if (html) {
    return <p className={`bionic whitespace-pre-wrap ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <p className={`whitespace-pre-wrap ${className}`}>{text}</p>;
}

/** Inline read-aloud button, the TTS half of the reading toolbar (PRD §3.1). */
export function SpeakButton({ text, label = 'Read aloud', compact = false }:
  { text: string; label?: string; compact?: boolean }) {
  const { speak, stopSpeaking, speaking } = useAccessibility();
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => (speaking ? stopSpeaking() : speak(text))}
      className={compact ? 'btn-subtle !px-2.5 !py-1.5' : 'btn-ghost'}
      aria-label={speaking ? 'Stop reading aloud' : label}
      data-tap
    >
      <Icon name={speaking ? 'pause' : 'speaker'} className="h-4 w-4" />
      {!compact && <span>{speaking ? 'Stop' : label}</span>}
    </button>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
