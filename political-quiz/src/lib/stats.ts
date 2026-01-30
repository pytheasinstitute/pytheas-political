import { Redis } from "@upstash/redis";

export type ArchetypeKey =
| "progressive_reformer"
| "progressive_individualist"
| "conservative_protector"
| "conservative_entrepreneur"
| "pragmatic_centrist"
| "liberty_first"
| "order_first"
| "independent_mix";

export type ThemeKey =
| "environment_first"
| "freedom_first"
| "order_first"
| "safety_net"
| "low_taxes"
| "public_services"
| "business_friendly"
| "stability"
| "change";

export const THEME_LABELS: Record<ThemeKey, string> = {
environment_first: "Environment-first",
freedom_first: "Freedom-first",
order_first: "Order-first",
safety_net: "Safety net",
low_taxes: "Low taxes",
public_services: "Strong public services",
business_friendly: "Business-friendly",
stability: "Stability",
change: "Change",
};

export const ARCHETYPE_LABELS: Record<ArchetypeKey, string> = {
progressive_reformer: "Progressive Reformer",
progressive_individualist: "Progressive Individualist",
conservative_protector: "Conservative Protector",
conservative_entrepreneur: "Conservative Entrepreneur",
pragmatic_centrist: "Pragmatic Centrist",
liberty_first: "Liberty-first",
order_first: "Order-first",
independent_mix: "Independent Mix",
};

export const ARCHETYPE_DESCRIPTIONS: Record<ArchetypeKey, string> = {
progressive_reformer:
"You generally support social change and you’re comfortable using government to solve problems and reduce harm.",
progressive_individualist:
"You’re socially open to change, but you prefer a lighter government touch and more room for individual choice and markets.",
conservative_protector:
"You lean toward stability and tradition, and you’re comfortable with a strong state when it comes to security and support.",
conservative_entrepreneur:
"You lean toward stability and tradition, and you generally prefer lower taxes, fewer rules, and more personal responsibility.",
pragmatic_centrist:
"You don’t lean strongly in one direction. You tend to decide issue-by-issue and care more about what works than labels.",
liberty_first:
"Across tradeoffs, you usually prioritize personal freedom over safety or order — even when it feels uncomfortable.",
order_first:
"Across tradeoffs, you usually prioritize safety and stability over personal freedom — especially in uncertain times.",
independent_mix:
"Your answers don’t fit neatly into one box. You likely think topic-by-topic, and different values pull you in different directions.",
};

export function getRedis(): Redis | null {
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) return null;
return new Redis({ url, token });
}

export function statsKeyTotal() {
return "pytheas:political:views:total";
}

export function statsKeyArchetype(a: ArchetypeKey) {
return `pytheas:political:views:archetype:${a}`;
}
