"use strict";
/* Dashboard Efek Mutasi: tampilan halaman dan grafik SVG (tanpa pustaka luar). Desain v2: Usulan Dashboard v2.figcraft. */

const WARNA = { HepG2: "#2a78d6", K562: "#eb6834", SKNSH: "#1baf7a" };
const LABEL = { HepG2: "HepG2", K562: "K562", SKNSH: "SK-N-SH" };
const DIV = {
  biru: ["#b9c6d8", "#839ec3", "#4f77ac", "#184f95"],
  merah: ["#e2bab4", "#cf867e", "#b8504a", "#9c0013"],
  tengah: "#f0efec",
};
const T = { ink: "#141414", ink2: "#6b675d", grid: "#e7e3d8", axis: "#b9b4a6", track: "#ece8de", pita: "#dcd8cc", card: "#ffffff", soft: "#f7f5f0", aksen: "#ffe14d" };
const MONO = "JetBrains Mono, Liberation Mono, monospace";
const AMBANG = 0.013;
const NS = "http://www.w3.org/2000/svg";
const ISTILAH_TAMPILAN = /\b(saturation mutagenesis|reverse complement|standard error|in-distribution|fine-tuning|checkpoint|zero-shot|one-hot|readout|training|branch|epoch|seed|probe|head|train|noise)\b/gi;
const TARGET_LABEL = { post: "Posterior", raw: "Mentah" };
const TARGET_KOLOM = { post: "post_log2Skew", raw: "log2Skew" };

const S = {
  meta: null,
  target: "post",
  metrik: "pearson",
  filterSel: "semua",
  cari: "",
  peta: { elemen: "9:34988605:G:C:wC", sat_ref: "9:34988605:G:C:R:wC", sel: "HepG2", data: null },
  pred: { seq: "", sel: { HepG2: true, K562: true, SKNSH: true }, hasil: null, selPeta: "HepG2", sedang: false, galat: "", kemajuan: "" },
};

/* ---------- sumber data: API FastAPI, atau versi statis (statis.js) bila dimuat ---------- */
async function ambilJSON(url, opsi) {
  const r = await fetch(url, opsi);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || r.statusText);
  return j;
}
const API = window.API_STATIS || {
  meta: () => ambilJSON("/api/meta"),
  peta: (q) => ambilJSON(`/api/peta?${new URLSearchParams(q)}`),
  contoh: () => ambilJSON("/api/contoh"),
  prediksi: (sekuens) => ambilJSON("/api/prediksi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sekuens }) }),
};

/* ---------- bantu ---------- */
const fmt = (v, n = 3) => (v == null || Number.isNaN(v) ? "–" : v.toFixed(n).replace("-", "−").replace(".", ","));
const sfmt = (v, n = 3) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(n).replace(".", ","));
const ribu = (n) => n.toLocaleString("id-ID");
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const kodeAlel = (sr) => { const m = sr.match(/:([A-Z]):w[A-Z]+$/); return m ? m[1] : sr; };
const miring = (t, buat) => String(t).split(ISTILAH_TAMPILAN).map((p, i) => (i % 2 ? buat(p) : p));

function h(tag, attrs = {}, ...anak) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.append(...miring(v, (p) => h("em", {}, document.createTextNode(p))));
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const a of anak.flat()) if (a != null) {
    if (a.nodeType) el.append(a);
    else el.append(...miring(a, (p) => h("em", {}, document.createTextNode(p))));
  }
  return el;
}
function s(tag, attrs = {}, ...anak) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const a of anak.flat()) if (a != null) el.append(a.nodeType ? a : document.createTextNode(a));
  return el;
}
const svg = (w, hgt, label) => s("svg", { viewBox: `0 0 ${w} ${hgt}`, role: "img", "aria-label": label });
const teks = (x, y, t, o = {}) => s("text", {
  x, y, fill: o.fill || T.ink2, "font-size": o.size || 13, "font-weight": o.tebal ? 700 : o.berat || null,
  "text-anchor": o.anchor || "start", "dominant-baseline": o.baseline || "middle",
}, ...miring(t, (p) => s("tspan", { "font-style": "italic" }, p)));
const garis = (x1, y1, x2, y2, warna = T.grid, lebar = 1, dash) => s("line", { x1, y1, x2, y2, stroke: warna, "stroke-width": lebar, "stroke-dasharray": dash });
const kunciSvg = (g, x, y, sel) => g.append(s("circle", { cx: x + 5, cy: y, r: 5, fill: WARNA[sel] }), teks(x + 16, y, LABEL[sel], { fill: T.ink, size: 14, berat: 500 }));

function warnaDiv(v, vmax) {
  if (v == null || Number.isNaN(v)) return "#ffffff";
  const t = Math.abs(v) / vmax;
  const k = t < 0.125 ? 0 : t < 0.375 ? 1 : t < 0.625 ? 2 : t < 0.875 ? 3 : 4;
  return k === 0 ? DIV.tengah : (v > 0 ? DIV.merah : DIV.biru)[k - 1];
}
const skala = (lo, hi, a, b) => (v) => a + ((v - lo) / (hi - lo)) * (b - a);
const sw = (sel, label) => h("span", { class: "sw", style: { "--warna": WARNA[sel] } }, label || LABEL[sel]);

function seg(opsi, aktif, onPilih, label) {
  const g = h("div", { class: "seg", role: "group", "aria-label": label || "Pilihan" });
  for (const [nilai, teksOpsi] of opsi) {
    g.append(h("button", { type: "button", "aria-pressed": String(nilai === aktif), onclick: () => nilai !== aktif && onPilih(nilai) }, teksOpsi));
  }
  return g;
}
const segTarget = () => h("div", { class: "kontrol" }, h("span", { class: "ket" }, "Target"),
  seg([["post", "Posterior"], ["raw", "Mentah"]], S.target, (v) => { S.target = v; render(); }, "Target"));

/* ---------- komponen tata letak ---------- */
function kepala(label, judul, sub, ...kontrol) {
  return h("header", { class: "bungkus kepala" }, h("div", {}, h("p", { class: "label-hal", text: label }), h("h1", { text: judul }), sub ? h("p", { class: "sub", text: sub }) : null),
    kontrol.length ? h("div", { class: "kontrol" }, ...kontrol) : null);
}
function panel(gbr, judul, sub, ...isi) {
  return h("section", { class: "panel" }, gbr ? h("p", { class: "gbr", text: gbr }) : null, h("h2", { text: judul }), sub ? h("p", { class: "sub", text: sub }) : null, h("div", { class: "isi" }, ...isi));
}
const halaman = (...isi) => h("div", { class: "bungkus tumpuk" }, ...isi);
function deret(item) {
  return h("div", { class: "deret" }, item.map((d) => h("div", {}, h("p", { class: "label", text: d.label }),
    h("p", { class: `nilai${d.aksen ? " aksen" : ""}`, text: d.nilai }), d.catat ? h("p", { class: "catat" }, d.catat) : null)));
}
const catatan = (judul, ...isi) => h("div", { class: "catatan" }, h("h2", { text: judul }), ...isi);
const gulirX = (el) => h("div", { class: "gulir-x" }, el);

/* tooltip */
const tip = document.getElementById("tip");
document.addEventListener("mouseover", (e) => { const t = e.target.closest("[data-tip]"); if (!t) return; tip.textContent = t.dataset.tip; tip.hidden = false; });
document.addEventListener("mousemove", (e) => {
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  const y = e.clientY + 16 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 16;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
});
document.addEventListener("mouseout", (e) => { if (e.target.closest("[data-tip]")) tip.hidden = true; });

