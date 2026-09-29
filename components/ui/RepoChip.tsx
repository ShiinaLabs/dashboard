import { Star, GitFork } from "lucide-react";
import { languageColor } from "@/app/(dashboard)/overview/constants";
import { Button } from "@/components/ui/button";

export function RepoChip({ name, language, stars, forks, onClick }: {
  name: string; language: string | null; stars: number; forks: number; onClick: () => void;
}) {
  return (
    <Button onClick={onClick} variant="outline" size="sm"
      className="flex min-h-10 w-full min-w-0 items-center gap-2.5 text-left h-auto min-w-0 justify-start px-3 py-2"
    >
      {language && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: languageColor(language) }} />}
      <span className="min-w-0 flex-1 truncate text-xs font-medium truncate">{name}</span>
      <span className="ml-auto inline-flex shrink-0 items-center gap-3 text-[11px] text-[var(--muted-foreground)] shrink-0">
        <span className="flex items-center gap-0.5"><Star size={10} /> {stars.toLocaleString()}</span>
        <span className="flex items-center gap-0.5"><GitFork size={10} /> {forks.toLocaleString()}</span>
      </span>
    </Button>
  );
}
