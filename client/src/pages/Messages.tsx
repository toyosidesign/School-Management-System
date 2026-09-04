import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { relative, dateTime } from '../lib/format';
import Icon from '../components/Icon';
import Select from '../components/Select';
import { Readable, SpeakButton } from '../components/Readable';
import { Avatar, Badge, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader } from '../components/ui';

/**
 * Parent ↔ teacher messaging with inline translation (PRD §4.2).
 * Two-pane on desktop; on mobile the thread list and the conversation swap in place.
 */
export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const threads = useFetch<any[]>('/threads');
  const languages = useFetch<Record<string, string>>('/languages');
  const contacts = useFetch<any[]>('/contacts');

  const [activeId, setActiveId] = useState<number | null>(null);
  const [lang, setLang] = useState(user.locale ?? 'en');

  // Changing language in the header changes what is read here too.
  useEffect(() => { setLang(user.locale ?? 'en'); }, [user.locale]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [newThread, setNewThread] = useState({ subject: '', participant_ids: [] as number[], body: '' });
  const endRef = useRef<HTMLDivElement>(null);

  const active = (threads.data ?? []).find((t) => t.id === activeId);

  const loadMessages = async (id: number, language = lang) => {
    setLoadingMsgs(true);
    try {
      setMessages(await api.get(`/threads/${id}/messages?lang=${language}`));
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => { if (activeId) loadMessages(activeId); /* eslint-disable-next-line */ }, [activeId, lang]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-open the first conversation on a wide screen.
  useEffect(() => {
    if (!activeId && threads.data?.length && window.innerWidth >= 1024) setActiveId(threads.data[0].id);
  }, [threads.data, activeId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/threads/${activeId}/messages`, { body: draft.trim(), source_lang: 'en' });
      setDraft('');
      await loadMessages(activeId!);
      threads.reload();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const startThread = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const t = await api.post('/threads', newThread);
      toast('Conversation started.');
      setComposing(false);
      setNewThread({ subject: '', participant_ids: [], body: '' });
      await threads.reload();
      setActiveId(t.id);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (threads.loading) return <Loading rows={4} />;
  if (threads.error) return <ErrorNote error={threads.error} onRetry={threads.reload} />;

  return (
    <>
      <PageHeader
        icon="message" title="Messages"
        subtitle="Direct, verified conversations. Switch language and every message is translated inline."
        actions={<button className="btn-primary" onClick={() => setComposing(true)}><Icon name="plus" className="h-4 w-4" /> New message</button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* ── Thread list ── */}
        <aside className={`${activeId ? 'hidden lg:block' : 'block'} min-w-0`}>
          {(threads.data ?? []).length === 0 ? (
            <EmptyState
              icon="message" title="No conversations yet"
              body={user.role === 'parent' ? 'Start a conversation with one of your child’s teachers.' : 'Start a conversation with a parent.'}
              action={<button className="btn-primary" onClick={() => setComposing(true)}>New message</button>}
            />
          ) : (
            <ul className="space-y-2">
              {threads.data!.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={`card w-full p-3 text-left transition hover:border-brand-300 ${
                      activeId === t.id ? 'border-brand-500 ring-2 ring-brand-500/20' : ''
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-ink">{t.subject}</span>
                      {t.unread > 0 && (
                        <span className="grid h-5 min-w-[1.25rem] shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white leading-none">
                          {t.unread}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs font-medium text-ink-soft">{t.participants}</p>
                    {t.student_name && <p className="truncate text-[11px] text-ink-faint">About {t.student_name}</p>}
                    {t.last_message && <p className="mt-1 line-clamp-1 text-xs text-ink-faint">{t.last_message}</p>}
                    {t.last_at && <p className="mt-1 text-[11px] text-ink-faint">{relative(t.last_at)}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Conversation ── */}
        <section className={`${activeId ? 'block' : 'hidden lg:block'} min-w-0`}>
          {!active ? (
            <EmptyState icon="message" title="Choose a conversation" body="Pick a thread from the list to read and reply." />
          ) : (
            <div className="card flex h-[calc(100vh-16rem)] min-h-[28rem] flex-col overflow-hidden">
              <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <button className="btn-subtle !px-2 lg:hidden" onClick={() => setActiveId(null)} aria-label="Back to conversations">
                  <Icon name="chevronLeft" className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-ink">{active.subject}</h2>
                  <p className="truncate text-xs text-ink-soft">{active.participants}</p>
                </div>
                <label className="flex shrink-0 items-center gap-1.5">
                  <Icon name="globe" className="h-4 w-4 text-ink-faint" />
                  <span className="sr-only">Translate messages into</span>
                  <Select className="!min-h-0 !w-auto !py-1.5 !text-xs"
                    value={lang}
                    onChange={(v) => setLang(v)}
                    options={Object.entries(languages.data ?? { en: 'English' })
                      .map(([code, name]) => ({ value: code, label: String(name) }))}
                  />
                </label>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {loadingMsgs && <Loading rows={2} label="Loading conversation" />}
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-2.5 ${m.mine ? 'flex-row-reverse' : ''}`}>
                    <Avatar first={m.first_name} last={m.last_name} colour={m.avatar_colour} src={m.avatar_url} emoji={m.avatar_emoji} size="sm" />
                    <div className={`min-w-0 max-w-[85%] ${m.mine ? 'items-end text-right' : ''}`}>
                      <p className="mb-1 text-[11px] font-semibold text-ink-soft">
                        {m.first_name} {m.last_name} <span className="font-normal text-ink-faint">· {relative(m.created_at)}</span>
                      </p>
                      <div className={`rounded-2xl px-3.5 py-2.5 text-left ${
                        m.mine ? 'bg-brand-600 text-white' : 'bg-[color:var(--surface-sunken)] text-ink'
                      }`}>
                        {m.translated ? (
                          <>
                            <Readable text={m.translated} className="text-sm" />
                            <details className="mt-2">
                              <summary className={`cursor-pointer text-[11px] font-semibold ${m.mine ? 'text-white/70' : 'text-ink-faint'}`}>
                                Show original
                              </summary>
                              <p className={`mt-1 text-xs ${m.mine ? 'text-white/80' : 'text-ink-soft'}`}>{m.body}</p>
                            </details>
                          </>
                        ) : (
                          <Readable text={m.body} className="text-sm" />
                        )}
                      </div>
                      <div className={`mt-1 flex gap-1 ${m.mine ? 'justify-end' : ''}`}>
                        {m.translated && <Badge tone="slate" icon="globe">Translated</Badge>}
                        <SpeakButton text={m.translated ?? m.body} compact />
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
                <label className="sr-only" htmlFor="draft">Write a message</label>
                <textarea
                  id="draft" className="input min-h-[2.75rem] resize-none" rows={1} value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }}
                  placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                />
                <button className="btn-primary shrink-0 !px-4" disabled={sending || !draft.trim()} aria-label="Send message">
                  <Icon name="chevronRight" className="h-5 w-5" />
                </button>
              </form>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={composing} onClose={() => setComposing(false)} title="Start a conversation"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setComposing(false)}>Cancel</button>
            <button className="btn-primary" form="thread-form" disabled={!newThread.subject || !newThread.participant_ids.length}>
              Start conversation
            </button>
          </>
        }
      >
        <form id="thread-form" onSubmit={startThread} className="space-y-4">
          <Field label="Subject" required>
            <input className="input" value={newThread.subject} required
                   onChange={(e) => setNewThread({ ...newThread, subject: e.target.value })}
                   placeholder="e.g. Reading progress this term" />
          </Field>

          <fieldset>
            <legend className="label">Who are you writing to?</legend>
            {(contacts.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-faint">No contacts available yet.</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                {contacts.data!.map((c) => {
                  const picked = newThread.participant_ids.includes(c.id);
                  return (
                    <button
                      key={c.id} type="button" role="checkbox" aria-checked={picked}
                      onClick={() => setNewThread({
                        ...newThread,
                        participant_ids: picked
                          ? newThread.participant_ids.filter((id) => id !== c.id)
                          : [...newThread.participant_ids, c.id],
                      })}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                        picked ? 'bg-brand-600/10' : 'hover:bg-[color:var(--surface-sunken)]'
                      }`}
                      data-tap
                    >
                      <Avatar first={c.first_name} last={c.last_name} colour={c.avatar_colour} src={c.avatar_url} emoji={c.avatar_emoji} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{c.first_name} {c.last_name}</span>
                        <span className="block truncate text-xs text-ink-faint">{c.context}</span>
                      </span>
                      {picked && <Icon name="check" className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <Field label="First message">
            <textarea className="input min-h-[6rem] resize-y" value={newThread.body}
                      onChange={(e) => setNewThread({ ...newThread, body: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
