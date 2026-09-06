import { Key, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/useTheme";
import { themes, type Theme, type ThemeSettings } from "@/lib/client/themes";
import { api } from "@/lib/api";
import { getTimezone, setTimezone } from "@/lib/client/datetime";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { validatePassword } from "@/lib/client/validatePassword";
import { PasswordHints } from "@/components/ui/PasswordHints";
import { Alert, Button, PasswordInput, SegmentedControl, Select, TextInput } from "@/components/ui";

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

  const tz = getTimezone();
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
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold">{t("settings.heading")}</h2>
        <p className="text-sm text-[var(--muted-foreground)]">{t("settings.description")}</p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t("settings.language")}</h3>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <SegmentedControl value={i18n.language} onChange={(value) => void i18n.changeLanguage(value)} data={LANG_OPTIONS} fullWidth />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock size={14} /> {t("settings.timezone")}</h3>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <Select
            value={tz}
            onChange={(value) => { if (value) setTimezone(value); }}
            data={COMMON_TIMEZONES.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))}
            searchable
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-2">{t("settings.timezoneHint")}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Key size={14} /> {t("settings.security")}</h3>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
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
            {pwError && <Alert color="danger" variant="light">{pwError}</Alert>}
            {pwSuccess && <Alert color="success" variant="light">{pwSuccess}</Alert>}
            <Button
              type="submit" disabled={pwLoading}
              loading={pwLoading}
              className="sm:self-start"
            >
              {t("settings.changePassword")}
            </Button>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t("settings.appearance")}</h3>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-4">
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

      <AiSettingsSection />
    </div>
  );
}

function AiSettingsSection() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: async (data: { baseUrl?: string; apiKey?: string; model?: string }) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading || !settings?.ai) return null;

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">AI Analysis</h3>
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-4">
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
      <Select
        value={value}
        onChange={(next) => { if (next) onChange(next); }}
        data={options.map((theme) => ({ value: theme.id, label: theme.name }))}
        className="flex-1"
      />
    </div>
  );
}
