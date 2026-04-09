'use server';

import { cookies } from 'next/headers';
import { type Locale, locales } from '@/i18n/config';

export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) {
    throw new Error('Invalid locale');
  }

  const cookieStore = await cookies();
  cookieStore.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
}
