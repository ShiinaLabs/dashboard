import { useNavigation } from "react-router";

export function NavigationProgress() {
  const navigation = useNavigation();

  if (navigation.state === "idle") return null;

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] h-[3px]">
      <div className="nav-bar h-full rounded-r-full" style={{
        background: "linear-gradient(90deg, var(--primary), color-mix(in oklch, var(--primary) 60%, var(--chart-2)))",
        boxShadow: "0 0 12px color-mix(in oklch, var(--primary) 50%, transparent)",
      }} />
    </div>
  );
}
