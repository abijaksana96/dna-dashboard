# Dashboard Prediksi Efek Mutasi Tunggal

Kode *dashboard* untuk skripsi "Pengembangan Dashboard Prediksi Efek Mutasi Tunggal pada DNA Regulatori Menggunakan Model Malinois" (Program Studi Sistem Informasi, Universitas Hasanuddin, 2026).

*Dashboard* ini menyajikan hasil pengujian *zero-shot* Malinois yang dilatih ulang pada 128 elemen *saturation mutagenesis* dari Siraj et al. (2026). Halaman Prediksi menjalankan model acuan (dilatih ulang 20 *epoch*) untuk memprediksi efek setiap mutasi tunggal pada sekuens baru.

## Menjalankan

Butuh Python 3.11 atau lebih baru dan [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                          # sekali saja: FastAPI, uvicorn, numpy, pandas, PyTorch CPU
uv run uvicorn dashboard.server:app --port 8000
```

Buka http://127.0.0.1:8000. Dokumentasi API ada di http://127.0.0.1:8000/api/docs.

## Versi daring

https://abijaksana96.github.io/dna-dashboard/ memuat halaman yang sama tanpa server. Data dibaca dari berkas JSON, dan prediksi berjalan di peramban dengan model acuan dalam format ONNX lewat ONNX Runtime Web 1.30.0 dari jsDelivr. Di Chrome desktop dengan WebGPU, prediksi sekuens 200 bp butuh 1,6 sampai 4 detik pada laptop penulis, ditambah unduhan model 16 MB pada pemakaian pertama. Peramban tanpa WebGPU memakai WASM dan butuh sekitar 18 detik.

Folder `situs/` dibangun dengan perintah berikut, lalu isinya dipasang di cabang `gh-pages`:

```bash
uv run --with onnx --with onnxscript --with onnxruntime python bangun_statis.py
```

## Halaman

| Halaman | Isi | Sumber angka |
|---|---|---|
| Ringkasan | angka utama, jarak model ke batas atas, ringkasan ablasi, sebaran korelasi per elemen | `data/metrik.json`, `data/elemen.json` |
| Ablasi | korelasi tiap perlakuan dibanding model acuan, tabel lengkap | `data/metrik.json` |
| Per elemen | korelasi tiap elemen dibanding batas atasnya, daftar jarak terbesar, histogram | `data/elemen.json` |
| Peta mutasi | heatmap posisi × basa hasil ukur dan prediksi, scatter, mutasi berefek terbesar | `data/mutasi.csv.gz`, `data/sekuens.json` |
| Prediksi | sekuens 189–200 bp dimasukkan, lalu model memprediksi aktivitas dan efek setiap mutasi tunggal | `model/` (dijalankan langsung) |

Tombol **Posterior/Mentah** memilih target `post_log2Skew` atau `log2Skew`. Selisih ablasi dihitung dari angka yang sudah dibulatkan tiga desimal. Selisih ≤ 0,013 ditampilkan abu-abu karena setiap konfigurasi hanya dilatih dengan satu *seed*.

## Isi repositori

- `dashboard/server.py`: API (`/api/meta`, `/api/peta`, `/api/prediksi`, `/api/contoh`) dan halaman web.
- `dashboard/model.py`: prediksi. Sekuens diberi pengapit vektor MPRA sampai 600 bp, lalu hasil arah maju dan *reverse complement* dirata-ratakan, sama seperti di notebook pelatihan.
- `web/`: HTML, CSS, dan JavaScript tanpa pustaka luar. Grafik digambar sebagai SVG. `web/statis.js` hanya dimuat versi daring: ia menggantikan API dengan berkas JSON dan menjalankan prediksi lewat ONNX Runtime Web.
- `bangun_statis.py`: membangun `situs/` (data JSON per elemen, model `acuan_20ep.onnx`, salinan `web/`) dan membandingkan keluaran ONNX dengan PyTorch.
- `model/best_20ep.pt`: bobot model acuan hasil pelatihan ulang.
- `model/modeling_mpac.py`, `model/config.json`: kode dan konfigurasi resmi MPAC dari Hugging Face `saarantras1/MPAC`, revisi `a3641679deb6ac1c2e3172f11319baeab70f9e9a`.
- `model/boda2_constants.py`: sekuens pengapit vektor MPRA dari boda2 (`boda/common/constants.py`).
- `data/prediksi_ablasi/*.csv`: prediksi aktivitas 170.576 sekuens Siraj dari tiap model, keluaran notebook pelatihan.
- `siapkan_data.py`: membangun `data/metrik.json`, `data/elemen.json`, `data/mutasi.csv.gz`, dan `data/sekuens.json` dari folder data `satmut` Siraj et al. (2026) dan prediksi di atas: `uv run python siapkan_data.py FOLDER_SATMUT`.
- `uji_fungsi.py`: 12 skenario uji fungsi.

## Pemeriksaan

- Prediksi lokal untuk 600 mutasi alel R elemen 9:34988605:G:C sama dengan keluaran notebook pelatihan. Selisih maksimumnya 5 × 10⁻⁵, karena pembanding sudah dibulatkan empat desimal.
- Pearson global semua model (target posterior) sama dengan hasil notebook pada tiga desimal.
- Versi daring sama dengan API pada 1.136 kombinasi peta (elemen × alel × lini sel × target). Selisih nilai paling besar 0,0001, berasal dari pembulatan empat desimal.
- Model ONNX dibanding PyTorch pada sekuens contoh dan 600 mutasinya: selisih maksimum 5,3 × 10⁻⁶.
- Prediksi di peramban (Chrome, WebGPU) dibanding API pada sekuens 189, 192, 197, dan 200 bp: selisih maksimum 4,1 × 10⁻⁶.

## Batasan

- Prediksi hanya memakai model acuan.
- Panjang sekuens 189–200 bp. Masukan model 600 bp terdiri atas sekuens dan pengapit vektor MPRA. Sekuens yang lebih panjang akan menggeser pengapit, keadaan yang tidak pernah ada saat pelatihan.
- Batas atas mentah per elemen (persamaan 16 Lage-Castellanos et al., 2019) tidak terdefinisi untuk 6 elemen HepG2, dan korelasi 3 elemen HepG2 melewati batas itu. Halaman Per elemen menyebutkan hal ini saat target Mentah dipilih.
- Angka uji MPAC disalin dari hasil notebook, tidak dihitung ulang di sini, karena data uji MPAC tidak disertakan.
- Belum ada mode gelap. Tampilan diperiksa di Chrome pada lebar 1440 dan 390 px; peramban lain belum diuji.
- Versi daring butuh koneksi ke jsDelivr (ONNX Runtime Web) dan Google Fonts.

## Lisensi kode pihak ketiga

`model/modeling_mpac.py` dan `model/boda2_constants.py` berlisensi MIT (Copyright (c) 2025 Sagar Gosai, Rodrigo Castro). Teks lisensinya ada di bagian atas tiap berkas.
