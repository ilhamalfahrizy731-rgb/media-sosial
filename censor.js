// Sensor kata kasar. Tahan terhadap: leetspeak (m3m3k), huruf berulang (kontooool),
// pemisah (k.o.n.t.o.l / k o n t o l), huruf fullwidth/aksen/homoglyph Cyrillic, karakter tak terlihat (zero-width).
const fs = require('fs');
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '+': 't' };
const HOMO = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'і': 'i', 'ѕ': 's', 'ο': 'o' };
const INVISIBLE = /[\u0300-\u036f\u200b-\u200f\u2060\ufeff\u00ad]/g;
const isLetter = c => c >= 'a' && c <= 'z';

function createCensor(wordlistPath, censorChar = '*') {
  const words = fs.readFileSync(wordlistPath, 'utf8').split(/\r?\n/)
    .map(w => w.trim().toLowerCase()).filter(w => /^[a-z]+$/.test(w)).sort((a, b) => b.length - a.length);
  const pat = ws => ws.map(w => [...w].map(c => c + '+').join('')).join('|');
  const A = new RegExp(`(${pat(words)})(nya|lah|kah|an|in|mu|ku|e)?`, 'g');   // kata utuh (+ imbuhan)
  const longWords = words.filter(w => w.length >= 5);                         // kata panjang: cek juga versi berspasi
  const fold = w => w.replace(/(.)\1+/g, '$1');
  const B = longWords.length ? new RegExp(`(${longWords.map(fold).join('|')})`, 'g') : null;

  function normalize(chars) {
    const s = [], ci = [], real = [];
    chars.forEach((ch, i) => {
      for (let c of ch.normalize('NFKD').replace(INVISIBLE, '').toLowerCase()) {
        c = HOMO[c] || c;
        const o = LEET[c] || c;
        real.push(isLetter(c)); ci.push(i); s.push(o.length > 1 ? '\u0001' : o);
      }
    });
    return { s: s.join(''), ci, real };
  }

  function findRanges(chars) {
    const { s, ci, real } = normalize(chars), out = [];
    let m;
    // A: kata utuh, dibatasi batas kata. Angka hasil leetspeak tidak dihitung sebagai huruf,
    //    jadi "kontol1" tetap kena.
    A.lastIndex = 0;
    while ((m = A.exec(s))) {
      const st = m.index, wEnd = st + m[1].length, fEnd = st + m[0].length;
      const endOk = e => e >= s.length || !real[e];
      const end = endOk(fEnd) ? fEnd : endOk(wEnd) ? wEnd : -1;
      if ((!st || !real[st - 1]) && end > 0) { out.push([ci[st], ci[end - 1]]); A.lastIndex = end; }
      else A.lastIndex = st + 1;
    }
    // B: huruf dipisah titik/spasi/simbol (maks. 2 karakter antar huruf)
    if (B) {
      // huruf kembar yang menempel (oo) dilipat jadi satu; huruf yang dipisah simbol tidak dilipat,
      // supaya "memek, kontol" tidak saling menelan huruf k.
      const idx = [], idxEnd = []; let sq = '';
      for (let k = 0; k < s.length; k++) {
        if (!isLetter(s[k])) continue;
        if (sq && sq[sq.length - 1] === s[k] && idxEnd[idxEnd.length - 1] === k - 1) idxEnd[idxEnd.length - 1] = k;
        else { sq += s[k]; idx.push(k); idxEnd.push(k); }
      }
      B.lastIndex = 0;
      while ((m = B.exec(sq))) {
        const i0 = m.index, i1 = i0 + m[0].length - 1, a = idx[i0], b = idxEnd[i1];
        let gapOk = true;
        for (let j = i0 + 1; j <= i1; j++) if (idx[j] - idxEnd[j - 1] > 3) gapOk = false;
        if (gapOk && (!a || !real[a - 1]) && (b + 1 >= s.length || !real[b + 1])) out.push([ci[a], ci[b]]);
        else B.lastIndex = i0 + 1;
      }
    }
    return out;
  }

  function censor(text) {
    const chars = [...text];
    const rs = findRanges(chars).sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const r of rs) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]);
    }
    for (const [a, b] of merged) for (let i = a; i <= b; i++) chars[i] = censorChar;
    return { text: chars.join(''), count: merged.length };
  }
  return { censor, wordCount: words.length };
}
module.exports = { createCensor };