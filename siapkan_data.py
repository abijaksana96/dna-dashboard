"""Siapkan data dashboard dari Siraj SatMut dan prediksi model (keluaran notebook Kaggle).

Masukan:
- data mutagenesis jenuh Siraj et al. (2026): folder satmut (satmut.txt.gz, satmut_sequences.txt.gz,
  satmut_final_128elements.txt), default ~/Downloads/Datasets/data/satmut
- prediksi aktivitas tiap model untuk 170.576 sekuens Siraj (urutan = siraj_raw di notebook):
  data/prediksi_ablasi/*.csv

Keluaran di data/: metrik.json, elemen.json, mutasi.csv.gz, sekuens.json

Pemasangan induk-mutan mengikuti notebook (load_siraj_table, build_siraj_tables; 128 elemen, include_indel=True)
dan 09 Naskah/gambar/data_elemen_saring.py. Cek wajib: Pearson global model acuan 0,609 / 0,677 (target posterior).

Jalankan: uv run python siapkan_data.py [folder_satmut]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

APP = Path(__file__).resolve().parent
DATA = APP / "data"
PRED = DATA / "prediksi_ablasi"
SATMUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "Downloads/Datasets/data/satmut")
FIX = (("4763691", "4763491"), ("ALT", "Alt"),
       ("6:41924998:C:G:A:wC", "6:41924998:C:G:A:wX"), ("6:41924998:C:G:R:wC", "6:41924998:C:G:R:wX"))
CELL = {"HEPG2": "HepG2", "K562": "K562"}
SEL = ["HepG2", "K562"]

# Model: kunci, label naskah, komponen yang diubah, berkas prediksi, tes MPAC (Pearson HepG2, K562; dari Ablasi.md)
MODEL = [
    ("acuan", "Acuan 20 epoch", "—", "baseline2_siraj_pred_20ep.csv", (0.820, 0.824)),
    ("A", "A · 2 cabang", "Arsitektur: K562 + HepG2, tanpa SK-N-SH", "ablasi_2_cabang_siraj_pred.csv", (0.818, 0.821)),
    ("B", "B · model per sel", "Arsitektur: satu model tiap lini sel", "ablasi_1_sel_siraj_pred.csv", (0.817, 0.820)),
    ("C_linear", "C · head linear", "Readout baru, encoder dibekukan", "ablasi_ganti_head_siraj_pred_linear.csv", (0.821, 0.824)),
    ("C_MLP", "C · head MLP", "Readout baru, encoder dibekukan", "ablasi_ganti_head_siraj_pred_MLP.csv", (0.821, 0.825)),
    ("C_XGBoost", "C · head XGBoost", "Readout baru, encoder dibekukan", "ablasi_ganti_head_siraj_pred_XGBoost.csv", (0.823, 0.827)),
    ("D", "D · tambah CRE", "Data latih: +14.086 sekuens OL15", "ablasi_tambah_cre_siraj_pred.csv", (0.817, 0.820)),
    ("E_kontrol", "E · kontrol 2 tahap", "Training: 15 + 5 epoch", "ablasi_kontrol_2tahap_siraj_pred.csv", (0.816, 0.819)),
    ("E_evoaug", "E · EvoAug 2 tahap", "Training: augmentasi EvoAug", "ablasi_evoaug_siraj_pred.csv", (0.799, 0.808)),
    ("F", "F · filter lfcSE", "Data latih: buang lfcSE ≥ 1", "filter_lfcse_latih_siraj_pred.csv", (0.820, 0.824)),
]

# Batas atas global: keluaran 08 Lampiran/Skrip/batas_kebisingan_posterior.py (10 November 2026),
# bootstrap 500 kali per elemen. Mentah = Lage-Castellanos et al. (2019) persamaan 16; posterior = modifikasi penulis.
BATAS = {
    "post": {"HepG2": [0.9209, 0.9057, 0.9344], "K562": [0.9706, 0.9656, 0.9744]},
    "raw": {"HepG2": [0.8610, 0.8214, 0.8946], "K562": [0.9573, 0.9463, 0.9655]},
}


def muat():
    s = pd.read_csv(SATMUT / "satmut.txt.gz", sep="\t", dtype={"chr": str}, low_memory=False)
    keep = pd.read_csv(SATMUT / "satmut_final_128elements.txt", sep="\t")
    s = s[s["sat_ref_parent"].isin(keep["sat_ref_parent"])]
    s = s.assign(cell=s["cell_type"].map(CELL))
    s = s[s["cell"].isin(SEL)]

    def tau2(x):  # varians log2FC di antara kuantil 5 dan 95 % per (lini sel, sat_ref), seperti satmut.R
        x = x.dropna().to_numpy()
        lo, hi = np.quantile(x, [0.05, 0.95])
        return x[(x > lo) & (x < hi)].var(ddof=1)

    t2 = s.groupby(["cell", "sat_ref"])["log2FC"].transform(tau2)
    s = s.assign(v=1.0 / (1.0 / t2 + 1.0 / s["log2FC_SE"] ** 2))
    w = s.pivot(index=["ID", "sat_ref_parent", "sat_ref", "oligomut", "chr"], columns="cell",
                values=["post_log2Skew", "log2Skew", "log2Skew_SE", "v"])
    w.columns = [f"{c}_{v}" for v, c in w.columns]
    w = w.reset_index()
    q = pd.read_csv(SATMUT / "satmut_sequences.txt.gz", sep="\t", usecols=["final_id", "sequence"])
    for a, b in FIX:
        q["final_id"] = q["final_id"].str.replace(a, b, regex=False)
    q = q.drop_duplicates(["final_id", "sequence"])
    raw = w.merge(q, left_on="ID", right_on="final_id", how="inner").drop(columns="final_id")
    par = raw["oligomut"] == "m0"
    parent_of = pd.Series(raw.index[par], index=raw.loc[par, "sat_ref"])
    pr = raw.loc[~par].rename_axis("mutant_seq_idx").reset_index()
    pr.insert(0, "parent_seq_idx", pr["sat_ref"].map(parent_of).to_numpy())
    return raw, pr


def pearson(a, b):
    a, b = a - a.mean(), b - b.mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))


def spearman(a, b):
    ra = pd.Series(a).rank().to_numpy()
    rb = pd.Series(b).rank().to_numpy()
    return pearson(ra, rb)


def metrik(y, d, el):
    df = pd.DataFrame({"y": y, "d": d, "el": el})
    per = df.groupby("el").apply(lambda g: pd.Series({"r": pearson(g.y.to_numpy(), g.d.to_numpy()),
                                                       "rs": spearman(g.y.to_numpy(), g.d.to_numpy())}),
                                 include_groups=False)
    return {"pearson": pearson(y, d), "spearman": spearman(y, d),
            "median_pearson": float(per["r"].median()), "median_spearman": float(per["rs"].median())}, per


def nama_pendek(e):
    return e.replace(":wC", "").split(":Alt")[0].split(":ALT")[0]


def main():
    raw, pr = muat()
    assert len(raw) == 170576, len(raw)
    el = pr["sat_ref_parent"].to_numpy()
    target = {"post": "post_log2Skew", "raw": "log2Skew"}
    hasil, per_acuan = [], {}
    pred_acuan = None
    for kunci, label, komp, berkas, mpac in MODEL:
        p = pd.read_csv(PRED / berkas, index_col=0)
        assert len(p) == len(raw), (berkas, len(p))
        if kunci == "acuan":
            pred_acuan = p
        m = {"kunci": kunci, "label": label, "komponen": komp, "mpac": {"HepG2": mpac[0], "K562": mpac[1]}}
        for t, kol in target.items():
            m[t] = {}
            for c in SEL:
                d = p[c].to_numpy()[pr.mutant_seq_idx] - p[c].to_numpy()[pr.parent_seq_idx]
                y = pr[f"{c}_{kol}"].to_numpy()
                ok = ~np.isnan(y)
                mm, per = metrik(y[ok], d[ok], el[ok])
                m[t][c] = {k: round(v, 6) for k, v in mm.items()}
                if kunci == "acuan":
                    per_acuan[(t, c)] = per
        hasil.append(m)
        print(f"{label:24s} post HepG2 {m['post']['HepG2']['pearson']:.3f} K562 {m['post']['K562']['pearson']:.3f} | "
              f"raw HepG2 {m['raw']['HepG2']['pearson']:.3f} K562 {m['raw']['K562']['pearson']:.3f}")
    a = hasil[0]["post"]
    assert round(a["HepG2"]["pearson"], 3) == 0.609 and round(a["K562"]["pearson"], 3) == 0.677, a

    # batas atas per elemen (posterior: varians posterior; mentah: Lage-Castellanos persamaan 16)
    elemen = []
    for e, g in pr.groupby("sat_ref_parent", sort=False):
        row = {"id": e, "nama": nama_pendek(e), "n": int(len(g)), "alel": sorted(g["sat_ref"].unique().tolist())}
        for c in SEL:
            yp, v = g[f"{c}_post_log2Skew"].to_numpy(), g[f"{c}_v"].to_numpy()
            vy = np.nanvar(yp, ddof=1)
            yr, se = g[f"{c}_log2Skew"].to_numpy(), g[f"{c}_log2Skew_SE"].to_numpy()
            vr = np.nanvar(yr, ddof=1)
            br = 1 - np.nanmean(se ** 2) / vr
            row[c] = {
                "post": {"r": round(float(per_acuan[("post", c)].loc[e, "r"]), 4),
                         "batas": round(float(np.sqrt(vy / (vy + np.nanmean(v)))), 4)},
                "raw": {"r": round(float(per_acuan[("raw", c)].loc[e, "r"]), 4),
                        "batas": round(float(np.sqrt(br)), 4) if br > 0 else None},
            }
        elemen.append(row)
    elemen.sort(key=lambda r: r["nama"])

    # tabel mutasi untuk peta (semua pasangan; posisi hanya untuk substitusi satu basa)
    m = pr["oligomut"].str.extract(r"^m([ACGT])(\d+)([ACGT])$")
    tab = pd.DataFrame({
        "elemen": pr["sat_ref_parent"], "sat_ref": pr["sat_ref"], "oligomut": pr["oligomut"],
        "ref": m[0], "pos": pd.to_numeric(m[1]).astype("Int64"), "alt": m[2],
    })
    for c in SEL:
        tab[f"{c}_post"] = pr[f"{c}_post_log2Skew"].round(5)
        tab[f"{c}_raw"] = pr[f"{c}_log2Skew"].round(5)
        tab[f"{c}_pred"] = (pred_acuan[c].to_numpy()[pr.mutant_seq_idx]
                            - pred_acuan[c].to_numpy()[pr.parent_seq_idx]).round(5)
    tab.to_csv(DATA / "mutasi.csv.gz", index=False)

    par = raw[raw["oligomut"] == "m0"]
    sekuens = {r.sat_ref: r.sequence for r in par.itertuples()}
    json.dump(sekuens, open(DATA / "sekuens.json", "w"))
    json.dump({"model": hasil, "batas": BATAS, "n_elemen": int(pr["sat_ref_parent"].nunique()),
               "n_mutasi": int(len(pr)), "sumber": {
                   "siraj": "Siraj et al. (2026), mutagenesis jenuh, 128 elemen",
                   "batas": "08 Lampiran/Skrip/batas_kebisingan_posterior.py (10 November 2026)",
                   "mpac": "05 Eksekusi/Ablasi.md, Pearson tes MPAC kromosom 7 dan 16"}},
              open(DATA / "metrik.json", "w"), ensure_ascii=False, indent=1)
    json.dump(elemen, open(DATA / "elemen.json", "w"), ensure_ascii=False)
    print("elemen", len(elemen), "| mutasi", len(tab), "| sekuens induk", len(sekuens))


if __name__ == "__main__":
    main()
