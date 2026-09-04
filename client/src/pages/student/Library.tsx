import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch';
import Icon from '../../components/Icon';
import { Badge, EmptyState, ErrorNote, Loading, PageHeader, ProgressBar } from '../../components/ui';

export default function StudentLibrary() {
  const { data, loading, error, reload } = useFetch<any[]>('/textbooks');

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        icon="book" title="E-textbook library"
        subtitle="Every book opens in the reader with read-aloud, font and colour settings built in."
      />

      {(data ?? []).length === 0 ? (
        <EmptyState icon="book" title="No books for your year group yet" body="Your teachers will publish reading material here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((b) => (
            <Link
              key={b.id} to={`/student/library/${b.id}`}
              className="card group flex gap-4 p-4 transition hover:border-brand-300 hover:shadow-md"
            >
              <span
                className="grid h-24 w-16 shrink-0 place-items-center rounded-lg text-white shadow-inner"
                style={{ background: `linear-gradient(140deg, ${b.cover_colour}, ${b.cover_colour}bb)` }}
              >
                <Icon name="book" className="h-7 w-7" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-2 font-bold leading-snug text-ink">{b.title}</span>
                <span className="mt-0.5 text-xs text-ink-soft">{b.author}</span>
                <span className="mt-auto pt-3">
                  {b.current_page > 0 ? (
                    <ProgressBar value={b.current_page} max={b.total_pages} label={`Page ${b.current_page} of ${b.total_pages}`} />
                  ) : (
                    <Badge tone="slate">{b.total_pages} pages</Badge>
                  )}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
