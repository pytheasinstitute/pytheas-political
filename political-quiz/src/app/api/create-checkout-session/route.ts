import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { UNLOCK_PRICE_EUR } from "@/lib/quiz";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not configured (missing STRIPE_SECRET_KEY)." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    origin?: string;
  };

  const origin = body.origin || "";
  if (!origin.startsWith("http")) {
    return NextResponse.json({ error: "Missing origin" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "Pytheas Political Profile — Full Result Unlock",
          },
          unit_amount: UNLOCK_PRICE_EUR * 100,
        },
        quantity: 1,
      },
    ],
    allow_promotion_codes: false,
    success_url: `${origin}/quiz/result?session_id={CHECKOUT_SESSION_ID}&unlock=1`,
    cancel_url: `${origin}/quiz/result?cancel=1`,
    metadata: {
      product: "pytheas_unlock_v1",
    },
  });

  return NextResponse.json({ url: session.url });
}
