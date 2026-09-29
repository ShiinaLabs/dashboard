import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, LoaderCircle, LogIn } from "lucide-react";
import { PasswordInput } from "@/components/ui/form-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "login.login" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // Mock /api/auth/me reports the mock admin user even before a session cookie
  // exists. Keep the login form available in mock mode so the login endpoint
  // can issue the cookie required by protected mock API routes.
  const isMock =
    process.env.NEXT_PUBLIC_MOCK_DATA === "1" ||
    process.env.NEXT_PUBLIC_MOCK_DATA === "true";
  const fromParam = searchParams.get("from");
  // Only allow internal paths, strip protocol/host to avoid open-redirect.
  const safeFrom = fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//") ? fromParam : null;

  const { data: auth } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.checkAuth(),
    staleTime: 2 * 60_000,
  });

  // If already authenticated, bounce to the original destination instead of
  // showing the form — prevents an authenticated user stuck on /login.
  useEffect(() => {
    if (auth?.authenticated && !isMock) {
      const dest = safeFrom || "/overview";
      navigate(dest, { replace: true });
    }
  }, [auth, isMock, safeFrom, navigate]);
  // Mock/debug mode (build-time mirror of MOCK_DATA): the server accepts any
  // credentials, so don't require a password client-side either.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(username || "admin", password);
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        // Prefer the original destination captured by the auth middleware
        // (?from=...) and fall back to /overview. Using validate-safeFrom
        // avoids an open-redirect and avoids the extra "/" -> "/overview"
        // client hop that previously caused a double replace.
        const dest = safeFrom || "/overview";
        navigate(dest, { replace: true });
      } else {
        setError(t("login.invalidPassword"));
      }
    } catch {
      setError(t("login.invalidPassword"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh bg-background md:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <aside className="relative hidden overflow-hidden border-r bg-muted/40 p-10 md:flex md:flex-col md:justify-between lg:p-14">
        <div className="absolute -right-24 -top-24 size-96 rounded-full border border-primary/10" aria-hidden="true" />
        <div className="absolute -right-8 -top-8 size-64 rounded-full border border-primary/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><AudioLines size={20} /></span>
          <span>{t("common.dashboard")}</span>
        </div>
        <div className="relative max-w-lg space-y-4">
          <p className="text-sm font-medium text-primary">{t("common.dashboard")}</p>
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl">{t("login.tagline")}</h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("login.supportingCopy")}</p>
        </div>
        <p className="relative text-xs text-muted-foreground">{t("common.copyright")}</p>
      </aside>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center md:text-left">
            <div className="mx-auto mb-6 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground md:hidden"><AudioLines size={21} /></div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("login.login")}</h1>
            <p className="text-sm text-muted-foreground">{t("login.tagline")}</p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="login-username">{t("login.username")}</Label>
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                placeholder="admin"
                autoComplete="username"
                aria-label={t("login.username")}
              />
            </div>
            <PasswordInput
              label={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
              autoFocus
              aria-label={t("login.password")}
            />

            {isMock && <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"><AlertDescription>{t("login.mockHint")}</AlertDescription></Alert>}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <Button type="submit" disabled={loading || (!password && !isMock)} className="mt-1 w-full">
              {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}{t("login.login")}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
