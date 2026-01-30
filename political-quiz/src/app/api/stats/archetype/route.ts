import { NextResponse } from "next/server";
import { getRedis, statsKeyArchetype, statsKeyTotal, type ArchetypeKey } from "@/lib/stats";
export async function GET(request: Request) {
const redis = getRedis();
if (!redis) {
return NextResponse.json(
{ ok: false, error: "Stats storage not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)." },
{ status: 500 }
);
}

const url = new URL(request.url);
const archetype = url.searchParams.get("archetype") as ArchetypeKey | null;
if (!archetype) return NextResponse.json({ ok: false, error: "Missing archetype" }, { status: 400 });

const [total, aCount] = await redis.pipeline().get(statsKeyTotal()).get(statsKeyArchetype(archetype)).exec();
const totalNum = Number(total) || 0;
const aNum = Number(aCount) || 0;
const share = totalNum > 0 ? aNum / totalNum : 0;

return NextResponse.json({ ok: true, total: totalNum, archetype: aNum, share });
}
