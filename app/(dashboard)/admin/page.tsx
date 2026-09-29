import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Users, Plus, Trash2 } from "lucide-react";
import { validatePassword } from "@/lib/client/validatePassword";
import { PasswordHints } from "@/components/ui/PasswordHints";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PasswordInput, TextInput } from "@/components/ui/form-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.admin" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function Admin() {
  const { t } = useTranslation();
  const [createError, setCreateError] = useState("");
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("user");
  const pwRules = validatePassword(password).rules;
  const pwMismatch = confirmPassword !== "" && password !== confirmPassword;

  const { data: authData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.checkAuth(),
  });

  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.getUsers(),
    enabled: authData?.role === "admin",
  });

  const users = usersData?.users || [];

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError("");
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const username = (form.get("username") as string)?.trim();
    const password = (form.get("password") as string) || "";

    if (!username) { setCreateError(t("admin.errorUsernameRequired")); return; }
    if (password !== confirmPassword) { setCreateError(t("admin.errorPasswordsDontMatch")); return; }
    const pwResult = validatePassword(password);
    if (!pwResult.valid) {
      setCreateError(t(`admin.errorPassword${pwResult.errorKey}`));
      return;
    }

    try {
      await api.createUser({ username, password, role });
      formElement.reset();
      setPassword("");
      setConfirmPassword("");
      setRole("user");
      refetchUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  if (authData?.role !== "admin") {
    return (
      <div className="text-center py-12 text-[var(--muted-foreground)]">
        {t("admin.forbidden")}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.heading")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.description")}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Plus size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("admin.createUser")}</h2>
        </div>
        <div className="p-5">
          <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput name="username" label={t("admin.username")} required />
              <PasswordInput
                name="password" type="password" label={t("admin.password")} required
                value={password} onChange={(e) => { setPassword(e.target.value); setCreateError(""); }}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="new-user-role">{t("admin.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="new-user-role"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="user">{t("admin.roleUser")}</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            {password && <PasswordHints rules={pwRules} t={t} namespace="admin" />}
            <PasswordInput
              name="confirmPassword" type="password" label={t("admin.confirmPassword")} required
              value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setCreateError(""); }}
            />
            {pwMismatch && <p className="text-xs text-[var(--danger)]">{t("admin.errorPasswordsDontMatch")}</p>}
            {createError && <Alert variant="destructive"><AlertDescription>{createError}</AlertDescription></Alert>}
            <Button type="submit" className="sm:self-start">
              {t("admin.createUser")}
            </Button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Users size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("admin.userList")}</h2>
          <span className="ml-auto text-xs text-muted-foreground">{users.length}</span>
        </div>
        <div className="p-5">
          {users.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("admin.noUsers")}</p>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div key={u.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    {u.username}
                    <span className="text-[11px] text-[var(--muted-foreground)] ml-1.5">({u.role})</span>
                  </span>
                  {u.id !== 1 && (
                    <Button
                      onClick={() => setDeleteUserId(u.id)}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      </div>

      <ConfirmDialog
        open={deleteUserId !== null}
        onOpenChange={(v) => { if (!v) setDeleteUserId(null); }}
        title={t("admin.deleteUser")}
        description={t("admin.deleteUserDesc")}
        confirmLabel={t("common.delete")}
        target={deleteUserId ?? undefined}
        action="delete"
        onConfirm={async (token) => {
          if (deleteUserId === null) return;
          await api.deleteUser(deleteUserId, token);
          setDeleteUserId(null);
          refetchUsers();
        }}
      />
    </div>
  );
}