/* ---------- data ---------- */
const model = (k) => S.meta.metrik.model.find((m) => m.kunci === k);
// angka dibulatkan 3 desimal seperti naskah; selisih dihitung dari angka bulat ini
const r3 = (v) => Math.round(v * 1000) / 1000;
const nilai = (k, sel, met = "pearson", tgt = S.target) => r3(model(k)[tgt][sel][met]);
const batas = (sel, tgt = S.target) => S.meta.metrik.batas[tgt][sel];

/* ---------- Ringkasan ---------- */
function meter() {
  const W = 1288, X0 = 150, PW = 1030, g = svg(W, 236, "Korelasi model acuan dibanding batas atas noise");
  const sx = skala(0, 1, X0, X0 + PW);
  ["HepG2", "K562"].forEach((sel, i) => {
    const y = 16 + i * 92, r = nilai("acuan", sel), [b, lo, hi] = batas(sel);
    kunciSvg(g, 0, y + 21, sel);
    g.append(s("rect", { x: X0, y: y + 14, width: PW, height: 14, fill: T.track }),
      s("rect", { x: sx(lo), y: y + 6, width: sx(hi) - sx(lo), height: 30, fill: T.pita }),
      s("rect", { x: X0, y: y + 14, width: sx(r) - X0, height: 14, fill: WARNA[sel], "data-tip": `${LABEL[sel]} · model acuan\nkorelasi ${fmt(r)}` }),
      s("rect", { x: sx(r), y: y + 14, width: Math.max(0, sx(b) - sx(r)), height: 14, fill: T.aksen, "data-tip": `${LABEL[sel]} · jarak ke batas atas\n${fmt(b - r)}` }),
      s("rect", { x: sx(b) - 1.5, y: y + 2, width: 3, height: 38, fill: T.ink, "data-tip": `batas atas ${fmt(b)}\nCI95 ${fmt(lo)}–${fmt(hi)}` }),
      teks(sx(r) - 6, y + 56, fmt(r), { fill: T.ink, size: 15, tebal: true, anchor: "end" }),
      teks((sx(r) + sx(b)) / 2, y + 56, `jarak ${fmt(b - r, 2)}`, { fill: T.ink, size: 15, berat: 600, anchor: "middle" }),
      teks(sx(b) + 8, y + 56, `batas ${fmt(b)}`, { size: 14 }));
  });
  [0, 0.25, 0.5, 0.75, 1].forEach((t) => g.append(garis(sx(t), 206, sx(t), 212, T.axis), teks(sx(t), 226, fmt(t, t === 0.25 || t === 0.75 ? 2 : 1), { anchor: "middle" })));
  return g;
}

function ringkasAblasi() {
  const C = ["C_linear", "C_MLP", "C_XGBoost"].sort((a, b) => (nilai(b, "HepG2") + nilai(b, "K562")) - (nilai(a, "HepG2") + nilai(a, "K562")))[0];
  const d = (k, sel) => nilai(k, sel) - nilai("acuan", sel);
  const baris = [
    [model("A").label, d("A", "HepG2"), d("A", "K562")],
    ["B · model per sel", d("B", "HepG2"), d("B", "K562")],
    [`C · head terbaik (${C.split("_")[1]})`, d(C, "HepG2"), d(C, "K562")],
    ["D · tambah CRE", d("D", "HepG2"), d("D", "K562")],
    ["E · EvoAug vs kontrol", nilai("E_evoaug", "HepG2") - nilai("E_kontrol", "HepG2"), nilai("E_evoaug", "K562") - nilai("E_kontrol", "K562")],
    [model("F").label, d("F", "HepG2"), d("F", "K562")],
  ];
  const sel = (v) => h("td", { class: Math.abs(v) <= AMBANG ? "ka redup" : "ka tebal", text: sfmt(v) });
  return h("div", {}, h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Perlakuan" }), h("th", { class: "ka", text: "HepG2" }), h("th", { class: "ka", text: "K562" }))),
    h("tbody", {}, baris.map(([n, a, b]) => h("tr", {}, h("td", { text: n }), sel(a), sel(b))))),
  h("p", { class: "ket-bawah", text: "Abu-abu: |selisih| ≤ 0,013, tidak disebut beda (satu seed)." }));
}

function stripPlot() {
  const W = 1288, H = 220, PX = 150, PW = W - PX - 20;
  const g = svg(W, H, "Sebaran korelasi per elemen");
  const sx = skala(0, 1, PX, PX + PW);
  for (let t = 0; t <= 1.0001; t += 0.2) g.append(garis(sx(t), 10, sx(t), 172), teks(sx(t), 186, fmt(t, 1), { anchor: "middle" }));
  ["HepG2", "K562"].forEach((sel, i) => {
    const cy = 58 + i * 74;
    const ev = S.meta.elemen.map((e) => ({ e, r: e[sel][S.target].r, b: e[sel][S.target].batas }));
    const med = median(ev.map((x) => x.r)), mb = median(ev.filter((x) => x.b != null).map((x) => x.b));
    kunciSvg(g, 0, cy, sel);
    ev.forEach((x, k) => {
      const j = (((k * 37) % 23) - 11) * 1.5;
      g.append(s("circle", { class: "mark", cx: sx(x.r), cy: cy + j, r: 4.5, fill: WARNA[sel], stroke: T.card, "stroke-width": 1, "fill-opacity": 0.88,
        "data-tip": `${x.e.nama} · ${LABEL[sel]}\nkorelasi ${fmt(x.r)}${x.b != null ? ` · batas ${fmt(x.b)}` : ""}` }));
    });
    g.append(garis(sx(med), cy - 28, sx(med), cy + 28, T.ink, 2.5), teks(sx(med) + 6, cy - 34, `median ${fmt(med)}`, { fill: T.ink, tebal: true }),
      garis(sx(mb), cy - 28, sx(mb), cy + 28, T.ink2, 1.5, "4 3"), teks(sx(mb) - 6, cy - 34, `batas atas ${fmt(mb)}`, { anchor: "end" }));
  });
  g.append(teks(PX, 208, "Korelasi Pearson per elemen"));
  return g;
}

function renderRingkasan() {
  const m = S.meta.metrik, r = { HepG2: nilai("acuan", "HepG2"), K562: nilai("acuan", "K562") }, b = { HepG2: batas("HepG2")[0], K562: batas("K562")[0] };
  const satu = (label, v, catat) => h("div", {}, h("p", { class: "label", text: label }), h("p", { class: "nilai", text: v }), h("p", { class: "catat", text: catat }));
  const dua = (label, v) => h("div", {}, h("p", { class: "label", text: label }), h("p", { class: "nilai dua-angka" }, h("span", { text: fmt(v.HepG2) }), h("span", { text: fmt(v.K562) })),
    h("p", { class: "catat pasangan" }, sw("HepG2"), sw("K562")));
  return [
    h("section", { class: "pita-temuan" }, h("div", { class: "bungkus" },
      h("div", {}, h("p", { class: "label-hal", text: `Temuan utama, target ${TARGET_LABEL[S.target].toLowerCase()}` }),
        h("h1", { text: `Malinois menangkap sebagian efek mutasi tunggal pada elemen baru, dengan jarak ${fmt(b.HepG2 - r.HepG2, 2)} (HepG2) dan ${fmt(b.K562 - r.K562, 2)} (K562) ke batas atas.` }),
        h("p", { class: "sub", text: "Korelasi Pearson antara prediksi model acuan 20 epoch dan hasil ukur Siraj pada 170.292 mutasi per lini sel. Batas atas adalah taksiran dari noise pengukuran. Setiap konfigurasi hanya dilatih dengan satu seed." })),
      h("div", { class: "kisi-hitam" },
        satu("Elemen uji", ribu(m.n_elemen), "Tidak pernah dipakai saat training"),
        satu("Mutasi per lini sel", ribu(m.n_mutasi), "Basis evaluasi"),
        dua("Korelasi model acuan", r), dua("Batas atas noise", b)))),
    h("div", { class: "bungkus tumpuk", style: { paddingTop: "40px" } },
      panel("Gbr. 1", "Seberapa dekat model acuan ke batas atas?",
        "Batang = korelasi model acuan 20 epoch. Garis tinta = taksiran batas atas, pita abu = selang kepercayaan 95%. Kuning menandai jarak keduanya.", gulirX(meter())),
      h("div", { class: "dua-kolom" },
        panel("Gbr. 2", "Perlakuan mana yang menggeser korelasi?", "Selisih Pearson terhadap model acuan. E dibanding kontrolnya sendiri.", ringkasAblasi()),
        h("div", { class: "kertas" },
          catatan("Sumber data", h("p", { text: `Siraj et al. (2026), saturation mutagenesis: 128 elemen, 170.292 mutasi per lini sel, target ${TARGET_KOLOM[S.target]}. `
            + "Model MPAC/Malinois (BassetBranched) dilatih ulang 20 epoch tanpa elemen Siraj, lalu diuji zero-shot." })),
          catatan("Batas tafsir", h("ol", {},
            h("li", { text: "Satu seed per konfigurasi: selisih ≤ 0,013 tidak disebut beda." }),
            h("li", { text: S.target === "post" ? "Batas atas posterior adalah taksiran dengan asumsi (Lage-Castellanos et al., 2019, dimodifikasi)." : "Batas atas mentah: persamaan 16 Lage-Castellanos et al. (2019)." }),
            h("li", { text: "Probe memberi batas bawah informasi yang bisa dibaca." }))))),
      panel("Gbr. 3", "Bagaimana korelasi tersebar di 128 elemen?", "Satu titik = satu elemen. Garis tinta = median korelasi, garis putus = median batas atas.", gulirX(stripPlot()))),
  ];
}

