import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import { keyIdFromFilename } from "@/lib/client/app-store-key";
import { formatDateTime } from "@/lib/client/datetime";
import type { AppStoreConnection } from "@/shared/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "App Store Connect operation failed"; }

export function AppStoreConnections({ adding, onClose, onAdd }: { adding: boolean; onClose: () => void; onAdd: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const list = useQuery({ queryKey: ["app-store-connections"], queryFn: api.getAppStoreConnections });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app-store-connections"] }),
      queryClient.invalidateQueries({ queryKey: ["app-store-connection"] }),
    ]);
  };

  if (adding) return <ConnectionForm onCancel={onClose} onSaved={async (connection) => { await invalidate(); setSelected(connection.id); onClose(); }} />;
  if (selected !== null) return <ConnectionDetail key={selected} id={selected} onBack={() => setSelected(null)} onChanged={invalidate} />;
  if (list.isLoading) return <p role="status">{t("common.loading")}</p>;
  if (list.isError) return <div className="space-y-3"><p role="alert" className="text-destructive">{errorMessage(list.error)}</p><Button variant="outline" onClick={() => void list.refetch()}>{t("appStore.retry")}</Button></div>;

  return <section className="space-y-3" aria-label={t("appStore.title")}>
    <p className="text-sm text-muted-foreground">{t("appStore.intro")}</p>
    {list.data?.connections.length ? list.data.connections.map((connection) =>
      <Card key={connection.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1"><h2 className="break-words font-semibold">{connection.name}</h2><p className="text-sm text-muted-foreground">{t("appStore.title")} · {connection.key_id}</p></div>
        <div className="flex items-center gap-3">{!connection.is_active && <Badge>{t("badge.inactive")}</Badge>}<Button variant="outline" onClick={() => setSelected(connection.id)}>{t("appStore.manage")}<ArrowRight aria-hidden="true" /></Button></div>
      </CardContent></Card>,
    ) : <Card><CardContent className="space-y-4 p-8 text-center"><p className="text-sm text-muted-foreground">{t("appStore.empty")}</p><Button onClick={onAdd}>{t("settings.addAccount")}</Button></CardContent></Card>}
  </section>;
}

