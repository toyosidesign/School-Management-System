import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch';
import { dateLong, time } from '../../lib/format';
import Icon from '../../components/Icon';
import { Readable, SpeakButton } from '../../components/Readable';
import { Badge, ChipRail, EmptyState, ErrorNote, Loading } from '../../components/ui';
import PageHero from './PageHero';

export function NewsList() {
  const posts = useFetch<any[]>('/public/news?limit=30');
  const events = useFetch<any[]>('/public/events');
  const [category, setCategory] = useState('');

  const shown = (posts.data ?? []).filter((p) => !category || p.category === category);

  return (
    <>
      <PageHero
        heading="News and events"
        body="What is happening at the school, plus the dates families need in the diary."
      />

      <div className="mx-auto max-w-site px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="min-w-0">
            <div className="mb-6">
              <ChipRail
                ariaLabel="Filter news by category" value={category} onChange={setCategory}
                options={[
                  { value: '', label: 'Everything', count: (posts.data ?? []).length },
                  { value: 'news', label: 'News' },
                  { value: 'notice', label: 'Notices' },
                  { value: 'event', label: 'Events' },
                ]}
              />
            </div>

            {posts.loading && <Loading rows={3} />}
            {posts.error && <ErrorNote error={posts.error} onRetry={posts.reload} />}
            {!posts.loading && shown.length === 0 && (
              <EmptyState icon="file" title="Nothing posted yet" body="Check back soon." />
            )}

            <div className="space-y-4">
              {shown.map((p) => (
                <Link key={p.id} to={`/news/${p.slug}`}
                      className="card flex gap-4 overflow-hidden p-5 transition hover:border-brand-300 hover:shadow-md">
                  <span className="hidden w-1.5 shrink-0 rounded-full sm:block" style={{ background: p.cover_colour }} />
                  <span className="min-w-0 flex-1">
                    <span className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{p.category}</Badge>
                      <span className="text-xs text-ink-faint">{dateLong(p.published_at)}</span>
                    </span>
                    <span className="block font-display text-lg font-bold leading-snug text-ink">{p.title}</span>
                    {p.excerpt && <span className="mt-1.5 block text-sm leading-relaxed text-ink-soft">{p.excerpt}</span>}
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                      Read more <Icon name="chevronRight" className="h-4 w-4" />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <aside className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Coming up</h2>
            {(events.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-ink-faint">No public events scheduled.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {events.data!.map((e) => (
                  <li key={e.id} className="card flex gap-3 p-4">
                    <span className="w-12 shrink-0 rounded-xl bg-[color:var(--surface-sunken)] py-2 text-center">
                      <span className="block text-[10px] font-bold uppercase text-ink-soft">
                        {new Date(e.start_at).toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                      <span className="block text-lg font-bold tabular-nums text-ink">{new Date(e.start_at).getDate()}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-snug text-ink">{e.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-soft">
                        {e.all_day ? 'All day' : time(e.start_at)}{e.location ? ` · ${e.location}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

export function NewsArticle() {
  const { slug } = useParams();
  const { data, loading, error } = useFetch<any>(`/public/news/${slug}`);

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6"><Loading rows={3} /></div>;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <EmptyState icon="search" title="Article not found"
                    body="This post may have been unpublished."
                    action={<Link className="btn-primary" to="/news">Back to news</Link>} />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Link to="/news" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> News and events
      </Link>

      <Badge tone="brand">{data.category}</Badge>
      <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">{data.title}</h1>
      <p className="mt-3 text-sm text-ink-soft">
        {dateLong(data.published_at)}{data.author ? ` · ${data.author}` : ''}
      </p>

      <div className="mt-4"><SpeakButton text={`${data.title}. ${data.body}`} label="Read this page aloud" /></div>

      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-ink">
        {String(data.body).split('\n\n').map((para: string, i: number) => (
          <Readable key={i} text={para} />
        ))}
      </div>
    </article>
  );
}
