// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var o,
  s,
  l,
  u = c(959),
  f = c.n(u),
  p = c(398),
  m = c(676),
  _ = c(642),
  h = c(408),
  b = function () {
    return (
      (b =
        Object.assign ||
        function (e) {
          for (var t, n = 1, a = arguments.length; n < a; n++)
            for (var i in (t = arguments[n]))
              Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i]);
          return e;
        }),
      b.apply(this, arguments)
    );
  },
  g = "undefined" == typeof window ? c.g : window,
  v = g && g.CSPSettings && g.CSPSettings.nonce,
  y =
    ((l = g.__themeState__ || {
      theme: void 0,
      lastStyleElement: void 0,
      registeredStyles: [],
    }).runState ||
      (l = b(b({}, l), {
        perf: { count: 0, duration: 0 },
        runState: { flushTimer: 0, mode: 0, buffer: [] },
      })),
    l.registeredThemableStyles ||
      (l = b(b({}, l), { registeredThemableStyles: [] })),
    (g.__themeState__ = l),
    l),
  S =
    /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g,
  D = function () {
    return "undefined" != typeof performance && performance.now
      ? performance.now()
      : Date.now();
  };
function I(e) {
  var t = D();
  e();
  var n = D();
  y.perf.duration += n - t;
}
function x(e, t) {
  y.loadStyles
    ? y.loadStyles(C(e).styleString, e)
    : (function (e) {
        if ("undefined" != typeof document) {
          var t = document.getElementsByTagName("head")[0],
            n = document.createElement("style"),
            a = C(e),
            i = a.styleString,
            r = a.themable;
          (n.setAttribute("data-load-themed-styles", "true"),
            v && n.setAttribute("nonce", v),
            n.appendChild(document.createTextNode(i)),
            y.perf.count++,
            t.appendChild(n));
          var o = document.createEvent("HTMLEvents");
          (o.initEvent("styleinsert", !0, !1),
            (o.args = { newStyle: n }),
            document.dispatchEvent(o));
          var s = { styleElement: n, themableStyle: e };
          r ? y.registeredThemableStyles.push(s) : y.registeredStyles.push(s);
        }
      })(e);
}
function C(e) {
  var t = y.theme,
    n = !1;
  return {
    styleString: (e || [])
      .map(function (e) {
        var a = e.theme;
        if (a) {
          n = !0;
          var i = t ? t[a] : void 0,
            r = e.defaultValue || "inherit";
          return (t && !i && console, i || r);
        }
        return e.rawString;
      })
      .join(""),
    themable: n,
  };
}
((o =
  ".aiCoeFrontDoor_e1833fe9{color:var(--bodyText);min-height:100%}.signedInUser_e1833fe9{clip:rect(0,0,0,0);border:0;height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;white-space:nowrap;width:1px}"),
  void 0 === (s = !0) && (s = !1),
  I(function () {
    var e = Array.isArray(o)
        ? o
        : (function (e) {
            var t = [];
            if (e) {
              for (var n = 0, a = void 0; (a = S.exec(e)); ) {
                var i = a.index;
                (i > n && t.push({ rawString: e.substring(n, i) }),
                  t.push({ theme: a[1], defaultValue: a[2] }),
                  (n = S.lastIndex));
              }
              t.push({ rawString: e.substring(n) });
            }
            return t;
          })(o),
      t = y.runState,
      n = t.mode,
      a = t.buffer,
      i = t.flushTimer;
    s || 1 === n
      ? (a.push(e),
        i ||
          (y.runState.flushTimer = setTimeout(function () {
            ((y.runState.flushTimer = 0),
              I(function () {
                var e = y.runState.buffer.slice();
                y.runState.buffer = [];
                var t = [].concat.apply([], e);
                t.length > 0 && x(t);
              }));
          }, 0)))
      : x(e);
  }));
