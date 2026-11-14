"use strict";
/* Dashboard Efek Mutasi: tampilan halaman dan grafik SVG (tanpa pustaka luar). */

const WARNA = { HepG2: "#2a78d6", K562: "#eb6834", SKNSH: "#1baf7a" };
const LABEL = { HepG2: "HepG2", K562: "K562", SKNSH: "SK-N-SH" };
const DIV = {
  biru: ["#b9c6d8", "#839ec3", "#4f77ac", "#184f95"],
  merah: ["#e2bab4", "#cf867e", "#b8504a", "#9c0013"],
  tengah: "#f0efec",
};
const T = { ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#ecebe6", axis: "#c3c2b7", track: "#ecebe6", pita: "#e4e3dd", card: "#ffffff", soft: "#f6f6f3" };
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
  pred: { seq: "", sel: { HepG2: true, K562: true, SKNSH: true }, hasil: null, selPeta: "HepG2", sedang: false, galat: "" },
};

/* ---------- bantu ---------- */
const fmt = (v, n = 3) => (v == null || Number.isNaN(v) ? "–" : v.toFixed(n).replace("-", "−").replace(".", ","));
const sfmt = (v, n = 3) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(n).replace(".", ","));
const ribu = (n) => n.toLocaleString("id-ID");
const median = (a) => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const kodeAlel = (sr) => { const m = sr.match(/:([A-Z]):w[A-Z]+$/); return m ? m[1] : sr; };
const pearson = (a, b) => {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb);
};

function h(tag, attrs = {}, ...anak) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.append(...String(v).split(ISTILAH_TAMPILAN).map((t, i) => i % 2 ? h("em", {}, document.createTextNode(t)) : document.createTextNode(t)));
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const a of anak.flat()) if (a != null) {
    if (a.nodeType) el.append(a);
    else el.append(...String(a).split(ISTILAH_TAMPILAN).map((t, i) => i % 2 ? h("em", {}, document.createTextNode(t)) : document.createTextNode(t)));
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
  x, y, fill: o.fill || T.muted, "font-size": o.size || 11, "font-weight": o.tebal ? 600 : null,
  "text-anchor": o.anchor || "start", "dominant-baseline": o.baseline || "middle",
}, ...String(t).split(ISTILAH_TAMPILAN).map((p, i) => i % 2 ? s("tspan", { "font-style": "italic" }, p) : p));
const garis = (x1, y1, x2, y2, warna = T.grid, lebar = 1, dash) => s("line", { x1, y1, x2, y2, stroke: warna, "stroke-width": lebar, "stroke-dasharray": dash });

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
const segTarget = () => h("div", { class: "kontrol" }, h("label", { class: "ket" }, "Target"),
  seg([["post", "Posterior"], ["raw", "Mentah"]], S.target, (v) => { S.target = v; render(); }, "Target"));

function kepala(judul, sub, ...kontrol) {
  return h("header", { class: "kepala" }, h("div", {}, h("h1", { text: judul }), h("p", { text: sub })),
    h("div", { class: "kontrol" }, ...kontrol));
}
function kartu(judul, sub, ...isi) {
  return h("section", { class: "kartu" }, h("h2", { text: judul }), sub ? h("p", { class: "sub", text: sub }) : null, h("div", { class: "isi" }, ...isi));
}
function angka(label, nilai, catat) {
  return h("div", { class: "kartu angka" }, h("p", { class: "label", text: label }), h("p", { class: "nilai", text: nilai }), catat ? h("p", { class: "catat", text: catat }) : null);
}
function angkaDua(label, pasangan) {
  return h("div", { class: "kartu angka" }, h("p", { class: "label", text: label }),
    h("div", { class: "dua" }, pasangan.map(([sel, v]) => h("div", {}, h("p", { class: "nilai", text: v }), h("p", { class: "catat" }, sw(sel))))));
}

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
  const W = 524, g = svg(W, 196, "Korelasi model acuan dibanding batas atas noise");
  const sx = skala(0, 1, 0, W);
  ["HepG2", "K562"].forEach((sel, i) => {
    const y = 10 + i * 84, r = nilai("acuan", sel), [b, lo, hi] = batas(sel);
    g.append(s("circle", { cx: 4, cy: y + 6, r: 4, fill: WARNA[sel] }), teks(14, y + 6, LABEL[sel], { fill: T.ink2, size: 12 }),
      teks(W, y + 6, `jarak ${fmt(b - r, 2)}`, { fill: T.ink2, size: 12, anchor: "end" }),
      s("rect", { x: 0, y: y + 22, width: W, height: 12, rx: 6, fill: T.track }),
      s("rect", { x: sx(lo), y: y + 16, width: sx(hi) - sx(lo), height: 24, rx: 2, fill: "#d9d8d2" }),
      s("rect", { x: 0, y: y + 22, width: sx(r), height: 12, rx: 6, fill: WARNA[sel], "data-tip": `${LABEL[sel]} · model acuan\nkorelasi ${fmt(r)}` }),
      s("rect", { x: sx(b) - 1, y: y + 14, width: 2, height: 28, fill: T.ink, "data-tip": `batas atas ${fmt(b)}\nCI95 ${fmt(lo)}–${fmt(hi)}` }),
      teks(sx(r), y + 52, fmt(r), { fill: T.ink, size: 12, tebal: true, anchor: "end" }),
      teks(sx(b), y + 52, `batas ${fmt(b)}`, { fill: T.ink2, size: 12, anchor: "end" }));
  });
  [0, 0.5, 1].forEach((t) => g.append(teks(sx(t), 186, fmt(t, 1), { anchor: t === 0 ? "start" : t === 1 ? "end" : "middle" })));
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
  h("p", { class: "ket-bawah", text: `Abu-abu: |selisih| ≤ 0,013, tidak disebut beda (satu seed).` }));
}

