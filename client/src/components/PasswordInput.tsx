import { useState } from 'react';
import Icon from './Icon';

/**
 * A password box you can look inside.
 *
 * Typing a password blind is how people mistype one and conclude the account is
 * broken, so every password field in the app offers the same eye: the field
 * stays masked by default, and revealing it is the person's own decision. The
 * button is skipped by the tab order — reaching the next field matters more —
 * and it says which state it is in for a screen reader.
 */
export default function PasswordInput({ className = '', ...props }:
  React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={shown ? 'text' : 'password'} className={`input pr-11 ${className}`} />
      <button
        type="button" tabIndex={-1} onClick={() => setShown(!shown)}
        aria-label={shown ? 'Hide the password' : 'Show the password'} aria-pressed={shown}
        title={shown ? 'Hide' : 'Show'}
        className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-[color:var(--surface-sunken)] hover:text-ink"
      >
        <Icon name={shown ? 'eye-off' : 'eye'} className="h-5 w-5" />
      </button>
    </span>
  );
}