/* ---------- Ablasi ---------- */
function dotPlot() {
  const met = S.metrik;
  const daftar = S.meta.metrik.model.filter((m) => m.kunci !== "E_kontrol");
  const W = 1288, Y0 = 56, RH = 40, H = Y0 + daftar.length * RH + 62, LW = 340, PW = 420, GAP = 80;
  const g = svg(W, H, "Korelasi tiap perlakuan dibanding model acuan");
  const dom = {};
  let span = 0;
  for (const sel of ["HepG2", "K562"]) {
    const v = S.meta.metrik.model.map((m) => r3(m[S.target][sel][met]));
    const lo = Math.floor((Math.min(...v) - 0.006) * 100) / 100, hi = Math.ceil((Math.max(...v) + 0.006) * 100) / 100;
    dom[sel] = lo; span = Math.max(span, hi - lo);
  }
  daftar.forEach((m, k) => {
    const y = Y0 + k * RH;
    if (k % 2 === 0) g.append(s("rect", { x: 0, y, width: W, height: RH, fill: T.soft }));
    g.append(teks(16, y + RH / 2, m.kunci === "E_evoaug" ? "E · kontrol → EvoAug" : m.label, { fill: T.ink, size: 15, berat: k === 0 ? 700 : 500 }));
  });
  ["HepG2", "K562"].forEach((sel, p) => {
    const X = LW + p * (PW + GAP), lo = dom[sel], hi = lo + span, sx = skala(lo, hi, X, X + PW);
    const a = nilai("acuan", sel, met);
    kunciSvg(g, X, 22, sel);
    g.append(s("rect", { x: sx(a - AMBANG), y: Y0, width: sx(a + AMBANG) - sx(a - AMBANG), height: daftar.length * RH, fill: T.pita }),
      garis(sx(a), Y0 - 6, sx(a), Y0 + daftar.length * RH, T.ink, 2));
    const step = span <= 0.1 ? 0.02 : 0.05;
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) g.append(teks(sx(t), Y0 + daftar.length * RH + 18, fmt(t, 2), { anchor: "middle" }));
    g.append(teks(X, H - 10, `${met === "pearson" ? "Pearson global" : "Median Pearson per elemen"} (${LABEL[sel]})`));
    daftar.forEach((m, k) => {
      const cy = Y0 + k * RH + RH / 2, v = r3(m[S.target][sel][met]);
      const tipTeks = `${m.label} · ${LABEL[sel]}\n${fmt(v)} (selisih ${sfmt(v - a)} dari acuan)`;
      if (m.kunci === "E_evoaug") {
        const v0 = r3(model("E_kontrol")[S.target][sel][met]);
        g.append(garis(sx(v), cy, sx(v0), cy, WARNA[sel], 2),
          s("circle", { class: "mark", cx: sx(v0), cy, r: 6, fill: T.card, stroke: WARNA[sel], "stroke-width": 2, "data-tip": `E · kontrol 2 tahap · ${LABEL[sel]}\n${fmt(v0)}` }),
          teks(sx(v0) + (v0 < v ? -10 : 10), cy, fmt(v0), { anchor: v0 < v ? "end" : "start" }),
          s("circle", { class: "mark", cx: sx(v), cy, r: 6, fill: WARNA[sel], stroke: T.card, "stroke-width": 2, "data-tip": `${tipTeks}\nvs kontrol ${sfmt(v - v0)}` }),
          teks(sx(v) + (v < v0 ? -10 : 10), cy, fmt(v), { fill: T.ink, tebal: true, anchor: v < v0 ? "end" : "start" }));
      } else {
        g.append(s("circle", { class: "mark", cx: sx(v), cy, r: 6, fill: k === 0 ? T.ink : WARNA[sel], stroke: T.card, "stroke-width": 2, "data-tip": tipTeks }),
          teks(sx(v) + (v < a ? -10 : 10), cy, fmt(v), { fill: T.ink, tebal: k === 0, anchor: v < a ? "end" : "start" }));
      }
    });
  });
  g.append(s("circle", { cx: W - 200, cy: 22, r: 6, fill: T.card, stroke: T.ink, "stroke-width": 2 }), teks(W - 188, 22, "kontrol", { fill: T.ink, size: 14, berat: 500 }),
    s("circle", { cx: W - 100, cy: 22, r: 6, fill: T.ink }), teks(W - 88, 22, "EvoAug", { fill: T.ink, size: 14, berat: 500 }));
  return g;
}

function tabelAblasi() {
  const met = S.metrik;
  const a = { HepG2: nilai("acuan", "HepG2", met), K562: nilai("acuan", "K562", met) };
  const d = (v) => h("td", { class: Math.abs(v) <= AMBANG ? "ka redup" : "ka tebal", text: sfmt(v) });
  return h("div", {}, h("div", { class: "lebar-tabel" }, h("table", {},
    h("thead", {}, h("tr", {}, ["Perlakuan", "Komponen yang diubah"].map((t) => h("th", { text: t })),
      ["HepG2", "Δ", "K562", "Δ", "Tes MPAC HepG2", "Tes MPAC K562"].map((t) => h("th", { class: "ka", text: t })))),
    h("tbody", {}, S.meta.metrik.model.map((m) => {
      const acu = m.kunci === "acuan", vh = r3(m[S.target].HepG2[met]), vk = r3(m[S.target].K562[met]);
      return h("tr", {}, h("td", { text: m.label, class: acu ? "tebal" : null }), h("td", { text: acu ? "–" : m.komponen, class: acu ? "redup" : null }),
        h("td", { class: acu ? "ka tebal" : "ka", text: fmt(vh) }), acu ? h("td", { class: "ka redup", text: "–" }) : d(vh - a.HepG2),
        h("td", { class: acu ? "ka tebal" : "ka", text: fmt(vk) }), acu ? h("td", { class: "ka redup", text: "–" }) : d(vk - a.K562),
        h("td", { class: "ka", text: fmt(m.mpac.HepG2) }), h("td", { class: "ka", text: fmt(m.mpac.K562) }));
    })))),
  h("p", { class: "ket-bawah", text: `E · EvoAug dibanding kontrol 2 tahap: ${sfmt(nilai("E_evoaug", "HepG2", met) - nilai("E_kontrol", "HepG2", met))} (HepG2) dan `
    + `${sfmt(nilai("E_evoaug", "K562", met) - nilai("E_kontrol", "K562", met))} (K562). Tes MPAC = data uji asal model (in-distribution), Pearson, dari Ablasi.md. Abu-abu: |selisih| ≤ 0,013.` }));
}

