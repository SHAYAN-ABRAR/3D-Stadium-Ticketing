'use client';
/** Order code + email, checked against the orders saved in this browser; then the order page. */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { getStore } from '@/data';
import { normaliseOrderCode } from '@/lib/tickets/codes';
import { buttonClass } from '../ui/atoms';

const INPUT = 'mt-1 block min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink';

export function LookupForm({ initialCode }: { initialCode: string }) {
  const t = useTranslations('lookup');
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!normaliseOrderCode(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage(t('invalid'));
      return;
    }
    setBusy(true);
    setMessage(null);
    const found = await getStore()
      .lookupOrder(code, email)
      .catch(() => undefined);
    if (found) {
      router.push(`/orders/${found}`);
      return;
    }
    setMessage(found === null ? t('notFound') : t('error'));
    setBusy(false);
  };

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="mt-5">
      <label htmlFor="lk-code" className="font-semibold">
        {t('code')}
      </label>
      <input
        id="lk-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-describedby="lk-code-hint"
        className={`${INPUT} font-display text-xl tracking-wider uppercase`}
      />
      <p id="lk-code-hint" className="mt-1 text-sm text-muted">
        {t('codeHint')}
      </p>
      <label htmlFor="lk-email" className="mt-4 block font-semibold">
        {t('email')}
      </label>
      <input
        id="lk-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={INPUT}
      />
      {message ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"
        >
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass('primary', 'mt-5 w-full')}>
        {busy ? t('working') : t('submit')}
      </button>
    </form>
  );
}
