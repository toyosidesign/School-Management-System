import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';
import { Avatar, Loading, Modal } from './ui';

export type TeacherTarget = {
  kind: 'subject' | 'section';
  id: string | number;
  name: string;
  teachers?: { id: number }[];
};

/**
 * Who teaches a subject, or who works in a part of the school.
 *
 * Both answer the same question from different ends, and both are what fill in
 * a class that has a subject but nobody against it. Saving says how many
 * pairings that settled, so the effect is visible where the decision is made
 * rather than discovered later on a timetable.
 */
export default function TeacherPicker({ target, onClose, onSaved }: {
  target: TeacherTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const staff = useFetch<any[]>('/staff');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setPicked((target.teachers ?? []).map((t) => t.id));
  }, [target]);

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const path = target.kind === 'subject'
        ? `/subjects/${target.id}/teachers`
        : `/sections/${target.id}/teachers`;
      const out = await api.put(path, { teacher_ids: picked });
      toast(out.assigned
        ? `Saved. ${out.assigned} class${out.assigned === 1 ? '' : 'es'} now has a teacher for it.`
        : out.ambiguous
          ? `Saved. ${out.ambiguous} class${out.ambiguous === 1 ? '' : 'es'} still needs to be told which of them takes it.`
          : 'Saved.');
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const teachers = (staff.data ?? []).filter((s: any) => s.role === 'teacher' || s.role === 'admin');

  return (
    <Modal
      open={!!target} onClose={onClose} wide
      title={target?.kind === 'subject' ? `Who teaches ${target.name}` : `Who works in ${target?.name ?? ''}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-soft">
        {target?.kind === 'subject'
          ? 'Where one of them teaches this subject in a class that has nobody against it, they are put there. A class that already has a teacher is left alone.'
          : 'Naming who works here settles which of several subject teachers takes a class in this section.'}
      </p>

      {staff.loading && <Loading rows={3} />}

      {!staff.loading && teachers.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-faint">
          No teaching staff yet. Add them on the Staff page first.
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {teachers.map((t: any) => {
          const on = picked.includes(t.user_id);
          return (
            <li key={t.user_id}>
              <button
                type="button" role="checkbox" aria-checked={on}
                onClick={() => setPicked(on ? picked.filter((id) => id !== t.user_id) : [...picked, t.user_id])}
                className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                  on ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                }`}
              >
                <Avatar first={t.first_name} last={t.last_name} colour={t.avatar_colour}
                        src={t.avatar_url} emoji={t.avatar_emoji} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {t.first_name} {t.last_name}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {t.title || t.department || 'Teacher'}
                  </span>
                </span>
                {on && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={3} />}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
