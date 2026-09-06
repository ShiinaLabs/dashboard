import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FETCH_POLICY } from "@/lib/application/scheduler/fetchPolicy";
import { api, type Account } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GithubIcon, GitlabIcon, RedditIcon, XIcon } from "@/components/BrandIcons";
import { formatDateTime } from "@/lib/client/datetime";
import { useNow } from "@/lib/client/use-now";
import { Pencil, Plus, PlayCircle, PauseCircle, Trash2, AlertCircle, ArrowUpRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TriggerPanel } from "@/components/TriggerPanel";
import { ActionIcon, Button, PasswordInput, TextInput } from "@/components/ui";

const TABS = [
  { key: "twitter", headingKey: "nav.x", basePath: "/x", Icon: XIcon, formatUsername: (a: Account) => `@${a.screen_name}` },
  { key: "github", headingKey: "nav.github", basePath: "/github", Icon: GithubIcon, formatUsername: (a: Account) => a.screen_name },
  { key: "gitlab", headingKey: "nav.gitlab", basePath: "/gitlab", Icon: GitlabIcon, formatUsername: (a: Account) => a.screen_name },
  { key: "reddit", headingKey: "nav.reddit", basePath: "/reddit", Icon: RedditIcon, formatUsername: (a: Account) => a.screen_name },
] as const;

type Platform = (typeof TABS)[number]["key"];

export default function AccountsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Platform>("twitter");
  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
    refetchInterval: 3 * 60_000,
  });

  const accounts = (data?.accounts ?? []).filter((a: Account) => a.platform === tab);
  const now = useNow();

  const staleMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const a of accounts) {
      const last = a.last_fetched_at ? new Date(a.last_fetched_at).getTime() : 0;
      const l1Minutes = parseInt((FETCH_POLICY[a.platform]?.l1 ?? "90m").replace(/[^0-9]/g, "") || "90", 10);
      map.set(a.id, last > 0 && (now - last) > l1Minutes * 60 * 1000);
    }
    return map;
  }, [accounts, now]);

  const deleteMutation = useMutation({
    mutationFn: ({ id, token }: { id: number; token: string }) => api.deleteAccount(id, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.updateAccount(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });

  if (isLoading) {
    return <div className="text-center py-12 text-[var(--muted-foreground)]">{t("common.loading")}</div>;
  }

  const currentTab = TABS.find((t) => t.key === tab)!;
  const showForm = adding || editing;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t("settings.accounts")}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">{t("settings.accountsDesc")}</p>
        </div>
        <Button
          onClick={() => { setEditing(null); setAdding(true); }}
          leftSection={<Plus size={16} />}
        >
          {t("settings.addAccount")}
        </Button>
      </div>

      {/* platform tabs */}
      <div className="mobile-tab-strip -mx-4 flex snap-x gap-1 overflow-x-auto border-b border-[var(--border)] px-4">
        {TABS.map(({ key, headingKey, Icon }) => (
          <Button key={key} onClick={() => { setTab(key); setAdding(false); setEditing(null); }}
            variant={tab === key ? "light" : "subtle"} color={tab === key ? "primary" : "gray"} size="sm"
            leftSection={<Icon size={14} />} className="shrink-0"
          >{t(headingKey)}</Button>
        ))}
      </div>

      {/* inline form — uses key to force remount when editing target changes */}
      {showForm && (
        <Card>
          <CardContent className="p-5 pt-5 sm:pt-5">
            <AccountFormPanel
              key={editing ? editing.id : "add"}
              account={editing}
              defaultPlatform={editing?.platform as Platform ?? tab}
              onClose={() => { setEditing(null); setAdding(false); }}
            />
          </CardContent>
        </Card>
      )}

      {/* account list — full width */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          {accounts.length > 0 ? `${accounts.length} accounts` : t("settings.noAccounts")}
        </h3>
        {accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account: Account) => {
              const lastFetched = account.last_fetched_at ? new Date(account.last_fetched_at) : null;
              const isStale = staleMap.get(account.id) ?? false;

              return (
                <Card key={account.id}
                  className={`group ${!account.is_active ? "opacity-60 " : ""}cursor-pointer hover:border-[var(--primary)]/50 transition-colors`}
                  onClick={() => navigate(`${currentTab.basePath}/${account.id}`)}
                >
                  <CardContent className="account-card-content">
                    <div className="mobile-account-card justify-between gap-4">
                      <div className="account-card-main">
                        <div className="account-card-header">
                          <span className="min-w-0 break-all text-base font-semibold">{currentTab.formatUsername(account)}</span>
                          <ArrowUpRight size={14} className="text-[var(--muted-foreground)] hover-reveal-icon" />
                          {!account.is_active && <Badge>{t("badge.inactive")}</Badge>}
                          {account.error_message && (
                            <Badge className="bg-[var(--danger)]/10 text-[var(--danger)]">{t("badge.error")}</Badge>
                          )}
                          {isStale && account.is_active && (
                            <Badge className="bg-[var(--warn)]/10 text-[var(--warn)]">{t("badge.stale")}</Badge>
                          )}
                        </div>
                        <div className="account-card-meta text-sm text-[var(--muted-foreground)]">
                          <span>{t("settings.autoSchedule")}</span>
                          {lastFetched && <span>{t("settings.lastFetched", { date: formatDateTime(lastFetched) })}</span>}
                        </div>
                        {account.error_message && (
                          <div className="account-card-error text-xs text-[var(--danger)]">
                            <AlertCircle size={12} /> {account.error_message}
                          </div>
                        )}
                      </div>
                      <div className="account-card-actions shrink-0">
                        <ActionIcon
                          onClick={(e) => { e.stopPropagation(); setEditing(account); setAdding(false); }}
                          variant="light" color="gray"
                          title={t("settings.edit")}
                        ><Pencil size={16} /></ActionIcon>
                        <TriggerPanel accountId={account.id} platform={account.platform} />
                        <ActionIcon
                          onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: account.id, isActive: !account.is_active }); }}
                          disabled={toggleActiveMutation.isPending}
                          variant="light" color="gray"
                          title={account.is_active ? t("settings.disable") : t("settings.enable")}
                        >{account.is_active ? <PauseCircle size={16} /> : <PlayCircle size={16} />}</ActionIcon>
                        <ActionIcon
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(account); }}
                          disabled={deleteMutation.isPending}
                          variant="light" color="danger"
                          title={t("settings.delete")}
                        ><Trash2 size={16} /></ActionIcon>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 pt-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)] mb-4">{t("settings.noAccountsDesc")}</p>
              <Button
                onClick={() => setAdding(true)}
                leftSection={<Plus size={14} />}
              >
                {t("settings.addFirstAccount")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t("settings.delete")}
        description={t("settings.deleteConfirm", { name: deleteTarget?.screen_name ?? "" })}
        target={deleteTarget?.id ?? undefined}
        action="delete"
        onConfirm={async (token) => { deleteMutation.mutate({ id: deleteTarget!.id, token }); }}
      />
    </div>
  );
}

