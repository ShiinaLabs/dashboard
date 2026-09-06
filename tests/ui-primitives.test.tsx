import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MantineProvider } from "@mantine/core";
import { ConfirmDialog, Badge, Button, Divider, TextInput } from "@/components/ui";

describe("Mantine UI primitives", () => {
  it("exports the approved Mantine-backed controls", () => {
    expect(Button).toBeDefined();
    expect(Badge).toBeDefined();
    expect(Divider).toBeDefined();
    expect(TextInput).toBeDefined();
  });

  it("keeps a closed confirmation dialog out of the SSR markup", () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ConfirmDialog
          open={false}
          onOpenChange={() => undefined}
          title="Delete account"
          description="This cannot be undone"
          onConfirm={async () => undefined}
        />
      </MantineProvider>,
    );

    expect(html).not.toContain("Delete account");
  });
});
