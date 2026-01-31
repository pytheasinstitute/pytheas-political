"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useMemo } from "react";

export type PrismCorner = { key: string; label: string; color: string };

/**
* Double‑sided pyramid with 6 corners:
* - 1 top, 1 bottom, 4 around the equator (octahedron vertices).
* Faces are tinted by the adjacent corner color for “territory” fill.
*/
export default function Prism3D({
weights,
corners,
height = 360,
locked,
}: {
// weights must align with corners order:
// [top, bottom, east, west, north, south]
weights: [number, number, number, number, number, number];
corners: [PrismCorner, PrismCorner, PrismCorner, PrismCorner, PrismCorner, PrismCorner];
height?: number;
locked?: boolean;
}) {
const w = useMemo(() => {
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ww = weights.map(clamp01);
const s = ww.reduce((a, b) => a + b, 0) || 1;
return ww.map((x) => x / s) as [number, number, number, number, number, number];
}, [weights]);

// Octahedron vertices: top/bottom + 4 equator points.
const verts = useMemo(() => {
const h = 1.15;
const r = 0.92;
return [
new THREE.Vector3(0, h, 0), // 0 top
new THREE.Vector3(0, -h, 0), // 1 bottom
new THREE.Vector3(r, 0, 0), // 2 east
new THREE.Vector3(-r, 0, 0), // 3 west
new THREE.Vector3(0, 0, r), // 4 north
new THREE.Vector3(0, 0, -r), // 5 south
] as const;
}, []);

// Faces (8 triangles) for an octahedron (double pyramid).
// We tint each face by the "dominant" corner participating in the triangle.
const faceTris = useMemo(() => {
const top = 0, bot = 1, E = 2, W = 3, N = 4, S = 5;
return [
[top, E, N],
[top, N, W],
[top, W, S],
[top, S, E],
[bot, N, E],
[bot, W, N],
[bot, S, W],
[bot, E, S],
] as const;
}, []);

const geom = useMemo(() => {
const g = new THREE.BufferGeometry();
const positions: number[] = [];
const indices: number[] = [];

// Build unique vertices per face so we can later do per-face-ish shading via separate meshes.
// (We’ll still use a single geometry for the glass shell.)
const baseVerts = verts.map((v) => v.clone());
// Create indexed geometry for the glass shell.
const vArr: THREE.Vector3[] = baseVerts as unknown as THREE.Vector3[];
const idx: number[] = [];
for (const tri of faceTris) idx.push(tri[0], tri[1], tri[2]);

g.setFromPoints(vArr);
g.setIndex(idx);
g.computeVertexNormals();
return g;
}, [verts, faceTris]);

// Weighted point inside the shape.
const point = useMemo(() => {
const p = new THREE.Vector3(0, 0, 0);
for (let i = 0; i < 6; i++) p.addScaledVector(verts[i], w[i]);
// pull slightly inward so it never clips
return p.multiplyScalar(0.78);
}, [verts, w]);

// Dot color is blended by weights.
const dotColor = useMemo(() => {
const cs = corners.map((c) => new THREE.Color(c.color));
let r = 0, g = 0, b = 0;
for (let i = 0; i < 6; i++) {
r += cs[i].r * w[i];
g += cs[i].g * w[i];
b += cs[i].b * w[i];
}
return `#${new THREE.Color(r, g, b).getHexString()}`;
}, [corners, w]);

const faceMeshes = useMemo(() => {
// Create one small geometry per face with tint color
return faceTris.map((tri, faceIdx) => {
const g = new THREE.BufferGeometry();
const pts = tri.map((vi) => verts[vi]);
g.setFromPoints(pts);
g.setIndex([0, 1, 2]);
g.computeVertexNormals();

// choose the corner among tri with max weight
const triWeights = tri.map((vi) => w[vi]);
let maxI = 0;
for (let i = 1; i < triWeights.length; i++) if (triWeights[i] > triWeights[maxI]) maxI = i;
const cornerIdx = tri[maxI];

return { geometry: g, color: corners[cornerIdx].color, key: `f-${faceIdx}-${cornerIdx}` };
});
}, [corners, faceTris, verts, w]);

return (
<div className="card" style={{ padding: 14, overflow: "hidden", position: "relative", height }}>
{locked && (
<div
style={{
position: "absolute",
inset: 0,
backdropFilter: "blur(10px)",
background: "rgba(247,244,238,0.35)",
zIndex: 2,
}}
/>
)}

<div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
<Canvas dpr={[1, 2]} camera={{ position: [2.35, 1.55, 2.35], fov: 45 }}>
<ambientLight intensity={locked ? 0.7 : 0.95} />
<directionalLight position={[3, 5, 2]} intensity={locked ? 0.6 : 0.95} />
<pointLight position={[-3, 2, -2]} intensity={locked ? 0.25 : 0.55} />

{/* Face fills (territory) */}
<group>
{faceMeshes.map((f) => (
<mesh key={f.key} geometry={f.geometry}>
<meshStandardMaterial
color={f.color}
transparent
opacity={locked ? 0.06 : 0.18}
roughness={0.35}
metalness={0.05}
depthWrite={false}
/>
</mesh>
))}
</group>

{/* Glass shell */}
<mesh geometry={geom}>
<meshPhysicalMaterial
color={"#0b2a5b"}
transparent
opacity={locked ? 0.10 : 0.16}
roughness={0.12}
metalness={0.08}
transmission={locked ? 0.18 : 0.38}
thickness={0.7}
clearcoat={0.85}
clearcoatRoughness={0.22}
/>
</mesh>

{/* Edges */}
<lineSegments>
<edgesGeometry attach="geometry" args={[geom]} />
<lineBasicMaterial
attach="material"
color={"#0b2a5b"}
transparent
opacity={locked ? 0.22 : 0.60}
/>
</lineSegments>

{/* Corner nodes */}
{verts.map((v, i) => (
<mesh key={i} position={v.toArray() as any}>
<sphereGeometry args={[0.05, 18, 18]} />
<meshStandardMaterial
color={corners[i].color}
emissive={corners[i].color}
emissiveIntensity={locked ? 0.06 : 0.35}
/>
</mesh>
))}

{/* User point */}
<mesh position={point.toArray() as any}>
<sphereGeometry args={[0.085, 28, 28]} />
<meshStandardMaterial
color={dotColor}
emissive={dotColor}
emissiveIntensity={locked ? 0.25 : 0.9}
/>
</mesh>
{/* Fun = interactive */}
<OrbitControls enableZoom={false} enablePan={false} />
</Canvas>
</div>

<div style={{ position: "relative", zIndex: 3, padding: 14 }}>
<div className="kicker">Pytheas Pyramid</div>
<div style={{ fontWeight: 850, marginTop: 6 }}>Your archetype shape</div>
<div className="small" style={{ marginTop: 8, opacity: 0.9 }}>
Drag to rotate.
</div>
</div>
</div>
);
}
