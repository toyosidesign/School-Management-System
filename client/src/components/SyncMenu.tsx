import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';

/**
 * The two things a school has already decided but not yet written down
 * everywhere: which classes teach a subject, and who takes them.
 *
 * They belong together because they are the same act — the curriculum and the
 * staff list answering for the classes — and apart because a school often wants
 * one without the other. Both add only what is missing: a pairing that has a
 * teacher, lessons or work behind it is never touched, so either can be run
 * again after new classes, subjects or staff appear.
 */
export default function SyncMenu({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const run = async (what: 'subjects' | 'teachers') => {
    setBusy(what);
    try {
      if (what === 'subjects') {
        const out = await api.post('/subjects/offer-to-classes', {});
        toast(out.added
          ? `${out.added} subject${out.added === 1 ? '' : 's'} added to classes. Each still needs a teacher.`
          : 'Every class already teaches its section’s subjects.');
      } else {
        const out = await api.post('/teaching/sync', {});
        // Names the subjects it is waiting on. "283 classes have nobody" is a
        // number to despair at; "Art and PE name no teacher" is an afternoon's
        // work, and it is the same fact.
        const waiting = (out.waiting_on ?? []) as string[];
        const named = waiting.slice(0, 3).join(', ')
          + (waiting.length > 3 ? ` and ${waiting.length - 3} more` : '');

        toast(
          out.assigned
            ? `${out.assigned} class${out.assigned === 1 ? '' : 'es'} now has a teacher for its subject.`
            : waiting.length
              ? `Nothing left to fill in. ${named} name${waiting.length === 1 ? 's' : ''} no teacher, which is what ${out.unanswered} class${out.unanswered === 1 ? ' is' : 'es are'} waiting on. Set that on the Subjects page or on each teacher's record.`
              : out.ambiguous
                ? `${out.ambiguous} class${out.ambiguous === 1 ? '' : 'es'} still needs telling which of several teachers takes it. Naming who works in each year group settles it.`
                : 'Every class already has a teacher for what it takes.',
        );
      }
      onDone?.();
      setOpen(false);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const items = [
    {
      key: 'subjects' as const,
      label: 'Subjects to classes',
      hint: 'Every class picks up what its section teaches',
    },
    {
      key: 'teachers' as const,
      label: 'Teachers to classes',
      hint: 'Fills in who takes each subject, where it is not in doubt',
    },
  ];

  return (
    <div className="relative" ref={box}>
      <button className="btn-ghost" aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen(!open)} disabled={!!busy}>
        <Icon name="sparkle" className="h-4 w-4" />
        {busy ? 'Syncing...' : 'Sync'}
        <Icon name="chevronDown" className="h-3.5 w-3.5 text-ink-faint" />
      </button>

      {open && (
        <div
          role="menu" aria-label="Sync"
          className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-[color:var(--surface-raised)] shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key} role="menuitem" disabled={!!busy}
              onClick={() => run(item.key)}
              className="block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-sunken)] disabled:opacity-60"
            >
              <span className="block text-sm font-semibold text-ink">{item.label}</span>
              <span className="block text-xs text-ink-faint">{item.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
