#!/usr/bin/env python3
"""Builds pixelwerk/ai/: the local AI models and the ONNX Runtime binary, packed for the page.

Each pack is the ONNX graph without its weights plus the weights (float32 stored as float16, half
the download), split into base64 text chunks of at most 11 MB, so they can be published next to
the page as ordinary text files. ai/index.json lists the packs; js/ai.js reads it, downloads the
chunks, expands the weights and keeps the packs in IndexedDB.

Sources (all from the npm registry):
  onnxruntime-web       ort-wasm-simd-threaded.wasm   MIT
  @planby-tech/rmbg-webgpu  models/u2netp.onnx        U²-Netp, Apache-2.0
  @geti-ui/smart-tools  mobile_sam.encoder.onnx      MobileSAM, Apache-2.0
                        sam_vit_h_4b8939.decoder.onnx  Segment Anything decoder, Apache-2.0
  migan-onnx            models/migan_pipeline_v2.onnx  MI-GAN, MIT

Usage: python3 tools/build-ai.py [work dir]   (needs npm, numpy, onnx)
"""
import base64, hashlib, json, os, pathlib, subprocess, sys, tarfile

import numpy as np
import onnx
from onnx import TensorProto, numpy_helper

ORT_VERSION = '1.23.2'
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'ai'
WORK = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/pixelwerk-ai')
CHUNK = 11 * 1024 * 1024
SOURCES = {
    'ort': (f'onnxruntime-web@{ORT_VERSION}', 'package/dist/ort-wasm-simd-threaded.wasm'),
    'u2netp': ('@planby-tech/rmbg-webgpu@0.2.1', 'package/models/u2netp.onnx'),
    'sam-enc': ('@geti-ui/smart-tools@1.7.0', 'package/dist/esm/mobile_sam.encoder.onnx'),
    'sam-dec': ('@geti-ui/smart-tools@1.7.0', 'package/dist/esm/sam_vit_h_4b8939.decoder.onnx'),
    'migan': ('migan-onnx@1.0.0', 'package/models/migan_pipeline_v2.onnx'),
}


def fetch(spec, member):
    """Path of `member` inside the npm package `spec` (downloaded once into WORK)."""
    d = WORK / spec.replace('/', '_').replace('@', '_')
    target = d / member
    if not target.exists():
        d.mkdir(parents=True, exist_ok=True)
        name = subprocess.run(['npm', 'pack', spec, '--silent'], cwd=d, check=True, capture_output=True, text=True).stdout.strip().splitlines()[-1]
        with tarfile.open(d / name) as t:
            t.extract(member, d, filter='data')
    return target


def pack_model(path):
    """Graph without weights + packed weights; segs say how to expand them: [off, len, kind, pos, full]."""
    m = onnx.load(path)
    blob, segs, pos = bytearray(), [], 0
    for t in m.graph.initializer:
        a = numpy_helper.to_array(t)
        if a.nbytes < 1024:
            continue
        kind, raw = 0, a.tobytes()
        if a.dtype == np.float32:
            h = a.astype(np.float16)
            if np.all(np.isfinite(h)) or not np.all(np.isfinite(a)):
                kind, raw = 1, h.tobytes()
        off = len(blob)
        blob += raw + b'\0' * ((-len(raw)) % 4)
        for f in ('raw_data', 'float_data', 'int64_data', 'int32_data', 'double_data'):
            t.ClearField(f)
        t.data_location = TensorProto.EXTERNAL
        del t.external_data[:]
        for k, v in (('location', 'w.bin'), ('offset', str(pos)), ('length', str(a.nbytes))):
            e = t.external_data.add()
            e.key, e.value = k, v
        segs.append([off, len(raw), kind, pos, a.nbytes])
        pos += a.nbytes
        pos += (-pos) % 16
    graph = m.SerializeToString()
    return graph + bytes(blob), {'graph': len(graph), 'weights': pos, 'segs': segs}


def write(name, data, extra):
    n = (len(data) + CHUNK - 1) // CHUNK
    for i in range(n):
        (OUT / f'{name}-{i}.txt').write_text(base64.b64encode(data[i * CHUNK:(i + 1) * CHUNK]).decode())
    return {'bytes': len(data), 'chunks': n, 'sha': hashlib.sha256(data).hexdigest()[:16], **extra}


def main():
    OUT.mkdir(exist_ok=True)
    for f in OUT.glob('*-*.txt'):
        f.unlink()
    packs = {}
    for name, (spec, member) in SOURCES.items():
        src = fetch(spec, member)
        if name == 'ort':
            packs[name] = write(name, src.read_bytes(), {'graph': 0, 'weights': 0, 'segs': []})
        else:
            data, extra = pack_model(src)
            packs[name] = write(name, data, extra)
        print(f'{name:8s} {packs[name]["bytes"] / 1e6:6.1f} MB in {packs[name]["chunks"]} chunk(s)')
    (OUT / 'index.json').write_text(json.dumps({'version': 1, 'ort': ORT_VERSION, 'packs': packs}))
    total = sum(p['bytes'] for p in packs.values())
    print(f'total    {total / 1e6:6.1f} MB → {OUT}')


if __name__ == '__main__':
    main()
