"""Prediksi aktivitas dan efek mutasi dengan model acuan (MPAC/Malinois dilatih ulang, 20 epoch).

Resep sama dengan notebook Kaggle (Langkah 16, 21, dan 27):
- kelas resmi MPACModel dari Hugging Face saarantras1/MPAC, revisi a3641679…, berkas model/modeling_mpac.py
- config.json resmi, keluaran tiga cabang (K562, HepG2, SKNSH)
- bobot model/best_20ep.pt (keluaran notebook Kaggle, folder outputs/baseline2)
- sekuens dipasang pengapit vektor MPRA boda2 sampai 600 bp (pad_like_boda), lalu prediksi arah maju
  dan reverse complement dirata-rata (predict_official)
"""
from __future__ import annotations

import importlib.util
import json
import threading
from pathlib import Path

import numpy as np
import torch

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
SEL = ["K562", "HepG2", "SKNSH"]
BASA = "ACGT"
COMPLEMENT = str.maketrans("ACGT", "TGCA")
NT_INDEX = np.full(256, 4, dtype=np.int64)
NT_INDEX[[ord(nt) for nt in BASA]] = np.arange(4)
# Masukan model 600 bp = sekuens (variable_region_len 200 bp) + pengapit vektor MPRA. Rentang 189-200 bp sama dengan
# notebook: oligo 200 bp dan tiga latar alel delesi Siraj (189, 192, 197 bp) yang diberi pengapit lebih panjang.
PANJANG_MIN, PANJANG_MAKS = 189, 200


def _muat_modul(nama: str, path: Path):
    spec = importlib.util.spec_from_file_location(nama, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_konst = _muat_modul("boda2_constants", MODEL_DIR / "boda2_constants.py")
MPRA_UPSTREAM, MPRA_DOWNSTREAM = _konst.MPRA_UPSTREAM, _konst.MPRA_DOWNSTREAM


def pad_like_boda(sequence: str, padded_len: int = 600) -> str:
    """Tiru row_pad_sequence boda2: ujung kanan pengapit kiri + sekuens + ujung kiri pengapit kanan."""
    pad = padded_len - len(sequence)
    up_start = -pad // 2 + pad % 2
    up = MPRA_UPSTREAM[up_start:] if up_start < 0 else ""
    return up + sequence + MPRA_DOWNSTREAM[:pad // 2 + pad % 2]


def one_hot_600(sequences: list[str]) -> torch.Tensor:
    codes = NT_INDEX[np.frombuffer("".join(pad_like_boda(s, 600) for s in sequences).encode(), dtype=np.uint8)]
    return torch.from_numpy(np.eye(5, 4, dtype=np.float32)[codes.reshape(len(sequences), 600)]).permute(0, 2, 1)


class ModelAcuan:
    def __init__(self, bobot: Path = MODEL_DIR / "best_20ep.pt"):
        mpac = _muat_modul("modeling_mpac", MODEL_DIR / "modeling_mpac.py")
        args = json.loads((MODEL_DIR / "config.json").read_text())
        self.model = mpac.MPACModel(**args)
        state = torch.load(bobot, map_location="cpu", weights_only=True)
        self.model.load_state_dict(state)
        self.model.eval()
        self.nama_keluaran = list(self.model.output_names)
        self._kunci = threading.Lock()

    @torch.no_grad()
    def prediksi(self, sequences: list[str], batch_size: int = 256) -> np.ndarray:
        """Aktivitas (log2FC) per sekuens, kolom urut SEL. Rata-rata arah maju dan reverse complement."""
        out = []
        with self._kunci:
            for i in range(0, len(sequences), batch_size):
                chunk = [s.upper() for s in sequences[i:i + batch_size]]
                fwd = self.model(one_hot_600(chunk))
                rev = self.model(one_hot_600([s.translate(COMPLEMENT)[::-1] for s in chunk]))
                out.append(((fwd + rev) / 2).numpy())
        pred = np.concatenate(out)
        urut = [self.nama_keluaran.index(s) for s in SEL]
        return pred[:, urut]

    def pindai_mutasi(self, seq: str) -> dict:
        """Prediksi sekuens asli dan semua mutasi satu basa (3 basa pengganti per posisi)."""
        seq = seq.upper()
        mutan, kunci = [], []
        for i, b in enumerate(seq):
            for alt in BASA:
                if alt != b:
                    mutan.append(seq[:i] + alt + seq[i + 1:])
                    kunci.append((i + 1, b, alt))
        pred = self.prediksi([seq] + mutan)
        induk = pred[0]
        efek = pred[1:] - induk
        return {
            "induk": {s: float(v) for s, v in zip(SEL, induk)},
            "mutasi": [
                {"pos": p, "ref": r, "alt": a, **{s: float(v) for s, v in zip(SEL, e)}}
                for (p, r, a), e in zip(kunci, efek)
            ],
        }


def periksa_sekuens(seq: str) -> str:
    s = "".join(seq.split()).upper()
    if not s:
        raise ValueError("Sekuens kosong.")
    salah = sorted({c for c in s if c not in BASA})
    if salah:
        raise ValueError(f"Hanya huruf A, C, G, T yang diterima; ditemukan: {', '.join(salah)}.")
    if not PANJANG_MIN <= len(s) <= PANJANG_MAKS:
        raise ValueError(f"Panjang sekuens {len(s)} bp; harus {PANJANG_MIN}–{PANJANG_MAKS} bp (model menambah pengapit vektor sampai 600 bp).")
    return s
