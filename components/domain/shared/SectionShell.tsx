import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionShell({ icon, title, action, children }: Props) {
  return (
    <section className="overview-section space-y-3" data-slot="overview-section">
      <div className="overview-section-heading" data-slot="overview-section-heading">
        <h3>
          <span className="overview-section-icon" data-slot="overview-section-icon" aria-hidden="true">
            {icon}
          </span>
          <span>{title}</span>
        </h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