// ── Inline form ──────────────────────────────────────────────────

function AccountFormPanel({
  account, defaultPlatform, onClose,
}: {
  account: Account | null;
  defaultPlatform: Platform;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editing = !!account;

  const [screenName, setScreenName] = useState(account?.screen_name ?? "");
  const [authToken, setAuthToken] = useState("");
  const [platform, setPlatform] = useState<Platform>(account?.platform as Platform ?? defaultPlatform);
  const [instanceUrl, setInstanceUrl] = useState(account?.instance_url ?? "");
  const [authType, setAuthType] = useState<string | null>(account?.auth_type ?? null);
  const [error, setError] = useState("");
  const tLevel = (lvl: "l0" | "l1" | "l2", field: "label" | "desc") => {
    const key = `fetchLevel.${platform}.${lvl}.${field}`;
    const v = t(key) as string;
    return v !== key ? v : (t(`fetchLevel.${lvl}.${field}`) as string);
  };

  const isReddit = platform === "reddit";
  const isRedditPublic = isReddit && authType === "reddit_public";

  // Load reddit cookie details on edit — the list API no longer returns auth_token
  const [cookieLoading, setCookieLoading] = useState(false);
  const cookieInitDone = useRef(false);

  // cookie table state
  const [cookieEntries, setCookieEntries] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (!editing || !isReddit || !isRedditPublic || !account || cookieInitDone.current) return;
    let cancelled = false;
    // Defer the loading flag out of the synchronous effect body so the
    // cascading-render lint stays happy; the fetch below resolves it.
    const timer = setTimeout(() => { if (!cancelled) setCookieLoading(true); }, 0);
    api.getAccount(account.id).then(detail => {
      if (cancelled) return;
      cookieInitDone.current = true;
      if (detail?.auth_token) {
        try {
          const obj = JSON.parse(detail.auth_token);
          const entries = Object.entries(obj).map(([k, v]) => ({ key: k, value: String(v) }));
          setCookieEntries(entries);
          setAuthToken(JSON.stringify(obj));
        } catch { /* ignore */ }
      }
      setCookieLoading(false);
    }).catch(() => { if (!cancelled) setCookieLoading(false); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [editing, isReddit, isRedditPublic, account]);

  const syncCookieToken = (entries: { key: string; value: string }[]) => {
    setCookieEntries(entries);
    const obj: Record<string, string> = {};
    for (const { key, value } of entries) { if (key.trim()) obj[key.trim()] = value; }
    setAuthToken(JSON.stringify(obj));
  };

  const addMutation = useMutation({
    mutationFn: () => api.createAccount({ screenName, authToken, platform, instanceUrl: instanceUrl || undefined, authType: authType || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  const editMutation = useMutation({
    mutationFn: () => {
      const d: Record<string, string | number | boolean | null> = {};
      if (screenName !== account!.screen_name) d.screenName = screenName;
      if (authToken !== "") d.authToken = authToken;
      // fetchIntervals are now system-managed (L0 24h / L1 90m / L2 8h); no user override
      if (isReddit && authType !== (account!.auth_type || null)) d.authType = authType || null;
      if (platform === "gitlab" && instanceUrl !== (account!.instance_url || "")) d.instanceUrl = instanceUrl || null;
      return api.updateAccount(account!.id, d);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["accounts"] }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  const mutation = editing ? editMutation : addMutation;
  const canSubmit = !mutation.isPending && !!screenName && (editing || !!authToken);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{editing ? t("editAccountForm.title") : t("addAccountForm.title")}</h3>
        <Button onClick={onClose} variant="subtle" color="gray" size="sm">
          {t("addAccountForm.cancel")}
        </Button>
      </div>
      {error && <div className="p-3 rounded-lg bg-[var(--danger)]/5 text-[var(--danger)] text-sm">{error}</div>}

      {/* platform selector — add mode only */}
      {!editing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TABS.map(({ key, Icon }) => (
            <Button key={key} type="button" onClick={() => setPlatform(key)}
              variant={platform === key ? "light" : "default"} color={platform === key ? "primary" : "gray"}
              leftSection={<Icon size={16} />} size="sm"
            >{t(`nav.${key === "twitter" ? "x" : key}`)}</Button>
          ))}
        </div>
      )}

      {/* ── fields ── */}
      <div className="space-y-4">

        {/* username */}
        <fieldset>
          <legend className="text-sm font-medium mb-1.5">{t("addAccountForm.username")}</legend>
          <TextInput value={screenName} onChange={(e) => setScreenName(e.currentTarget.value)}
            placeholder={platform === "github" ? "octocat" : platform === "gitlab" ? "your-username" : platform === "reddit" ? "spez" : "elonmusk"}
            />
          <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
            {platform === "github" ? t("addAccountForm.helpGithubUsername")
              : platform === "gitlab" ? t("addAccountForm.helpGitlabUsername")
              : platform === "reddit" ? t("addAccountForm.helpRedditUsername")
              : t("addAccountForm.helpXUsername")}
          </p>
        </fieldset>

        {/* reddit auth type */}
        {isReddit && (
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">{t("addAccountForm.redditAuthType")}</legend>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setAuthType(null)} variant={authType !== "reddit_public" ? "light" : "default"} color={authType !== "reddit_public" ? "primary" : "gray"}>{t("addAccountForm.redditOAuth")}</Button>
              <Button type="button" onClick={() => setAuthType("reddit_public")} variant={authType === "reddit_public" ? "light" : "default"} color={authType === "reddit_public" ? "primary" : "gray"}>{t("addAccountForm.redditPublic")}</Button>
            </div>
            <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
              {isRedditPublic ? t("addAccountForm.helpRedditPublicMode") : t("addAccountForm.helpRedditOAuthMode")}
            </p>
          </fieldset>
        )}

        {/* token — single input or cookie table */}
        <fieldset>
          <legend className="text-sm font-medium mb-1.5">
            {isRedditPublic ? t("addAccountForm.cookies") :
              platform === "github" || platform === "gitlab" ? t("addAccountForm.personalAccessToken") :
              platform === "reddit" ? t("addAccountForm.refreshToken") :
              t("addAccountForm.authToken")}
          </legend>

          {isRedditPublic ? (
            cookieLoading ? <p className="text-sm text-[var(--muted-foreground)]">{t("common.loading")}</p> :
            <CookieTable entries={cookieEntries} onChange={syncCookieToken} t={t} />
          ) : (
            <div>
              <PasswordInput
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.currentTarget.value)}
                placeholder={platform === "github" ? "ghp_..." : platform === "gitlab" ? "glpat-..." : platform === "reddit" ? "your Reddit password" : "Your X auth_token cookie"}
                />
              <p className="text-[12px] text-[var(--muted-foreground)] mt-1">
                {editing ? t("editAccountForm.tokenHint") : (
                  platform === "github" ? t("addAccountForm.helpGithubToken")
                    : platform === "gitlab" ? t("addAccountForm.helpGitlabToken")
                    : platform === "reddit" ? t("addAccountForm.helpRedditToken")
                    : t("addAccountForm.helpXToken")
                )}
              </p>
            </div>
          )}
        </fieldset>

        {/* gitlab instance URL */}
        {platform === "gitlab" && (
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">{t("addAccountForm.instanceUrl")}</legend>
            <TextInput value={instanceUrl} onChange={(e) => setInstanceUrl(e.currentTarget.value)}
              placeholder="https://gitlab.com"
              />
            <p className="text-[12px] text-[var(--muted-foreground)] mt-1">{t("addAccountForm.helpInstanceUrl")}</p>
          </fieldset>
        )}

        {/* fetch schedule — L0/L1/L2 */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("addAccountForm.fetchSchedule")}</legend>
          <p className="text-[12px] text-[var(--muted-foreground)] -mt-1">{t("addAccountForm.helpFetchSchedule")}</p>
          <div className="grid gap-2">
            {/* L0 — read-only 24h */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{tLevel("l0","label")} <span className="ml-1.5 inline-flex items-center rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">L0</span></p>
                <p className="text-[12px] text-[var(--muted-foreground)]">{tLevel("l0","desc")}</p>
              </div>
              <span className="shrink-0 text-sm font-mono tabular-nums">{FETCH_POLICY[platform]?.l0 ?? "24h"}</span>
            </div>
            {/* L1 — timely: stars/issues/PR/downloads */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{tLevel("l1","label")} <span className="ml-1.5 inline-flex items-center rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary)]">L1</span></p>
                <p className="text-[12px] text-[var(--muted-foreground)]">{tLevel("l1","desc")}</p>
              </div>
              <span className="shrink-0 text-sm font-mono tabular-nums">{FETCH_POLICY[platform]?.l1 ?? "90m"}</span>
            </div>
            {/* L2 — telemetry trends */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{tLevel("l2","label")} <span className="ml-1.5 inline-flex items-center rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">L2</span></p>
                <p className="text-[12px] text-[var(--muted-foreground)]">{tLevel("l2","desc")}</p>
              </div>
              <span className="shrink-0 text-sm font-mono tabular-nums">{FETCH_POLICY[platform]?.l2 ?? "8h"}</span>
            </div>

          </div>
          <p className="text-[12px] text-[var(--muted-foreground)]">{t("addAccountForm.helpFetchScheduleAuto")}</p>
        </fieldset>
      </div>

      <Button onClick={() => mutation.mutate()} disabled={!canSubmit} fullWidth loading={mutation.isPending}>
        {mutation.isPending ? (editing ? t("editAccountForm.saving") : t("addAccountForm.adding")) : (editing ? t("editAccountForm.save") : t("addAccountForm.addAccount"))}
      </Button>
    </div>
  );
}

// ── Cookie key-value table ───────────────────────────────────────

function CookieTable({
  entries, onChange, t,
}: {
  entries: { key: string; value: string }[];
  onChange: (entries: { key: string; value: string }[]) => void;
  t: (key: string) => string;
}) {
  const addRow = () => onChange([...entries, { key: "", value: "" }]);
  const removeRow = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: "key" | "value", val: string) => {
    const next = entries.map((e, idx) => idx === i ? { ...e, [field]: val } : e);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-[var(--muted-foreground)]">{t("addAccountForm.helpRedditPublicCookies")}</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm" style={{ minWidth: 360 }}>
          <thead>
            <tr className="text-left text-xs text-[var(--muted-foreground)] border-b border-[var(--border)]">
              <th className="pb-1.5 font-medium w-1/3">{t("addAccountForm.cookieName")}</th>
              <th className="pb-1.5 font-medium">{t("addAccountForm.cookieValue")}</th>
              <th className="pb-1.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {entries.map((row, i) => (
              <tr key={i} className="border-b border-[var(--border)]/50">
                <td className="py-1 pr-2">
                  <TextInput value={row.key} onChange={(e) => updateRow(i, "key", e.currentTarget.value)}
                    placeholder="cookie name"
                    />
                </td>
                <td className="py-1 pr-2">
                  <PasswordInput value={row.value} onChange={(e) => updateRow(i, "value", e.currentTarget.value)}
                    placeholder="..."
                    />
                </td>
                <td className="py-1">
                  <ActionIcon onClick={() => removeRow(i)} variant="subtle" color="danger" aria-label="Remove cookie">
                    &times;
                  </ActionIcon>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={addRow} variant="default" color="gray" fullWidth>
        + {t("addAccountForm.addCookieRow")}
      </Button>
    </div>
  );
}