function renderAblasi() {
  return [
    kepala("Ablasi", "Satu komponen per perlakuan.", "Korelasi pada 170.292 mutasi dari 128 elemen. Setiap perlakuan dilatih dengan satu seed.",
      h("span", { class: "ket" }, "Ukuran"), seg([["pearson", "Pearson global"], ["median_pearson", "Median per elemen"]], S.metrik, (v) => { S.metrik = v; render(); }, "Ukuran")),
    halaman(
      panel("Gbr. 1", "Perlakuan mana yang keluar dari pita ±0,013?",
        "Garis tinta = model acuan 20 epoch. Pita abu = selisih ≤ 0,013 dari acuan, tidak disebut beda. Baris E: titik kosong = kontrol 2 tahap, titik penuh = EvoAug.", gulirX(dotPlot())),
      panel("Gbr. 2", "Angka lengkap", "Selisih dihitung terhadap model acuan 20 epoch dari angka yang dibulatkan tiga desimal.", tabelAblasi())),
  ];
}

/* ---------- Per elemen ---------- */
function titikElemen() {
  const sels = S.filterSel === "semua" ? ["HepG2", "K562"] : [S.filterSel];
  const out = [];
  for (const e of S.meta.elemen) for (const sel of sels) {
    const v = e[sel][S.target];
    if (v.batas == null) continue;
    out.push({ e, sel, r: v.r, b: v.batas, gap: v.batas - v.r });
  }
  return out;
}
const cocokCari = (e) => !S.cari || e.nama.toLowerCase().includes(S.cari.toLowerCase());
const kePeta = (id, sel) => { location.hash = `#/peta?e=${encodeURIComponent(id)}&sel=${sel}`; };

function scatterElemen(titik) {
  const W = 740, H = 600, X0 = 60, Y0 = 16, PW = 660, PH = 520;
  const xlo = Math.min(0.5, Math.floor(Math.min(...titik.map((t) => t.b)) * 10) / 10);
  const ylo = Math.min(0, Math.floor(Math.min(...titik.map((t) => t.r)) * 10) / 10);
  const sx = skala(xlo, 1, X0, X0 + PW), sy = skala(ylo, 1, Y0 + PH, Y0);
  const g = svg(W, H, "Korelasi model per elemen dibanding batas atas");
  for (let t = xlo; t <= 1.0001; t += 0.1) g.append(garis(sx(t), Y0, sx(t), Y0 + PH), teks(sx(t), Y0 + PH + 16, fmt(t, 1), { anchor: "middle" }));
  for (let t = ylo; t <= 1.0001; t += 0.2) g.append(garis(X0, sy(t), X0 + PW, sy(t)), teks(X0 - 10, sy(t), fmt(t, 1), { anchor: "end" }));
  const d0 = Math.max(xlo, ylo);
  g.append(garis(sx(d0), sy(d0), sx(1), sy(1), T.ink2, 1.5, "5 4"), teks(sx(0.86), sy(0.95), "korelasi = batas atas", { anchor: "end" }));
  const ada = S.cari && titik.some((t) => cocokCari(t.e));
  for (const t of titik) {
    const kena = cocokCari(t.e);
    const c = s("circle", { class: "mark klik", cx: sx(t.b), cy: sy(t.r), r: kena && ada ? 7 : 4.5, fill: WARNA[t.sel], stroke: kena && ada ? T.ink : T.card,
      "stroke-width": kena && ada ? 2 : 1, "fill-opacity": ada && !kena ? 0.15 : 0.88,
      "data-tip": `${t.e.nama} · ${LABEL[t.sel]}\nkorelasi ${fmt(t.r)} · batas ${fmt(t.b)}\njarak ${fmt(t.gap)}\nklik untuk membuka peta mutasi` });
    c.addEventListener("click", () => kePeta(t.e.id, t.sel));
    g.append(c);
  }
  g.append(teks(X0, H - 14, "Batas atas noise per elemen"), teks(0, 4, "Korelasi model"));
  return g;
}

function histogram(titik) {
  const sels = S.filterSel === "semua" ? ["HepG2", "K562"] : [S.filterSel];
  const W = 1288, H = 250, LB = 0.05, DASAR = 196;
  const g = svg(W, H, "Sebaran jarak ke batas atas");
  const nb = Math.ceil(Math.max(...titik.map((t) => t.gap)) / LB) + 1;
  const bins = Object.fromEntries(sels.map((sel) => [sel, new Array(nb).fill(0)]));
  titik.forEach((t) => { bins[t.sel][Math.max(0, Math.floor(t.gap / LB))]++; });
  const mx = Math.max(...sels.flatMap((sel) => bins[sel]));
  const PW = sels.length === 2 ? 600 : W;
  sels.forEach((sel, i) => {
    const X = i * 660, BW = PW / nb, sy = skala(0, mx, DASAR, 40);
    kunciSvg(g, X, 10, sel);
    g.append(garis(X, DASAR, X + PW, DASAR, T.axis));
    bins[sel].forEach((n, k) => {
      if (n) g.append(s("rect", { class: "mark", x: X + k * BW + 1, y: sy(n), width: BW - 2, height: DASAR - sy(n), fill: WARNA[sel],
        "data-tip": `${LABEL[sel]} · jarak ${fmt(k * LB, 2)}–${fmt((k + 1) * LB, 2)}\n${n} elemen` }));
    });
    for (let t = 0; t <= nb * LB; t += 0.2) g.append(teks(X + (t / LB) * BW, DASAR + 16, fmt(t, 1), { anchor: t === 0 ? "start" : "middle" }));
    g.append(teks(X, DASAR + 42, "Jarak ke batas atas"));
  });
  return g;
}

function tabelElemen(titik) {
  const baris = titik.filter((t) => cocokCari(t.e)).sort((a, b) => b.gap - a.gap);
  const jmax = baris.length ? baris[0].gap : 1;
  if (!baris.length) return h("p", { class: "ket-bawah", text: `Tidak ada elemen yang cocok dengan "${S.cari}". Hapus sebagian teks pencarian.` });
  return h("div", { class: "gulir" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Elemen" }), h("th", { text: "Sel" }), h("th", { class: "ka", text: "Korelasi" }), h("th", { class: "ka", text: "Batas" }), h("th", { text: "Jarak" }))),
    h("tbody", {}, baris.map((t) => h("tr", { class: "klik", tabindex: 0, onclick: () => kePeta(t.e.id, t.sel), onkeydown: (ev) => ev.key === "Enter" && kePeta(t.e.id, t.sel) },
      h("td", { class: "mono", text: t.e.nama }), h("td", {}, sw(t.sel, " ")), h("td", { class: "ka", text: fmt(t.r) }), h("td", { class: "ka", text: fmt(t.b) }),
      h("td", { style: { whiteSpace: "nowrap" } }, h("span", { class: "meter-mini", title: fmt(t.gap) }, h("i", { style: { width: `${Math.max(2, (t.gap / jmax) * 100)}%` } })), h("b", { text: ` ${fmt(t.gap, 2)}` })))))));
}

