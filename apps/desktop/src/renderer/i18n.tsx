import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo
} from "react";
import {
  createTranslator,
  resolveSupportedLocale,
  type Translator
} from "../shared/localization";

export {
  createTranslator,
  resolveSupportedLocale,
  type MessageCatalog,
  type MessageId,
  type MessageValues,
  type SupportedLocale,
  type Translator
} from "../shared/localization";

const LocalizationContext = createContext<Translator | null>(null);

export function I18nProvider({
  children,
  requestedLocales
}: {
  children: ReactNode;
  requestedLocales?: readonly string[] | undefined;
}) {
  const locale = resolveSupportedLocale(
    requestedLocales ?? (typeof navigator === "undefined" ? ["en"] : navigator.languages)
  );
  const translator = useMemo(() => createTranslator(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocalizationContext.Provider value={translator}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useI18n(): Translator {
  const translator = useContext(LocalizationContext);
  if (translator === null) throw new Error("useI18n must be used inside I18nProvider");
  return translator;
}
