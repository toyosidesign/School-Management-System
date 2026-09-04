import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export type Option = { value: string; label: string; hint?: string; disabled?: boolean; group?: string };

/**
 * The platform's own dropdown.
 *
 * A native `<select>` hands its list to the operating system, which paints it
 * in system chrome: the wrong typeface, the wrong colours, and no idea the app
 * is in dark mode or large-text mode. This renders the list itself so a
 * dropdown looks like everything else here, and keeps what a native select
 * gives for free: keyboard navigation, type-ahead, and an announced role.
 */
export default function Select({
  value, onChange, options, placeholder = 'Choose one', disabled, id, className = '', ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; drop: 'down' | 'up' } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  /**
   * The list is drawn at the top of the document rather than inside the field.
   *
   * A dialog scrolls its own body, and an absolutely positioned list inside one
   * is clipped by it: the options end up cut off or unreachable. Measuring the
   * field and painting the list over the page avoids that wherever a select
   * happens to sit.
   */
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
    // Anything that moves the field moves the list with it.
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const selectable = useMemo(() => options.filter((o) => !o.disabled), [options]);
  const chosen = options.find((o) => o.value === value);

  // Opening lands on what is already chosen, so up and down move from there.
  useEffect(() => {
    if (!open) return;
    const at = selectable.findIndex((o) => o.value === value);
    setActive(at >= 0 ? at : 0);
  }, [open, value, selectable]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      // The list lives outside this element in the DOM, so it is checked too.
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  // Keep the highlighted row in sight when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const pick = (option: Option) => {
    onChange(option.value);
    setOpen(false);
    ref.current?.querySelector('button')?.focus();
  };

  /** Typing letters jumps to a match, as a native select does. */
  const typeAhead = (key: string) => {
    const now = Date.now();
    typed.current.text = now - typed.current.at > 800 ? key : typed.current.text + key;
    typed.current.at = now;

    const at = selectable.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()));
    if (at < 0) return;
    if (open) setActive(at);
    else pick(selectable[at]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Tab') { setOpen(false); return; }

    if (!open && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      typeAhead(e.key);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, selectable.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    if (e.key === 'End') { e.preventDefault(); setActive(selectable.length - 1); }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selectable[active]) pick(selectable[active]);
    }
  };

  // Options may carry a group; headings are drawn where the group changes.
  let lastGroup: string | undefined;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button" id={id} disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`input flex w-full items-center justify-between gap-2 text-left ${
          open ? 'border-brand-500 ring-2 ring-brand-500/25' : ''
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        data-tap
      >
        <span className={`min-w-0 truncate ${chosen ? 'text-ink' : 'text-ink-faint'}`}>
          {chosen?.label ?? placeholder}
        </span>
        <Icon name="chevronDown" className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && box && createPortal(
        <ul
          ref={listRef} id={listId} role="listbox" tabIndex={-1}
          aria-activedescendant={selectable[active] ? `${listId}-${active}` : undefined}
          style={{
            position: 'fixed', left: box.left, width: box.width,
            ...(box.drop === 'down' ? { top: box.top } : { bottom: window.innerHeight - box.top }),
          }}
          className="z-[120] max-h-64 overflow-auto rounded-xl border border-line bg-[color:var(--surface-raised)] p-1 shadow-xl animate-fade-up"
        >
          {options.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-ink-faint">Nothing to choose from</li>
          )}
          {options.map((option) => {
            const index = selectable.indexOf(option);
            const isActive = index === active && index >= 0;
            const selected = option.value === value;
            const heading = option.group && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;

            return (
              <li key={`${option.value}-${option.label}`}>
                {heading && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    {heading}
                  </p>
                )}
                <div
                  id={index >= 0 ? `${listId}-${index}` : undefined}
                  role="option" aria-selected={selected} data-active={isActive}
                  onMouseEnter={() => index >= 0 && setActive(index)}
                  onClick={() => !option.disabled && pick(option)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    option.disabled ? 'cursor-not-allowed text-ink-faint'
                      : isActive ? 'bg-brand-50 text-brand-900'
                      : 'text-ink'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && <span className="block truncate text-xs text-ink-faint">{option.hint}</span>}
                  </span>
                  {selected && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-600" />}
                </div>
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
