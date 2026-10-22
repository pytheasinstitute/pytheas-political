# KI-Modelle (lokal)

Dieser Ordner wird von `tools/build-ai.py` gefüllt und nicht eingecheckt (etwa 70 MB).
Ohne ihn arbeitet Pixelwerk mit den klassischen Verfahren (GrabCut, PatchMatch).

```
python3 tools/build-ai.py
```

| Datei | Modell | Lizenz |
| --- | --- | --- |
| `ort-*.txt` | ONNX Runtime Web (WebAssembly) | MIT |
| `u2netp-*.txt` | U²-Netp – Motiv-Erkennung | Apache 2.0 |
| `sam-enc-*.txt` | MobileSAM-Bildkodierer | Apache 2.0 |
| `sam-dec-*.txt` | Segment-Anything-Maskendekodierer | Apache 2.0 |
| `migan-*.txt` | MI-GAN – Bereiche neu malen | MIT |

Alle Modelle laufen im Browser auf dem eigenen Gerät; Bilder werden nirgendwohin geschickt.
