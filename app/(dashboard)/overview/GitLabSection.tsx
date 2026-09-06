import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { type Account } from "@/lib/api";
import { MetricCard } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { RepoChip } from "@/components/ui/RepoChip";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { PinnedGrid } from "@/components/domain/shared/PinnedGrid";
import { GitlabIcon } from "@/components/BrandIcons";
import { Star, GitFork, TrendingUp } from "lucide-react";

interface ProjectLike {
  id: number;
  account_id: number;
  project_id?: number;
  name: string;
  language: string | null;
  stars: number;
  forks: number;
  pinned: number | boolean;
}

interface Props {
  glAllProjects: ProjectLike[];
  glPinned: ProjectLike[];
  glTotalStars: number;
  glTotalForks: number;
  glFollowers: number;
  glAccounts: Account[];
}

export function GitLabSection({ glAllProjects, glPinned, glTotalStars, glTotalForks, glFollowers, glAccounts }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (glAccounts.length === 0) return null;

  return (
    <SectionShell icon={<GitlabIcon />} title={t("overview.gitlabHeading")}>
      <MetricGrid>
        <MetricCard label={t("overview.stats.projects")} value={glAllProjects.length} icon={<GitlabIcon />} />
        <MetricCard label={t("overview.stats.totalStars")} value={glTotalStars} icon={<Star size={16} />} />
        <MetricCard label={t("overview.stats.totalForks")} value={glTotalForks} icon={<GitFork size={16} />} />
        <MetricCard label={t("overview.stats.followers")} value={glFollowers} icon={<TrendingUp size={16} />} />
      </MetricGrid>

      {glPinned.length > 0 && (
        <PinnedGrid title={t("overview.pinnedProjects")}>
          {glPinned.map((p) => {
            const acc = glAccounts.find((a) => a.id === p.account_id);
            return (
              <RepoChip key={p.id} name={p.name} language={p.language} stars={p.stars} forks={p.forks}
                onClick={() => navigate(`/gitlab/${acc?.id ?? p.account_id}/projects/${p.project_id}`)} />
            );
          })}
        </PinnedGrid>
      )}
    </SectionShell>
  );
}
