import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/**
 * An action reduced to its icon, which says what it is when pointed at.
 *
 * A row of buttons repeated down a table is mostly noise: the same words
 * eleven times, competing with the record they belong to. The label appears on
 * hover and on keyboard focus — never only on hover, which would leave it
 * unreachable for anybody not using a mouse — and `aria-label` carries the same
 * words, so nothing depends on seeing it at all.
 *
 * The label is drawn at the top of the document rather than inside the button.
 * A table sits in a card that clips its own corners, and a tooltip in the last
 * column is the one that gets clipped: the action whose name you cannot read
 * ends up being the one at the edge, which is usually the destructive one.
 */
export default function IconButton({
  icon, label, onClick, tone = 'default', disabled, as = 'button', href,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  tone?: 'default' | 'danger' | 'brand';
  disabled?: boolean;
  as?: 'button' | 'link';
  href?: string;
}) {
  const ref = useRef<any>(null);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // Kept on screen: an icon in the last column would otherwise hang its label
    // over the edge of the window.
    const half = 90;
    setSpot({
      top: box.top - 6,
      left: Math.min(Math.max(box.left + box.width / 2, half), window.innerWidth - half),
    });
  };
  const hide = () => setSpot(null);

  const tones = {
    default: 'text-ink-faint hover:bg-[color:var(--surface-sunken)] hover:text-ink',
    brand: 'text-ink-faint hover:bg-brand-50 hover:text-brand-700',
    danger: 'text-ink-faint hover:bg-red-50 hover:text-red-700',
  };

  const className = `grid h-8 w-8 place-items-center rounded-lg transition-colors ${
    tones[tone]} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`;

  const listeners = { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };

  const tip = spot && createPortal(
    <span
      role="tooltip"
      style={{ position: 'fixed', top: spot.top, left: spot.left, transform: 'translate(-50%, -100%)' }}
      className="pointer-events-none z-[130] whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-[color:var(--surface-raised)] shadow-lg"
    >
      {label}
    </span>,
    document.body,
  );

  if (as === 'link' && href) {
    return (
      <>
        <a ref={ref} href={href} className={className} aria-label={label} {...listeners}>
          <Icon name={icon} className="h-4 w-4" />
        </a>
        {tip}
      </>
    );
  }

  return (
    <>
      <button
        ref={ref} type="button" className={className} aria-label={label}
        onClick={onClick} disabled={disabled} {...listeners}
      >
        <Icon name={icon} className="h-4 w-4" />
      </button>
      {tip}
    </>
  );
}
