import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";

const isBrowser = typeof window !== "undefined";

if (!i18n.isInitialized) {
  if (isBrowser) {
    i18n.use(LanguageDetector);
  }

  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, zh: { translation: zh } },
    fallbackLng: "en",
    // Server and browser must start from the same language for hydration.
    // Stored/browser language preferences are applied after the first render.
    lng: "en",
    interpolation: { escapeValue: false },
    detection: isBrowser
      ? {
          order: ["localStorage", "navigator"],
          caches: ["localStorage"],
          lookupLocalStorage: "i18n-lang",
        }
      : undefined,
  });
}

if (process.env.NODE_ENV === "development") {
  i18n.on("missingKey", (_lngs, _ns, key) => {
    console.warn(`[i18n] Missing key "${key}"`);
  });
}

export default i18n;