function stripPlot() {
  const W = 1100, H = 196, PX = 92, PW = W - PX - 10;
  const g = svg(W, H, "Sebaran korelasi per elemen");
  const sx = skala(0, 1, PX, PX + PW);
  for (let t = 0; t <= 1.0001; t += 0.2) g.append(garis(sx(t), 20, sx(t), 156), teks(sx(t), 172, fmt(t, 1), { anchor: "middle" }));
  ["HepG2", "K562"].forEach((sel, i) => {
    const cy = 52 + i * 64;
    const ev = S.meta.elemen.map((e) => ({ e, r: e[sel][S.target].r, b: e[sel][S.target].batas }));
    const med = median(ev.map((x) => x.r)), mb = median(ev.filter((x) => x.b != null).map((x) => x.b));
    g.append(s("circle", { cx: 4, cy, r: 4, fill: WARNA[sel] }), teks(14, cy, LABEL[sel], { fill: T.ink2, size: 12 }));
    ev.forEach((x, k) => {
      const j = (((k * 37) % 23) - 11) * 1.5;
      g.append(s("circle", { class: "mark", cx: sx(x.r), cy: cy + j, r: 4, fill: WARNA[sel], stroke: T.card, "stroke-width": 1, "fill-opacity": 0.85,
        "data-tip": `${x.e.nama} · ${LABEL[sel]}\nkorelasi ${fmt(x.r)}${x.b != null ? ` · batas ${fmt(x.b)}` : ""}` }));
    });
    g.append(garis(sx(med), cy - 26, sx(med), cy + 26, T.ink, 2), teks(sx(med) + 6, cy - 30, `median ${fmt(med)}`, { fill: T.ink, tebal: true }),
      garis(sx(mb), cy - 26, sx(mb), cy + 26, T.ink2, 1.5, "4 3"), teks(sx(mb) - 6, cy - 30, `batas atas ${fmt(mb)}`, { fill: T.ink2, anchor: "end" }));
  });
  g.append(teks(PX, 190, "Korelasi Pearson per elemen"));
  return g;
}

function renderRingkasan() {
  const m = S.meta.metrik;
  return [
    kepala("Ringkasan", "Model MPAC/Malinois yang dilatih ulang, diuji zero-shot pada mutasi tunggal Siraj SatMut.", segTarget()),
    h("div", { class: "kisi k4" },
      angka("Elemen uji", ribu(m.n_elemen), "Tidak pernah dipakai saat training"),
      angka("Mutasi per lini sel", ribu(m.n_mutasi), "Baris evaluasi"),
      angkaDua("Korelasi model acuan (Pearson)", [["HepG2", fmt(nilai("acuan", "HepG2"))], ["K562", fmt(nilai("acuan", "K562"))]]),
      angkaDua("Batas atas noise", [["HepG2", fmt(batas("HepG2")[0])], ["K562", fmt(batas("K562")[0])]])),
    h("div", { class: "kisi k2", style: { marginTop: "16px" } },
      kartu("Jarak model ke batas atas", "Batang = korelasi model acuan. Garis = batas atas; pita abu = selang kepercayaan 95%.", meter()),
      kartu("Ringkasan ablasi", "Selisih Pearson terhadap model acuan. E dibanding kontrolnya sendiri.", ringkasAblasi())),
    h("div", { style: { marginTop: "16px" } }, kartu("Sebaran korelasi per elemen",
      "Satu titik = satu elemen (128 per lini sel). Garis hitam = median korelasi; garis putus = median batas atas.", stripPlot())),
    h("div", { class: "kisi k2", style: { marginTop: "16px" } },
      kartu("Sumber data", null, h("p", { style: { color: T.ink2, lineHeight: 1.6 } },
        `Siraj et al. (2026), saturation mutagenesis: 128 elemen, 170.292 mutasi per lini sel, target ${TARGET_KOLOM[S.target]}. `
        + "Model MPAC/Malinois (BassetBranched) dilatih ulang 20 epoch tanpa elemen Siraj, lalu diuji zero-shot.")),
      kartu("Batas tafsir", null, h("ul", { class: "titik-daftar" },
        h("li", { text: "Satu seed per konfigurasi: selisih ≤ 0,013 tidak disebut beda." }),
        h("li", { text: S.target === "post" ? "Batas atas posterior adalah taksiran dengan asumsi (Lage-Castellanos et al., 2019, dimodifikasi)." : "Batas atas mentah: persamaan 16 Lage-Castellanos et al. (2019)." }),
        h("li", { text: "Probe memberi batas bawah informasi yang bisa dibaca." })))),
  ];
}

