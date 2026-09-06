import { Star, GitFork } from "lucide-react";
import { languageColor } from "@/app/(dashboard)/overview/constants";
import { Button } from "@mantine/core";

export function RepoChip({ name, language, stars, forks, onClick }: {
  name: string; language: string | null; stars: number; forks: number; onClick: () => void;
}) {
  return (
    <Button onClick={onClick} variant="light" color="gray" size="sm"
      className="repo-chip min-w-0"
      justify="flex-start"
      classNames={{ inner: "repo-chip-inner", label: "repo-chip-label" }}
    >
      {language && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: languageColor(language) }} />}
      <span className="repo-chip-name text-xs font-medium truncate">{name}</span>
      <span className="repo-chip-stats text-[11px] text-[var(--muted-foreground)] shrink-0">
        <span className="flex items-center gap-0.5"><Star size={10} /> {stars.toLocaleString()}</span>
        <span className="flex items-center gap-0.5"><GitFork size={10} /> {forks.toLocaleString()}</span>
      </span>
    </Button>
  );
}
