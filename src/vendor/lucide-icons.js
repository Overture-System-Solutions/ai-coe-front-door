// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
const O = (...e) =>
    e
      .filter((e, t, n) => Boolean(e) && "" !== e.trim() && n.indexOf(e) === t)
      .join(" ")
      .trim(),
  w = (e) => {
    const t = ((e) =>
      e.replace(/^([A-Z])|[\s-_]+(\w)/g, (e, t, n) =>
        n ? n.toUpperCase() : t.toLowerCase(),
      ))(e);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
var E = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const A = (e) => {
    for (const t in e)
      if (t.startsWith("aria-") || "role" === t || "title" === t) return !0;
    return !1;
  },
  L = (0, u.createContext)({}),
  k = (0, u.forwardRef)(
    (
      {
        color: e,
        size: t,
        strokeWidth: n,
        absoluteStrokeWidth: a,
        className: i = "",
        children: r,
        iconNode: o,
        ...s
      },
      c,
    ) => {
      const {
          size: d = 24,
          strokeWidth: l = 2,
          absoluteStrokeWidth: f = !1,
          color: p = "currentColor",
          className: m = "",
        } = (0, u.useContext)(L) ?? {},
        _ = (a ?? f) ? (24 * Number(n ?? l)) / Number(t ?? d) : (n ?? l);
      return (0, u.createElement)(
        "svg",
        {
          ref: c,
          ...E,
          width: t ?? d ?? E.width,
          height: t ?? d ?? E.height,
          stroke: e ?? p,
          strokeWidth: _,
          className: O("lucide", m, i),
          ...(!r && !A(s) && { "aria-hidden": "true" }),
          ...s,
        },
        [
          ...o.map(([e, t]) => (0, u.createElement)(e, t)),
          ...(Array.isArray(r) ? r : [r]),
        ],
      );
    },
  ),
  M = (e, t) => {
    const n = (0, u.forwardRef)(({ className: n, ...a }, i) => {
      return (0, u.createElement)(k, {
        ref: i,
        iconNode: t,
        className: O(
          `lucide-${((r = w(e)), r.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())}`,
          `lucide-${e}`,
          n,
        ),
        ...a,
      });
      var r;
    });
    return ((n.displayName = w(e)), n);
  },
  P = M("lightbulb", [
    [
      "path",
      {
        d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
        key: "1gvzjb",
      },
    ],
    ["path", { d: "M9 18h6", key: "x1upvd" }],
    ["path", { d: "M10 22h4", key: "ceow96" }],
  ]),
  T = M("circle-question-mark", [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", key: "1u773s" }],
    ["path", { d: "M12 17h.01", key: "p32p05" }],
  ]),
  U = M("users", [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
    ["path", { d: "M16 3.128a4 4 0 0 1 0 7.744", key: "16gr8j" }],
    ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
    ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ]),
  F = M("graduation-cap", [
    [
      "path",
      {
        d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
        key: "j76jl0",
      },
    ],
    ["path", { d: "M22 10v6", key: "1lu8f3" }],
    ["path", { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5", key: "1r8lef" }],
  ]),
  H = M("message-square", [
    [
      "path",
      {
        d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
        key: "18887p",
      },
    ],
  ]),
  R = M("info", [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "M12 16v-4", key: "1dtifu" }],
    ["path", { d: "M12 8h.01", key: "e9boi3" }],
  ]),
  N = M("check", [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]]),
  B = M("circle-check", [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }],
  ]),
  j = M("copy", [
    [
      "rect",
      {
        width: "14",
        height: "14",
        x: "8",
        y: "8",
        rx: "2",
        ry: "2",
        key: "17jyea",
      },
    ],
    [
      "path",
      {
        d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
        key: "zix9uf",
      },
    ],
  ]),
  V = M("download", [
    ["path", { d: "M12 15V3", key: "m9g1x1" }],
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
    ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }],
  ]),
  z = M("rotate-ccw", [
    [
      "path",
      { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" },
    ],
    ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ]),
  G = M("save", [
    [
      "path",
      {
        d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
        key: "1c8476",
      },
    ],
    ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", key: "1ydtos" }],
    ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7", key: "t51u73" }],
  ]),
  K = M("chevron-left", [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]]),
  W = M("chevron-right", [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]]),
  q = M("refresh-cw", [
    [
      "path",
      {
        d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
        key: "v9h5vc",
      },
    ],
    ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
    [
      "path",
      {
        d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
        key: "3uifl3",
      },
    ],
    ["path", { d: "M8 16H3v5", key: "1cv678" }],
  ]),
  Q = M("inbox", [
    [
      "polyline",
      { points: "22 12 16 12 14 15 10 15 8 12 2 12", key: "o97t9d" },
    ],
    [
      "path",
      {
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        key: "oot6mr",
      },
    ],
  ]),
  Y = M("clock-3", [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "M12 6v6h4", key: "135r8i" }],
  ]),
  J = M("shield-alert", [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
        key: "oel41y",
      },
    ],
    ["path", { d: "M12 8v4", key: "1got3b" }],
    ["path", { d: "M12 16h.01", key: "1drbdi" }],
  ]),
  X = M("search", [
    ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
    ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
  ]),
  Z = M("layout-dashboard", [
    [
      "rect",
      { width: "7", height: "9", x: "3", y: "3", rx: "1", key: "10lvy0" },
    ],
    [
      "rect",
      { width: "7", height: "5", x: "14", y: "3", rx: "1", key: "16une8" },
    ],
    [
      "rect",
      { width: "7", height: "9", x: "14", y: "12", rx: "1", key: "1hutg5" },
    ],
    [
      "rect",
      { width: "7", height: "5", x: "3", y: "16", rx: "1", key: "ldoo1y" },
    ],
  ]),
  $ = M("x", [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }],
  ]),
  ee = M("external-link", [
    ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
    ["path", { d: "M10 14 21 3", key: "gplh6r" }],
    [
      "path",
      {
        d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
        key: "a6xqqp",
      },
    ],
  ]),
  te = M("arrow-right", [
    ["path", { d: "M5 12h14", key: "1ays0h" }],
    ["path", { d: "m12 5 7 7-7 7", key: "xquz4c" }],
  ]),
  ne = M("shield-check", [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
        key: "oel41y",
      },
    ],
    ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }],
  ]),
  ae = M("briefcase-business", [
    ["path", { d: "M12 12h.01", key: "1mp3jc" }],
    ["path", { d: "M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2", key: "1ksdt3" }],
    ["path", { d: "M22 13a18.15 18.15 0 0 1-20 0", key: "12hx5q" }],
    [
      "rect",
      { width: "20", height: "14", x: "2", y: "6", rx: "2", key: "i6l2r4" },
    ],
  ]),
  ie = M("calendar-days", [
    ["path", { d: "M8 2v3", key: "1ioesn" }],
    ["path", { d: "M16 2v3", key: "otl347" }],
    [
      "rect",
      { x: "3", y: "3", width: "18", height: "18", rx: "2", key: "h1oib" },
    ],
    ["path", { d: "M3 9h18", key: "1pudct" }],
    ["path", { d: "M8 13h.01", key: "1sbv64" }],
    ["path", { d: "M12 13h.01", key: "y0uutt" }],
    ["path", { d: "M16 13h.01", key: "wip0gl" }],
    ["path", { d: "M8 17h.01", key: "p3bg7i" }],
    ["path", { d: "M12 17h.01", key: "p32p05" }],
    ["path", { d: "M16 17h.01", key: "ql8jdd" }],
  ]);