function renderElemen() {
  const titik = titikElemen();
  const gaps = (sel) => titik.filter((t) => t.sel === sel).map((t) => t.gap);
  const minTeks = ["HepG2", "K562"].filter((sel) => gaps(sel).length).map((sel) => `${fmt(Math.min(...gaps(sel)))} (${LABEL[sel]})`).join(" dan ");
  const lewat = titik.filter((t) => t.r > t.b).length;
  const selAktif = S.filterSel === "semua" ? ["HepG2", "K562"] : [S.filterSel];
  const kosong = S.meta.elemen.reduce((n, e) => n + selAktif.filter((sel) => e[sel][S.target].batas == null).length, 0);
  const catatMentah = S.target === "raw" ? ` Batas atas mentah per elemen (persamaan 16 Lage-Castellanos et al., 2019) bisa tidak stabil di tingkat elemen${kosong ? `; ${kosong} elemen tidak punya batas karena varians kesalahannya melebihi varians total` : ""}.` : "";
  const cari = h("input", { class: "cari", type: "search", placeholder: "mis. 9:34988605", value: S.cari, "aria-label": "Cari elemen", id: "cari-elemen" });
  cari.addEventListener("input", () => { S.cari = cari.value; render(); const c = document.querySelector(".cari"); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } });
  return [
    kepala("Kinerja per elemen", lewat === 0 ? "Semua elemen di bawah batas atasnya." : `${lewat} elemen melewati batas atasnya.`,
      `Korelasi model acuan tiap elemen dibanding batas atas noise elemen itu, target ${TARGET_LABEL[S.target].toLowerCase()}.${catatMentah}`),
    h("div", { class: "bungkus kontrol baris-kontrol" }, h("label", { class: "ket", for: "cari-elemen" }, "Cari elemen"), cari,
      h("span", { class: "ket" }, "Lini sel"), seg([["semua", "Keduanya"], ["HepG2", "HepG2"], ["K562", "K562"]], S.filterSel, (v) => { S.filterSel = v; render(); }, "Lini sel")),
    halaman(
      h("div", { class: "dua-kolom lebar" },
        panel("Gbr. 1", "Elemen mana yang paling jauh?", "Satu titik = satu elemen. Garis putus = korelasi sama dengan batas atas. Klik titik untuk membuka peta mutasinya.",
          h("div", { class: "legenda", style: { marginBottom: "8px" } }, sw("HepG2"), sw("K562")), scatterElemen(titik)),
        panel("Gbr. 2", "Jarak terbesar", "Jarak = batas atas − korelasi model. Klik baris untuk membuka peta mutasinya.", tabelElemen(titik))),
      panel("Gbr. 3", "Bagaimana jarak tersebar?", `Jumlah elemen per selang jarak 0,05. Jarak terkecil ${minTeks}.`, gulirX(histogram(titik)))),
  ];
}

/* ---------- Peta mutasi ---------- */
function pitaSekuens(g, ref, X0, CW, y, label) {
  if (label) g.append(teks(X0, y - 18, label, { size: 12.5, berat: 600 }));
  g.append(s("text", { x: [...ref].map((_, i) => (X0 + (i + 0.5) * CW).toFixed(2)).join(" "), y, fill: T.ink, "font-size": 9.5, "font-family": MONO, "text-anchor": "middle", "dominant-baseline": "middle" }, ref));
}

function petaKisi(g, data, ref, vmax, y0, judul, label, X0 = 56, PW = 1220) {
  const L = ref.length || Math.max(...data.map((d) => d[0])), CW = PW / L, RHh = 14;
  if (judul) g.append(teks(X0, y0 - 18, judul, { fill: T.ink, size: 14, berat: 600 }));
  const ramp = [...DIV.biru].reverse().concat([DIV.tengah], DIV.merah), lx = X0 + PW - ramp.length * 18 - 74;
  ramp.forEach((w, i) => g.append(s("rect", { x: lx + i * 18, y: y0 - 24, width: 18, height: 12, fill: w })));
  g.append(teks(lx - 8, y0 - 18, `−${fmt(vmax, 1)} turun`, { anchor: "end" }), teks(lx + ramp.length * 18 + 8, y0 - 18, `naik +${fmt(vmax, 1)}`));
  "ACGT".split("").forEach((b, i) => g.append(s("text", { x: X0 - 16, y: y0 + i * (RHh + 2) + RHh / 2, fill: T.ink2, "font-size": 12, "font-weight": 700, "font-family": MONO, "text-anchor": "middle", "dominant-baseline": "middle" }, b)));
  for (const [pos, alt, v] of data) {
    const i = "ACGT".indexOf(alt);
    g.append(s("rect", { class: "mark", x: X0 + (pos - 1) * CW, y: y0 + i * (RHh + 2), width: CW + 0.15, height: RHh, fill: warnaDiv(v, vmax),
      "data-tip": `${ref[pos - 1] || "?"}${pos}${alt} · ${label}\n${sfmt(v)}` }));
  }
  for (let p = 1; p <= ref.length; p++) {
    const i = "ACGT".indexOf(ref[p - 1]);
    if (i < 0) continue;
    g.append(s("rect", { x: X0 + (p - 1) * CW, y: y0 + i * (RHh + 2), width: CW + 0.15, height: RHh, fill: T.card }),
      s("circle", { cx: X0 + (p - 0.5) * CW, cy: y0 + i * (RHh + 2) + RHh / 2, r: Math.min(1.3, CW / 3), fill: T.ink }));
  }
  return { CW, X0, L, bawah: y0 + 4 * (RHh + 2) };
}
const vmaxDari = (v) => { const a = v.filter((x) => x != null).map(Math.abs).sort((x, y) => x - y); return Math.max(0.1, Math.ceil(a[Math.floor(a.length * 0.98)] * 10) / 10); };

function sumbuPosisi(g, info, y) {
  const ticks = [1]; for (let t = 25; t < info.L; t += 25) ticks.push(t); ticks.push(info.L);
  ticks.forEach((t) => g.append(garis(info.X0 + (t - 0.5) * info.CW, y, info.X0 + (t - 0.5) * info.CW, y + 6, T.axis), teks(info.X0 + (t - 0.5) * info.CW, y + 18, String(t), { anchor: "middle" })));
  g.append(teks(info.X0 - 16, y + 18, "posisi", { anchor: "end" }));
}

function scatterPeta(d) {
  const pts = d.mutasi.filter((m) => m[2] != null);
  const W = 500, H = 420, X0 = 56, Y0 = 26, PW = 430, PH = 340;
  const xs = pts.map((p) => p[2]), ys = pts.map((p) => p[3]);
  const xa = Math.floor(Math.min(...xs)), xb = Math.ceil(Math.max(...xs)), ya = Math.floor(Math.min(...ys)), yb = Math.ceil(Math.max(...ys));
  const sx = skala(xa, xb, X0, X0 + PW), sy = skala(ya, yb, Y0 + PH, Y0);
  const g = svg(W, H, "Hasil ukur dibanding prediksi tiap mutasi");
  for (let t = xa; t <= xb; t++) g.append(garis(sx(t), Y0, sx(t), Y0 + PH, t === 0 ? T.axis : T.grid, t === 0 ? 1.5 : 1), teks(sx(t), Y0 + PH + 16, fmt(t, 1), { anchor: "middle" }));
  for (let t = ya; t <= yb; t++) g.append(garis(X0, sy(t), X0 + PW, sy(t), t === 0 ? T.axis : T.grid, t === 0 ? 1.5 : 1), teks(X0 - 10, sy(t), fmt(t, 1), { anchor: "end" }));
  for (const [pos, alt, o, p] of pts) g.append(s("circle", { class: "mark", cx: sx(o), cy: sy(p), r: 3.2, fill: WARNA[d.sel], "fill-opacity": 0.7,
    "data-tip": `${d.ref[pos - 1]}${pos}${alt}\nhasil ukur ${sfmt(o)} · prediksi ${sfmt(p)}` }));
  g.append(teks(X0, H - 8, `Hasil ukur (${TARGET_KOLOM[d.target]})`), teks(0, 6, "Prediksi"));
  return g;
}

