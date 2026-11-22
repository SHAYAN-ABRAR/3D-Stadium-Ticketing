/**
 * The tab's session: holds belong to it, as they belonged to a visitor's session on a server. It lives in
 * sessionStorage, so a reload keeps the hold, and two tabs behave like two visitors (they can't take each
 * other's held seats). Orders belong to the whole browser.
 */
import { newId } from '@/lib/tickets/codes';

const KEY = 'stadium.session.v1';
let fallback: string | null = null;

export function tabSession(): string {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: one session for this page's lifetime.
    fallback ??= newId();
    return fallback;
  }
}