function ConnectionForm({ connection, onCancel, onSaved }: { connection?: AppStoreConnection; onCancel: () => void; onSaved: (connection: AppStoreConnection) => Promise<void> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(connection?.name ?? "");
  const [issuerId, setIssuerId] = useState(connection?.issuer_id ?? "");
  const [keyId, setKeyId] = useState(connection?.key_id ?? "");
  const [vendorNumber, setVendorNumber] = useState(connection?.vendor_number ?? "");
  const [privateKey, setPrivateKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || reading) return;
    setBusy(true); setError(null);
    try {
      // Keep private keys out of React Query's mutation cache and browser storage.
      const common = { name, vendorNumber: vendorNumber.trim() || null };
      const saved = connection ? await api.updateAppStoreConnection(connection.id, {
        ...common,
        ...(issuerId !== connection.issuer_id ? { issuerId } : {}),
        ...(keyId !== connection.key_id ? { keyId } : {}),
        ...(privateKey ? { privateKey } : {}),
      }) : await api.createAppStoreConnection({ ...common, issuerId, keyId, privateKey });
      setPrivateKey("");
      await onSaved(saved);
    } catch (error) {
      setError(errorMessage(error));
      if (connection) await queryClient.invalidateQueries({ queryKey: ["app-store-connection", connection.id] });
    }
    finally { setBusy(false); }
  };

  return <Card><CardContent className="p-5">
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <div className="space-y-1"><h2 className="text-lg font-semibold">{t(connection ? "appStore.edit" : "appStore.add")}</h2><p className="text-sm text-muted-foreground">{t("appStore.teamKeyHelp")}</p></div>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="asc-name">{t("appStore.name")}</Label><Input id="asc-name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="asc-private-key">{t("appStore.privateKey")}</Label><Input id="asc-private-key" type="file" accept=".p8" required={!connection} disabled={reading} onChange={async (event) => {
          const file = event.target.files?.[0];
          setPrivateKey(""); setError(null);
          if (!file) return;
          if (!file.name.endsWith(".p8") || file.size > 16_384) { setError(t("appStore.fileError")); event.target.value = ""; return; }
          setReading(true);
          try {
            const content = await file.text();
            setPrivateKey(content);
            const extracted = keyIdFromFilename(file.name);
            if (extracted) setKeyId(extracted);
          } catch { setError(t("appStore.fileError")); }
          finally { setReading(false); }
        }} />{connection && <p className="text-xs text-muted-foreground">{t("appStore.keepPrivateKey")}</p>}</div>
        <div className="space-y-2"><Label htmlFor="asc-key-id">{t("appStore.keyId")}</Label><Input id="asc-key-id" required pattern="[A-Z0-9]{10}" maxLength={10} autoComplete="off" value={keyId} onChange={(event) => setKeyId(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="asc-issuer-id">{t("appStore.issuerId")}</Label><Input id="asc-issuer-id" required autoComplete="off" value={issuerId} onChange={(event) => setIssuerId(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="asc-vendor-number">{t("appStore.vendorNumberOptional")}</Label><Input id="asc-vendor-number" inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} value={vendorNumber} onChange={(event) => setVendorNumber(event.target.value)} /></div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || reading}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{t(busy ? "appStore.validating" : "common.save")}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button></div>
    </form>
  </CardContent></Card>;
}

function ConnectionDetail({ id, onBack, onChanged }: { id: number; onBack: () => void; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const detail = useQuery({ queryKey: ["app-store-connection", id], queryFn: () => api.getAppStoreConnection(id) });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); await onChanged(); }
    catch (error) { setError(errorMessage(error)); await onChanged(); throw error; }
    finally { setBusy(false); }
  };
  const run = (operation: () => Promise<unknown>) => { void perform(operation).catch(() => undefined); };

  if (detail.isLoading) return <p role="status">{t("common.loading")}</p>;
  if (!detail.data || detail.isError) return <div className="space-y-3"><p role="alert" className="text-destructive">{errorMessage(detail.error)}</p><Button variant="outline" onClick={onBack}>{t("appStore.back")}</Button><Button variant="outline" onClick={() => void detail.refetch()}>{t("appStore.retry")}</Button></div>;
  const { connection, apps, recentSyncRuns, lastSuccessfulSync } = detail.data;
  if (editing) return <ConnectionForm connection={connection} onCancel={() => setEditing(false)} onSaved={async () => { await onChanged(); setEditing(false); }} />;
  const lastSuccess = lastSuccessfulSync;

  return <section className="space-y-5">
    <Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden="true" />{t("appStore.back")}</Button>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">{t("appStore.title")}</p><h2 className="break-words text-xl font-semibold">{connection.name}</h2>{!connection.is_active && <Badge>{t("badge.inactive")}</Badge>}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !connection.is_active} onClick={() => run(() => api.refreshAppStoreApps(id))}>{t("appStore.refresh")}</Button><Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>{t("appStore.edit")}</Button><Button variant="outline" disabled={busy} onClick={() => run(() => api.updateAppStoreConnection(id, { isActive: !connection.is_active }))}>{t(connection.is_active ? "settings.disable" : "settings.enable")}</Button><Button variant="destructive" disabled={busy} onClick={() => setDeleting(true)}>{t("common.delete")}</Button></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
    <Card><CardContent className="p-5"><h3 className="mb-4 font-semibold">{t("appStore.connection")}</h3><dl className="grid gap-3 text-sm sm:grid-cols-2">{[
      [t("appStore.keyId"), connection.key_id], [t("appStore.issuerId"), connection.issuer_id],
      [t("appStore.privateKey"), t(connection.private_key_configured ? "appStore.configured" : "appStore.notConfigured")],
      [t("appStore.vendorNumber"), connection.vendor_number || t("appStore.notConfigured")],
    ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-medium">{value}</dd></div>)}</dl></CardContent></Card>
    <Card><CardContent className="space-y-3 p-5"><h3 className="font-semibold">{t("appStore.apps")}</h3><p className="text-sm text-muted-foreground">{t("appStore.appsHelp")}</p>{apps.length ? apps.map((app) => <div key={app.id} className="flex items-center gap-3 rounded-lg border p-3"><Checkbox id={`asc-app-${app.id}`} checked={app.is_enabled} disabled={busy} onCheckedChange={(value) => run(() => api.setAppStoreAppEnabled(id, app.id, value === true))} /><Label htmlFor={`asc-app-${app.id}`} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-1"><span className="break-words">{app.name}</span><span className="break-all text-xs font-normal text-muted-foreground">{app.bundle_id} · {app.apple_id}</span></Label></div>) : <p className="text-sm text-muted-foreground">{t("appStore.noApps")}</p>}</CardContent></Card>
    <Card><CardContent className="space-y-3 p-5"><h3 className="font-semibold">{t("appStore.lastSync")}</h3><p className="text-sm">{t("appStore.apps")}: {lastSuccess?.finished_at ? formatDateTime(lastSuccess.finished_at) : "—"}</p>{recentSyncRuns.map((sync) => <div key={sync.id} className="space-y-1 border-t pt-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{formatDateTime(sync.started_at)}</span><span>{t(`appStore.syncStatus.${sync.status}`)}</span></div>{sync.error_message && <p className="break-words text-destructive">{sync.error_message}</p>}</div>)}</CardContent></Card>
    <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t("common.delete")} description={t("settings.deleteConfirm", { name: connection.name })} target={id} action="delete_app_store_connection" onConfirm={async (token) => { await perform(() => api.deleteAppStoreConnection(id, token)); onBack(); }} />
  </section>;
}
