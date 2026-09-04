import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAccessibility } from '../../context/AccessibilityContext';
import { clamp } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable, SpeakButton } from '../../components/Readable';
import { ErrorNote, Loading, ProgressBar } from '../../components/ui';

const WINDOW = 5; // pages fetched per request, progressive loading (PRD §4.1)

/**
 * E-textbook reader. Pages load in windows of five rather than as one payload,
 * and the whole Accessibility Reading Toolbar is available inline.
 */
export default function StudentReader() {
  const { id } = useParams();
  const { prefs, set, setOpen } = useAccessibility();
  const [book, setBook] = useState<any>(null);
  const [pages, setPages] = useState<Record<number, any>>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadWindow = useCallback(async (from: number) => {
    const res = await api.get(`/textbooks/${id}/pages?from=${from}&size=${WINDOW}`);
    setBook(res.book);
    setPages((cur) => {
      const next = { ...cur };
      for (const p of res.pages) next[p.page_number] = p;
      return next;
    });
    return res;
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await loadWindow(1);
        if (!alive) return;
        // Resume where the reader left off.
        const saved = res.book.current_page;
        if (saved > 1) { setPage(saved); await loadWindow(saved); }
      } catch (e: any) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadWindow]);

  // Prefetch the next window as the reader nears the edge of what is loaded.
  useEffect(() => {
    if (!book) return;
    if (!pages[page]) loadWindow(page).catch(() => {});
    else if (page + 2 <= book.total_pages && !pages[page + 2]) loadWindow(page + 1).catch(() => {});
  }, [page, book, pages, loadWindow]);

  // Persist reading position, debounced.
  useEffect(() => {
    if (!book) return;
    const t = setTimeout(() => api.put(`/textbooks/${id}/progress`, { page_number: page }).catch(() => {}), 900);
    return () => clearTimeout(t);
  }, [page, book, id]);

  // Arrow keys turn pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.key === 'ArrowRight') setPage((p) => clamp(p + 1, 1, book?.total_pages ?? 1));
      if (e.key === 'ArrowLeft') setPage((p) => clamp(p - 1, 1, book?.total_pages ?? 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book?.total_pages]);

  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [page]);

  if (loading) return <Loading rows={3} label="Opening your book" />;
  if (error) return <ErrorNote error={error} />;

  const current = pages[page];

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/student/library" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> Library
      </Link>

      {/* ── Reading toolbar ── */}
      <div className="card sticky top-16 z-30 mb-4 p-3 lg:top-16">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-ink">{book.title}</h1>
            <p className="truncate text-xs text-ink-faint">{book.author}</p>
          </div>
          <SpeakButton text={current ? `${current.heading}. ${current.content}` : ''} label="Read page aloud" compact />
          <button
            className={`btn-subtle !px-2.5 ${prefs.bionic ? '!bg-brand-600 !text-white' : ''}`}
            onClick={() => set({ bionic: prefs.bionic ? 0 : 1 })}
            aria-pressed={!!prefs.bionic} title="Bionic reading mode"
          >
            <b className="text-xs">B</b>
          </button>
          <button className="btn-subtle !px-2.5" onClick={() => set({ text_scale: Math.max(80, prefs.text_scale - 10) })} aria-label="Smaller text">A−</button>
          <button className="btn-subtle !px-2.5" onClick={() => set({ text_scale: Math.min(175, prefs.text_scale + 10) })} aria-label="Larger text">A+</button>
          <button className="btn-subtle !px-2.5" onClick={() => setOpen(true)} aria-label="All accessibility settings">
            <Icon name="accessibility" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2.5">
          <ProgressBar value={page} max={book.total_pages} label={`Page ${page} of ${book.total_pages}`} />
        </div>
      </div>

      {/* ── Page ── */}
      <article ref={contentRef} className="card min-h-[24rem] p-5 sm:p-8" aria-live="polite">
        {current ? (
          <>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-600">Page {page}</p>
            <h2 className="mb-4 text-xl font-bold text-ink sm:text-2xl">{current.heading}</h2>
            <Readable text={current.content} className="text-[15px] leading-relaxed text-ink sm:text-base" />
          </>
        ) : (
          <div className="space-y-3"><div className="skeleton h-6 w-1/3" /><div className="skeleton h-40 w-full" /></div>
        )}
      </article>

      {/* ── Pager ── */}
      <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Page navigation">
        <button className="btn-ghost" onClick={() => setPage((p) => clamp(p - 1, 1, book.total_pages))} disabled={page === 1}>
          <Icon name="chevronLeft" className="h-4 w-4" /> Previous
        </button>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="sr-only sm:not-sr-only">Go to page</span>
          <input
            type="number" min={1} max={book.total_pages} value={page}
            onChange={(e) => setPage(clamp(Number(e.target.value) || 1, 1, book.total_pages))}
            className="input w-20 !py-2 text-center tabular-nums" aria-label="Page number"
          />
          <span className="tabular-nums text-ink-faint">/ {book.total_pages}</span>
        </label>
        <button className="btn-ghost" onClick={() => setPage((p) => clamp(p + 1, 1, book.total_pages))} disabled={page === book.total_pages}>
          Next <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
