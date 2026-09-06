import type { ReactNode } from "react";
import { ThemeContext } from "./useTheme";
import type { ThemeContextValue } from "./useTheme";

export function ThemeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ThemeContextValue;
}) {
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
