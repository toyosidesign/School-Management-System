import Icon from './Icon';

/**
 * An action reduced to its icon, which says what it is when pointed at.
 *
 * A row of buttons repeated down a table is mostly noise: the same four words
 * eleven times, competing with the record they belong to. An icon gives the
 * row back to its content, and the label appears on hover and on keyboard
 * focus — never only on hover, which would leave it unreachable for anybody
 * not using a mouse. `aria-label` carries the same words for a screen reader,
 * so nothing depends on seeing the tooltip at all.
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
  const tones = {
    default: 'text-ink-faint hover:bg-[color:var(--surface-sunken)] hover:text-ink',
    brand: 'text-ink-faint hover:bg-brand-50 hover:text-brand-700',
    danger: 'text-ink-faint hover:bg-red-50 hover:text-red-700',
  };

  const inner = (
    <>
      <Icon name={icon} className="h-4 w-4" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-[color:var(--surface-raised)] shadow-lg group-hover:block group-focus-visible:block"
      >
        {label}
      </span>
    </>
  );

  const className = `group relative grid h-8 w-8 place-items-center rounded-lg transition-colors ${
    tones[tone]} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`;

  if (as === 'link' && href) {
    return <a href={href} className={className} aria-label={label}>{inner}</a>;
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
      {inner}
    </button>
  );
}
