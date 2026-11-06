// ===== Adaptive learning engine + question generators =====
const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const NZ = (a, b) => { let n = 0; while (n === 0) n = R(a, b); return n; };
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n, d) => { const g = gcd(n, d); n /= g; d /= g; if (d < 0) { n = -n; d = -d; } return d === 1 ? `${n}` : `${n}/${d}`; };
const fracTex = s => (s.includes("/") ? `\\frac{${s.split("/")[0]}}{${s.split("/")[1]}}` : s);
const sg = n => (n < 0 ? `- ${-n}` : `+ ${n}`);
const par = n => (n < 0 ? `(${n})` : `${n}`);

// Each generator returns { ms, en, tex, answer, steps:[tex strings], hint:{ms,en}, type }
const TOPICS = [
  { id: "t1-integer", form: 1, ms: "Integer & Nombor Nisbah", en: "Integers & Rational Numbers", icon: "➕",
    gen(l) {
      if (l === 1) { const a = R(-20, 20), b = NZ(-20, 20);
        return { ms: "Hitung:", en: "Calculate:", tex: `${a} + ${par(b)}`, answer: a + b, steps: [`${a} + ${par(b)} = ${a + b}`], hint: { ms: "Tambah nombor negatif sama seperti menolak.", en: "Adding a negative is the same as subtracting." } }; }
      if (l === 2) { const a = R(-15, 15), b = NZ(-12, -1), c = NZ(-6, 6);
        return { ms: "Hitung:", en: "Calculate:", tex: `${a} - (${b}) \\times ${par(c)}`, answer: a - b * c, steps: [`${b} \\times ${par(c)} = ${b * c}`, `${a} - ${par(b * c)} = ${a - b * c}`], hint: { ms: "Darab dahulu, kemudian tolak. (−)(−) = (+).", en: "Multiply first, then subtract. (−)(−) = (+)." } }; }
      const a = R(2, 9), b = R(2, 6), c = R(1, 5), d = R(-9, 9);
      return { ms: "Hitung (ikut tertib operasi):", en: "Calculate (order of operations):", tex: `(${a} - ${b + a})^2 \\div ${b} + ${par(d)} \\times ${c}`, answer: (b * b) / b + d * c, steps: [`(${a} - ${a + b})^2 = (${-b})^2 = ${b * b}`, `${b * b} \\div ${b} = ${b}`, `${par(d)} \\times ${c} = ${d * c}`, `${b} + ${par(d * c)} = ${b + d * c}`], hint: { ms: "Kurungan → kuasa → darab/bahagi → tambah/tolak.", en: "Brackets → powers → multiply/divide → add/subtract." } };
    } },
  { id: "t1-fraction", form: 1, ms: "Pecahan", en: "Fractions", icon: "½",
    gen(l) {
      if (l === 1) { const d = R(3, 12), a = R(1, d - 1), b = R(1, d - 1);
        return { ms: "Hitung dan ringkaskan:", en: "Calculate and simplify:", tex: `\\frac{${a}}{${d}} + \\frac{${b}}{${d}}`, answer: frac(a + b, d), steps: [`\\frac{${a}+${b}}{${d}} = ${fracTex(frac(a + b, d))}`], hint: { ms: "Penyebut sama – tambah pengangka sahaja.", en: "Same denominator – add the numerators only." } }; }
      if (l === 2) { const d1 = R(2, 6), d2 = R(2, 7), a = R(1, d1), b = R(1, d2); const L = d1 * d2 / gcd(d1, d2);
        return { ms: "Hitung dan ringkaskan:", en: "Calculate and simplify:", tex: `\\frac{${a}}{${d1}} + \\frac{${b}}{${d2}}`, answer: frac(a * d2 + b * d1, d1 * d2), steps: [`\\text{GSTK/LCM} = ${L}`, `\\frac{${a * L / d1}}{${L}} + \\frac{${b * L / d2}}{${L}} = \\frac{${a * L / d1 + b * L / d2}}{${L}}`, `= ${fracTex(frac(a * d2 + b * d1, d1 * d2))}`], hint: { ms: "Samakan penyebut dengan GSTK dahulu. Jangan tambah penyebut!", en: "Find a common denominator (LCM) first. Don't add denominators!" } }; }
      const a = R(1, 8), b = R(2, 9), c = R(1, 8), d = R(2, 9);
      return { ms: "Hitung dan ringkaskan:", en: "Calculate and simplify:", tex: `\\frac{${a}}{${b}} \\div \\frac{${c}}{${d}}`, answer: frac(a * d, b * c), steps: [`\\frac{${a}}{${b}} \\times \\frac{${d}}{${c}} = \\frac{${a * d}}{${b * c}}`, `= ${fracTex(frac(a * d, b * c))}`], hint: { ms: "Bahagi pecahan = darab dengan salingan (terbalikkan pecahan kedua).", en: "Dividing fractions = multiply by the reciprocal." } };
    } },
  { id: "t1-algebra", form: 1, ms: "Ungkapan Algebra", en: "Algebraic Expressions", icon: "𝑥",
    gen(l) {
      if (l === 1) { const a = R(2, 9), b = R(-9, 9), x = R(1, 6);
        return { ms: `Cari nilai jika x = ${x}:`, en: `Find the value when x = ${x}:`, tex: `${a}x ${sg(b)}`, answer: a * x + b, steps: [`${a}(${x}) ${sg(b)} = ${a * x + b}`], hint: { ms: "Gantikan x dengan nombor itu.", en: "Substitute x with the number." } }; }
      if (l === 2) { const a = R(2, 9), b = R(2, 9), c = R(1, 9);
        return { ms: "Ringkaskan. Apakah pekali x?", en: "Simplify. What is the coefficient of x?", tex: `${a}x + ${b}y - ${c}x + ${b}x`, answer: a - c + b, steps: [`(${a} - ${c} + ${b})x + ${b}y = ${a - c + b}x + ${b}y`], hint: { ms: "Kumpul sebutan serupa (semua x bersama).", en: "Group like terms (all x together)." } }; }
      const a = R(2, 6), b = R(1, 7), c = R(2, 5), d = R(1, 7);
      return { ms: "Kembangkan dan ringkaskan. Apakah sebutan pemalar (tanpa x)?", en: "Expand and simplify. What is the constant term?", tex: `${a}(x + ${b}) - ${c}(x - ${d})`, answer: a * b + c * d, steps: [`${a}x + ${a * b} - ${c}x + ${c * d}`, `= ${a - c}x + ${a * b + c * d}`], hint: { ms: "Negatif di luar kurungan menukar SEMUA tanda: −c(x − d) = −cx + cd.", en: "A negative outside brackets changes ALL signs: −c(x − d) = −cx + cd." } };
    } },
  { id: "t1-linear", form: 1, ms: "Persamaan Linear", en: "Linear Equations", icon: "⚖️",
    gen(l) {
      const x = R(-6, 9);
      if (l === 1) { const b = NZ(-12, 12);
        return { ms: "Selesaikan, cari x:", en: "Solve for x:", tex: `x ${sg(b)} = ${x + b}`, answer: x, steps: [`x = ${x + b} ${sg(-b)}`, `x = ${x}`], hint: { ms: "Pindahkan nombor ke sebelah kanan – tanda bertukar.", en: "Move the number to the right side – the sign changes." } }; }
      if (l === 2) { const a = R(2, 9), b = NZ(-15, 15);
        return { ms: "Selesaikan, cari x:", en: "Solve for x:", tex: `${a}x ${sg(b)} = ${a * x + b}`, answer: x, steps: [`${a}x = ${a * x + b} ${sg(-b)} = ${a * x}`, `x = \\frac{${a * x}}{${a}} = ${x}`], hint: { ms: "Langkah 1: pindah pemalar. Langkah 2: bahagi dengan pekali x.", en: "Step 1: move the constant. Step 2: divide by the coefficient of x." } }; }
      const a = R(4, 9), c = R(1, a - 1), b = R(-10, 10), d = (a - c) * x + b;
      return { ms: "Selesaikan, cari x:", en: "Solve for x:", tex: `${a}x ${sg(b)} = ${c}x ${sg(d)}`.replace("+ 0", ""), answer: x, steps: [`${a}x - ${c}x = ${d} ${sg(-b)}`, `${a - c}x = ${d - b}`, `x = ${x}`], hint: { ms: "Kumpul sebutan x di kiri dan nombor di kanan.", en: "Collect x terms on the left and numbers on the right." } };
    } },
  { id: "t2-pattern", form: 2, ms: "Pola & Jujukan", en: "Patterns & Sequences", icon: "🔢",
    gen(l) {
      const a = R(-5, 12), d = NZ(-6, 8), s = [0, 1, 2, 3].map(i => a + i * d).join(",\\ ");
      if (l === 1) return { ms: "Apakah sebutan seterusnya?", en: "What is the next term?", tex: `${s},\\ \\dots`, answer: a + 4 * d, steps: [`d = ${a + d} - ${par(a)} = ${d}`, `${a + 3 * d} ${sg(d)} = ${a + 4 * d}`], hint: { ms: "Cari beza antara dua sebutan berturutan.", en: "Find the difference between consecutive terms." } };
      const n = R(8, 25);
      if (l === 2) return { ms: `Cari sebutan ke-${n}, T${n}:`, en: `Find the ${n}th term, T${n}:`, tex: `${s},\\ \\dots`, answer: a + (n - 1) * d, steps: [`T_n = a + (n-1)d`, `T_{${n}} = ${a} + (${n - 1})(${d}) = ${a + (n - 1) * d}`], hint: { ms: "Guna Tn = a + (n − 1)d. Ingat: (n − 1), bukan n.", en: "Use Tn = a + (n − 1)d. Remember: (n − 1), not n." } };
      const t = a + (n - 1) * d;
      return { ms: `Sebutan ke berapakah bernilai ${t}?`, en: `Which term has the value ${t}?`, tex: `${s},\\ \\dots`, answer: n, steps: [`${a} + (n-1)(${d}) = ${t}`, `n - 1 = ${n - 1}`, `n = ${n}`], hint: { ms: "Bentuk persamaan a + (n − 1)d = nilai, kemudian selesaikan n.", en: "Form a + (n − 1)d = value, then solve for n." } };
    } },
  { id: "t2-factor", form: 2, ms: "Pemfaktoran", en: "Factorisation", icon: "🧩",
    gen(l) {
      if (l === 1) { const k = R(2, 9), p = R(2, 7), q = R(1, 9);
        if (gcd(p, q) !== 1) return this.gen(1);
        return { ms: "Cari nilai k (FSTB):", en: "Find k (HCF):", tex: `${k * p}x + ${k * q} = k(${p}x + ${q})`, answer: k, steps: [`\\text{FSTB}(${k * p}, ${k * q}) = ${k}`], hint: { ms: "Cari faktor sepunya terbesar bagi kedua-dua sebutan.", en: "Find the highest common factor of both terms." } }; }
      if (l === 2) { const p = NZ(-7, 7), q = NZ(-7, 7);
        return { ms: "Cari nilai q:", en: "Find q:", tex: `x^2 ${sg(p + q)}x ${sg(p * q)} = (x ${sg(p)})(x + q)`.replace("+ 0x", ""), answer: q, steps: [`p \\times q = ${p * q},\\ p + q = ${p + q}`, `q = ${q}`], hint: { ms: "Cari dua nombor: hasil darab = pemalar, hasil tambah = pekali x.", en: "Find two numbers: product = constant, sum = coefficient of x." } }; }
      const a = R(30, 99), b = R(1, a - 1);
      return { ms: "Hitung tanpa kalkulator (guna a² − b²):", en: "Calculate without a calculator (use a² − b²):", tex: `${a}^2 - ${b}^2`, answer: a * a - b * b, steps: [`(${a} + ${b})(${a} - ${b})`, `= ${a + b} \\times ${a - b} = ${a * a - b * b}`], hint: { ms: "a² − b² = (a + b)(a − b).", en: "a² − b² = (a + b)(a − b)." } };
    } },
  { id: "t2-circle", form: 2, ms: "Pythagoras & Bulatan", en: "Pythagoras & Circles", icon: "⭕",
    gen(l) {
      const tr = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]][R(0, 5)];
      if (l === 1) return { ms: "Segi tiga bersudut tegak. Cari hipotenus c:", en: "Right-angled triangle. Find the hypotenuse c:", tex: `a = ${tr[0]},\\ b = ${tr[1]}`, answer: tr[2], steps: [`c^2 = ${tr[0]}^2 + ${tr[1]}^2 = ${tr[2] ** 2}`, `c = \\sqrt{${tr[2] ** 2}} = ${tr[2]}`], hint: { ms: "c² = a² + b², kemudian punca kuasa dua.", en: "c² = a² + b², then square root." } };
      if (l === 2) return { ms: "Cari sisi b:", en: "Find side b:", tex: `c = ${tr[2]},\\ a = ${tr[0]}`, answer: tr[1], steps: [`b^2 = ${tr[2]}^2 - ${tr[0]}^2 = ${tr[1] ** 2}`, `b = ${tr[1]}`], hint: { ms: "Untuk sisi pendek: b² = c² − a².", en: "For a shorter side: b² = c² − a²." } };
      const r = 7 * R(1, 4);
      return { ms: "Cari luas bulatan (π = 22/7), dalam cm²:", en: "Find the area of the circle (π = 22/7), in cm²:", tex: `j = ${r}\\text{ cm}`, answer: (22 * r * r) / 7, steps: [`A = \\pi j^2 = \\frac{22}{7} \\times ${r}^2`, `= ${(22 * r * r) / 7}\\text{ cm}^2`], hint: { ms: "Luas = πj². Kuasa duakan jejari dahulu.", en: "Area = πr². Square the radius first." } };
    } },
  { id: "t3-index", form: 3, ms: "Indeks", en: "Indices", icon: "²",
    gen(l) {
      if (l === 1) { const m = R(2, 9), n = R(2, 9);
        return { ms: "Cari nilai n:", en: "Find n:", tex: `a^{${m}} \\times a^{${n}} = a^{n}`, answer: m + n, steps: [`a^{${m}+${n}} = a^{${m + n}}`], hint: { ms: "Darab asas sama → TAMBAH indeks.", en: "Multiply same base → ADD the indices." } }; }
      if (l === 2) { const m = R(2, 5), n = R(2, 4), k = R(1, 9);
        return { ms: "Cari nilai n:", en: "Find n:", tex: `(a^{${m}})^{${n}} \\div a^{${k}} = a^{n}`, answer: m * n - k, steps: [`a^{${m * n}} \\div a^{${k}}`, `= a^{${m * n}-${k}} = a^{${m * n - k}}`], hint: { ms: "Kuasa bagi kuasa → darab. Bahagi → tolak.", en: "Power of a power → multiply. Divide → subtract." } }; }
      const [b, r] = [[8, 2], [27, 3], [64, 4], [125, 5], [16, 2]][R(0, 4)]; const p = R(1, 3) === 1 ? 1 : 2; const root = b === 16 ? 4 : 3;
      return { ms: "Hitung:", en: "Evaluate:", tex: `${b}^{\\frac{${p}}{${root}}}`, answer: r ** p, steps: [`(\\sqrt[${root}]{${b}})^{${p}}`, `= ${r}^{${p}} = ${r ** p}`], hint: { ms: "a^(m/n) = (punca kuasa n bagi a)^m.", en: "a^(m/n) = (nth root of a)^m." } };
    } },
  { id: "t3-standard", form: 3, ms: "Bentuk Piawai", en: "Standard Form", icon: "🔬",
    gen(l) {
      const A = R(11, 99) / 10;
      if (l === 1) { const n = R(3, 7), N = Math.round(A * 10 ** n);
        return { ms: "Tulis dalam bentuk piawai. Cari n:", en: "Write in standard form. Find n:", tex: `${N.toLocaleString("en").replace(/,/g, "\\ ")} = ${A} \\times 10^{n}`, answer: n, steps: [`\\text{Titik perpuluhan bergerak } ${n} \\text{ tempat ke kiri}`, `n = ${n}`], hint: { ms: "Kira berapa tempat titik perpuluhan bergerak.", en: "Count how many places the decimal point moves." } }; }
      if (l === 2) { const n = R(2, 6), N = (A / 10 ** n).toFixed(n + 1);
        return { ms: "Tulis dalam bentuk piawai. Cari n:", en: "Write in standard form. Find n:", tex: `${N} = ${A} \\times 10^{n}`, answer: -n, steps: [`\\text{Nombor} < 1 \\Rightarrow n \\text{ negatif}`, `n = ${-n}`], hint: { ms: "Nombor kurang daripada 1 → indeks negatif.", en: "Numbers less than 1 → negative index." } }; }
      const a = R(1, 3), b = R(1, 3), m = R(2, 8), n = R(-5, 6);
      return { ms: "Hitung. Jawapan = A × 10ⁿ, cari n:", en: "Calculate. Answer = A × 10ⁿ, find n:", tex: `(${a} \\times 10^{${m}}) \\times (${b} \\times 10^{${n}})`, answer: m + n, steps: [`(${a} \\times ${b}) \\times 10^{${m} + ${par(n)}}`, `= ${a * b} \\times 10^{${m + n}}`], hint: { ms: "Darab nombor A, tambah indeks 10.", en: "Multiply the A values, add the powers of 10." } };
    } },
  { id: "t3-inequality", form: 3, ms: "Ketaksamaan Linear", en: "Linear Inequalities", icon: "≶",
    gen(l) {
      const x = R(-6, 9), sym = ["<", ">", "≤", "≥"][R(0, 3)], flip = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
      const texS = s => ({ "≤": "\\le", "≥": "\\ge" }[s] || s);
      if (l === 1) { const b = NZ(-9, 9);
        return { ms: "Selesaikan (contoh jawapan: x > 3):", en: "Solve (answer format: x > 3):", tex: `x ${sg(b)} ${texS(sym)} ${x + b}`, answer: `x${sym}${x}`, type: "ineq", steps: [`x ${texS(sym)} ${x + b} ${sg(-b)}`, `x ${texS(sym)} ${x}`], hint: { ms: "Selesaikan seperti persamaan linear.", en: "Solve like a linear equation." } }; }
      const a = l === 2 ? R(2, 6) : -R(2, 6), b = R(-9, 9), s2 = a < 0 ? flip[sym] : sym;
      return { ms: "Selesaikan (contoh jawapan: x ≤ -2):", en: "Solve (answer format: x ≤ -2):", tex: `${a}x ${sg(b)} ${texS(sym)} ${a * x + b}`.replace("+ 0 ", ""), answer: `x${s2}${x}`, type: "ineq", steps: [`${a}x ${texS(sym)} ${a * x}`, a < 0 ? `\\text{Bahagi dengan nombor negatif} \\Rightarrow \\text{terbalikkan simbol}` : `\\text{Bahagi dengan } ${a}`, `x ${texS(s2)} ${x}`], hint: { ms: "Jika bahagi dengan nombor NEGATIF, terbalikkan simbol!", en: "If you divide by a NEGATIVE number, flip the symbol!" } };
    } },
];