function tabelEfekTerbesar(d) {
  const top = d.mutasi.filter((m) => m[2] != null).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])).slice(0, 9);
  const vo = vmaxDari(d.mutasi.map((m) => m[2])), vp = vmaxDari(d.mutasi.map((m) => m[3]));
  const sel = (v, vm) => h("td", { class: "ka" }, h("span", { class: "kotak-warna", style: { background: warnaDiv(v, vm) } }), sfmt(v));
  return h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Mutasi" }), h("th", { class: "ka", text: "Hasil ukur" }), h("th", { class: "ka", text: "Prediksi" }), h("th", { text: "Arah" }))),
    h("tbody", {}, top.map(([pos, alt, o, p]) => h("tr", {}, h("td", { class: "tebal", text: `${d.ref[pos - 1]}${pos}${alt}` }), sel(o, vo), sel(p, vp),
      h("td", { text: (o > 0) === (p > 0) ? "sama" : "berlawanan", class: (o > 0) === (p > 0) ? "redup" : "tebal" })))));
}

function muatPeta() {
  const p = S.peta, q = { elemen: p.elemen, sel: p.sel, target: S.target };
  if (p.sat_ref) q.sat_ref = p.sat_ref;
  return API.peta(q);
}

function renderPeta() {
  const p = S.peta;
  const e0 = S.meta.elemen.find((e) => e.id === p.elemen);
  const pilihan = h("select", { class: "pilihan", "aria-label": "Elemen dan alel", id: "pilih-elemen" });
  for (const e of S.meta.elemen) for (const a of e.alel) {
    const o = h("option", { value: `${e.id}|${a}` }, `${e.nama} · alel ${kodeAlel(a)}`);
    if (e.id === p.elemen && a === p.sat_ref) o.selected = true;
    pilihan.append(o);
  }
  pilihan.addEventListener("change", () => { [p.elemen, p.sat_ref] = pilihan.value.split("|"); render(); });
  const wadah = h("div", { class: "bungkus" }, h("p", { class: "memuat", text: "Memuat peta mutasi…" }));
  muatPeta().then((d) => {
    p.data = d;
    const W = 1288, g = svg(W, 340, "Peta efek per posisi dan basa pengganti");
    const vo = vmaxDari(d.mutasi.map((m) => m[2])), vp = vmaxDari(d.mutasi.map((m) => m[3]));
    const L = d.ref.length, CW = 1220 / L;
    pitaSekuens(g, d.ref, 56, CW, 34, `Sekuens alel ${kodeAlel(d.sat_ref)}`);
    petaKisi(g, d.mutasi.map((m) => [m[0], m[1], m[2]]), d.ref, vo, 104, `Hasil ukur Siraj (${TARGET_KOLOM[d.target]})`, "hasil ukur");
    const info = petaKisi(g, d.mutasi.map((m) => [m[0], m[1], m[3]]), d.ref, vp, 226, "Prediksi model acuan (selisih log2 aktivitas)", "prediksi");
    sumbuPosisi(g, info, info.bawah + 6);
    const jarak = d.batas_elemen != null ? d.batas_elemen - d.r_elemen : null;
    wadah.replaceChildren(
      deret([
        { label: `Mutasi tunggal (alel ${kodeAlel(d.sat_ref)})`, nilai: ribu(d.n_snv), catat: `${ribu(d.n_alel)} pasangan pada alel ini` },
        { label: `Korelasi elemen (${d.alel.length} alel)`, nilai: fmt(d.r_elemen), catat: `${ribu(d.n_elemen)} mutasi, ${LABEL[d.sel]}` },
        { label: "Batas atas elemen", nilai: fmt(d.batas_elemen), catat: d.batas_elemen == null ? "Tidak terdefinisi untuk elemen ini" : TARGET_LABEL[d.target] },
        { label: "Jarak ke batas atas", nilai: fmt(jarak), catat: "batas atas − korelasi", aksen: jarak != null },
      ]),
      h("div", { class: "tumpuk" },
        panel("Gbr. 1", "Di posisi mana mutasi paling mengubah aktivitas?",
          "Kotak putih bertitik = basa asli. Tiap peta memakai skalanya sendiri, simetris di sekitar 0. Arahkan kursor ke kotak untuk angkanya.", gulirX(g)),
        h("div", { class: "dua-kolom rata" },
          panel("Gbr. 2", "Seberapa sejalan prediksinya?", `Satu titik = satu mutasi alel ${kodeAlel(d.sat_ref)} (${d.n_snv}). Korelasi alel ini ${fmt(d.r_alel)}.`, scatterPeta(d)),
          panel("Gbr. 3", "Mutasi dengan efek terukur terbesar", "Diurutkan menurut besar efek hasil ukur. Arah = tanda prediksi sama dengan hasil ukur.", h("div", { class: "lebar-tabel" }, tabelEfekTerbesar(d))))));
  }).catch((err) => wadah.replaceChildren(h("p", { class: "pesan", text: `Gagal memuat peta: ${err.message}. Muat ulang halaman, atau pilih elemen lain.` })));
  return [
    kepala("Peta efek mutasi", `${e0 ? e0.nama : p.elemen}, alel ${kodeAlel(p.sat_ref)}`, "Efek tiap mutasi tunggal pada satu elemen: hasil ukur Siraj dan prediksi model acuan berdampingan.",
      h("label", { class: "ket", for: "pilih-elemen" }, "Elemen"), pilihan,
      h("span", { class: "ket" }, "Lini sel"), seg([["HepG2", "HepG2"], ["K562", "K562"]], p.sel, (v) => { p.sel = v; render(); }, "Lini sel")),
    wadah,
  ];
}

/* ---------- Prediksi ---------- */
function cekSeq(teksMasuk) {
  const sq = teksMasuk.replace(/\s+/g, "").toUpperCase();
  if (!sq) return { ok: false, pesan: "Tempel sekuens 200 bp, atau pakai contoh dari Siraj.", sq };
  const salah = [...new Set(sq.replace(/[ACGT]/g, ""))];
  if (salah.length) return { ok: false, pesan: `Hanya A, C, G, T. Ditemukan: ${salah.slice(0, 6).join(", ")}`, sq };
  if (sq.length < 189 || sq.length > 200) return { ok: false, pesan: `Panjang harus 189–200 bp (sekarang ${sq.length} bp). Model menambah pengapit vektor sendiri sampai 600 bp.`, sq };
  return { ok: true, pesan: "Sekuens valid: hanya A, C, G, T", sq };
}

async function jalankanPrediksi() {
  const P = S.pred, c = cekSeq(P.seq);
  if (!c.ok) { P.galat = c.pesan; render(); return; }
  P.sedang = true; P.galat = ""; P.kemajuan = ""; render();
  try {
    P.hasil = await API.prediksi(c.sq, (t) => { P.kemajuan = t; const el = document.querySelector(".sedang"); if (el) el.textContent = t; });
    P.selPeta = ["HepG2", "K562", "SKNSH"].find((k) => P.sel[k]) || "HepG2";
  } catch (err) { P.galat = `Prediksi gagal: ${err.message}`; }
  P.sedang = false; render();
}

function pilihModel() {
  return [h("label", { class: "ket", for: "pilih-model" }, "Model"),
    h("select", { class: "pilihan", id: "pilih-model" }, h("option", {}, "Model acuan 20 epoch"))];
}

