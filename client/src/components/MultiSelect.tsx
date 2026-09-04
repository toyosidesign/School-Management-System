import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type MultiOption = { value: string; label: string; hint?: string };

/**
 * A dropdown that takes several answers.
 *
 * The same list as a single select, but the question is "which of these", not
 * "which one": the subjects a teacher takes, the years they work in. It stays
 * open while choices are made, because closing after each one turns picking
 * four things into four trips, and it reads back what has been chosen rather
 * than a count, so a glance down a form says what is set.
 *
 * The list is drawn at the top of the document for the same reason the single
 * select does it: inside a dialog that scrolls its own body, an absolutely
 * positioned list is clipped by it.
 */
export default function MultiSelect({
  value, onChange, options, placeholder = 'Choose', empty, disabled, id, ariaLabel,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiOption[];
  placeholder?: string;
  empty?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; drop: 'down' | 'up' } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  const place = () => {
    const trigger = ref.current?.getBoundingClientRect();
    if (!trigger) return;
    const below = window.innerHeight - trigger.bottom;
    const drop = below < 260 && trigger.top > below ? 'up' : 'down';
    setBox({
      width: trigger.width,
      left: trigger.left,
      top: drop === 'down' ? trigger.bottom + 6 : trigger.top - 6,
      drop,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)
          && !(e.target as HTMLElement).closest(`[data-list="${listId}"]`)) {
        setOpen(false);
      }
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, listId]);

  const toggle = (option: MultiOption) => {
    onChange(value.includes(option.value)
      ? value.filter((v) => v !== option.value)
      : [...value, option.value]);
  };

  const chosen = options.filter((o) => value.includes(o.value));
  const label = chosen.length ? chosen.map((o) => o.label).join(', ') : placeholder;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" id={id} disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        className={`input flex w-full items-center justify-between gap-2 text-left ${
          open ? 'border-brand-500 ring-2 ring-brand-500/25' : ''
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        data-tap
      >
        <span className={`min-w-0 truncate ${chosen.length ? 'text-ink' : 'text-ink-faint'}`}>{label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {chosen.length > 1 && (
            <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
              {chosen.length}
            </span>
          )}
          <Icon name="chevronDown" className={`h-4 w-4 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && box && createPortal(
        <ul
          role="listbox" aria-multiselectable data-list={listId}
          style={{
            position: 'fixed', left: box.left, width: box.width,
            ...(box.drop === 'down' ? { top: box.top } : { bottom: window.innerHeight - box.top }),
          }}
          className="z-[120] max-h-64 overflow-auto rounded-xl border border-line bg-[color:var(--surface-raised)] p-1 shadow-xl animate-fade-up"
        >
          {options.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-ink-faint">{empty ?? 'Nothing to choose from'}</li>
          )}
          {options.map((option) => {
            const on = value.includes(option.value);
            return (
              <li key={option.value}>
                <div
                  role="option" aria-selected={on}
                  onClick={() => toggle(option)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[color:var(--surface-sunken)]"
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border-2 ${
                    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line'
                  }`}>
                    {on && <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{option.label}</span>
                    {option.hint && <span className="block truncate text-xs text-ink-faint">{option.hint}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
