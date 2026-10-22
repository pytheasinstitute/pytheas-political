import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/lib/ogCard";
import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS, type ArchetypeKey } from "@/lib/stats";

export const alt = "A Pytheas Political result";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return Object.keys(ARCHETYPE_LABELS).map((archetype) => ({ archetype }));
}

export default async function Image({ params }: { params: Promise<{ archetype: string }> }) {
  const { archetype } = await params;
  const key = (archetype in ARCHETYPE_LABELS ? archetype : "independent_mix") as ArchetypeKey;

  return new ImageResponse(
    (
      <OgCard
        kicker="My Pytheas Political result"
        title={ARCHETYPE_LABELS[key]}
        body={ARCHETYPE_DESCRIPTIONS[key]}
        footer="Where do you stand? Take the quiz"
      />
    ),
    size
  );
}
