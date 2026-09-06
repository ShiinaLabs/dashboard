import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, LogIn, Eye, EyeOff } from "lucide-react";
import { Alert, Button, PasswordInput, TextInput } from "@/components/ui";
import { api } from "@/lib/api";
import { useBingWallpaper } from "@/lib/client/useBingWallpaper";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { url } = useBingWallpaper();
  const [searchParams] = useSearchParams();
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
    if (auth?.authenticated) {
      const dest = safeFrom || "/overview";
      navigate(dest, { replace: true });
    }
  }, [auth, safeFrom, navigate]);
  // Mock/debug mode (build-time mirror of MOCK_DATA): the server accepts any
  // credentials, so don't require a password client-side either.
  const isMock =
    process.env.NEXT_PUBLIC_MOCK_DATA === "1" ||
    process.env.NEXT_PUBLIC_MOCK_DATA === "true";
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
    <div className="relative min-h-dvh flex items-center justify-center bg-[var(--background)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {/* Bing wallpaper background */}
      <div className="absolute inset-0">
        {/* /api/bing-wallpaper 302-redirects to bing.com; cross-origin img */}
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      </div>

      {/* Form card */}
      <div className="relative z-10 w-full max-w-md sm:mx-4">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-5 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Branding */}
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="p-2.5 rounded-xl bg-white/15">
              <LayoutDashboard size={24} className="text-white" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-white text-center mb-1">
            {t("common.dashboard")}
          </h1>
          <p className="text-sm text-white/60 text-center mb-8">
            {t("login.tagline")}
          </p>

          <h2 className="text-base font-medium text-white/90 mb-4">{t("login.login")}</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/60">{t("login.username")}</label>
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                placeholder="admin"
                aria-label={t("login.username")}
                styles={{ input: { background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.2)", color: "white" } }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/60">{t("login.password")}</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                autoFocus
                aria-label={t("login.password")}
                visibilityToggleIcon={({ reveal }) => reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                styles={{ input: { background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.2)", color: "white" } }}
              />
            </div>

            {isMock && (
              <Alert color="yellow" variant="light" p="xs">{t("login.mockHint")}</Alert>
            )}

            {error && (
              <Alert color="danger" variant="light" p="xs">{error}</Alert>
            )}

            <Button
              type="submit"
              disabled={loading || (!password && !isMock)}
              loading={loading}
              fullWidth
              color="gray"
              leftSection={<LogIn size={16} />}
            >
              {t("login.login")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
