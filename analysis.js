/* analysis.js — حسابات اللوحة (تعمل في المتصفح وفي Node للاختبار) */
(function (root) {
  "use strict";

  function flat(C) {
    var out = [];
    C.AXES.forEach(function (ax, ai) { ax.statements.forEach(function (t) { out.push({ text: t, axis: ai, axisKey: ax.key }); }); });
    return out;
  }
  function validRow(r, C) {
    if (!r || !Array.isArray(r.q) || r.q.length !== flat(C).length) return false;
    for (var i = 0; i < r.q.length; i++) { if (!(r.q[i] >= 1 && r.q[i] <= 5)) return false; }
    return !!r.role && !!r.stage;
  }
  function mean(arr) {
    var v = arr.filter(function (x) { return typeof x === "number" && isFinite(x); });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }
  function countBy(rows, key, list) {
    var o = {}; list.forEach(function (x) { o[x.code] = 0; });
    rows.forEach(function (r) { if (o[r[key]] != null) o[r[key]]++; });
    return o;
  }
  function countMulti(rows, key, list) {
    var o = {}; list.forEach(function (x) { o[x.code] = 0; });
    rows.forEach(function (r) { (r[key] || []).forEach(function (c) { if (o[c] != null) o[c]++; }); });
    return o;
  }

  /* role: رمز وظيفة للتصفية، أو "" للجميع */
  function compute(rows, C, role) {
    var all = (rows || []).filter(function (r) { return validRow(r, C); });
    var list = role ? all.filter(function (r) { return r.role === role; }) : all;
    var S = flat(C);

    var statements = S.map(function (s, i) {
      var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, vals = [];
      list.forEach(function (r) { counts[r.q[i]]++; vals.push(r.q[i]); });
      var n = vals.length;
      return { index: i, text: s.text, axis: s.axis, n: n, counts: counts, mean: mean(vals),
               highPct: n ? Math.round((counts[4] + counts[5]) / n * 100) : 0 };
    });
    var axes = C.AXES.map(function (ax, ai) {
      return { key: ax.key, label: ax.label, mean: mean(statements.filter(function (s) { return s.axis === ai; }).map(function (s) { return s.mean; })) };
    });
    var withData = statements.filter(function (s) { return s.mean != null; });
    var ranked = withData.slice().sort(function (a, b) { return b.mean - a.mean || b.highPct - a.highPct; });

    /* مقارنة الوظائف على المحاور (على كل الإجابات) */
    var byRole = C.ROLES.map(function (ro) {
      var rs = all.filter(function (r) { return r.role === ro.code; });
      return { code: ro.code, label: ro.label, n: rs.length,
        mean: rs.length ? mean(rs.map(function (r) { return mean(r.q); })) : null,
        axes: C.AXES.map(function (ax, ai) {
          var idx = []; S.forEach(function (s, i) { if (s.axis === ai) idx.push(i); });
          return rs.length ? mean(rs.map(function (r) { return mean(idx.map(function (i) { return r.q[i]; })); })) : null;
        }) };
    });

    var prefs = {};
    C.PREFS.forEach(function (p) { prefs[p.key] = p.multi ? countMulti(list, p.key, p.options) : countBy(list, p.key, p.options); });

    var days = {};
    list.forEach(function (r) { var d = String(r.t).slice(0, 10); days[d] = (days[d] || 0) + 1; });

    return {
      n: list.length, total: all.length, statements: statements, axes: axes, ranked: ranked,
      overallMean: list.length ? mean(list.map(function (r) { return mean(r.q); })) : null,
      urgentPct: list.length ? Math.round(list.filter(function (r) { return mean(r.q) >= 4; }).length / list.length * 100) : 0,
      roleCounts: countBy(list, "role", C.ROLES), stageCounts: countBy(list, "stage", C.STAGES),
      expCounts: countBy(list, "exp", C.EXPERIENCE), attCounts: countBy(list, "attended", C.ATTENDED),
      byRole: byRole, prefs: prefs,
      perDay: Object.keys(days).sort().map(function (d) { return { day: d, count: days[d] }; }),
      lastTime: list.length ? list.map(function (r) { return String(r.t); }).sort().pop() : ""
    };
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function labelMap(list) { var m = {}; list.forEach(function (x) { m[x.code] = x.label; }); return m; }

  function toCSV(rows, C) {
    var S = flat(C), L = { role: labelMap(C.ROLES), stage: labelMap(C.STAGES), exp: labelMap(C.EXPERIENCE), attended: labelMap(C.ATTENDED) };
    var PL = {}; C.PREFS.forEach(function (p) { PL[p.key] = labelMap(p.options); });
    var head = ["التاريخ", "الوظيفة", "المرحلة", "الخبرة", "برامج العام الماضي"]
      .concat(S.map(function (s, i) { return "ح" + (i + 1) + ": " + s.text; }))
      .concat(C.PREFS.map(function (p) { return p.label; }))
      .concat(C.OPEN_QUESTIONS.map(function (q) { return q.label; }));
    var lines = [head.map(csvCell).join(",")];
    (rows || []).filter(function (r) { return validRow(r, C); }).forEach(function (r) {
      var line = [r.t, L.role[r.role], L.stage[r.stage], L.exp[r.exp], L.attended[r.attended]].concat(r.q)
        .concat(C.PREFS.map(function (p) {
          var v = r[p.key]; v = Array.isArray(v) ? v : [v];
          return v.filter(Boolean).map(function (c) { return PL[p.key][c] || c; }).join("، ");
        }))
        .concat(C.OPEN_QUESTIONS.map(function (q, i) { return (r.open && r.open[i]) || ""; }));
      lines.push(line.map(csvCell).join(","));
    });
    return "﻿" + lines.join("\r\n");
  }

  var api = { flat: flat, validRow: validRow, compute: compute, toCSV: toCSV, mean: mean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SurveyAnalysis = api;
})(typeof window !== "undefined" ? window : this);