/* ---------- Ablasi ---------- */
function dotPlot() {
  const met = S.metrik;
  const daftar = S.meta.metrik.model.filter((m) => m.kunci !== "E_kontrol");
  const W = 1104, Y0 = 70, RH = 32, H = Y0 + daftar.length * RH + 54, LW = 230, PW = 380, GAP = 90;
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
    if (k % 2 === 0) g.append(s("rect", { x: 0, y, width: W, height: RH, rx: 6, fill: T.soft }));
    g.append(teks(12, y + RH / 2, m.kunci === "E_evoaug" ? "E · kontrol → EvoAug" : m.label, { fill: T.ink, size: 13, tebal: k === 0 }));
  });
  ["HepG2", "K562"].forEach((sel, p) => {
    const X = LW + p * (PW + GAP), lo = dom[sel], hi = lo + span, sx = skala(lo, hi, X, X + PW);
    const a = nilai("acuan", sel, met);
    g.append(s("circle", { cx: X + 4, cy: 40, r: 4, fill: WARNA[sel] }), teks(X + 14, 40, LABEL[sel], { fill: T.ink2, size: 12 }));
    g.append(s("rect", { x: sx(a - AMBANG), y: Y0, width: sx(a + AMBANG) - sx(a - AMBANG), height: daftar.length * RH, fill: T.pita, "fill-opacity": 0.75 }),
      garis(sx(a), Y0 - 6, sx(a), Y0 + daftar.length * RH, T.ink, 1.5));
    const step = span <= 0.1 ? 0.02 : 0.05;
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) g.append(teks(sx(t), Y0 + daftar.length * RH + 16, fmt(t, 2), { anchor: "middle" }));
    g.append(teks(X, H - 8, `${met === "pearson" ? "Pearson global" : "Median Pearson per elemen"} (${LABEL[sel]})`));
    daftar.forEach((m, k) => {
      const cy = Y0 + k * RH + RH / 2, v = r3(m[S.target][sel][met]);
      const tipTeks = `${m.label} · ${LABEL[sel]}\n${fmt(v)} (selisih ${sfmt(v - a)} dari acuan)`;
      if (m.kunci === "E_evoaug") {
        const v0 = r3(model("E_kontrol")[S.target][sel][met]);
        g.append(garis(sx(v), cy, sx(v0), cy, T.axis, 2),
          s("circle", { class: "mark", cx: sx(v0), cy, r: 5, fill: T.card, stroke: WARNA[sel], "stroke-width": 2, "data-tip": `E · kontrol 2 tahap · ${LABEL[sel]}\n${fmt(v0)}` }),
          teks(sx(v0) + (v0 < a ? -10 : 10), cy, fmt(v0), { fill: T.ink2, anchor: v0 < a ? "end" : "start" }),
          s("circle", { class: "mark", cx: sx(v), cy, r: 5, fill: WARNA[sel], stroke: T.card, "stroke-width": 2, "data-tip": `${tipTeks}\nvs kontrol ${sfmt(v - v0)}` }),
          teks(sx(v) + (v < a ? -10 : 10), cy, fmt(v), { fill: T.ink, tebal: true, anchor: v < a ? "end" : "start" }));
      } else {
        g.append(s("circle", { class: "mark", cx: sx(v), cy, r: 5, fill: k === 0 ? T.ink : WARNA[sel], stroke: T.card, "stroke-width": 2, "data-tip": tipTeks }),
          teks(sx(v) + (v < a ? -10 : 10), cy, fmt(v), { fill: T.ink, tebal: k === 0, anchor: v < a ? "end" : "start" }));
      }
    });
  });
  g.append(s("circle", { cx: W - 170, cy: 40, r: 5, fill: T.card, stroke: T.ink2, "stroke-width": 2 }), teks(W - 160, 40, "kontrol", { fill: T.ink2, size: 12 }),
    s("circle", { cx: W - 90, cy: 40, r: 5, fill: T.ink2 }), teks(W - 80, 40, "EvoAug", { fill: T.ink2, size: 12 }));
  return g;
}

function tabelAblasi() {
  const met = S.metrik;
  const a = { HepG2: nilai("acuan", "HepG2", met), K562: nilai("acuan", "K562", met) };
  const d = (v) => h("td", { class: Math.abs(v) <= AMBANG ? "ka redup" : "ka", text: sfmt(v) });
  return h("div", {}, h("table", {},
    h("thead", {}, h("tr", {}, ["Perlakuan", "Komponen yang diubah"].map((t) => h("th", { text: t })),
      ["HepG2", "Δ", "K562", "Δ", "Tes MPAC HepG2", "Tes MPAC K562"].map((t) => h("th", { class: "ka", text: t })))),
    h("tbody", {}, S.meta.metrik.model.map((m) => {
      const acu = m.kunci === "acuan", vh = r3(m[S.target].HepG2[met]), vk = r3(m[S.target].K562[met]);
      return h("tr", {}, h("td", { text: m.label, class: acu ? "tebal" : null }), h("td", { text: acu ? "–" : m.komponen, style: { color: T.ink2 } }),
        h("td", { class: "ka", text: fmt(vh) }), acu ? h("td", { class: "ka redup", text: "–" }) : d(vh - a.HepG2),
        h("td", { class: "ka", text: fmt(vk) }), acu ? h("td", { class: "ka redup", text: "–" }) : d(vk - a.K562),
        h("td", { class: "ka", text: fmt(m.mpac.HepG2) }), h("td", { class: "ka", text: fmt(m.mpac.K562) }));
    }))),
  h("p", { class: "ket-bawah", text: `E · EvoAug dibanding kontrol 2 tahap: ${sfmt(nilai("E_evoaug", "HepG2", met) - nilai("E_kontrol", "HepG2", met))} (HepG2) dan `
    + `${sfmt(nilai("E_evoaug", "K562", met) - nilai("E_kontrol", "K562", met))} (K562). Tes MPAC = data uji asal model (in-distribution), Pearson, dari Ablasi.md.` }));
}

