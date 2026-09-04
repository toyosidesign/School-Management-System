import { useAccessibility, DEFAULT_PREFS } from '../context/AccessibilityContext';
import Icon from './Icon';
import Select from './Select';
import { Toggle } from './ui';

const FONTS = [
  { value: 'standard', label: 'Standard', sample: 'Aa', note: 'Inter' },
  { value: 'opendyslexic', label: 'OpenDyslexic', sample: 'Aa', note: 'Weighted letterforms' },
  { value: 'lexend', label: 'Lexend', sample: 'Aa', note: 'Wider spacing' },
] as const;

const TINTS = [
  { value: 'white', label: 'White', swatch: '#ffffff', ring: '#cbd5e1' },
  { value: 'blue', label: 'Soft blue', swatch: '#d0e8f2', ring: '#7dd3fc' },
  { value: 'yellow', label: 'Light yellow', swatch: '#fdf6d8', ring: '#fcd34d' },
  { value: 'dark', label: 'Dark mode', swatch: '#0b1220', ring: '#475569' },
] as const;

/**
 * The SEN Accessibility Toolbar (PRD §8.3). Rendered as a right-hand sheet on
 * desktop and a full-height drawer on mobile, with the same controls either way.
 */
export default function AccessibilityToolbar() {
  const { prefs, set, savePreset, reset, saving, saved, open, setOpen } = useAccessibility();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex justify-end bg-slate-900/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <aside
        role="dialog" aria-modal="true" aria-label="Accessibility settings"
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-[color:var(--surface-raised)] shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Icon name="accessibility" className="h-5 w-5 text-brand-600" />
            Accessibility settings
          </h2>
          <button className="btn-subtle !px-2.5" onClick={() => setOpen(false)} aria-label="Close accessibility settings" autoFocus>
            <Icon name="x" />
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
          {/* ── Typography ── */}
          <fieldset>
            <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft">Typography</legend>

            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Reading font">
              {FONTS.map((f) => (
                <button
                  key={f.value} role="radio" aria-checked={prefs.font === f.value}
                  onClick={() => set({ font: f.value })}
                  className={`rounded-xl border-2 px-2 py-3 text-center transition ${
                    prefs.font === f.value ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                  }`}
                  data-tap
                >
                  <span
                    className="block text-2xl font-bold text-ink"
                    style={{ fontFamily: f.value === 'opendyslexic' ? "'OpenDyslexic', 'Comic Sans MS'" : f.value === 'lexend' ? 'Lexend' : 'Inter' }}
                  >
                    {f.sample}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold leading-tight text-ink">{f.label}</span>
                  <span className="block text-[10px] leading-tight text-ink-faint">{f.note}</span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label !mb-0">Text size</span>
                <span className="text-sm font-bold tabular-nums text-ink">{prefs.text_scale}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost !px-3" onClick={() => set({ text_scale: Math.max(80, prefs.text_scale - 10) })}
                        aria-label="Decrease text size">−</button>
                <input
                  type="range" min={80} max={175} step={5} value={prefs.text_scale}
                  onChange={(e) => set({ text_scale: Number(e.target.value) })}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[color:var(--surface-sunken)] accent-brand-600"
                  aria-label="Text size percentage"
                />
                <button className="btn-ghost !px-3" onClick={() => set({ text_scale: Math.min(175, prefs.text_scale + 10) })}
                        aria-label="Increase text size">+</button>
              </div>
            </div>

            <div className="mt-3">
              <Toggle
                checked={!!prefs.bionic} onChange={(v) => set({ bionic: v ? 1 : 0 })}
                label="Bionic reading mode"
                hint="Bolds the first part of each word to guide the eye"
              />
              {!!prefs.bionic && (
                <p className="mt-1 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2 text-sm text-ink">
                  <b>Rea</b>ding <b>be</b>comes <b>eas</b>ier <b>wh</b>en <b>ea</b>ch <b>wo</b>rd <b>ha</b>s <b>a</b>n <b>anc</b>hor.
                </p>
              )}
            </div>
          </fieldset>

          {/* ── Colour ── */}
          <fieldset>
            <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft">Colour overlays &amp; contrast</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Background tint">
              {TINTS.map((t) => (
                <button
                  key={t.value} role="radio" aria-checked={prefs.tint === t.value}
                  onClick={() => set({ tint: t.value })}
                  className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition ${
                    prefs.tint === t.value ? 'border-brand-600' : 'border-line hover:border-brand-300'
                  }`}
                  data-tap
                >
                  <span className="h-7 w-7 shrink-0 rounded-lg border" style={{ background: t.swatch, borderColor: t.ring }} />
                  <span className="text-sm font-medium text-ink">{t.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* ── Sensory & assistive ── */}
          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Sensory &amp; assistive</legend>
            <div className="space-y-1">
              <Toggle checked={!!prefs.high_targets} onChange={(v) => set({ high_targets: v ? 1 : 0 })}
                      label="High target click areas" hint="Every control becomes at least 48 × 48 px" />
              <Toggle checked={!!prefs.captions} onChange={(v) => set({ captions: v ? 1 : 0 })}
                      label="Auto-show closed captions" hint="Captions on by default in every video" />
              <Toggle checked={!!prefs.low_sensory} onChange={(v) => set({ low_sensory: v ? 1 : 0 })}
                      label="Low-sensory mode" hint="Mutes animations and decorative movement" />
              <Toggle checked={!!prefs.focus_mode} onChange={(v) => set({ focus_mode: v ? 1 : 0 })}
                      label="Focus mode" hint="Hides secondary panels and clutter · Alt + F" />
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="voice-speed">Read-aloud speed</label>
              <Select
                id="voice-speed"
                value={String(prefs.voice_speed)}
                onChange={(v) => set({ voice_speed: Number(v) })}
                options={[0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6].map((s) => ({
                  value: String(s),
                  label: `${s.toFixed(2).replace(/0$/, '')}\u00d7${s === 1 ? ' (normal)' : ''}`,
                }))}
              />
            </div>
          </fieldset>
        </div>

        <footer className="space-y-2 border-t border-line px-5 py-4">
          <button className="btn-primary w-full" onClick={savePreset} disabled={saving}>
            <Icon name={saved ? 'check' : 'shield'} className="h-4 w-4" />
            {saving ? 'Saving…' : saved ? 'Saved as your default' : 'Save as my default preset'}
          </button>
          <button
            className="btn-subtle w-full"
            onClick={reset}
            disabled={JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFS)}
          >
            Reset to standard
          </button>
          <p className="text-center text-xs text-ink-faint">
            Your preset follows you on phone, tablet and desktop.
          </p>
        </footer>
      </aside>
    </div>
  );
}