// ===== Answer checking =====
function parseNum(s) {
  s = String(s).trim().replace(/\s+/g, "").replace(",", ".").replace("−", "-");
  if (/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/.test(s)) { const [a, b] = s.split("/").map(Number); return a / b; }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return NaN;
}
function checkAnswer(q, input) {
  if (q.type === "ineq") {
    const norm = v => String(v).toLowerCase().replace(/\s+/g, "").replace("<=", "≤").replace(">=", "≥").replace("−", "-");
    return norm(input) === norm(q.answer);
  }
  const u = parseNum(input), c = parseNum(q.answer);
  return !isNaN(u) && Math.abs(u - c) < 1e-6;
}

// ===== Mastery model (rule-based adaptive learning) =====
// 3 correct in a row → level up; 2 wrong in a row → level down.
function topicState(store, id) {
  return (store.topics[id] ||= { level: 1, streak: 0, wrong: 0, correct: 0, total: 0, mastered: false });
}
function mastery(st) {
  if (!st || st.total === 0) return 0;
  if (st.mastered) return 100;
  return Math.min(99, Math.round(((st.level - 1) * 3 + Math.min(st.streak, 3)) / 9 * 100));
}
function recordAnswer(store, id, ok) {
  const st = topicState(store, id); let event = null;
  st.total++;
  if (ok) {
    st.correct++; st.streak++; st.wrong = 0;
    if (st.streak >= 3) {
      if (st.level < 3) { st.level++; st.streak = 0; event = "up"; }
      else if (!st.mastered) { st.mastered = true; event = "mastered"; }
    }
  } else {
    st.streak = 0; st.wrong++;
    if (st.wrong >= 2 && st.level > 1) { st.level--; st.wrong = 0; event = "down"; }
  }
  return event;
}
