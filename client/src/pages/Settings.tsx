import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { useToast } from '../context/ToastContext';
import PasswordInput from '../components/PasswordInput';
import Icon from '../components/Icon';
import RolesAndAccess from '../components/RolesAndAccess';
import { Avatar, Badge, Field, PageHeader, Toggle } from '../components/ui';

/** A friendly spread rather than a full picker: enough to feel like yours. */
const AVATAR_COLOURS = [
  '#2563eb', '#0891b2', '#0d9488', '#16a34a', '#65a30d',
  '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#9333ea',
  '#7c3aed', '#4f46e5', '#475569', '#0f766e', '#b45309',
];

const AVATAR_EMOJI = [
  '', '⭐', '🚀', '🦊', '🐙', '🦕', '🐝', '🦋', '🌻', '🌈',
  '⚽', '🎨', '🎵', '📚', '🔬', '🧩', '🏀', '🐢', '🦉', '🍀',
];

const TINTS = [
  { value: 'white', label: 'White', swatch: '#ffffff' },
  { value: 'blue', label: 'Soft blue', swatch: '#d0e8f2' },
  { value: 'yellow', label: 'Light yellow', swatch: '#fdf6d8' },
  { value: 'dark', label: 'Dark', swatch: '#0b1220' },
] as const;

const FONTS = [
  { value: 'standard', label: 'Standard' },
  { value: 'opendyslexic', label: 'OpenDyslexic' },
  { value: 'lexend', label: 'Lexend' },
] as const;

