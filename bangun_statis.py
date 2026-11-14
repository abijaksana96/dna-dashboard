"""Bangun versi statis dashboard untuk GitHub Pages ke folder situs/.

Data dari folder data/ (sama dengan API), model acuan diekspor ke ONNX lalu dicek terhadap PyTorch.
Jalankan: uv run --with onnx --with onnxscript --with onnxruntime python bangun_statis.py
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from dashboard.model import MPRA_DOWNSTREAM, MPRA_UPSTREAM, ModelAcuan, one_hot_600

APP = Path(__file__).resolve().parent
DATA, WEB, SITUS = APP / "data", APP / "web", APP / "situs"
ONNX = SITUS / "model" / "acuan_20ep.onnx"
KOLOM = ["HepG2_post", "HepG2_raw", "HepG2_pred", "K562_post", "K562_raw", "K562_pred"]


def tulis(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def data_statis() -> None:
    metrik = json.loads((DATA / "metrik.json").read_text())
    elemen = json.loads((DATA / "elemen.json").read_text())
    sekuens = json.loads((DATA / "sekuens.json").read_text())
    tulis(SITUS / "data/meta.json", {"metrik": metrik, "elemen": elemen})
    tulis(SITUS / "data/sekuens.json", sekuens)
    tulis(SITUS / "data/pengapit.json", {"up": MPRA_UPSTREAM, "down": MPRA_DOWNSTREAM})
    sat = "9:34988605:G:C:R:wC"  # sama dengan /api/contoh
    tulis(SITUS / "data/contoh.json", {"sat_ref": sat, "elemen": "9:34988605:G:C:wC", "sekuens": sekuens[sat]})
    mut = pd.read_csv(DATA / "mutasi.csv.gz", dtype={"pos": "Int64"})
    for i, e in enumerate(elemen):  # nama berkas = indeks elemen; ID berisi titik dua
        g = mut[mut["elemen"] == e["id"]]
        alel = list(e["alel"])
        assert set(g["sat_ref"]) <= set(alel), e["id"]
        baris = [[alel.index(r.sat_ref), None if pd.isna(r.pos) else int(r.pos), None if pd.isna(r.alt) else r.alt,
                  *[None if pd.isna(v) else round(float(v), 5) for v in (getattr(r, k) for k in KOLOM)]]
                 for r in g.itertuples(index=False)]
        tulis(SITUS / f"data/peta/{i}.json", {"alel": alel, "ref": [sekuens.get(a, "") for a in alel],
                                              "kolom": ["alel", "pos", "alt", *KOLOM], "baris": baris})


def ekspor_onnx() -> None:
    import onnxruntime as ort

    acuan = ModelAcuan()
    ONNX.parent.mkdir(parents=True, exist_ok=True)
    contoh = one_hot_600(["A" * 200, "C" * 200])
    torch.onnx.export(acuan.model, (contoh,), ONNX, input_names=["x"], output_names=["y"], dynamo=True,
                      dynamic_shapes={"x": {0: torch.export.Dim.DYNAMIC}}, opset_version=18, external_data=False)
    # pemeriksaan: sekuens contoh dan 600 mutasinya, arah maju dan reverse complement, ONNX vs PyTorch
    seq = json.loads((SITUS / "data/contoh.json").read_text())["sekuens"]
    daftar = [seq] + [seq[:i] + a + seq[i + 1:] for i, b in enumerate(seq) for a in "ACGT" if a != b]
    rc = [s.translate(str.maketrans("ACGT", "TGCA"))[::-1] for s in daftar]
    sesi = ort.InferenceSession(str(ONNX), providers=["CPUExecutionProvider"])
    with torch.no_grad():
        for nama, kumpulan in (("maju", daftar), ("reverse complement", rc)):
            x = one_hot_600(kumpulan)
            a, b = acuan.model(x).numpy(), sesi.run(None, {"x": x.numpy()})[0]
            print(f"ONNX vs PyTorch, {nama}: selisih maks {np.abs(a - b).max():.2e}")
            assert np.abs(a - b).max() < 1e-4


def salin_web() -> None:
    import hashlib
    v = {f: hashlib.sha1((WEB / f).read_bytes()).hexdigest()[:8] for f in ("styles.css", "app.js", "statis.js")}  # pemecah cache
    html = (WEB / "index.html").read_text()
    html = html.replace('href="/static/styles.css"', f'href="styles.css?v={v["styles.css"]}"').replace(
        '<script src="/static/app.js"></script>',
        f'<script src="statis.js?v={v["statis.js"]}"></script>\n  <script src="app.js?v={v["app.js"]}"></script>')
    assert "/static/" not in html
    (SITUS / "index.html").write_text(html)
    for f in ("styles.css", "app.js", "statis.js"):
        shutil.copy(WEB / f, SITUS / f)
    (SITUS / ".nojekyll").write_text("")


if __name__ == "__main__":
    if SITUS.exists():
        shutil.rmtree(SITUS)
    data_statis()
    ekspor_onnx()
    salin_web()
    total = sum(p.stat().st_size for p in SITUS.rglob("*") if p.is_file())
    print(f"situs/: {sum(1 for p in SITUS.rglob('*') if p.is_file())} berkas, {total / 1e6:.1f} MB")
