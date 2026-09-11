import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, Building2, Check } from "lucide-react";
import { Badge, Button, Checkbox, Group, Modal, ScrollArea, Stack, Text, TextInput, notifications } from "@/components/ui";
import type {
  GithubAvailableOrgsResponse,
  GithubWatchlistCandidate,
  GithubWatchlistResponse,
  GithubWatchlistSource,
} from "@/lib/api";
import { api } from "@/lib/api";

export interface GithubWatchlistViewProps {
  candidates: GithubWatchlistCandidate[];
  sources: GithubWatchlistSource[];
  warnings: string[];
  errors: string[];
  /** Stable GitHub ids currently selected for monitoring. */
  watched: Set<number>;
  filter: string;
  onFilterChange: (value: string) => void;
  onToggle: (githubId: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  orgs: string[];
  onRemoveOrg: (login: string) => void;
  manualOrg: string;
  onManualOrgChange: (value: string) => void;
  onAddManualOrg: () => void;
  available: GithubAvailableOrgsResponse | null;
  availableLoading: boolean;
}

/**
 * Presentational half of the watchlist modal, split out so it can be rendered
 * without a DOM (this repo has no jsdom) and so the container stays about data.
 */
export function GithubWatchlistView(props: GithubWatchlistViewProps) {
  const { t } = useTranslation();
  const { candidates, watched, filter } = props;

  const listed = candidates.filter((c) => c.listedFrom !== null);
  const unavailable = candidates.filter((c) => c.listedFrom === null);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return listed;
    return listed.filter((c) => c.fullName.toLowerCase().includes(needle));
  }, [listed, filter]);

  const noneSelected = watched.size === 0;

  return (
    <Stack gap="md">
      {props.warnings.length > 0 && (
        <Stack gap={4}>
          {props.warnings.map((warning) => (
            <Group key={warning} gap="xs" wrap="nowrap" align="flex-start">
              <AlertCircle size={14} />
              <Text size="xs" c="dimmed">{warning}</Text>
            </Group>
          ))}
        </Stack>
      )}
      {props.errors.length > 0 && (
        <Stack gap={4}>
          {props.errors.map((error) => (
            <Text key={error} size="xs" c="red">{error}</Text>
          ))}
        </Stack>
      )}

      {/* Monitored repositories ------------------------------------------------- */}
      <Stack gap={4} data-slot="watchlist-repos">
        <Text fw={600}>{t("githubWatchlist.watchingHeading")}</Text>
        <Text size="xs" c="dimmed">{t("githubWatchlist.watchingDesc")}</Text>
        {noneSelected && <Text size="xs" c="orange">{t("githubWatchlist.nothingSelected")}</Text>}

        <Group gap="xs" mt={4}>
          <TextInput
            size="xs"
            placeholder={t("githubWatchlist.searchPlaceholder")}
            value={filter}
            onChange={(e) => props.onFilterChange(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button size="compact-xs" variant="light" color="gray" onClick={props.onSelectAll}>{t("githubWatchlist.selectAll")}</Button>
          <Button size="compact-xs" variant="light" color="gray" onClick={props.onSelectNone}>{t("githubWatchlist.selectNone")}</Button>
        </Group>

        <ScrollArea.Autosize mah={220} type="auto" mt={4}>
          <Stack gap={2}>
            {visible.map((candidate) => (
              <div key={String(candidate.githubId)} data-slot="watchlist-repo-row">
                <Checkbox
                  checked={candidate.githubId !== null && watched.has(candidate.githubId)}
                  onChange={() => candidate.githubId !== null && props.onToggle(candidate.githubId)}
                  label={
                    <Group gap={6} wrap="nowrap">
                      <span>{candidate.fullName}</span>
                      {candidate.ownerType === "Organization" && <Building2 size={12} />}
                      {candidate.isPrivate && <Badge size="xs" variant="light" color="gray">{t("githubWatchlist.private")}</Badge>}
                      {candidate.listedFrom === "own" && <Badge size="xs" variant="light" color="blue">{t("githubWatchlist.own")}</Badge>}
                      {candidate.lastError && (
                        <Text size="xs" c="red">{t("githubWatchlist.lastError", { message: candidate.lastError })}</Text>
                      )}
                    </Group>
                  }
                />
              </div>
            ))}
            {visible.length === 0 && <Text size="xs" c="dimmed">{t("githubWatchlist.noCandidates")}</Text>}
          </Stack>
        </ScrollArea.Autosize>

        {unavailable.length > 0 && (
          <Stack gap={2} mt="xs" data-slot="watchlist-unavailable">
            <Text size="xs" fw={600}>{t("githubWatchlist.unavailableHeading")}</Text>
            <Text size="xs" c="dimmed">{t("githubWatchlist.unavailableDesc")}</Text>
            {unavailable.map((candidate) => (
              <Checkbox
                key={String(candidate.githubId)}
                checked={candidate.githubId !== null && watched.has(candidate.githubId)}
                onChange={() => candidate.githubId !== null && props.onToggle(candidate.githubId)}
                label={<span>{candidate.fullName}</span>}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {/* Organizations ---------------------------------------------------------- */}
      <Stack gap={4} data-slot="watchlist-orgs">
        <Text fw={600}>{t("githubWatchlist.sourcesHeading")}</Text>
        <Text size="xs" c="dimmed">{t("githubWatchlist.sourcesDesc")}</Text>

        <Group gap="xs" mt={4} wrap="wrap">
          {props.orgs.map((login) => (
            <Badge
              key={login}
              variant="light"
              rightSection={
                <span
                  role="button"
                  aria-label={t("githubWatchlist.removeOrg", { login })}
                  style={{ cursor: "pointer" }}
                  onClick={() => props.onRemoveOrg(login)}
                >
                  ×
                </span>
              }
            >
              {login}
            </Badge>
          ))}
          {props.orgs.length === 0 && <Text size="xs" c="dimmed">{t("githubWatchlist.noSources")}</Text>}
        </Group>

        <Text size="xs" fw={600} mt={4}>{t("githubWatchlist.availableHeading")}</Text>
        {props.availableLoading && <Text size="xs" c="dimmed">{t("githubWatchlist.availableLoading")}</Text>}
        {props.available?.unavailable && (
          <Text size="xs" c="orange">{t("githubWatchlist.availableUnavailable", { message: props.available.unavailable })}</Text>
        )}
        {props.available && !props.available.unavailable && props.available.orgs.length === 0 && (
          <Text size="xs" c="dimmed">{t("githubWatchlist.availableEmpty")}</Text>
        )}
        <Group gap="xs" wrap="wrap">
          {props.available?.orgs
            .filter((org) => !props.orgs.some((login) => login.toLowerCase() === org.login.toLowerCase()))
            .map((org) => (
              <Button key={org.login} size="compact-xs" variant="light" onClick={() => props.onManualOrgChange(org.login)}>
                + {org.login}
              </Button>
            ))}
        </Group>

        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            label={t("githubWatchlist.manualLabel")}
            description={t("githubWatchlist.manualDesc")}
            placeholder={t("githubWatchlist.manualPlaceholder")}
            value={props.manualOrg}
            onChange={(e) => props.onManualOrgChange(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button size="xs" variant="light" leftSection={<Check size={12} />} onClick={props.onAddManualOrg}>
            {t("githubWatchlist.addOrg")}
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}

/**
 * Draft state lives here and is initialised on mount, which is why this is a
 * separate component mounted once per open session: a background refetch can
 * then never discard edits the user has not saved yet, and no effect is needed
 * to seed it.
 */
function GithubWatchlistDialog({
  accountId,
  data,
  available,
  availableLoading,
  onClose,
}: {
  accountId: number;
  data: GithubWatchlistResponse;
  available: GithubAvailableOrgsResponse | null;
  availableLoading: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [watched, setWatched] = useState<Set<number>>(
    () => new Set(data.candidates.filter((c) => c.watched && c.githubId !== null).map((c) => c.githubId as number)),
  );
  const [orgs, setOrgs] = useState<string[]>(() => data.sources.filter((s) => s.enabled).map((s) => s.login));
  const [manualOrg, setManualOrg] = useState("");
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: () => api.saveGithubWatchlist(accountId, { orgs, watched: [...watched] }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ["github", "overview", accountId] });
      queryClient.invalidateQueries({ queryKey: ["github", "watchlist", accountId] });
      if (payload.errors?.length) {
        setErrors(payload.errors);
        notifications.show({ color: "red", message: t("githubWatchlist.partialSave") });
        return;
      }
      notifications.show({ message: t("githubWatchlist.saved") });
      onClose();
    },
    onError: (error: unknown) => {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : String(error) });
    },
  });

  const listedOwn = data.candidates.filter((c) => c.listedFrom !== null);
  const toggle = (githubId: number) =>
    setWatched((prev) => {
      const next = new Set(prev);
      if (next.has(githubId)) next.delete(githubId); else next.add(githubId);
      return next;
    });

  return (
    <Stack gap="md">
      <GithubWatchlistView
        candidates={data.candidates}
        sources={data.sources}
        warnings={data.warnings}
        errors={errors}
        watched={watched}
        filter={filter}
        onFilterChange={setFilter}
        onToggle={toggle}
        onSelectAll={() => setWatched(new Set(listedOwn.map((c) => c.githubId).filter((id): id is number => id !== null)))}
        onSelectNone={() => setWatched(new Set())}
        orgs={orgs}
        onRemoveOrg={(login) => setOrgs((prev) => prev.filter((l) => l !== login))}
        manualOrg={manualOrg}
        onManualOrgChange={setManualOrg}
        onAddManualOrg={() => {
          const login = manualOrg.trim().replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/^@/, "").replace(/\/+$/, "");
          if (!login) return;
          setOrgs((prev) => (prev.some((l) => l.toLowerCase() === login.toLowerCase()) ? prev : [...prev, login]));
          setManualOrg("");
        }}
        available={available}
        availableLoading={availableLoading}
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="light" color="gray" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending}>{t("common.save")}</Button>
      </Group>
    </Stack>
  );
}

export function GithubWatchlistModal({ accountId, opened, onClose }: { accountId: number; opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const enabled = opened && Number.isFinite(accountId);

  const watchlist = useQuery({
    queryKey: ["github", "watchlist", accountId],
    queryFn: () => api.getGithubWatchlist(accountId),
    enabled,
  });
  const available = useQuery({
    queryKey: ["github", "watchlist", accountId, "available"],
    queryFn: () => api.getGithubAvailableOrgs(accountId),
    enabled,
  });

  // Mount the dialog only on data fetched during THIS open session, so its
  // initial state reflects the server rather than a stale cache.
  const ready = enabled && watchlist.data !== undefined && watchlist.isFetchedAfterMount;

  return (
    <Modal opened={opened} onClose={onClose} title={t("githubWatchlist.title")} size="lg" centered>
      {ready ? (
        <GithubWatchlistDialog
          accountId={accountId}
          data={watchlist.data}
          available={available.data ?? null}
          availableLoading={available.isLoading}
          onClose={onClose}
        />
      ) : (
        <Text size="sm" c="dimmed">{t("githubWatchlist.loading")}</Text>
      )}
    </Modal>
  );
}
