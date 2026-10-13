import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, zh: { translation: zh } },
    fallbackLng: "en",
    // Server and browser must start from the same language for hydration.
    // Providers applies stored/browser preferences after hydration; a detector
    // here would cache this fixed English startup language over the preference.
    lng: "en",
    interpolation: { escapeValue: false },
  });
}

if (process.env.NODE_ENV === "development") {
  i18n.on("missingKey", (_lngs, _ns, key) => {
    console.warn(`[i18n] Missing key "${key}"`);
  });
}

export default i18n;