function renderAblasi() {
  return [
    kepala("Ablasi", "Satu komponen diubah per perlakuan. Korelasi pada 170.292 mutasi dari 128 elemen, satu seed.",
      seg([["pearson", "Pearson global"], ["median_pearson", "Median per elemen"]], S.metrik, (v) => { S.metrik = v; render(); }, "Ukuran"), segTarget()),
    kartu("Korelasi tiap perlakuan dibanding model acuan", "Garis hitam = model acuan 20 epoch. Pita abu = selisih ≤ 0,013 dari acuan (tidak disebut beda).", dotPlot()),
    h("div", { style: { marginTop: "16px" } }, kartu("Angka lengkap", "Selisih dihitung terhadap model acuan 20 epoch.", tabelAblasi())),
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
  const W = 600, H = 560, X0 = 54, Y0 = 16, PW = 530, PH = 480;
  const xlo = Math.min(0.5, Math.floor(Math.min(...titik.map((t) => t.b)) * 10) / 10);
  const ylo = Math.min(0, Math.floor(Math.min(...titik.map((t) => t.r)) * 10) / 10);
  const sx = skala(xlo, 1, X0, X0 + PW), sy = skala(ylo, 1, Y0 + PH, Y0);
  const g = svg(W, H, "Korelasi model per elemen dibanding batas atas");
  for (let t = xlo; t <= 1.0001; t += 0.1) g.append(garis(sx(t), Y0, sx(t), Y0 + PH), teks(sx(t), Y0 + PH + 14, fmt(t, 1), { anchor: "middle" }));
  for (let t = ylo; t <= 1.0001; t += 0.2) g.append(garis(X0, sy(t), X0 + PW, sy(t)), teks(X0 - 8, sy(t), fmt(t, 1), { anchor: "end" }));
  const d0 = Math.max(xlo, ylo);
  g.append(garis(sx(d0), sy(d0), sx(1), sy(1), T.ink2, 1.5, "5 4"), teks(sx(0.88), sy(0.94), "batas atas", { fill: T.ink2 }));
  const ada = S.cari && titik.some((t) => cocokCari(t.e));
  for (const t of titik) {
    const kena = cocokCari(t.e);
    const c = s("circle", { class: "mark", cx: sx(t.b), cy: sy(t.r), r: kena && ada ? 6 : 4, fill: WARNA[t.sel], stroke: kena && ada ? T.ink : T.card,
      "stroke-width": kena && ada ? 2 : 1, "fill-opacity": ada && !kena ? 0.15 : 0.85,
      "data-tip": `${t.e.nama} · ${LABEL[t.sel]}\nkorelasi ${fmt(t.r)} · batas ${fmt(t.b)}\njarak ${fmt(t.gap)}\nklik untuk membuka peta mutasi` });
    c.style.cursor = "pointer";
    c.addEventListener("click", () => kePeta(t.e.id, t.sel));
    g.append(c);
  }
  g.append(teks(X0 + PW / 2, H - 14, "Batas atas noise per elemen", { anchor: "middle" }));
  return g;
}

function histogram(titik) {
  const sels = S.filterSel === "semua" ? ["HepG2", "K562"] : [S.filterSel];
  const W = 1100, H = 150, LB = 0.05;
  const g = svg(W, H, "Sebaran jarak ke batas atas");
  const nb = Math.ceil(Math.max(...titik.map((t) => t.gap)) / LB) + 1;
  const bins = Object.fromEntries(sels.map((sel) => [sel, new Array(nb).fill(0)]));
  titik.forEach((t) => { bins[t.sel][Math.max(0, Math.floor(t.gap / LB))]++; });
  const mx = Math.max(...sels.flatMap((sel) => bins[sel]));
  const PW = sels.length === 2 ? 520 : 1080;
  sels.forEach((sel, i) => {
    const X = 10 + i * 560, BW = PW / nb, sy = skala(0, mx, 120, 26);
    g.append(s("circle", { cx: X + 4, cy: 8, r: 4, fill: WARNA[sel] }), teks(X + 14, 8, LABEL[sel], { fill: T.ink2, size: 12 }), garis(X, 120, X + PW, 120, T.axis));
    bins[sel].forEach((n, k) => {
      if (n) g.append(s("rect", { class: "mark", x: X + k * BW + 1, y: sy(n), width: BW - 2, height: 120 - sy(n), rx: 2, fill: WARNA[sel],
        "data-tip": `${LABEL[sel]} · jarak ${fmt(k * LB, 2)}–${fmt((k + 1) * LB, 2)}\n${n} elemen` }));
    });
    for (let t = 0; t <= nb * LB; t += 0.2) g.append(teks(X + (t / LB) * BW, 136, fmt(t, 1), { anchor: "middle" }));
  });
  return g;
}

function tabelElemen(titik) {
  const baris = titik.filter((t) => cocokCari(t.e)).sort((a, b) => b.gap - a.gap);
  return h("div", { class: "gulir" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Elemen" }), h("th", { text: "Sel" }), h("th", { class: "ka", text: "Korelasi" }), h("th", { class: "ka", text: "Batas" }), h("th", { text: "Jarak" }))),
    h("tbody", {}, baris.map((t) => h("tr", { class: "klik", tabindex: 0, onclick: () => kePeta(t.e.id, t.sel), onkeydown: (ev) => ev.key === "Enter" && kePeta(t.e.id, t.sel) },
      h("td", { text: t.e.nama }), h("td", {}, sw(t.sel)), h("td", { class: "ka", text: fmt(t.r) }), h("td", { class: "ka", text: fmt(t.b) }),
      h("td", {}, h("span", { class: "meter-mini", title: fmt(t.gap) }, h("i", { style: { width: `${Math.min(100, t.gap * 100)}%` } })), ` ${fmt(t.gap, 2)}`))))));
}

function renderElemen() {
  const titik = titikElemen();
  const gaps = (sel) => titik.filter((t) => t.sel === sel).map((t) => t.gap);
  const minTeks = ["HepG2", "K562"].filter((sel) => gaps(sel).length).map((sel) => `${fmt(Math.min(...gaps(sel)))} (${LABEL[sel]})`).join(" dan ");
  const lewat = titik.filter((t) => t.r > t.b).length;
  const selAktif = S.filterSel === "semua" ? ["HepG2", "K562"] : [S.filterSel];
  const kosong = S.meta.elemen.reduce((n, e) => n + selAktif.filter((sel) => e[sel][S.target].batas == null).length, 0);
  const catatMentah = S.target === "raw" ? ` Batas atas mentah per elemen (persamaan 16 Lage-Castellanos et al., 2019) bisa tidak stabil di tingkat elemen${kosong ? `; ${kosong} elemen tidak punya batas karena varians kesalahannya melebihi varians total` : ""}.` : "";
  const cari = h("input", { class: "cari", type: "search", placeholder: "Cari elemen, mis. 9:34988605", value: S.cari, "aria-label": "Cari elemen" });
  cari.addEventListener("input", () => { S.cari = cari.value; render(); const c = document.querySelector(".cari"); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } });
  return [
    kepala("Kinerja per elemen", `Korelasi model acuan tiap elemen dibanding batas atas noise-nya. ${lewat === 0 ? "Tidak ada elemen yang melewati batasnya." : `${lewat} elemen melewati batasnya.`}${catatMentah}`,
      cari, h("label", { class: "ket" }, "Lini sel"), seg([["semua", "Keduanya"], ["HepG2", "HepG2"], ["K562", "K562"]], S.filterSel, (v) => { S.filterSel = v; render(); }, "Lini sel"), segTarget()),
    h("div", { class: "kisi k-lebar" },
      kartu("Korelasi model vs batas atas", "Satu titik = satu elemen. Garis putus = korelasi sama dengan batas atas. Klik titik untuk peta mutasinya.",
        h("div", { class: "legenda" }, sw("HepG2"), sw("K562")), scatterElemen(titik)),
      kartu("Elemen dengan jarak terbesar", "Jarak = batas atas − korelasi model. Klik baris untuk membuka peta mutasinya.", tabelElemen(titik))),
    h("div", { style: { marginTop: "16px" } }, kartu("Sebaran jarak ke batas atas", `Jumlah elemen per selang jarak 0,05. Jarak terkecil ${minTeks}.`, histogram(titik))),
  ];
}