function renderPrediksiMasukan() {
  const P = S.pred, c = cekSeq(P.seq);
  const ta = h("textarea", { class: `sekuens${P.seq && !c.ok ? " galat" : ""}`, spellcheck: "false", "aria-label": "Sekuens DNA", placeholder: "ACGT…", id: "sekuens" });
  ta.value = P.seq;
  const status = h("div", { class: "status" }, h("span", { class: c.ok ? "ok" : P.seq ? "no" : "", text: c.pesan }), h("b", { text: `${c.sq.length} bp` }));
  ta.addEventListener("input", () => {
    P.seq = ta.value; const k = cekSeq(P.seq);
    ta.classList.toggle("galat", !!P.seq && !k.ok);
    status.replaceChildren(h("span", { class: k.ok ? "ok" : P.seq ? "no" : "", text: k.pesan }), h("b", { text: `${k.sq.length} bp` }));
  });
  const berkas = h("input", { type: "file", accept: ".fa,.fasta,.fna,.txt", hidden: true });
  berkas.addEventListener("change", async () => {
    const f = berkas.files[0]; if (!f) return;
    const isi = await f.text();
    P.seq = isi.split(/\r?\n/).filter((l) => !l.startsWith(">")).join("").trim(); render();
  });
  const contoh = async () => { try { const j = await API.contoh(); P.seq = j.sekuens; P.galat = ""; } catch (err) { P.galat = `Contoh gagal dimuat: ${err.message}`; } render(); };
  const sels = ["HepG2", "K562", "SKNSH"];
  const rA = nilai("acuan", "HepG2", "pearson", "post"), rB = nilai("acuan", "K562", "pearson", "post");
  return [
    kepala("Prediksi", "Prediksi efek mutasi.", "Masukkan sekuens DNA regulatori. Model acuan memprediksi aktivitasnya dan efek tiap mutasi tunggal.", ...pilihModel()),
    halaman(h("div", { class: "dua-kolom" },
      h("div", { class: "tumpuk" },
        panel(null, "Sekuens DNA", "Panjang 200 bp, sama dengan oligo MPRA (189–199 bp juga diterima, seperti alel delesi Siraj). Model menambah pengapit vektor sampai 600 bp. Hanya huruf A, C, G, T.",
          ta, status,
          h("div", { class: "baris-tombol" },
            h("button", { class: "tombol", type: "button", onclick: contoh, disabled: P.sedang }, "Pakai contoh dari Siraj"),
            h("button", { class: "tombol", type: "button", onclick: () => berkas.click(), disabled: P.sedang }, "Unggah FASTA"), berkas,
            h("button", { class: "tombol utama dorong", type: "button", disabled: P.sedang, onclick: jalankanPrediksi }, P.sedang ? "Memprediksi…" : "Prediksi")),
          P.sedang ? h("p", { class: "sedang", role: "status", text: P.kemajuan || `Model memprediksi ${3 * c.sq.length} mutasi…` }) : null,
          P.galat ? h("p", { class: "pesan", role: "alert", text: P.galat }) : null),
        h("div", { class: "kertas" }, h("h2", { class: "judul-kertas", text: "Lini sel yang ditampilkan" }),
          h("p", { class: "ket-bawah", text: "Model punya tiga branch keluaran, satu per lini sel." }),
          h("div", { class: "pilih-sel" }, sels.map((k) => { const i = h("input", { type: "checkbox", checked: P.sel[k] }); i.addEventListener("change", () => { P.sel[k] = i.checked; }); return h("label", { class: "cek" }, i, sw(k)); })))),
      h("div", {},
        catatan("Yang dihitung", h("ol", {},
          h("li", { text: "Aktivitas sekuens asli di tiap lini sel (log2FC aktivitas MPRA)." }),
          h("li", { text: "Efek tiap mutasi tunggal: setiap posisi × 3 basa pengganti." }),
          h("li", { text: "Efek = prediksi mutan − prediksi sekuens asli." }),
          h("li", { text: "Tanda bila sekuens sama dengan elemen Siraj, supaya bisa dicocokkan dengan hasil ukur." }))),
        catatan("Sebelum membaca hasil", h("p", { text: "Hasil halaman ini adalah prediksi model, bukan hasil ukur laboratorium. Pada 128 elemen Siraj yang tidak pernah dipakai saat training, "
          + `korelasi prediksi dengan hasil ukur ${fmt(rA)} (HepG2) dan ${fmt(rB)} (K562), sedangkan batas atas noise ${fmt(batas("HepG2", "post")[0])} dan ${fmt(batas("K562", "post")[0])}.` }))))),
  ];
}

function petaPrediksi(hasil, sel) {
  const W = 1288, g = svg(W, 280, `Efek prediksi tiap mutasi, ${LABEL[sel]}`);
  const L = hasil.panjang, X0 = 56, PW = 1220, CW = PW / L;
  const mx = new Array(L + 1).fill(0);
  hasil.mutasi.forEach((m) => { mx[m.pos] = Math.max(mx[m.pos], Math.abs(m[sel])); });
  const top = Math.max(...mx);
  g.append(teks(0, 22, "pengaruh", { size: 11.5 }), teks(0, 36, "posisi", { size: 11.5 }), garis(X0, 72, X0 + PW, 72, T.axis));
  for (let p = 1; p <= L; p++) {
    const hh = (mx[p] / top) * 60;
    g.append(s("rect", { class: "mark", x: X0 + (p - 1) * CW + Math.min(0.6, CW * 0.12), y: 72 - hh, width: Math.max(0.5, CW - Math.min(1.2, CW * 0.24)), height: Math.max(hh, 0.5), fill: T.ink,
      "data-tip": `posisi ${p} (${hasil.sekuens[p - 1]})\nefek terbesar ${fmt(mx[p])}` }));
  }
  pitaSekuens(g, hasil.sekuens, X0, CW, 88);
  const data = hasil.mutasi.map((m) => [m.pos, m.alt, m[sel]]);
  const vmax = vmaxDari(data.map((d) => d[2]));
  const info = petaKisi(g, data, hasil.sekuens, vmax, 150, `Prediksi ${LABEL[sel]} (selisih log2 aktivitas)`, `prediksi ${LABEL[sel]}`, X0, PW);
  sumbuPosisi(g, info, info.bawah + 6);
  return g;
}

