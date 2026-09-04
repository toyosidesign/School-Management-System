import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import { useBranding, HEADING_FONTS } from '../../context/BrandingContext';
import { useToast } from '../../context/ToastContext';
import { PRESET_COLOURS, contrastOn, isHex, scaleFrom } from '../../lib/palette';
import Icon from '../../components/Icon';
import Select from '../../components/Select';
import { Badge, ChipRail, ErrorNote, Field, Loading, PageHeader, Toggle } from '../../components/ui';

/** A spread of marks a school might pick, rather than a free-text box alone. */
const FAVICON_CHOICES = ['\u{1F393}', '\u{1F4DA}', '\u{270F}\u{FE0F}', '\u{1F3EB}', '\u{1F31F}', '\u{1F331}',
                         '\u{1F9ED}', '\u{1F3A8}', '\u{1F52C}', '\u{26BD}', '\u{1F3B5}', '\u{1F54A}\u{FE0F}'];

const TABS = [
  { value: 'brand', label: 'Brand' },
  { value: 'contact', label: 'Contact & social' },
  { value: 'content', label: 'Page content' },
  { value: 'news', label: 'News' },
];

export default function Website() {
  const { reload: reloadBranding, preview } = useBranding();
  const { toast } = useToast();
  const settings = useFetch<any>('/website/settings');
  const [tab, setTab] = useState('brand');
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settings.data) setForm(settings.data); }, [settings.data]);

  // Live-preview brand changes across the whole app while editing.
  useEffect(() => {
    if (!form) return;
    preview({
      brand_primary: form.brand_primary, brand_accent: form.brand_accent,
      heading_font: form.heading_font, name: form.name,
      monogram: form.monogram, favicon_emoji: form.favicon_emoji, logo_url: form.logo_url,
      favicon_url: form.favicon_url,
    });
    return () => preview(null);
  }, [form?.brand_primary, form?.brand_accent, form?.heading_font, form?.name,
      form?.monogram, form?.favicon_emoji, form?.logo_url, form?.favicon_url]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/website/settings', form);
      await reloadBranding();
      preview(null);
      toast('Saved. Your website and portal now use these settings.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const next = await api.post('/website/settings/logo', fd);
      setForm(next);
      await reloadBranding();
      toast('Logo uploaded.');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const removeLogo = async () => {
    const next = await api.delete('/website/settings/logo');
    setForm({ ...form, logo_url: null });
    await reloadBranding();
    toast('Logo removed. The monogram will be used instead.');
  };

  const uploadFavicon = async (file: File) => {
    const fd = new FormData();
    fd.append('favicon', file);
    try {
      setForm(await api.post('/website/settings/favicon', fd));
      await reloadBranding();
      toast('Tab icon uploaded.');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const removeFavicon = async () => {
    try {
      setForm(await api.delete('/website/settings/favicon'));
      await reloadBranding();
      toast('Back to the symbol tab icon.');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  if (settings.loading || !form) return <Loading rows={4} />;
  if (settings.error) return <ErrorNote error={settings.error} onRetry={settings.reload} />;

  const set = (k: string) => (e: any) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <PageHeader
        icon="globe" title="Website &amp; branding"
        subtitle="Everything here shows on your public website and throughout the staff, pupil and parent portals."
        actions={
          <>
            <a href="/" target="_blank" rel="noreferrer" className="btn-ghost">
              <Icon name="eye" className="h-4 w-4" /> View site
            </a>
            <button className="btn-primary" onClick={save} disabled={busy}>
              <Icon name="check" className="h-4 w-4" /> {busy ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      />

      <div className="mb-6"><ChipRail ariaLabel="Website settings sections" value={tab} onChange={setTab} options={TABS} /></div>

      {tab === 'brand' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-5">
            <section className="card p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">Identity</h2>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="School name" required>
                    <input className="input" value={form.name ?? ''} onChange={set('name')} />
                  </Field>
                  <Field label="Short name" hint="Used where space is tight.">
                    <input className="input" value={form.short_name ?? ''} onChange={set('short_name')} />
                  </Field>
                </div>
                <Field label="Tagline" hint="One sentence, shown in the site footer.">
                  <input className="input" value={form.tagline ?? ''} onChange={set('tagline')} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Monogram" hint="Used if no logo is set.">
                    <input className="input" maxLength={3} value={form.monogram ?? ''} onChange={set('monogram')} />
                  </Field>
                  <Field label="Established">
                    <input className="input" value={form.established_year ?? ''} onChange={set('established_year')} />
                  </Field>
                </div>
              </div>
            </section>

            <section className="card p-5">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">Logo</h2>
              <p className="mb-4 text-xs text-ink-faint">PNG, JPG or WebP, up to 2 MB. A transparent PNG works best.</p>
              {form.logo_url ? (
                <div className="flex flex-wrap items-center gap-4">
                  <img src={form.logo_url} alt="Current logo" className="h-14 max-w-[14rem] rounded-lg border border-line bg-white object-contain p-2" />
                  <button className="btn-ghost" onClick={removeLogo}><Icon name="trash" className="h-4 w-4" /> Remove</button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-5 hover:border-brand-400">
                  <Icon name="upload" className="h-6 w-6 text-ink-faint" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Upload a logo</span>
                    <span className="block text-xs text-ink-faint">Otherwise the monogram below is used</span>
                  </span>
                  <input type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp"
                         onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                </label>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">Tab icon</h2>
              <p className="mb-4 text-xs text-ink-faint">
                The small icon in the browser tab. Pick a symbol or upload a square image; an uploaded one is used
                wherever both are set.
              </p>

              <div className="mb-4 flex flex-wrap items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-line bg-white">
                  {form.favicon_url
                    ? <img src={form.favicon_url} alt="Current tab icon" className="h-9 w-9 object-contain" />
                    : <span className="text-3xl leading-none">{form.favicon_emoji || FAVICON_CHOICES[0]}</span>}
                </span>
                <p className="flex-1 text-sm text-ink-soft">
                  {form.favicon_url ? 'Using your uploaded icon.' : 'Using a symbol.'}
                </p>
                {form.favicon_url && (
                  <button className="btn-ghost" onClick={removeFavicon}>
                    <Icon name="trash" className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>

              {!form.favicon_url && (
                <div className="mb-4">
                  <span className="label">Choose a symbol</span>
                  <div className="flex flex-wrap gap-2">
                    {FAVICON_CHOICES.map((choice) => (
                      <button
                        key={choice} type="button"
                        onClick={() => setForm({ ...form, favicon_emoji: choice })}
                        aria-label={`Use ${choice}`} aria-pressed={form.favicon_emoji === choice}
                        className={`grid h-11 w-11 place-items-center rounded-xl border text-2xl leading-none transition ${
                          form.favicon_emoji === choice
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                            : 'border-line hover:border-brand-300'
                        }`}
                      >
                        {choice}
                      </button>
                    ))}
                    <input
                      className="input !w-20 text-center text-xl" maxLength={4}
                      value={form.favicon_emoji ?? ''} onChange={set('favicon_emoji')}
                      aria-label="Or type your own symbol" title="Or type your own"
                    />
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-4 hover:border-brand-400">
                <Icon name="upload" className="h-5 w-5 text-ink-faint" />
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {form.favicon_url ? 'Replace the icon' : 'Upload an icon instead'}
                  </span>
                  <span className="block text-xs text-ink-faint">Square PNG, JPG or WebP, up to 512 KB. 64x64 is plenty.</span>
                </span>
                <input type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp"
                       onChange={(e) => e.target.files?.[0] && uploadFavicon(e.target.files[0])} />
              </label>
            </section>

            <section className="card p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">Colours</h2>
              <p className="mb-4 text-xs text-ink-faint">
                Pick one primary colour. Every shade the interface needs is generated from it automatically.
              </p>

              <div className="mb-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {PRESET_COLOURS.map((p) => (
                  <button
                    key={p.name} type="button" title={p.name}
                    onClick={() => setForm({ ...form, brand_primary: p.primary, brand_accent: p.accent })}
                    className={`h-11 rounded-xl border-2 transition ${
                      form.brand_primary === p.primary ? 'border-ink scale-105' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: p.primary }}
                    aria-label={`Use the ${p.name} colour scheme`}
                  />
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ColourField label="Primary" value={form.brand_primary} onChange={(v) => setForm({ ...form, brand_primary: v })} />
                <ColourField label="Accent" value={form.brand_accent} onChange={(v) => setForm({ ...form, brand_accent: v })} />
              </div>

              <div className="mt-5">
                <p className="label">Generated scale</p>
                <div className="flex overflow-hidden rounded-xl border border-line">
                  {isHex(form.brand_primary) && Object.entries(scaleFrom(form.brand_primary)).map(([stop, rgb]) => (
                    <span key={stop} className="h-10 flex-1" style={{ background: `rgb(${rgb})` }} title={`brand-${stop}`} />
                  ))}
                </div>
              </div>
            </section>

            <section className="card p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">Heading font</h2>
              <div className="grid gap-2 sm:grid-cols-4">
                {HEADING_FONTS.map((f) => (
                  <button
                    key={f} type="button" onClick={() => setForm({ ...form, heading_font: f })}
                    className={`rounded-xl border-2 p-3 text-center transition ${
                      form.heading_font === f ? 'border-brand-600 bg-brand-600/8' : 'border-line hover:border-brand-300'
                    }`}
                  >
                    <span className="block truncate text-lg font-bold text-ink" style={{ fontFamily: `'${f}'` }}>Aa</span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-soft">{f}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-faint">
                This applies to headings on the public site only. Body text always follows each user's own
                accessibility preference, which must stay under their control.
              </p>
            </section>

            <section className="card p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">Admissions</h2>
              <Toggle
                checked={!!form.admissions_open} onChange={(v) => setForm({ ...form, admissions_open: v ? 1 : 0 })}
                label="Accepting applications" hint="When off, the public application form is replaced with a notice"
              />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Academic year"><input className="input" value={form.academic_year ?? ''} onChange={set('academic_year')} /></Field>
                <Field label="Currency" hint="Used for fees and invoices.">
                  <select className="input" value={form.currency ?? 'USD'} onChange={set('currency')}>
                    {['USD', 'GBP', 'EUR', 'NGN', 'CAD', 'AUD', 'ZAR', 'KES', 'GHS', 'INR'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>
          </div>

          <aside className="min-w-0">
            <div className="lg:sticky lg:top-24">
              <BrandPreview form={form} />
            </div>
          </aside>
        </div>
      )}

      {tab === 'contact' && (
        <section className="card max-w-3xl p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">Contact details</h2>
          <div className="space-y-4">
            <Field label="Address"><input className="input" value={form.address ?? ''} onChange={set('address')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone"><input className="input" type="tel" value={form.phone ?? ''} onChange={set('phone')} /></Field>
              <Field label="Email"><input className="input" type="email" value={form.email ?? ''} onChange={set('email')} /></Field>
            </div>
            <Field label="Office hours"><input className="input" value={form.office_hours ?? ''} onChange={set('office_hours')} /></Field>
            <Field label="Map embed URL" hint="From Google Maps: Share, then Embed a map, then copy the src value only.">
              <input className="input" type="url" value={form.map_embed_url ?? ''} onChange={set('map_embed_url')} placeholder="https://www.google.com/maps/embed?..." />
            </Field>

            <h2 className="!mt-8 mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">Social links</h2>
            <p className="mb-3 text-xs text-ink-faint">Leave blank to hide a link from the site footer.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facebook"><input className="input" type="url" value={form.facebook_url ?? ''} onChange={set('facebook_url')} /></Field>
              <Field label="Instagram"><input className="input" type="url" value={form.instagram_url ?? ''} onChange={set('instagram_url')} /></Field>
              <Field label="X"><input className="input" type="url" value={form.x_url ?? ''} onChange={set('x_url')} /></Field>
              <Field label="LinkedIn"><input className="input" type="url" value={form.linkedin_url ?? ''} onChange={set('linkedin_url')} /></Field>
            </div>
          </div>
        </section>
      )}

      {tab === 'content' && <ContentEditor />}
      {tab === 'news' && <NewsEditor />}
    </>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} error={!isHex(value) ? 'Must be a hex colour such as #2563eb' : undefined}>
      <div className="flex gap-2">
        <input
          type="color" value={isHex(value) ? value : '#2563eb'} onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1"
          aria-label={`${label} colour picker`}
        />
        <input className="input font-mono" value={value ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </div>
    </Field>
  );
}

/** Shows the school's identity applied to real interface pieces, not swatches. */
function BrandPreview({ form }: { form: any }) {
  const primary = isHex(form.brand_primary) ? form.brand_primary : '#2563eb';
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-line px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
        Live preview
      </p>

      <div className="p-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-line p-3">
          {form.logo_url ? (
            <img src={form.logo_url} alt="" className="h-9 w-auto max-w-[8rem] object-contain" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-xl text-base font-black"
                  style={{ background: primary, color: contrastOn(primary) }}>
              {form.monogram || 'S'}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold text-ink">{form.name || 'Your School'}</span>
            <span className="block text-[11px] text-ink-faint">{form.favicon_emoji} browser tab icon</span>
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          <button className="btn-primary w-full" type="button">Primary button</button>
          <button className="btn-ghost w-full" type="button">Secondary button</button>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">Brand badge</Badge>
            <Badge tone="green">Success</Badge>
            <Badge tone="amber">Warning</Badge>
          </div>
          <div className="rounded-xl bg-brand-600/10 p-3">
            <p className="text-sm font-semibold text-brand-700">Tinted panel</p>
            <p className="text-xs text-ink-soft">Used for highlights and callouts.</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
            <div className="h-full w-2/3 rounded-full bg-brand-600" />
          </div>
          <p className="font-display text-lg font-bold text-ink">Heading in {form.heading_font}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Page content ─────────────────────────────────────────────────────────── */
function ContentEditor() {
  const { toast } = useToast();
  const { reload } = useBranding();
  const content = useFetch<any[]>('/website/content');
  const [page, setPage] = useState('home');
  const [saving, setSaving] = useState<string | null>(null);

  if (content.loading) return <Loading rows={3} />;
  if (content.error) return <ErrorNote error={content.error} onRetry={content.reload} />;

  const rows = (content.data ?? []).filter((c) => c.page === page);
  const pageNames = [...new Set((content.data ?? []).map((c) => c.page))];

  const uploadMedia = async (block: any, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api.post(`/website/content/${block.page}/${block.slot}/media`, fd);
      await Promise.all([content.reload(), reload()]);
      toast('Image uploaded.');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const removeMedia = async (block: any) => {
    await api.delete(`/website/content/${block.page}/${block.slot}/media`);
    await Promise.all([content.reload(), reload()]);
    toast('Image removed.');
  };

  const saveBlock = async (block: any, patch: any) => {
    setSaving(`${block.page}/${block.slot}`);
    try {
      await api.put(`/website/content/${block.page}/${block.slot}`, { ...block, ...patch });
      await Promise.all([content.reload(), reload()]);
      toast('Content updated.');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="mb-5">
        <ChipRail
          ariaLabel="Choose a page" value={page} onChange={setPage}
          options={pageNames.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
        />
      </div>

      <div className="space-y-4">
        {rows.map((block) => (
          <ContentBlock
            key={`${block.page}/${block.slot}`} block={block}
            saving={saving === `${block.page}/${block.slot}`}
            onSave={(patch) => saveBlock(block, patch)}
            onUpload={(file: File) => uploadMedia(block, file)}
            onRemoveMedia={() => removeMedia(block)}
          />
        ))}
      </div>
    </>
  );
}

function ContentBlock({ block, onSave, saving, onUpload, onRemoveMedia }: any) {
  const [heading, setHeading] = useState(block.heading ?? '');
  const [body, setBody] = useState(block.body ?? '');
  const [extra, setExtra] = useState(block.extra ? JSON.stringify(block.extra, null, 2) : '');
  const [extraError, setExtraError] = useState('');

  const dirty = heading !== (block.heading ?? '') || body !== (block.body ?? '') ||
                extra !== (block.extra ? JSON.stringify(block.extra, null, 2) : '');

  const save = () => {
    let parsed = null;
    if (extra.trim()) {
      try { parsed = JSON.parse(extra); } catch { setExtraError('This is not valid JSON. Check the brackets and commas.'); return; }
    }
    setExtraError('');
    onSave({ heading: heading || null, body: body || null, extra: parsed });
  };

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wide text-brand-600">{block.slot.replace(/_/g, ' ')}</h3>
        <button className="btn-primary !py-1.5 !text-xs" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving...' : 'Save block'}
        </button>
      </div>

      <div className="space-y-3">
        <Field label="Heading">
          <input className="input" value={heading} onChange={(e) => setHeading(e.target.value)} />
        </Field>
        <Field label="Body text">
          <textarea className="input min-h-[5rem] resize-y" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {(block.extra || extra) && (
          <Field
            label="Structured content"
            hint="Lists of cards, stats or steps shown on this block. Edit the values, keep the shape."
            error={extraError}
          >
            <textarea className="input min-h-[10rem] resize-y font-mono text-xs" value={extra}
                      onChange={(e) => setExtra(e.target.value)} spellCheck={false} />
          </Field>
        )}

        <div>
          <span className="label">Image</span>
          {block.media_url ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-3">
              <img src={block.media_url} alt="" className="h-24 w-32 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-ink-faint">{block.media_url}</p>
                <p className="mt-1 text-xs text-ink-soft">Shown in place of the built-in illustration.</p>
              </div>
              <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onRemoveMedia}>
                <Icon name="trash" className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line p-4 hover:border-brand-400">
              <Icon name="upload" className="h-5 w-5 shrink-0 text-ink-faint" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Add a photograph</span>
                <span className="block text-xs text-ink-faint">
                  PNG, JPG or WebP up to 8 MB. Landscape works best; the hero crops to a rounded shape.
                </span>
              </span>
              <input
                type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
              />
            </label>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── News ─────────────────────────────────────────────────────────────────── */
function NewsEditor() {
  const { toast } = useToast();
  const posts = useFetch<any[]>('/website/news');
  const [form, setForm] = useState<any>({ title: '', excerpt: '', body: '', category: 'news', cover_colour: '#2563eb' });
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/website/news', form);
      setForm({ title: '', excerpt: '', body: '', category: 'news', cover_colour: '#2563eb' });
      posts.reload();
      toast('Published to the website.');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (p: any) => {
    await api.patch(`/website/news/${p.id}`, { is_published: !p.is_published });
    posts.reload();
    toast(p.is_published ? 'Unpublished.' : 'Published.');
  };

  const remove = async (p: any) => {
    await api.delete(`/website/news/${p.id}`);
    posts.reload();
    toast('Article deleted.');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0">
        {posts.loading && <Loading rows={3} />}
        <ul className="space-y-3">
          {(posts.data ?? []).map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{p.category}</Badge>
                    <Badge tone={p.is_published ? 'green' : 'slate'}>{p.is_published ? 'Published' : 'Draft'}</Badge>
                  </div>
                  <h3 className="font-bold text-ink">{p.title}</h3>
                  {p.excerpt && <p className="mt-1 text-sm text-ink-soft">{p.excerpt}</p>}
                  <p className="mt-1 font-mono text-[11px] text-ink-faint">/news/{p.slug}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="btn-ghost !py-1.5 !text-xs" onClick={() => togglePublished(p)}>
                    {p.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className="btn-subtle !px-2.5" onClick={() => remove(p)} aria-label={`Delete ${p.title}`}>
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={create} className="card h-fit p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">New article</h2>
        <div className="space-y-3">
          <Field label="Title" required>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Category">
            <Select
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={[{ value: "news", label: "News" }, { value: "notice", label: "Notice" }, { value: "event", label: "Event" }]}
              />
          </Field>
          <Field label="Excerpt" hint="One or two lines shown on the news list.">
            <textarea className="input min-h-[4rem] resize-y" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
          </Field>
          <Field label="Body" required hint="Leave a blank line between paragraphs.">
            <textarea className="input min-h-[10rem] resize-y" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy || !form.title || !form.body}>
          {busy ? 'Publishing...' : 'Publish article'}
        </button>
      </form>
    </div>
  );
}
