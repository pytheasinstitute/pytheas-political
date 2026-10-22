import { NextResponse } from "next/server";
import { ARCHETYPE_LABELS, getRedis, statsKeyArchetype, statsKeyTotal, type ArchetypeKey } from "@/lib/stats";

export async function POST(request: Request) {
const redis = getRedis();
if (!redis) {
return NextResponse.json(
{ ok: false, error: "Stats storage not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)." },
{ status: 500 }
);
}

const body = (await request.json().catch(() => ({}))) as { archetype?: ArchetypeKey };
if (!body.archetype || !(body.archetype in ARCHETYPE_LABELS)) {
return NextResponse.json({ ok: false, error: "Unknown archetype" }, { status: 400 });
}

await redis.pipeline().incr(statsKeyTotal()).incr(statsKeyArchetype(body.archetype)).exec();
return NextResponse.json({ ok: true });
}
