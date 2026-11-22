'use client';
/** The site navigation below 901 px: a menu button opening a sheet with the links and the language switch. */
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { LanguageSwitcher } from '../LanguageSwitcher';

export interface NavItem {
  href: string;
  label: string;
}

export function MobileMenu({ items, labels }: { items: NavItem[]; labels: { open: string; close: string } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full bg-paper-2 text-ink hover:bg-line"
          aria-label={labels.open}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content className="fixed inset-x-2 top-2 z-50 rounded-card bg-paper p-4 shadow-card focus:outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-display text-2xl font-bold">{labels.open}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-full bg-paper-2 hover:bg-line"
                aria-label={labels.close}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{labels.open}</Dialog.Description>
          <nav className="mt-3">
            <ul className="grid gap-1">
              {items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === it.href ? 'page' : undefined}
                    className="flex min-h-12 items-center rounded-[10px] px-3 text-lg font-semibold hover:bg-paper-2 aria-[current=page]:text-pick-ink"
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4 border-t border-line pt-4">
            <LanguageSwitcher />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
