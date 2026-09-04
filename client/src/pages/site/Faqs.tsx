import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import Icon from '../../components/Icon';
import { ChipRail } from '../../components/ui';
import PageHero from './PageHero';

export default function Faqs() {
  const { pages } = useBranding();
  const page = pages.faqs ?? {};
  const items = page.items?.extra ?? [];
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState<number | null>(0);

  const categories = useMemo(
    () => [...new Set(items.map((i: any) => i.category).filter(Boolean))] as string[],
    [items]
  );
  const shown = items.filter((i: any) => !category || i.category === category);

  return (
    <>
      <PageHero heading={page.hero?.heading ?? 'Frequently asked questions'} body={page.hero?.body} />

      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {categories.length > 1 && (
          <div className="mb-6">
            <ChipRail
              ariaLabel="Filter questions by topic" value={category} onChange={setCategory}
              options={[{ value: '', label: 'All', count: items.length },
                        ...categories.map((c) => ({ value: c, label: c, count: items.filter((i: any) => i.category === c).length }))]}
            />
          </div>
        )}

        <dl className="space-y-3">
          {shown.map((item: any, i: number) => {
            const expanded = open === i;
            return (
              <div key={item.q} className="card overflow-hidden">
                <dt>
                  <button
                    onClick={() => setOpen(expanded ? null : i)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-[color:var(--surface-sunken)]"
                    data-tap
                  >
                    <span className="min-w-0 flex-1 font-semibold text-ink">{item.q}</span>
                    <Icon
                      name="chevronDown"
                      className={`h-5 w-5 shrink-0 text-ink-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </dt>
                {expanded && (
                  <dd className="border-t border-line px-5 py-4 text-[15px] leading-relaxed text-ink-soft">
                    {item.a}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>

        <div className="card mt-8 p-6 text-center">
          <h2 className="font-display text-lg font-bold text-ink">Not answered here?</h2>
          <p className="mt-2 text-sm text-ink-soft">The school office replies to every message, usually the same day.</p>
          <Link to="/contact" className="btn-primary mt-4">Ask us directly</Link>
        </div>
      </div>
    </>
  );
}