function unduh(nama, isi, tipe) {
  const a = h("a", { href: URL.createObjectURL(new Blob([isi], { type: tipe })), download: nama });
  document.body.append(a); a.click(); a.remove();
}
function unduhCSV(hasil) {
  const kol = ["HepG2", "K562", "SKNSH"];
  const baris = [["posisi", "basa_asli", "basa_mutan", ...kol.map((k) => `efek_${k}`)].join(",")];
  hasil.mutasi.forEach((m) => baris.push([m.pos, m.ref, m.alt, ...kol.map((k) => m[k].toFixed(5))].join(",")));
  baris.unshift(`# aktivitas sekuens asli (log2FC): ${kol.map((k) => `${k}=${hasil.induk[k].toFixed(5)}`).join(" ")}`);
  unduh("prediksi_efek_mutasi.csv", baris.join("\n"), "text/csv");
}
function unduhPNG(el) {
  const svgEl = el.querySelector("svg"); if (!svgEl) return;
  const vb = svgEl.viewBox.baseVal, skalaPx = 2;
  const klon = svgEl.cloneNode(true);
  klon.setAttribute("width", vb.width); klon.setAttribute("height", vb.height); klon.setAttribute("xmlns", NS);
  klon.insertBefore(s("rect", { x: 0, y: 0, width: vb.width, height: vb.height, fill: "#ffffff" }), klon.firstChild);
  klon.setAttribute("font-family", "Inter, Arial, sans-serif");
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = vb.width * skalaPx; c.height = vb.height * skalaPx;
    const ctx = c.getContext("2d"); ctx.scale(skalaPx, skalaPx); ctx.drawImage(img, 0, 0);
    c.toBlob((b) => unduh("peta_prediksi.png", b, "image/png"));
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(klon))}`;
}

function renderPrediksiHasil() {
  const P = S.pred, R = P.hasil;
  const sels = ["HepG2", "K562", "SKNSH"].filter((k) => P.sel[k]);
  if (!sels.includes(P.selPeta)) P.selPeta = sels[0] || "HepG2";
  const tampil = sels.length ? sels : ["HepG2"];
  const ukuran = Math.max(...R.mutasi.map((m) => Math.abs(m[P.selPeta])));
  const top = [...R.mutasi].sort((a, b) => Math.abs(b[P.selPeta]) - Math.abs(a[P.selPeta])).slice(0, 8);
  const vmax = vmaxDari(R.mutasi.map((m) => m[P.selPeta]));
  const panelPeta = panel("Gbr. 1", "Di posisi mana mutasi paling mengubah prediksi?",
    "Atas: pengaruh posisi = efek terbesar di posisi itu. Bawah: efek tiap basa pengganti; kotak putih bertitik = basa asli.", gulirX(petaPrediksi(R, P.selPeta)));
  panelPeta.append(h("div", { class: "kanan" }, seg(tampil.map((k) => [k, LABEL[k]]), P.selPeta, (v) => { P.selPeta = v; render(); }, "Lini sel peta")));
  const siraj = R.siraj && R.siraj.elemen ? S.meta.elemen.find((e) => e.id === R.siraj.elemen) : null;
  const s0 = R.sekuens;
  return [
    kepala("Prediksi", "Hasil prediksi model acuan.", "Prediksi untuk sekuens yang dimasukkan. Bukan hasil ukur laboratorium.", ...pilihModel()),
    halaman(
      h("div", {},
        h("div", { class: "ringkas-seq" }, h("span", { class: "ket", text: "Sekuens" }),
          h("code", { text: s0.length > 40 ? `${s0.slice(0, 24)}…${s0.slice(-12)}` : s0 }),
          h("span", { class: "ket", text: `${R.panjang} bp${siraj ? ` · sama dengan ${siraj.nama} alel ${kodeAlel(R.siraj.sat_ref)} (Siraj)` : " · tidak ada di data Siraj"}` }),
          h("button", { class: "tombol dorong", type: "button", onclick: () => { P.hasil = null; render(); } }, "Ubah sekuens")),
        deret([...tampil.map((k) => ({ label: "Aktivitas prediksi", nilai: fmt(R.induk[k]), catat: [sw(k), h("span", { text: "log2FC" })] })),
          { label: "Mutasi diprediksi", nilai: ribu(R.mutasi.length), catat: `${R.panjang} posisi × 3 basa` }])),
      panelPeta,
      h("div", { class: "dua-kolom" },
        panel("Gbr. 2", "Mutasi dengan efek prediksi terbesar", `Diurutkan menurut besar efek di ${LABEL[P.selPeta]}. Efek terbesar ${fmt(ukuran)}. Efek = prediksi mutan − prediksi sekuens asli, dalam log2 aktivitas.`,
          h("div", { class: "lebar-tabel" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Mutasi" }), tampil.map((k) => h("th", { class: "ka", text: LABEL[k] })))),
            h("tbody", {}, top.map((m) => h("tr", {}, h("td", { class: "tebal", text: `${m.ref}${m.pos}${m.alt}` }),
              tampil.map((k) => h("td", { class: "ka" }, h("span", { class: "kotak-warna", style: { background: warnaDiv(m[k], vmax) } }), sfmt(m[k]))))))))),
        h("div", { class: "kertas" }, catatan("Simpan dan bandingkan",
          h("div", { style: { display: "grid", gap: "12px", marginTop: "18px" } },
            h("button", { class: "tombol penuh", type: "button", onclick: () => unduhCSV(R) }, `Unduh CSV (${ribu(R.mutasi.length)} baris)`),
            h("button", { class: "tombol penuh", type: "button", onclick: () => unduhPNG(panelPeta) }, "Unduh peta (PNG)")),
          siraj
            ? h("div", { style: { borderTop: "1px solid var(--axis)", marginTop: "24px", paddingTop: "4px" } },
              h("p", { text: "Sekuens ini ada di data Siraj, jadi prediksinya bisa dicocokkan dengan hasil ukur." }),
              h("p", {}, h("a", { class: "tautan", href: `#/peta?e=${encodeURIComponent(siraj.id)}&a=${encodeURIComponent(R.siraj.sat_ref)}&sel=${P.selPeta === "SKNSH" ? "HepG2" : P.selPeta}` }, "Buka di Peta mutasi →")))
            : h("p", { style: { borderTop: "1px solid var(--axis)", marginTop: "24px", paddingTop: "12px" }, text: "Sekuens ini tidak ada di data Siraj, jadi belum ada hasil ukur pembanding." }),
          h("p", { class: "ket-bawah", style: { marginTop: "18px" }, text: `Prediksi model, bukan hasil ukur. Korelasi model acuan dengan hasil ukur Siraj ${fmt(nilai("acuan", "HepG2", "pearson", "post"))} (HepG2) dan ${fmt(nilai("acuan", "K562", "pearson", "post"))} (K562).` }))))),
  ];
}
const renderPrediksi = () => (S.pred.hasil ? renderPrediksiHasil() : renderPrediksiMasukan());

/* ---------- rute ---------- */
const HAL = { ringkasan: renderRingkasan, ablasi: renderAblasi, elemen: renderElemen, peta: renderPeta, prediksi: renderPrediksi };
const JUDUL = { ringkasan: "Ringkasan", ablasi: "Ablasi", elemen: "Per elemen", peta: "Peta mutasi", prediksi: "Prediksi" };

function rute() {
  const [jalur, qs] = (location.hash.replace(/^#\/?/, "") || "ringkasan").split("?");
  const q = new URLSearchParams(qs || "");
  const hal = HAL[jalur] ? jalur : "ringkasan";
  if (hal === "peta" && q.get("e")) {
    const e = S.meta.elemen.find((x) => x.id === q.get("e"));
    if (e) { S.peta.elemen = e.id; S.peta.sat_ref = q.get("a") && e.alel.includes(q.get("a")) ? q.get("a") : e.alel[e.alel.length - 1]; }
    if (["HepG2", "K562"].includes(q.get("sel"))) S.peta.sel = q.get("sel");
    history.replaceState(null, "", "#/peta");
  }
  if (hal === "prediksi" && q.get("contoh") === "1") {  // tautan demo: isi contoh Siraj lalu langsung prediksi
    history.replaceState(null, "", "#/prediksi");
    API.contoh().then((j) => { S.pred.seq = j.sekuens; jalankanPrediksi(); });
  }
  return hal;
}

let halSekarang = null;
function render() {
  const hal = rute(), isi = document.getElementById("isi");
  document.querySelectorAll("nav a").forEach((a) => (a.dataset.hal === hal ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.getElementById("kontrol-global").replaceChildren(...(hal === "prediksi" ? [] : [segTarget()]));
  document.title = `${JUDUL[hal]} · Dashboard Efek Mutasi`;
  tip.hidden = true;
  const y = window.scrollY, sama = hal === halSekarang;
  isi.replaceChildren(...HAL[hal]());
  if (sama) window.scrollTo(0, y); else { window.scrollTo(0, 0); halSekarang = hal; }
}

window.addEventListener("hashchange", () => { halSekarang = null; render(); });
API.meta().then((m) => {
  m.metrik.model.find((x) => x.kunci === "A").label = "A · 2 branch";
  m.metrik.model.find((x) => x.kunci === "F").label = "Eksperimen F · penyaringan label latih";
  m.metrik.model.find((x) => x.kunci === "acuan").komponen = "–";
  S.meta = m; render();
})
  .catch((err) => document.getElementById("isi").replaceChildren(h("p", { class: "bungkus pesan", text: `Gagal memuat data: ${err.message}. Periksa koneksi lalu muat ulang halaman.` })));