export default function Settings() {
  const { user, refresh } = useAuth();
  const { prefs, set, savePreset, saving, saved } = useAccessibility();
  const { toast } = useToast();

  const isStudent = user.role === 'student';
  const [form, setForm] = useState({
    preferred_name: user.preferred_name ?? '',
    avatar_colour: user.avatar_colour ?? '#2563eb',
    avatar_emoji: user.avatar_emoji ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  /**
   * Shrinks to a square before uploading.
   *
   * A phone photograph is several megabytes and thousands of pixels wide, for a
   * circle rendered at 40. Resizing on the device keeps the upload small, avoids
   * an image library on the server, and means families on mobile data are not
   * pushing 8 MB up the line for an avatar.
   */
  const shrink = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not process that image'));
        // Cover: crop the long edge rather than squashing the picture.
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image'))), 'image/jpeg', 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read')); };
      img.src = url;
    });

  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.jpg');
      await api.post('/auth/profile/avatar', fd);
      await refresh();
      toast('Picture updated.');
    } catch (e: any) {
      toast(e.message ?? 'Could not upload that picture', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await api.delete('/auth/profile/avatar');
      await refresh();
      toast('Picture removed.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  useEffect(() => {
    setForm({
      preferred_name: user.preferred_name ?? '',
      avatar_colour: user.avatar_colour ?? '#2563eb',
      avatar_emoji: user.avatar_emoji ?? '',
    });
  }, [user.preferred_name, user.avatar_colour, user.avatar_emoji]);

  const dirty =
    form.preferred_name !== (user.preferred_name ?? '') ||
    form.avatar_colour !== (user.avatar_colour ?? '#2563eb') ||
    form.avatar_emoji !== (user.avatar_emoji ?? '');

  const saveProfile = async () => {
    setBusy(true);
    try {
      await api.patch('/auth/profile', form);
      await refresh();
      toast('Saved. That is how you will appear from now on.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon="settings"
        title="My settings"
        subtitle={isStudent
          ? 'Make the app yours: pick a colour, choose what we call you, and set up how you like to read.'
          : 'Your display name, avatar and reading preferences.'}
        actions={
          <button className="btn-primary" onClick={saveProfile} disabled={!dirty || busy}>
            <Icon name="check" className="h-4 w-4" /> {busy ? 'Saving...' : 'Save changes'}
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0 space-y-5">
          {/* ── Avatar ── */}
          <section className="card p-5">
            <h2 className="font-display text-lg font-bold text-ink">Your avatar</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Use a photograph, or pick a colour and an emoji instead.
            </p>

            <div className="mt-5">
              <span className="label">Photograph</span>
              {user.avatar_url ? (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-3">
                  <img src={user.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  <p className="min-w-0 flex-1 text-xs text-ink-soft">
                    Shown wherever your name appears. Remove it to go back to your colour and emoji.
                  </p>
                  <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={removePhoto} disabled={photoBusy}>
                    <Icon name="trash" className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-4 hover:border-brand-400">
                  <Icon name="upload" className="h-5 w-5 shrink-0 text-ink-faint" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {photoBusy ? 'Uploading...' : 'Upload a picture'}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      PNG, JPG or WebP. It is cropped to a circle and shrunk on your device before sending.
                    </span>
                  </span>
                  <input
                    type="file" className="sr-only" accept="image/png,image/jpeg,image/webp"
                    disabled={photoBusy}
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                  />
                </label>
              )}
            </div>

            <div className="mt-5">
              <span className="label">{user.avatar_url ? "Colour (used if you remove your picture)" : "Colour"}</span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, avatar_colour: c })}
                    aria-label={`Use this colour`}
                    aria-pressed={form.avatar_colour === c}
                    className={`h-10 w-10 rounded-full transition ${
                      form.avatar_colour === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-[color:var(--surface-raised)]' : 'hover:scale-110'
                    }`}
                    style={{ background: c }}
                    data-tap
                  />
                ))}
              </div>
            </div>

            <div className="mt-5">
              <span className="label">Emoji <span className="font-normal text-ink-faint">(optional)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {AVATAR_EMOJI.map((e) => (
                  <button
                    key={e || 'none'}
                    type="button"
                    onClick={() => setForm({ ...form, avatar_emoji: e })}
                    aria-label={e ? `Use the ${e} emoji` : 'Use my initials instead'}
                    aria-pressed={form.avatar_emoji === e}
                    className={`grid h-10 w-10 place-items-center rounded-xl border-2 text-lg transition ${
                      form.avatar_emoji === e ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                    }`}
                    data-tap
                  >
                    {e || <span className="text-[10px] font-bold text-ink-soft">AB</span>}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Name ── */}
          <section className="card p-5">
            <h2 className="font-display text-lg font-bold text-ink">What we call you</h2>
            <p className="mt-1 text-sm text-ink-soft">
              If you go by something other than your first name, put it here. We will use it to say hello.
            </p>
            <div className="mt-4 max-w-sm">
              <Field
                label="Preferred name"
                hint={`Leave blank to use ${user.first_name}. Your full name stays ${user.first_name} ${user.last_name} on registers and reports.`}
              >
                <input
                  className="input"
                  maxLength={40}
                  value={form.preferred_name}
                  onChange={(e) => setForm({ ...form, preferred_name: e.target.value })}
                  placeholder={user.first_name}
                />
              </Field>
            </div>
          </section>

          {/* ── Reading and display ── */}
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">How you like to read</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  The same settings as the toolbar. They follow you onto any device you sign in from.
                </p>
              </div>
              <button className="btn-ghost shrink-0" onClick={savePreset} disabled={saving}>
                <Icon name={saved ? 'check' : 'shield'} className="h-4 w-4" />
                {saving ? 'Saving...' : saved ? 'Saved' : 'Save as my default'}
              </button>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <span className="label">Reading font</span>
                <div className="flex flex-wrap gap-2">
                  {FONTS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => set({ font: f.value })}
                      aria-pressed={prefs.font === f.value}
                      className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                        prefs.font === f.value ? 'border-brand-600 bg-brand-600/8 text-ink' : 'border-line text-ink-soft'
                      }`}
                      style={{ fontFamily: f.value === 'opendyslexic' ? "'OpenDyslexic', 'Comic Sans MS'" : f.value === 'lexend' ? 'Lexend' : 'Inter' }}
                      data-tap
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Background</span>
                <div className="flex flex-wrap gap-2">
                  {TINTS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => set({ tint: t.value })}
                      aria-pressed={prefs.tint === t.value}
                      aria-label={t.label}
                      className={`h-10 w-10 rounded-xl border-2 transition ${
                        prefs.tint === t.value ? 'border-brand-600' : 'border-line hover:border-brand-300'
                      }`}
                      style={{ background: t.swatch }}
                      data-tap
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label !mb-0">Text size</span>
                <span className="text-sm font-bold tabular-nums text-ink">{prefs.text_scale}%</span>
              </div>
              <input
                type="range" min={80} max={175} step={5} value={prefs.text_scale}
                onChange={(e) => set({ text_scale: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--surface-sunken)] accent-brand-600"
                aria-label="Text size percentage"
              />
            </div>

            <div className="mt-4 space-y-1">
              <Toggle checked={!!prefs.bionic} onChange={(v) => set({ bionic: v ? 1 : 0 })}
                      label="Bionic reading" hint="Bolds the start of each word to guide your eye" />
              <Toggle checked={!!prefs.captions} onChange={(v) => set({ captions: v ? 1 : 0 })}
                      label="Always show captions" hint="Subtitles switch on by default in videos" />
              <Toggle checked={!!prefs.high_targets} onChange={(v) => set({ high_targets: v ? 1 : 0 })}
                      label="Bigger buttons" hint="Everything you tap becomes at least 48 pixels" />
              <Toggle checked={!!prefs.low_sensory} onChange={(v) => set({ low_sensory: v ? 1 : 0 })}
                      label="Calm mode" hint="Turns off movement and animation" />
              <Toggle checked={!!prefs.focus_mode} onChange={(v) => set({ focus_mode: v ? 1 : 0 })}
                      label="Focus mode" hint="Hides extra panels so there is less on screen" />
            </div>
          </section>

          {/* Who may do what, for the people who decide it. */}
          {user.role === 'admin' && <RolesAndAccess owner={!!user.is_super_admin} />}

          {isStudent ? (
            <section className="card panel-brand p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                <Icon name="shield" className="shrink-0 h-5 w-5 text-brand-600" /> Signing in
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                You sign in with the code your school gives you, so there is no password to remember or lose.
                If your code stops working, ask your teacher for a new one.
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                Keep your code to yourself. Nobody from school will ever ask you for it.
              </p>
            </section>
          ) : (
            <ChangePassword />
          )}
        </div>

        {/* ── Live preview ── */}
        <aside className="min-w-0">
          <div className="lg:sticky lg:top-24">
            <div className="card overflow-hidden">
              <p className="border-b border-line px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                How you will look
              </p>
              <div className="p-5 text-center">
                <span className="inline-block">
                  <Avatar
                    first={form.preferred_name || user.first_name}
                    last={user.last_name}
                    colour={form.avatar_colour}
                    emoji={form.avatar_emoji}
                    src={user.avatar_url}
                    size="lg"
                  />
                </span>
                <p className="mt-3 font-display text-lg font-bold text-ink">
                  {form.preferred_name || user.first_name} {user.last_name}
                </p>
                {form.preferred_name && form.preferred_name !== user.first_name && (
                  <p className="mt-0.5 text-xs text-ink-faint">On records: {user.first_name} {user.last_name}</p>
                )}
                {user.student?.class_name && (
                  <p className="mt-2"><Badge tone="brand">{user.student.class_name}</Badge></p>
                )}

                <div className="mt-5 rounded-xl bg-[color:var(--surface-sunken)] p-3 text-left">
                  <p className="text-sm text-ink">
                    Good morning, {form.preferred_name || user.first_name}. This is how text will look for you.
                  </p>
                </div>
              </div>
            </div>

            {dirty && (
              <button className="btn-primary mt-4 w-full" onClick={saveProfile} disabled={busy}>
                {busy ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function ChangePassword() {
  const { toast } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast('The two new passwords do not match', 'error');
    setBusy(true);
    try {
      await api.post('/auth/change-password', form);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed.');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-bold text-ink">Password</h2>
      <p className="mt-1 text-sm text-ink-soft">Keep it to yourself. Nobody from school will ever ask you for it.</p>
      <form onSubmit={submit} className="mt-4 grid max-w-lg gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Current password" required>
            <PasswordInput autoComplete="current-password" required
                           value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </Field>
        </div>
        <Field label="New password" required hint="At least 8 characters.">
          <PasswordInput autoComplete="new-password" required minLength={8}
                         value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Field label="Repeat new password" required>
          <PasswordInput autoComplete="new-password" required minLength={8}
                         value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <button className="btn-ghost" disabled={busy || !form.currentPassword || !form.newPassword}>
            {busy ? 'Changing...' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}
