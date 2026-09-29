import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/card";
import { Button, SegmentedControl, TextInput } from "@/components/ui/form-controls";
import { Group, Text } from "@/components/ui/layout-primitives";

describe("UI migration adapter hardening", () => {
  it("uses explicit static utility classes for known layout props", () => {
    const html = renderToStaticMarkup(
      <Group align="flex-start" justify="space-between" gap="lg" mt="md">
        <Text fz="lg" ta="center" tt="uppercase" lineClamp={2}>Heading</Text>
      </Group>,
    );

    expect(html).toContain("items-start");
    expect(html).toContain("justify-between");
    expect(html).toContain("gap-6");
    expect(html).toContain("mt-4");
    expect(html).toContain("text-lg");
    expect(html).toContain("text-center");
    expect(html).toContain("uppercase");
    expect(html).toContain("line-clamp-2");
  });

  it("uses inline styles for arbitrary numeric spacing instead of runtime utilities", () => {
    const button = renderToStaticMarkup(<Button mt={7} px={11} ml={3}>Save</Button>);
    const group = renderToStaticMarkup(<Group gap={13} mt={7}>Body</Group>);
    const card = renderToStaticMarkup(<Card p={9}>Card</Card>);

    expect(button).toContain("margin-top:7px");
    expect(button).toContain("padding-inline:11px");
    expect(button).toContain("margin-left:3px");
    expect(button).not.toContain("mt-[7px]");
    expect(group).toContain("gap:13px");
    expect(group).toContain("margin-top:7px");
    expect(group).not.toContain("gap-[13px]");
    expect(card).toContain("padding:9px");
    expect(card).not.toContain("p-[9px]");
  });

  it("supports responsive numeric card padding through a static CSS class", () => {
    const html = renderToStaticMarkup(<Card p={{ base: 10, sm: 18 }}>Card</Card>);

    expect(html).toContain("ui-card-responsive-padding");
    expect(html).toContain("--card-padding-base:10px");
    expect(html).toContain("--card-padding-sm:18px");
  });

  it("implements compatibility field sizes and disabled segmented options", () => {
    const input = renderToStaticMarkup(<TextInput size="sm" aria-label="Search" />);
    const segmented = renderToStaticMarkup(
      <SegmentedControl value="enabled" onChange={() => undefined} data={[{ value: "enabled", label: "Enabled" }, { value: "locked", label: "Locked", disabled: true }]} />,
    );

    expect(input).toContain("h-9");
    expect(segmented).toContain('aria-pressed="false" disabled=""');
  });
});
