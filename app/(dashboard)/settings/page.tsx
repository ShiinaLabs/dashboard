import { Key, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/useTheme";
import { themes, type Theme, type ThemeSettings } from "@/lib/client/themes";
import { api } from "@/lib/api";
import { getTimezone, setTimezone as saveTimezone } from "@/lib/client/datetime";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { validatePassword } from "@/lib/client/validatePassword";
import { PasswordHints } from "@/components/ui/PasswordHints";
import { PasswordInput, SegmentedControl, TextInput } from "@/components/ui/form-controls";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoaderCircle } from "lucide-react";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.settings" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

const MODE_OPTIONS = [
  { value: "system" as const },
  { value: "light" as const },
  { value: "dark" as const },
];

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { settings, setSettings } = useTheme();
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [timezone, setTimezone] = useState(getTimezone);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const pwRules = validatePassword(newPw).rules;
  const pwMismatch = confirmPw !== "" && newPw !== confirmPw;

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = (form.get("currentPassword") as string) || "";
    const newPassword = (form.get("newPassword") as string) || "";
    const confirm = (form.get("confirmPassword") as string) || "";

    if (newPassword !== confirm) {
      setPwError(t("settings.passwordsDontMatch"));
      return;
    }
    const pwResult = validatePassword(newPassword);
    if (!pwResult.valid) {
      setPwError(t(`settings.password${pwResult.errorKey}`));
      return;
    }

    setPwLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwSuccess(t("settings.passwordChanged"));
      formElement.reset();
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : String(err));
    } finally {
      setPwLoading(false);
    }
  };

  const allThemes = themes;

  const LANG_OPTIONS = [
    { value: "en" as const, label: "English" },
    { value: "zh" as const, label: "中文" },
  ];

  const MODE_LABELS: Record<string, string> = {
    system: t("settings.modeSystem"),
    light: t("settings.modeLight"),
    dark: t("settings.modeDark"),
  };

  const COMMON_TIMEZONES = [
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Taipei",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Dubai",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Vancouver",
    "America/Buenos_Aires",
    "America/Sao_Paulo",
    "America/Mexico_City",
    "Pacific/Auckland",
    "Australia/Sydney",
    "UTC",
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.heading")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.description")}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold">{t("settings.language")}</h3>
        <div>
          <SegmentedControl value={i18n.language} onChange={(value) => void i18n.changeLanguage(value)} data={LANG_OPTIONS} fullWidth />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock size={14} /> {t("settings.timezone")}</h3>
        <div>
          <SearchableSelect
            value={timezone}
            onValueChange={(nextTimezone) => { setTimezone(nextTimezone); saveTimezone(nextTimezone); }}
            options={COMMON_TIMEZONES.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))}
            searchPlaceholder={t("settings.searchTimezone")}
            emptyMessage={t("settings.noTimezoneResults")}
            aria-label={t("settings.timezone")}
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-2">{t("settings.timezoneHint")}</p>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Key size={14} /> {t("settings.security")}</h3>
        <div>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--muted-foreground)]">{t("settings.currentPassword")}</label>
              <PasswordInput name="currentPassword" autoComplete="current-password" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--muted-foreground)]">{t("settings.newPassword")}</label>
              <PasswordInput
                name="newPassword" autoComplete="new-password"
                value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwError(""); }}
              />
              {newPw && <div className="mt-2"><PasswordHints rules={pwRules} t={t} namespace="settings" /></div>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--muted-foreground)]">{t("settings.confirmPassword")}</label>
              <PasswordInput
                name="confirmPassword" autoComplete="new-password"
                value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setPwError(""); }}
              />
              {pwMismatch && <p className="text-xs text-[var(--danger)] mt-1">{t("settings.passwordsDontMatch")}</p>}
            </div>
            {pwError && <Alert variant="destructive"><AlertDescription>{pwError}</AlertDescription></Alert>}
            {pwSuccess && <Alert className="border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300"><AlertDescription>{pwSuccess}</AlertDescription></Alert>}
            <Button type="submit" disabled={pwLoading} className="sm:self-start">
              {pwLoading && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {t("settings.changePassword")}
            </Button>
          </form>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold">{t("settings.appearance")}</h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("settings.mode")}</p>
            <SegmentedControl value={settings.mode} onChange={(value) => setSettings({ ...settings, mode: value as ThemeSettings["mode"] })} data={MODE_OPTIONS.map(({ value }) => ({ value, label: MODE_LABELS[value] }))} fullWidth />
          </div>

          <div className="space-y-3">
            <div className="space-y-3">
              {(settings.mode === "system" || settings.mode === "light") && (
                <ThemeSelect
                  label={settings.mode === "system" ? t("settings.lightTheme") : t("settings.theme")}
                  options={allThemes}
                  value={settings.lightTheme}
                  onChange={(id) => setSettings({ ...settings, lightTheme: id })}
                />
              )}
              {(settings.mode === "system" || settings.mode === "dark") && (
                <ThemeSelect
                  label={settings.mode === "system" ? t("settings.darkTheme") : t("settings.theme")}
                  options={allThemes}
                  value={settings.darkTheme}
                  onChange={(id) => setSettings({ ...settings, darkTheme: id })}
                />
              )}
            </div>
          </div>
        </div>
      </section>
      </div>

      <AiSettingsSection />
    </div>
  );
}

function AiSettingsSection() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const mutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading || !settings?.ai) return null;

  return (
    <section className="max-w-3xl space-y-4 rounded-lg border bg-card p-5">
      <h3 className="text-sm font-semibold">AI Analysis</h3>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Endpoint URL</label>
          <TextInput
            type="text"
            defaultValue={settings.ai.baseUrl}
            onBlur={(e) => mutation.mutate({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">API Key</label>
          <PasswordInput
            type="password"
            defaultValue={settings.ai.apiKey === "••••••••" ? "" : settings.ai.apiKey}
            onBlur={(e) => { if (e.target.value) mutation.mutate({ apiKey: e.target.value }); }}
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Model</label>
          <TextInput
            type="text"
            defaultValue={settings.ai.model}
            onBlur={(e) => mutation.mutate({ model: e.target.value })}
          />
        </div>
        {saved && <p className="text-sm text-[var(--success)]">{t("aiAgent.saved")}</p>}
      </div>
    </section>
  );
}

function ThemeSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Theme[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-sm text-[var(--muted-foreground)] sm:w-24 sm:shrink-0">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="flex-1" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((theme) => <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