/* ---------- Peta mutasi ---------- */
function petaKisi(g, data, ref, vmax, y0, judul, label, X0 = 52, PW = 1040) {
  const L = ref.length || Math.max(...data.map((d) => d[0])), CW = PW / L, RHh = 15;
  g.append(teks(0, y0 - 18, judul, { fill: T.ink, size: 12, tebal: true }));
  const ramp = [...DIV.biru].reverse().concat([DIV.tengah], DIV.merah), lx = X0 + PW - ramp.length * 16;
  ramp.forEach((w, i) => g.append(s("rect", { x: lx + i * 16, y: y0 - 24, width: 16, height: 10, fill: w })));
  g.append(teks(lx - 6, y0 - 19, `−${fmt(vmax, 1)} turun`, { fill: T.ink2, anchor: "end" }), teks(X0 + PW, y0 - 5, `naik +${fmt(vmax, 1)}`, { fill: T.ink2, anchor: "end" }));
  "ACGT".split("").forEach((b, i) => g.append(teks(X0 - 14, y0 + i * (RHh + 2) + RHh / 2, b, { fill: T.ink2, anchor: "middle" })));
  for (const [pos, alt, v] of data) {
    const i = "ACGT".indexOf(alt);
    g.append(s("rect", { class: "mark", x: X0 + (pos - 1) * CW, y: y0 + i * (RHh + 2), width: CW + 0.15, height: RHh, fill: warnaDiv(v, vmax),
      "data-tip": `${ref[pos - 1] || "?"}${pos}${alt} · ${label}\n${sfmt(v)}` }));
  }
  for (let p = 1; p <= ref.length; p++) {
    const i = "ACGT".indexOf(ref[p - 1]);
    if (i < 0) continue;
    g.append(s("rect", { x: X0 + (p - 1) * CW, y: y0 + i * (RHh + 2), width: CW + 0.15, height: RHh, fill: T.card }),
      s("circle", { cx: X0 + (p - 0.5) * CW, cy: y0 + i * (RHh + 2) + RHh / 2, r: Math.min(1.3, CW / 3), fill: T.ink2 }));
  }
  return { CW, X0, L, bawah: y0 + 4 * (RHh + 2) };
}
const vmaxDari = (v) => { const a = v.filter((x) => x != null).map(Math.abs).sort((x, y) => x - y); return Math.max(0.1, Math.ceil(a[Math.floor(a.length * 0.98)] * 10) / 10); };

function sumbuPosisi(g, info, y) {
  const ticks = [1]; for (let t = 25; t < info.L; t += 25) ticks.push(t); ticks.push(info.L);
  ticks.forEach((t) => g.append(garis(info.X0 + (t - 0.5) * info.CW, y, info.X0 + (t - 0.5) * info.CW, y + 5, T.axis), teks(info.X0 + (t - 0.5) * info.CW, y + 16, String(t), { anchor: "middle" })));
  g.append(teks(info.X0 - 14, y + 16, "posisi", { anchor: "end" }));
}

function scatterPeta(d) {
  const pts = d.mutasi.filter((m) => m[2] != null);
  const W = 520, H = 372, X0 = 50, Y0 = 24, PW = 450, PH = 300;
  const xs = pts.map((p) => p[2]), ys = pts.map((p) => p[3]);
  const xa = Math.floor(Math.min(...xs)), xb = Math.ceil(Math.max(...xs)), ya = Math.floor(Math.min(...ys)), yb = Math.ceil(Math.max(...ys));
  const sx = skala(xa, xb, X0, X0 + PW), sy = skala(ya, yb, Y0 + PH, Y0);
  const g = svg(W, H, "Hasil ukur dibanding prediksi tiap mutasi");
  for (let t = xa; t <= xb; t++) g.append(garis(sx(t), Y0, sx(t), Y0 + PH, t === 0 ? T.axis : T.grid), teks(sx(t), Y0 + PH + 14, fmt(t, 1), { anchor: "middle" }));
  for (let t = ya; t <= yb; t++) g.append(garis(X0, sy(t), X0 + PW, sy(t), t === 0 ? T.axis : T.grid), teks(X0 - 8, sy(t), fmt(t, 1), { anchor: "end" }));
  for (const [pos, alt, o, p] of pts) g.append(s("circle", { class: "mark", cx: sx(o), cy: sy(p), r: 3, fill: WARNA[d.sel], "fill-opacity": 0.5,
    "data-tip": `${d.ref[pos - 1]}${pos}${alt}\nhasil ukur ${sfmt(o)} · prediksi ${sfmt(p)}` }));
  g.append(teks(X0 + PW / 2, H - 6, `Hasil ukur (${TARGET_KOLOM[d.target]})`, { anchor: "middle" }), teks(0, 6, "Prediksi"));
  return g;
}

