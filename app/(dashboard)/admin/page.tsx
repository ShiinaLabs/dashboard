import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Users, Plus, Trash2 } from "lucide-react";
import { validatePassword } from "@/lib/client/validatePassword";
import { PasswordHints } from "@/components/ui/PasswordHints";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Alert, Button, PasswordInput, Select, TextInput } from "@/components/ui";

export default function Admin() {
  const { t } = useTranslation();
  const [createError, setCreateError] = useState("");
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    const role = (form.get("role") as string) || "user";

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
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold">{t("admin.heading")}</h2>
        <p className="text-sm text-[var(--muted-foreground)]">{t("admin.description")}</p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Plus size={14} /> {t("admin.createUser")}
        </h3>
        <div className="admin-create-card rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput name="username" label={t("admin.username")} required />
              <PasswordInput
                name="password" type="password" label={t("admin.password")} required
                value={password} onChange={(e) => { setPassword(e.target.value); setCreateError(""); }}
              />
              <Select name="role" label={t("admin.role")} data={[{ value: "user", label: t("admin.roleUser") }]} defaultValue="user" />
            </div>
            {password && <PasswordHints rules={pwRules} t={t} namespace="admin" />}
            <PasswordInput
              name="confirmPassword" type="password" label={t("admin.confirmPassword")} required
              value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setCreateError(""); }}
            />
            {pwMismatch && <p className="text-xs text-[var(--danger)]">{t("admin.errorPasswordsDontMatch")}</p>}
            {createError && <Alert color="danger" variant="light">{createError}</Alert>}
            <Button
              type="submit"
              className="sm:self-start"
            >
              {t("admin.createUser")}
            </Button>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Users size={14} /> {t("admin.userList")}
        </h3>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {users.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("admin.noUsers")}</p>
          ) : (
            <div className="space-y-1">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-t border-[var(--border)] first:border-0">
                  <span className="text-sm">
                    {u.username}
                    <span className="text-[11px] text-[var(--muted-foreground)] ml-1.5">({u.role})</span>
                  </span>
                  {u.id !== 1 && (
                    <Button
                      onClick={() => setDeleteUserId(u.id)}
                      variant="subtle"
                      color="danger"
                      size="compact-xs"
                      leftSection={<Trash2 size={12} />}
                    >
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

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
