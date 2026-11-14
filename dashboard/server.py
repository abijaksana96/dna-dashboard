"""Server dashboard: API data penelitian dan prediksi model acuan, plus halaman web.

Jalankan dari folder app: uv run uvicorn dashboard.server:app --port 8000
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .model import ModelAcuan, periksa_sekuens

APP = Path(__file__).resolve().parent.parent
DATA, WEB = APP / "data", APP / "web"

METRIK = json.loads((DATA / "metrik.json").read_text())
ELEMEN = json.loads((DATA / "elemen.json").read_text())
ELEMEN_ID = {e["id"]: e for e in ELEMEN}
SEKUENS = json.loads((DATA / "sekuens.json").read_text())
SEKUENS_BALIK = {v: k for k, v in SEKUENS.items()}
MUTASI = pd.read_csv(DATA / "mutasi.csv.gz", dtype={"pos": "Int64"})
SEL = ("HepG2", "K562")

app = FastAPI(title="Dashboard Efek Mutasi", docs_url="/api/docs")


@app.middleware("http")
async def tanpa_cache(request, call_next):
    """Berkas web selalu diperiksa ulang supaya perubahan langsung terlihat."""
    resp = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@lru_cache(maxsize=1)
def model() -> ModelAcuan:
    return ModelAcuan()


def pearson(a: np.ndarray, b: np.ndarray) -> float | None:
    ok = ~(np.isnan(a) | np.isnan(b))
    a, b = a[ok] - a[ok].mean(), b[ok] - b[ok].mean()
    den = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / den) if den > 0 else None


@app.get("/api/meta")
def meta():
    return {"metrik": METRIK, "elemen": ELEMEN}


@app.get("/api/peta")
def peta(elemen: str, sat_ref: str | None = None, sel: str = "HepG2", target: str = "post"):
    if elemen not in ELEMEN_ID:
        raise HTTPException(404, "Elemen tidak ditemukan.")
    if sel not in SEL or target not in ("post", "raw"):
        raise HTTPException(400, "Lini sel atau target tidak dikenal.")
    e = ELEMEN_ID[elemen]
    sat_ref = sat_ref or e["alel"][-1]
    if sat_ref not in e["alel"]:
        raise HTTPException(404, "Alel tidak ditemukan untuk elemen ini.")
    g = MUTASI[(MUTASI["elemen"] == elemen)]
    a = g[g["sat_ref"] == sat_ref]
    snv = a.dropna(subset=["pos"])
    obs, pred = f"{sel}_{target}", f"{sel}_pred"
    sel_data = [[int(p), alt, None if pd.isna(o) else round(float(o), 4), round(float(q), 4)]
                for p, alt, o, q in snv[["pos", "alt", obs, pred]].itertuples(index=False)]
    return {
        "elemen": elemen, "nama": e["nama"], "sat_ref": sat_ref, "alel": e["alel"], "sel": sel, "target": target,
        "ref": SEKUENS.get(sat_ref, ""),
        "n_alel": int(len(a)), "n_snv": int(len(snv)), "n_elemen": int(len(g)),
        "r_alel": pearson(a[obs].to_numpy(float), a[pred].to_numpy(float)),
        "r_elemen": e[sel][target]["r"], "batas_elemen": e[sel][target]["batas"],
        "mutasi": sel_data,
    }


class Masukan(BaseModel):
    sekuens: str


@app.post("/api/prediksi")
def prediksi(m: Masukan):
    try:
        seq = periksa_sekuens(m.sekuens)
    except ValueError as err:
        raise HTTPException(422, str(err))
    hasil = model().pindai_mutasi(seq)
    cocok = SEKUENS_BALIK.get(seq)
    elemen = None
    if cocok:
        elemen = next((e["id"] for e in ELEMEN if cocok in e["alel"]), None)
    return {"sekuens": seq, "panjang": len(seq), "siraj": {"sat_ref": cocok, "elemen": elemen}, **hasil}


@app.get("/api/contoh")
def contoh():
    sat_ref = "9:34988605:G:C:R:wC"
    return {"sat_ref": sat_ref, "elemen": "9:34988605:G:C:wC", "sekuens": SEKUENS[sat_ref]}


app.mount("/static", StaticFiles(directory=WEB), name="static")


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")
