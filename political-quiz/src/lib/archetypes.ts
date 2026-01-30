import { type QuizAnswers, type QuizScore } from "./quiz";
import { type ArchetypeKey, type ThemeKey } from "./stats";
export function strengthLabel(pct: number): "low" | "medium" | "high" {
const dist = Math.abs(pct - 50);
if (dist >= 28) return "high";
if (dist >= 14) return "medium";
return "low";
}

export function computeArchetype(score: QuizScore): ArchetypeKey {
const socialDist = Math.abs(score.pcPct - 50);

// strong social “override”
if (socialDist >= 32) {
if (score.pcPct >= 82) return "liberty_first";
if (score.pcPct <= 18) return "order_first";
}

const centerDist = Math.max(Math.abs(score.pcPct - 50), Math.abs(score.smPct - 50));
if (centerDist <= 10) return "pragmatic_centrist";

const progressive = score.pcPct >= 50;
const state = score.smPct >= 50;

if (progressive && state) return "progressive_reformer";
if (progressive && !state) return "progressive_individualist";
if (!progressive && state) return "conservative_protector";
if (!progressive && !state) return "conservative_entrepreneur";

return "independent_mix";
}
export function computeThemes(answers: QuizAnswers): ThemeKey[] {
const themes: Record<ThemeKey, number> = {
environment_first: 0,
freedom_first: 0,
order_first: 0,
safety_net: 0,
low_taxes: 0,
public_services: 0,
business_friendly: 0,
stability: 0,
change: 0,
};

// only count strong-ish signals
const pos = (v: number | undefined) => (v === 2 ? 2 : v === 1 ? 1 : 0);
const neg = (v: number | undefined) => (v === -2 ? 2 : v === -1 ? 1 : 0);

// Social
themes.change += pos(answers["pc_1"]);
themes.stability += pos(answers["pc_2"]);
themes.change += pos(answers["pc_3"]);
themes.stability += pos(answers["pc_4"]);
themes.change += pos(answers["pc_6"]);
themes.freedom_first += pos(answers["pc_6"]);
themes.order_first += neg(answers["pc_6"]);

// Economic
themes.environment_first += pos(answers["sm_1"]);
themes.public_services += pos(answers["sm_1"]);
themes.low_taxes += pos(answers["sm_2"]);
themes.business_friendly += pos(answers["sm_2"]);

themes.safety_net += pos(answers["sm_3"]);
themes.public_services += pos(answers["sm_3"]);

themes.business_friendly += pos(answers["sm_4"]);

themes.safety_net += pos(answers["sm_5"]);

themes.freedom_first += pos(answers["sm_6"]);
themes.low_taxes += pos(answers["sm_6"]);

return (Object.keys(themes) as ThemeKey[])
.sort((a, b) => themes[b] - themes[a])
.filter((k) => themes[k] > 0)
.slice(0, 3);
}

export function formatPct(share: number, n: number): string {
if (n < 200) return `${Math.round(share * 100)}%`;
return `${(share * 100).toFixed(1)}%`;
}
