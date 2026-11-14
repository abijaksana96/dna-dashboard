"use strict";
/* Versi statis (GitHub Pages): pengganti API FastAPI. Data dari berkas JSON hasil bangun_statis.py, prediksi dijalankan
   di peramban dengan ONNX Runtime Web. Bentuk keluaran sama dengan /api/meta, /api/peta, /api/contoh, /api/prediksi. */
(() => {
  const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js";
  const SEL = ["K562", "HepG2", "SKNSH"];  // urutan keluaran model (config.json output_names)
  const BASA = "ACGT", KOMPLEMEN = { A: "T", C: "G", G: "C", T: "A" };
  const cache = {};
  const json = (p) => (cache[p] ||= fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }));

  const pearson = (a, b) => {
    const x = [], y = [];
    for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) { x.push(a[i]); y.push(b[i]); }
    const n = x.length; if (!n) return null;
    const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  };
  const r4 = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4);

  async function peta(q) {
    const meta = await json("data/meta.json");
    const i = meta.elemen.findIndex((e) => e.id === q.elemen);
    if (i < 0) throw new Error("Elemen tidak ditemukan.");
    const e = meta.elemen[i], f = await json(`data/peta/${i}.json`);
    const sel = q.sel || "HepG2", target = q.target || "post", satRef = q.sat_ref || e.alel[e.alel.length - 1];
    const ai = f.alel.indexOf(satRef);
    if (ai < 0) throw new Error("Alel tidak ditemukan untuk elemen ini.");
    const k = (nama) => f.kolom.indexOf(nama), ko = k(`${sel}_${target}`), kp = k(`${sel}_pred`);
    const a = f.baris.filter((b) => b[0] === ai), snv = a.filter((b) => b[1] != null);
    return {
      elemen: e.id, nama: e.nama, sat_ref: satRef, alel: e.alel, sel, target, ref: f.ref[ai] || "",
      n_alel: a.length, n_snv: snv.length, n_elemen: f.baris.length,
      r_alel: pearson(a.map((b) => b[ko]), a.map((b) => b[kp])),
      r_elemen: e[sel][target].r, batas_elemen: e[sel][target].batas,
      mutasi: snv.map((b) => [b[1], b[2], r4(b[ko]), r4(b[kp])]),
    };
  }

  /* ---------- prediksi di peramban (resep dashboard/model.py) ---------- */
  function muatOrt() {
    if (window.ort) return Promise.resolve(window.ort);
    return (cache.ort ||= new Promise((ok, gagal) => {
      const sc = document.createElement("script");
      sc.src = ORT_URL; sc.crossOrigin = "anonymous";
      sc.onload = () => ok(window.ort);
      sc.onerror = () => { delete cache.ort; gagal(new Error("ONNX Runtime Web gagal dimuat dari jsDelivr. Periksa koneksi.")); };
      document.head.append(sc);
    }));
  }
  async function sesi(kemajuan) {
    if (cache.sesi) return cache.sesi;
    kemajuan("Memuat model (sekitar 16 MB, hanya sekali)…");
    const ort = await muatOrt();
    ort.env.wasm.wasmPaths = ORT_URL.replace(/ort\.min\.js$/, "");
    // WebGPU bila ada (sekitar 9 kali lebih cepat di Chrome desktop), selain itu WASM di CPU
    const ep = navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
    cache.sesi = await ort.InferenceSession.create("model/acuan_20ep.onnx", { executionProviders: ep });
    return cache.sesi;
  }
  // tiru row_pad_sequence boda2: ujung kanan pengapit kiri + sekuens + ujung kiri pengapit kanan (Python: -pad // 2 dibulatkan ke bawah)
  function padLikeBoda(seq, up, down, panjang = 600) {
    const pad = panjang - seq.length, mulai = Math.floor(-pad / 2) + (pad % 2);
    return (mulai < 0 ? up.slice(mulai) : "") + seq + down.slice(0, Math.floor(pad / 2) + (pad % 2));
  }
  function oneHot(daftar, up, down) {
    const x = new Float32Array(daftar.length * 4 * 600);
    daftar.forEach((sq, n) => {
      const p = padLikeBoda(sq, up, down);
      for (let j = 0; j < 600; j++) { const c = BASA.indexOf(p[j]); if (c >= 0) x[n * 2400 + c * 600 + j] = 1; }
    });
    return x;
  }
  const rc = (sq) => [...sq].reverse().map((b) => KOMPLEMEN[b]).join("");

  function periksa(seq) {
    const s = seq.replace(/\s+/g, "").toUpperCase();
    if (!s) throw new Error("Sekuens kosong.");
    const salah = [...new Set(s.replace(/[ACGT]/g, ""))].sort();
    if (salah.length) throw new Error(`Hanya huruf A, C, G, T yang diterima; ditemukan: ${salah.join(", ")}.`);
    if (s.length < 189 || s.length > 200) throw new Error(`Panjang sekuens ${s.length} bp; harus 189–200 bp (model menambah pengapit vektor sampai 600 bp).`);
    return s;
  }

  async function prediksi(seqMasuk, kemajuan = () => {}) {
    const seq = periksa(seqMasuk);
    const [pengapit, sekuens] = await Promise.all([json("data/pengapit.json"), json("data/sekuens.json")]);
    const s = await sesi(kemajuan), ort = window.ort;
    const daftar = [seq], kunci = [];
    for (let i = 0; i < seq.length; i++) for (const alt of BASA) if (alt !== seq[i]) {
      daftar.push(seq.slice(0, i) + alt + seq.slice(i + 1)); kunci.push([i + 1, seq[i], alt]);
    }
    const B = 128, pred = new Float64Array(daftar.length * 3), mulai = performance.now();
    for (let i = 0; i < daftar.length; i += B) {
      kemajuan(`Memprediksi ${Math.min(i + B, daftar.length)} dari ${daftar.length} sekuens…`);
      const potong = daftar.slice(i, i + B), n = potong.length;
      const jalan = async (seqs) => (await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", oneHot(seqs, pengapit.up, pengapit.down), [n, 4, 600]) }))[s.outputNames[0]].data;
      const maju = await jalan(potong), balik = await jalan(potong.map(rc));
      for (let j = 0; j < n * 3; j++) pred[i * 3 + j] = Math.fround((maju[j] + balik[j]) / 2);
      await new Promise((r) => setTimeout(r));  // beri kesempatan layar memperbarui teks kemajuan
    }
    console.info(`prediksi ${daftar.length} sekuens: ${((performance.now() - mulai) / 1000).toFixed(1)} s`);
    const induk = Object.fromEntries(SEL.map((k, j) => [k, pred[j]]));
    const balikSek = Object.fromEntries(Object.entries(sekuens).map(([k, v]) => [v, k]));
    const satRef = balikSek[seq] || null, meta = await json("data/meta.json");
    const el = satRef ? meta.elemen.find((e) => e.alel.includes(satRef)) : null;
    return {
      sekuens: seq, panjang: seq.length, siraj: { sat_ref: satRef, elemen: el ? el.id : null }, induk,
      mutasi: kunci.map(([pos, ref, alt], m) => ({ pos, ref, alt, ...Object.fromEntries(SEL.map((k, j) => [k, Math.fround(pred[(m + 1) * 3 + j] - pred[j])])) })),
    };
  }

  window.API_STATIS = {
    meta: () => json("data/meta.json"),
    peta,
    contoh: () => json("data/contoh.json"),
    prediksi,
    _uji: { padLikeBoda, rc, oneHot },
  };
})();
