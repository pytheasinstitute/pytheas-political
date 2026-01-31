"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useMemo } from "react";

export type PrismCorner = { key: string; label: string; color: string };

export default function Prism3D({
weights,
corners,
height = 340,
locked,
}: {
weights: [number, number, number, number, number, number];
corners: [PrismCorner, PrismCorner, PrismCorner, PrismCorner, PrismCorner, PrismCorner];
height?: number;
locked?: boolean;
}) {
const w = useMemo(() => {
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ww = weights.map(clamp01);
const s = ww.reduce((a, b) => a + b, 0) || 1;
return ww.map((x) => x / s);
}, [weights]);

const geom = useMemo(() => {
const h = 1.0;
const s = 0.95;
const top = [
new THREE.Vector3(0, h, s),
new THREE.Vector3(-s, h, -s * 0.6),
new THREE.Vector3(s, h, -s * 0.6),
];
const bot = top.map((v) => new THREE.Vector3(v.x, -h, v.z));
const vertices = [...top, ...bot];
const indices = [
0, 1, 2,
3, 5, 4,
0, 2, 5, 0, 5, 3,
2, 1, 4, 2, 4, 5,
1, 0, 3, 1, 3, 4,
];
const g = new THREE.BufferGeometry();
g.setFromPoints(vertices);
g.setIndex(indices);
g.computeVertexNormals();
return g;
}, []);

const point = useMemo(() => {
const h = 1.0;
const s = 0.95;
const verts = [
new THREE.Vector3(0, h, s),
new THREE.Vector3(-s, h, -s * 0.6),
new THREE.Vector3(s, h, -s * 0.6),
new THREE.Vector3(0, -h, s),
new THREE.Vector3(-s, -h, -s * 0.6),
new THREE.Vector3(s, -h, -s * 0.6),
];
const p = new THREE.Vector3(0, 0, 0);
for (let i = 0; i < 6; i++) p.addScaledVector(verts[i], w[i]);
return p.multiplyScalar(0.92);
}, [w]);

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

return (
<div className="card" style={{ padding: 14, overflow: "hidden", position: "relative", height }}>
{locked && (
<div style={{ position: "absolute", inset: 0, backdropFilter: "blur(10px)", background: "rgba(247,244,238,0.35)", zIndex: 2 }} />
)}
<div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
<Canvas dpr={[1, 2]} camera={{ position: [2.4, 1.6, 2.6], fov: 45 }}>
<ambientLight intensity={locked ? 0.6 : 0.9} />
<directionalLight position={[3, 5, 2]} intensity={locked ? 0.6 : 0.9} />
<mesh geometry={geom}>
<meshPhysicalMaterial
color={"#0b2a5b"}
transparent
opacity={locked ? 0.12 : 0.18}
roughness={0.15}
metalness={0.1}
transmission={locked ? 0.2 : 0.35}
thickness={0.6}
clearcoat={0.8}
clearcoatRoughness={0.2}
/>
</mesh>
<lineSegments>
<edgesGeometry attach="geometry" args={[geom]} />
<lineBasicMaterial attach="material" color={"#0b2a5b"} transparent opacity={locked ? 0.25 : 0.55} />
</lineSegments>

<mesh position={point.toArray() as any}>
<sphereGeometry args={[0.075, 32, 32]} />
<meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={locked ? 0.25 : 0.75} />
</mesh>

{(() => {
const h = 1.0, s = 0.95;
const verts = [
new THREE.Vector3(0, h, s),
new THREE.Vector3(-s, h, -s * 0.6),
new THREE.Vector3(s, h, -s * 0.6),
new THREE.Vector3(0, -h, s),
new THREE.Vector3(-s, -h, -s * 0.6),
new THREE.Vector3(s, -h, -s * 0.6),
];
return verts.map((v, i) => (
<mesh key={i} position={v.toArray() as any}>
<sphereGeometry args={[0.045, 18, 18]} />
<meshStandardMaterial color={corners[i].color} emissive={corners[i].color} emissiveIntensity={locked ? 0.08 : 0.35} />
</mesh>
));
})()}

<OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={locked ? 0.8 : 1.1} />
</Canvas>
</div>

<div style={{ position: "relative", zIndex: 3, padding: 14 }}>
<div className="kicker">Pytheas Prism</div>
<div style={{ fontWeight: 850, marginTop: 6 }}>Your archetype prism</div>
</div>
</div>
);
}