function tabelEfekTerbesar(d) {
  const top = d.mutasi.filter((m) => m[2] != null).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2])).slice(0, 9);
  const vo = vmaxDari(d.mutasi.map((m) => m[2])), vp = vmaxDari(d.mutasi.map((m) => m[3]));
  const sel = (v, vm) => h("td", { class: "ka" }, h("span", { class: "kotak-warna", style: { background: warnaDiv(v, vm) } }), sfmt(v));
  return h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Mutasi" }), h("th", { class: "ka", text: "Hasil ukur" }), h("th", { class: "ka", text: "Prediksi" }), h("th", { text: "Arah" }))),
    h("tbody", {}, top.map(([pos, alt, o, p]) => h("tr", {}, h("td", { class: "tebal", text: `${d.ref[pos - 1]}${pos}${alt}` }), sel(o, vo), sel(p, vp),
      h("td", { text: (o > 0) === (p > 0) ? "sama" : "berlawanan", style: { color: (o > 0) === (p > 0) ? T.ink2 : T.ink } })))));
}

async function muatPeta() {
  const p = S.peta;
  const q = new URLSearchParams({ elemen: p.elemen, sel: p.sel, target: S.target });
  if (p.sat_ref) q.set("sat_ref", p.sat_ref);
  const r = await fetch(`/api/peta?${q}`);
  if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
  return r.json();
}

