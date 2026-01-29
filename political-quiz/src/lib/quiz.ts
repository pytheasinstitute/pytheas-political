export type Axis = "pc" | "sm"; // progressive-conservative, state-market

export type Likert = -2 | -1 | 0 | 1 | 2;

export type QuizQuestion = {
  id: string;
  text: string;
  // Which direction does agreement move the score?
  // +1 means agreement => more Progressive (pc) or more State (sm)
  // -1 means agreement => more Conservative (pc) or more Market (sm)
  axis: Axis;
  direction: 1 | -1;
};

export const QUESTIONS_V1: QuizQuestion[] = [
  // Progressive ↔ Conservative (pc)
  {
    id: "pc_1",
    text: "Society should change quickly when new evidence shows current norms are harmful.",
    axis: "pc",
    direction: 1,
  },
  {
    id: "pc_2",
    text: "Traditions are usually worth preserving, even when they seem outdated.",
    axis: "pc",
    direction: -1,
  },
  {
    id: "pc_3",
    text: "It is good when schools teach students to question established authority.",
    axis: "pc",
    direction: 1,
  },
  {
    id: "pc_4",
    text: "A country works best when it keeps long‑standing cultural norms stable.",
    axis: "pc",
    direction: -1,
  },
  {
    id: "pc_5",
    text: "In public policy, fairness often matters more than strict equality.",
    axis: "pc",
    direction: -1,
  },
  {
    id: "pc_6",
    text: "Government should be more active in protecting minority rights, even if it upsets the majority.",
    axis: "pc",
    direction: 1,
  },

  // State ↔ Market (sm)
  {
    id: "sm_1",
    text: "Government should regulate markets more strongly to protect people from harm.",
    axis: "sm",
    direction: 1,
  },
  {
    id: "sm_2",
    text: "Lower taxes and fewer regulations generally lead to better outcomes for society.",
    axis: "sm",
    direction: -1,
  },
  {
    id: "sm_3",
    text: "Healthcare should be primarily guaranteed by the state, not by the market.",
    axis: "sm",
    direction: 1,
  },
  {
    id: "sm_4",
    text: "Private companies usually deliver services more efficiently than governments.",
    axis: "sm",
    direction: -1,
  },
  {
    id: "sm_5",
    text: "Redistribution (e.g., progressive taxation) is necessary for a stable society.",
    axis: "sm",
    direction: 1,
  },
  {
    id: "sm_6",
    text: "People should be free to succeed or fail economically with minimal state interference.",
    axis: "sm",
    direction: -1,
  },
];

export type QuizAnswers = Record<string, Likert>;

export type QuizScore = {
  pc: number; // raw score
  sm: number; // raw score
  pcPct: number; // 0..100 (0=Conservative, 100=Progressive)
  smPct: number; // 0..100 (0=Market, 100=State)
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function scoreQuiz(answers: QuizAnswers, questions: QuizQuestion[] = QUESTIONS_V1): QuizScore {
  let pc = 0;
  let sm = 0;

  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined) continue;
    const delta = a * q.direction;
    if (q.axis === "pc") pc += delta;
    if (q.axis === "sm") sm += delta;
  }

  // Max magnitude per axis: 6 questions * 2 points = 12
  const pcNorm = clamp01((pc + 12) / 24);
  const smNorm = clamp01((sm + 12) / 24);

  return {
    pc,
    sm,
    pcPct: Math.round(pcNorm * 100),
    smPct: Math.round(smNorm * 100),
  };
}

export function profileBlurb(score: QuizScore): { title: string; bullets: string[]; paragraph: string } {
  const pcLabel = score.pcPct >= 50 ? "Progressive" : "Conservative";
  const smLabel = score.smPct >= 50 ? "State" : "Market";

  const title = `${pcLabel}-${smLabel} leaning`;

  const bullets: string[] = [];
  bullets.push(`Progressive ↔ Conservative: ${score.pcPct}% Progressive`);
  bullets.push(`State ↔ Market: ${score.smPct}% State`);

  const paragraph =
    "This profile is a structured self‑reflection snapshot. It describes your default instincts, not a complete ideology. Real political views are richer than two numbers.";

  return { title, bullets, paragraph };
}

export const UNLOCK_PRICE_EUR = 1;
export const LOCALSTORAGE_UNLOCK_KEY = "pytheas_unlock_v1";
