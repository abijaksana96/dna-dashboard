"""Uji fungsi dashboard lewat API (server harus sudah jalan di 127.0.0.1:8000).
Jalankan: uv run python uji_fungsi.py
Hasil 10 November 2026: 12 dari 12 lulus."""
import json
import random
import time
import urllib.error
import urllib.request
from pathlib import Path

B = "http://127.0.0.1:8000"
SEKUENS = json.loads((Path(__file__).parent / "data/sekuens.json").read_text())


def get(p):
    with urllib.request.urlopen(B + p) as r:
        return r.status, r.read()


def post(seq):
    req = urllib.request.Request(B + "/api/prediksi", data=json.dumps({"sekuens": seq}).encode(),
                                 headers={"content-type": "application/json"})
    t = time.time()
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read()), time.time() - t
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()), time.time() - t


def main():
    hasil = []
    s, _ = get("/")
    hasil.append(("Halaman utama terbuka", s == 200))
    s, b = get("/api/meta")
    m = json.loads(b)
    hasil.append(("Data meta: 10 model, 128 elemen", s == 200 and len(m["metrik"]["model"]) == 10 and len(m["elemen"]) == 128))
    s, b = get("/api/peta?elemen=9:34988605:G:C:wC")
    d = json.loads(b)
    hasil.append((f"Peta contoh: {d['n_snv']} mutasi, r alel {d['r_alel']:.3f}, r elemen {d['r_elemen']}", d["n_snv"] == 600))
    s, b = get("/api/peta?elemen=9:34988605:G:C:wC&sel=K562&target=raw")
    d = json.loads(b)
    hasil.append((f"Peta K562 target mentah: r elemen {d['r_elemen']}", s == 200))
    try:
        get("/api/peta?elemen=tidak-ada")
        hasil.append(("Elemen tak dikenal ditolak", False))
    except urllib.error.HTTPError as e:
        hasil.append((f"Elemen tak dikenal ditolak ({e.code})", e.code == 404))
    seq = SEKUENS["9:34988605:G:C:R:wC"]
    c, j, dt = post(seq)
    hasil.append((f"Prediksi sekuens Siraj 200 bp: {len(j['mutasi'])} mutasi, aktivitas HepG2 {j['induk']['HepG2']:.3f} "
                  f"K562 {j['induk']['K562']:.3f} SKNSH {j['induk']['SKNSH']:.3f}, cocok Siraj {j['siraj']['elemen']}, {dt:.1f} s", c == 200))
    random.seed(1)
    acak = "".join(random.choice("ACGT") for _ in range(200))
    c, j, dt = post(acak)
    hasil.append((f"Prediksi sekuens acak 200 bp: {len(j['mutasi'])} mutasi, tidak cocok Siraj, {dt:.1f} s",
                  c == 200 and j["siraj"]["elemen"] is None))
    c, j, dt = post(seq[:195])
    hasil.append((f"Sekuens 195 bp diterima ({len(j.get('mutasi', []))} mutasi)", c == 200))
    for nama, sq in [("huruf N", seq[:199] + "N"), ("204 bp", seq + "ACGT"), ("150 bp", seq[:150]), ("kosong", "")]:
        c, j, dt = post(sq)
        hasil.append((f"Masukan {nama} ditolak ({c}): {j.get('detail')}", c == 422))
    for t, ok in hasil:
        print("LULUS" if ok else "GAGAL", "|", t)
    print(f"{sum(ok for _, ok in hasil)} dari {len(hasil)} lulus")


if __name__ == "__main__":
    main()
