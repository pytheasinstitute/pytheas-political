import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/political", "/quiz", "/methodology", "/privacy", "/terms", "/imprint"];
  return pages.map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: "monthly",
    priority: path === "" || path === "/political" ? 1 : 0.5,
  }));
}
