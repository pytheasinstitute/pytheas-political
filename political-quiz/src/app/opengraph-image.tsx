import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "@/lib/ogCard";

export const alt = "Pytheas Political — where do you stand?";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        kicker="Pytheas Political"
        title="Where do you stand?"
        body="12 neutral statements. Two axes: progressive vs. conservative, state vs. market. Your archetype in 3 minutes."
        footer="Take the free quiz"
      />
    ),
    size
  );
}