function renderPeta() {
  const p = S.peta;
  const pilihan = h("select", { class: "pilihan", "aria-label": "Elemen dan alel" });
  for (const e of S.meta.elemen) for (const a of e.alel) {
    const o = h("option", { value: `${e.id}|${a}` }, `${e.nama} · alel ${kodeAlel(a)}`);
    if (e.id === p.elemen && a === p.sat_ref) o.selected = true;
    pilihan.append(o);
  }
  pilihan.addEventListener("change", () => { [p.elemen, p.sat_ref] = pilihan.value.split("|"); render(); });
  const wadah = h("div", {}, h("p", { class: "memuat", text: "Memuat peta mutasi…" }));
  muatPeta().then((d) => {
    p.data = d;
    const W = 1104, g = svg(W, 300, "Peta efek per posisi dan basa pengganti");
    const vo = vmaxDari(d.mutasi.map((m) => m[2])), vp = vmaxDari(d.mutasi.map((m) => m[3]));
    petaKisi(g, d.mutasi.map((m) => [m[0], m[1], m[2]]), d.ref, vo, 40, `Hasil ukur Siraj (${TARGET_KOLOM[d.target]})`, "hasil ukur");
    const info = petaKisi(g, d.mutasi.map((m) => [m[0], m[1], m[3]]), d.ref, vp, 168, "Prediksi model acuan (selisih log2 aktivitas)", "prediksi");
    sumbuPosisi(g, info, info.bawah + 6);
    const jarak = d.batas_elemen != null ? d.batas_elemen - d.r_elemen : null;
    wadah.replaceChildren(
      h("div", { class: "kisi k4" },
        angka(`Mutasi tunggal (alel ${kodeAlel(d.sat_ref)})`, ribu(d.n_snv), `${ribu(d.n_alel)} pasangan pada alel ini`),
        angka(`Korelasi elemen (${d.alel.length} alel)`, fmt(d.r_elemen), `${ribu(d.n_elemen)} mutasi, ${LABEL[d.sel]}`),
        angka("Batas atas elemen", fmt(d.batas_elemen), TARGET_LABEL[d.target]),
        angka("Jarak ke batas atas", fmt(jarak), "batas atas − korelasi")),
      h("div", { style: { marginTop: "16px" } }, kartu("Efek per posisi dan basa pengganti",
        "Kotak putih bertitik = basa asli. Tiap peta memakai skalanya sendiri (simetris di sekitar 0). Arahkan kursor ke kotak untuk angkanya.", g)),
      h("div", { class: "kisi k2", style: { marginTop: "16px" } },
        kartu("Hasil ukur vs prediksi", `Satu titik = satu mutasi alel ${kodeAlel(d.sat_ref)} (${d.n_snv}). Korelasi alel ini ${fmt(d.r_alel)}.`, scatterPeta(d)),
        kartu("Mutasi dengan efek terukur terbesar", "Diurutkan menurut besar efek hasil ukur. Arah = tanda prediksi sama dengan hasil ukur.", tabelEfekTerbesar(d))));
  }).catch((err) => wadah.replaceChildren(h("p", { class: "pesan", text: `Gagal memuat peta: ${err.message}` })));
  return [
    kepala("Peta efek mutasi", "Efek tiap mutasi tunggal pada satu elemen: hasil ukur Siraj dan prediksi model acuan berdampingan.",
      pilihan, h("label", { class: "ket" }, "Lini sel"), seg([["HepG2", "HepG2"], ["K562", "K562"]], p.sel, (v) => { p.sel = v; render(); }, "Lini sel"), segTarget()),
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
  P.sedang = true; P.galat = ""; render();
  try {
    const r = await fetch("/api/prediksi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sekuens: c.sq }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || r.statusText);
    P.hasil = j;
    P.selPeta = ["HepG2", "K562", "SKNSH"].find((k) => P.sel[k]) || "HepG2";
  } catch (err) { P.galat = `Prediksi gagal: ${err.message}`; }
  P.sedang = false; render();
}

function pilihModel() {
  return h("div", { class: "kontrol" }, h("label", { class: "ket" }, "Model"),
    h("select", { class: "pilihan", "aria-label": "Model" }, h("option", {}, "Model acuan 20 epoch")));
}

function renderPrediksiMasukan() {
  const P = S.pred, c = cekSeq(P.seq);
  const ta = h("textarea", { class: `sekuens${P.seq && !c.ok ? " galat" : ""}`, spellcheck: "false", "aria-label": "Sekuens DNA", placeholder: "ACGT…" });
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
  const contoh = async () => { const r = await fetch("/api/contoh"); const j = await r.json(); P.seq = j.sekuens; render(); };
  const sels = ["HepG2", "K562", "SKNSH"];
  return [
    kepala("Prediksi efek mutasi", "Masukkan sekuens DNA regulatori. Model acuan memprediksi aktivitasnya dan efek tiap mutasi tunggal.", pilihModel()),
    kartu("Sekuens DNA", "Panjang 200 bp, sama dengan oligo MPRA (189–199 bp juga diterima, seperti alel delesi Siraj). Model menambah pengapit vektor sampai 600 bp. Hanya huruf A, C, G, T.",
      ta, status,
      h("div", { class: "baris-tombol" },
        h("button", { class: "tombol", type: "button", onclick: contoh }, "Pakai contoh dari Siraj"),
        h("button", { class: "tombol", type: "button", onclick: () => berkas.click() }, "Unggah FASTA"), berkas,
        h("button", { class: "tombol utama dorong", type: "button", disabled: P.sedang, onclick: jalankanPrediksi }, P.sedang ? "Memprediksi…" : "Prediksi")),
      P.sedang ? h("p", { class: "sedang", text: `Model memprediksi ${3 * c.sq.length} mutasi…` }) : null,
      P.galat ? h("p", { class: "pesan", text: P.galat }) : null),
    h("div", { class: "kisi k2", style: { marginTop: "16px" } },
      kartu("Lini sel yang ditampilkan", "Model punya tiga branch keluaran, satu per lini sel.",
        sels.map((k) => { const i = h("input", { type: "checkbox", checked: P.sel[k] }); i.addEventListener("change", () => { P.sel[k] = i.checked; }); return h("label", { class: "cek" }, i, sw(k)); })),
      kartu("Yang dihitung", null, h("ul", { class: "titik-daftar" },
        h("li", { text: "Aktivitas sekuens asli di tiap lini sel (log2FC aktivitas MPRA)." }),
        h("li", { text: "Efek tiap mutasi tunggal: setiap posisi × 3 basa pengganti." }),
        h("li", { text: "Efek = prediksi mutan − prediksi sekuens asli." }),
        h("li", { text: "Tanda bila sekuens sama dengan elemen Siraj, supaya bisa dicocokkan dengan hasil ukur." })))),
    h("div", { style: { marginTop: "16px" } }, kartu("Sebelum membaca hasil", null,
      h("p", { style: { color: T.ink2, lineHeight: 1.65 } }, "Hasil halaman ini adalah prediksi model, bukan hasil ukur laboratorium. Pada 128 elemen Siraj yang tidak pernah dipakai saat training, "
        + `korelasi prediksi dengan hasil ukur ${fmt(nilai("acuan", "HepG2", "pearson", "post"))} (HepG2) dan ${fmt(nilai("acuan", "K562", "pearson", "post"))} (K562), sedangkan batas atas noise data `
        + `${fmt(batas("HepG2", "post")[0])} dan ${fmt(batas("K562", "post")[0])}.`),
      h("p", { style: { color: T.ink2, marginTop: "10px" } }, "Artinya: hasil di halaman ini adalah petunjuk mutasi mana yang perlu diuji, bukan pengganti uji laboratorium."),
      h("p", { class: "ket-bawah", text: "Model: MPAC/Malinois (BassetBranched) dilatih ulang 20 epoch, satu seed." }))),
  ];
}

function petaPrediksi(hasil, sel) {
  const W = 1104, g = svg(W, 230, `Efek prediksi tiap mutasi, ${LABEL[sel]}`);
  const L = hasil.panjang, X0 = 52, PW = 1040, CW = PW / L;
  const mx = new Array(L + 1).fill(0);
  hasil.mutasi.forEach((m) => { mx[m.pos] = Math.max(mx[m.pos], Math.abs(m[sel])); });
  const top = Math.max(...mx);
  g.append(teks(0, 20, "pengaruh"), teks(0, 34, "posisi"), garis(X0, 72, X0 + PW, 72, T.axis));
  for (let p = 1; p <= L; p++) {
    const hh = (mx[p] / top) * 60;
    g.append(s("rect", { class: "mark", x: X0 + (p - 1) * CW + Math.min(0.6, CW * 0.12), y: 72 - hh, width: Math.max(0.5, CW - Math.min(1.2, CW * 0.24)), height: Math.max(hh, 0.5), rx: 1, fill: T.ink2,
      "data-tip": `posisi ${p} (${hasil.sekuens[p - 1]})\nefek terbesar ${fmt(mx[p])}` }));
  }
  const data = hasil.mutasi.map((m) => [m.pos, m.alt, m[sel]]);
  const vmax = vmaxDari(data.map((d) => d[2]));
  const info = petaKisi(g, data, hasil.sekuens, vmax, 110, "", `prediksi ${LABEL[sel]}`, X0, PW);
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
  const kartuPeta = kartu("Efek prediksi tiap mutasi", "Atas: pengaruh posisi = efek terbesar di posisi itu. Bawah: efek tiap basa pengganti; titik = basa asli.", petaPrediksi(R, P.selPeta));
  kartuPeta.querySelector("h2").after(h("div", { style: { position: "absolute", right: "20px", top: "16px" } },
    seg(tampil.map((k) => [k, LABEL[k]]), P.selPeta, (v) => { P.selPeta = v; render(); }, "Lini sel peta")));
  kartuPeta.style.position = "relative";
  const siraj = R.siraj && R.siraj.elemen ? S.meta.elemen.find((e) => e.id === R.siraj.elemen) : null;
  const s0 = R.sekuens;
  return [
    kepala("Prediksi efek mutasi", "Hasil prediksi model acuan untuk sekuens yang dimasukkan.", pilihModel()),
    h("div", { class: "ringkas-seq" }, h("span", { class: "ket", text: "Sekuens" }),
      h("code", { text: s0.length > 40 ? `${s0.slice(0, 24)}…${s0.slice(-12)}` : s0 }),
      h("span", { class: "ket", text: `${R.panjang} bp${siraj ? ` · sama dengan ${siraj.nama} alel ${kodeAlel(R.siraj.sat_ref)} (Siraj)` : " · tidak ada di data Siraj"}` }),
      h("button", { class: "tombol dorong", type: "button", onclick: () => { P.hasil = null; render(); } }, "Ubah sekuens")),
    h("div", { class: "kisi k4" },
      tampil.map((k) => h("div", { class: "kartu angka" }, h("p", { class: "label", text: "Aktivitas prediksi" }), h("p", { class: "nilai", text: fmt(R.induk[k]) }),
        h("p", { class: "catat" }, sw(k, `${LABEL[k]} · log2FC`)))),
      angka("Mutasi diprediksi", ribu(R.mutasi.length), `${R.panjang} posisi × 3 basa`)),
    h("div", { style: { marginTop: "16px" } }, kartuPeta),
    h("div", { class: "kisi k-tabel", style: { marginTop: "16px" } },
      kartu("Mutasi dengan efek prediksi terbesar", `Diurutkan menurut besar efek di ${LABEL[P.selPeta]}. Efek terbesar ${fmt(ukuran)}.`,
        h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Mutasi" }), tampil.map((k) => h("th", { class: "ka", text: LABEL[k] })))),
          h("tbody", {}, top.map((m) => h("tr", {}, h("td", { class: "tebal", text: `${m.ref}${m.pos}${m.alt}` }),
            tampil.map((k) => h("td", { class: "ka" }, h("span", { class: "kotak-warna", style: { background: warnaDiv(m[k], vmax) } }), sfmt(m[k]))))))),
        h("p", { class: "ket-bawah", text: "Efek = prediksi mutan − prediksi sekuens asli, dalam log2 aktivitas." })),
      kartu("Simpan dan bandingkan", null,
        h("div", { style: { display: "grid", gap: "10px" } },
          h("button", { class: "tombol penuh", type: "button", onclick: () => unduhCSV(R) }, `Unduh CSV (${ribu(R.mutasi.length)} baris)`),
          h("button", { class: "tombol penuh", type: "button", onclick: () => unduhPNG(kartuPeta) }, "Unduh peta (PNG)")),
        h("hr", { style: { border: 0, borderTop: "1px solid #e6e5df", margin: "18px 0" } }),
        siraj
          ? h("div", {}, h("p", { style: { color: T.ink2, lineHeight: 1.6 }, text: "Sekuens ini ada di data Siraj, jadi prediksinya bisa dicocokkan dengan hasil ukur." }),
            h("p", { style: { marginTop: "12px" } }, h("a", { class: "tautan", href: `#/peta?e=${encodeURIComponent(siraj.id)}&a=${encodeURIComponent(R.siraj.sat_ref)}&sel=${P.selPeta === "SKNSH" ? "HepG2" : P.selPeta}` }, "Buka di Peta mutasi →")))
          : h("p", { style: { color: T.ink2, lineHeight: 1.6 }, text: "Sekuens ini tidak ada di data Siraj, jadi belum ada hasil ukur pembanding." }),
        h("p", { class: "ket-bawah", style: { marginTop: "22px" }, text: `Prediksi model, bukan hasil ukur. Korelasi model acuan dengan hasil ukur Siraj ${fmt(nilai("acuan", "HepG2", "pearson", "post"))} (HepG2) dan ${fmt(nilai("acuan", "K562", "pearson", "post"))} (K562).` }))),
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
    fetch("/api/contoh").then((r) => r.json()).then((j) => { S.pred.seq = j.sekuens; jalankanPrediksi(); });
  }
  return hal;
}

let halSekarang = null;
function render() {
  const hal = rute(), isi = document.getElementById("isi");
  document.querySelectorAll("nav a").forEach((a) => (a.dataset.hal === hal ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = `${JUDUL[hal]} · Dashboard Efek Mutasi`;
  tip.hidden = true;
  const y = window.scrollY, sama = hal === halSekarang;
  isi.replaceChildren(...HAL[hal]());
  if (sama) window.scrollTo(0, y); else { window.scrollTo(0, 0); halSekarang = hal; }
}

window.addEventListener("hashchange", () => { halSekarang = null; render(); });
fetch("/api/meta").then((r) => r.json()).then((m) => {
  m.metrik.model.find((x) => x.kunci === "A").label = "A · 2 branch";
  m.metrik.model.find((x) => x.kunci === "F").label = "Eksperimen F · penyaringan label latih";
  S.meta = m; render();
})
  .catch((err) => document.getElementById("isi").replaceChildren(h("p", { class: "pesan", text: `Gagal memuat data: ${err.message}` })));
