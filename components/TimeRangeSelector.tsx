import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@/components/ui";

const OPTIONS: { value: number; labelKey: string }[] = [
  { value: 7, labelKey: "timeRange.7d" },
  { value: 30, labelKey: "timeRange.30d" },
  { value: 90, labelKey: "timeRange.90d" },
  { value: 180, labelKey: "timeRange.180d" },
  { value: 365, labelKey: "timeRange.1y" },
];

interface Props {
  value: number;
  onChange: (days: number) => void;
  options?: { value: number; labelKey: string }[];
}

export function TimeRangeSelector({ value, onChange, options = OPTIONS }: Props) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      aria-label={t("timeRange.label")}
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      data={options.map((o) => ({ value: String(o.value), label: t(o.labelKey) }))}
      fullWidth
      radius="md"
      size="sm"
    />
  );
}
