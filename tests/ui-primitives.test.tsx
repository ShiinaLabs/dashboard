import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button, Divider, TextInput } from "@/components/ui/form-controls";

describe("shadcn UI primitives", () => {
  it("exports the exports the shared shadcn controls", () => {
    expect(Button).toBeDefined();
    expect(Badge).toBeDefined();
    expect(Divider).toBeDefined();
    expect(TextInput).toBeDefined();
  });

  it("keeps a closed confirmation dialog out of the SSR markup", () => {
    const html = renderToStaticMarkup(

        <ConfirmDialog
          open={false}
          onOpenChange={() => undefined}
          title="Delete account"
          description="This cannot be undone"
          onConfirm={async () => undefined}
        />
      ,
    );

    expect(html).not.toContain("Delete account");
  });
});
