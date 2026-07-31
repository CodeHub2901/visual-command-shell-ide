// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { englishMessages } from "./messages/en";

export type MessageId = keyof typeof englishMessages;
export type MessageValues = Readonly<Record<string, string | number>>;
export type MessageCatalog = Readonly<Record<MessageId, string>>;
export type SupportedLocale = "en";

export type Translator = Readonly<{
  locale: SupportedLocale;
  t: (id: MessageId, values?: MessageValues) => string;
  plural: (
    ids: Readonly<{ one?: MessageId; other: MessageId }>,
    count: number,
    values?: MessageValues
  ) => string;
  formatDateTime: (value: Date | string | number) => string;
  formatTime: (value: Date | string | number) => string;
  formatNumber: (value: number) => string;
}>;

const catalogs = {
  en: englishMessages
} satisfies Record<SupportedLocale, MessageCatalog>;

export function resolveSupportedLocale(
  requested: readonly string[],
  available: readonly SupportedLocale[] = Object.keys(catalogs) as SupportedLocale[]
): SupportedLocale {
  for (const candidate of requested) {
    const normalized = candidate.trim().toLowerCase();
    const exact = available.find((locale) => locale === normalized);
    if (exact !== undefined) return exact;
    const language = normalized.split("-")[0];
    const match = available.find((locale) => locale === language);
    if (match !== undefined) return match;
  }
  return "en";
}

export function createTranslator(
  locale: SupportedLocale,
  catalog: Partial<MessageCatalog> = catalogs[locale]
): Translator {
  const interpolate = (id: MessageId, values: MessageValues = {}) => {
    const template = catalog[id] ?? englishMessages[id];
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, name: string) => {
      const value = values[name];
      if (value === undefined) {
        throw new Error(`Missing localization value "${name}" for "${id}"`);
      }
      return String(value);
    });
  };
  const pluralRules = new Intl.PluralRules(locale);
  return {
    locale,
    t: interpolate,
    plural: (ids, count, values = {}) => {
      const category = pluralRules.select(count);
      const id = category === "one" ? (ids.one ?? ids.other) : ids.other;
      return interpolate(id, { count, ...values });
    },
    formatDateTime: (value) => new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value)),
    formatTime: (value) => new Intl.DateTimeFormat(locale, {
      timeStyle: "medium"
    }).format(new Date(value)),
    formatNumber: (value) => new Intl.NumberFormat(locale).format(value)
  };
}
