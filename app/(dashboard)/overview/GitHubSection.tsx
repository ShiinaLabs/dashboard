import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { type Account } from "@/lib/api";
import { MetricCard } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { RepoChip } from "@/components/ui/RepoChip";
import { SectionShell } from "@/components/domain/shared/SectionShell";
import { PinnedGrid } from "@/components/domain/shared/PinnedGrid";
import { GithubIcon } from "@/components/BrandIcons";
import { Star, GitFork, TrendingUp } from "lucide-react";

interface RepoLike {
  id: number;
  account_id: number;
  repo_id?: number;
  project_id?: number;
  name: string;
  language: string | null;
  stars: number;
  forks: number;
  pinned: number | boolean;
}

interface Props {
  ghAllRepos: RepoLike[];
  ghPinned: RepoLike[];
  ghTotalStars: number;
  ghTotalForks: number;
  ghFollowers: number;
  ghAccounts: Account[];
}

export function GitHubSection({ ghAllRepos, ghPinned, ghTotalStars, ghTotalForks, ghFollowers, ghAccounts }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (ghAccounts.length === 0) return null;

  return (
    <SectionShell icon={<GithubIcon />} title={t("overview.githubHeading")}>
      <MetricGrid>
        <MetricCard label={t("overview.stats.repos")} value={ghAllRepos.length} icon={<GithubIcon />} />
        <MetricCard label={t("overview.stats.totalStars")} value={ghTotalStars} icon={<Star size={16} />} />
        <MetricCard label={t("overview.stats.totalForks")} value={ghTotalForks} icon={<GitFork size={16} />} />
        <MetricCard label={t("overview.stats.followers")} value={ghFollowers} icon={<TrendingUp size={16} />} />
      </MetricGrid>

      {ghPinned.length > 0 && (
        <PinnedGrid title={t("overview.pinnedRepos")}>
          {ghPinned.map((repo) => {
            const acc = ghAccounts.find((a) => a.id === repo.account_id);
            return (
              <RepoChip key={repo.id} name={repo.name} language={repo.language} stars={repo.stars} forks={repo.forks}
                onClick={() => navigate(`/github/${acc?.id ?? repo.account_id}/repos/${repo.repo_id}`)} />
            );
          })}
        </PinnedGrid>
      )}
    </SectionShell>
  );
}
