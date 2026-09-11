// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
"use strict";
(c.r(d), c.d(d, { default: () => Jt }));
var e = function (t, n) {
  return (
    (e =
      Object.setPrototypeOf ||
      ({ __proto__: [] } instanceof Array &&
        function (e, t) {
          e.__proto__ = t;
        }) ||
      function (e, t) {
        for (var n in t)
          Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
      }),
    e(t, n)
  );
};
function t(t, n) {
  if ("function" != typeof n && null !== n)
    throw new TypeError(
      "Class extends value " + String(n) + " is not a constructor or null",
    );
  function a() {
    this.constructor = t;
  }
  (e(t, n),
    (t.prototype =
      null === n ? Object.create(n) : ((a.prototype = n.prototype), new a())));
}
var n = function () {
  return (
    (n =
      Object.assign ||
      function (e) {
        for (var t, n = 1, a = arguments.length; n < a; n++)
          for (var i in (t = arguments[n]))
            Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i]);
        return e;
      }),
    n.apply(this, arguments)
  );
};
function a(e, t, n, a) {
  return new (n || (n = Promise))(function (i, r) {
    function o(e) {
      try {
        c(a.next(e));
      } catch (e) {
        r(e);
      }
    }
    function s(e) {
      try {
        c(a.throw(e));
      } catch (e) {
        r(e);
      }
    }
    function c(e) {
      var t;
      e.done
        ? i(e.value)
        : ((t = e.value),
          t instanceof n
            ? t
            : new n(function (e) {
                e(t);
              })).then(o, s);
    }
    c((a = a.apply(e, t || [])).next());
  });
}
function i(e, t) {
  var n,
    a,
    i,
    r,
    o = {
      label: 0,
      sent: function () {
        if (1 & i[0]) throw i[1];
        return i[1];
      },
      trys: [],
      ops: [],
    };
  return (
    (r = { next: s(0), throw: s(1), return: s(2) }),
    "function" == typeof Symbol &&
      (r[Symbol.iterator] = function () {
        return this;
      }),
    r
  );
  function s(r) {
    return function (s) {
      return (function (r) {
        if (n) throw new TypeError("Generator is already executing.");
        for (; o; )
          try {
            if (
              ((n = 1),
              a &&
                (i =
                  2 & r[0]
                    ? a.return
                    : r[0]
                      ? a.throw || ((i = a.return) && i.call(a), 0)
                      : a.next) &&
                !(i = i.call(a, r[1])).done)
            )
              return i;
            switch (((a = 0), i && (r = [2 & r[0], i.value]), r[0])) {
              case 0:
              case 1:
                i = r;
                break;
              case 4:
                return (o.label++, { value: r[1], done: !1 });
              case 5:
                (o.label++, (a = r[1]), (r = [0]));
                continue;
              case 7:
                ((r = o.ops.pop()), o.trys.pop());
                continue;
              default:
                if (
                  !(
                    (i = (i = o.trys).length > 0 && i[i.length - 1]) ||
                    (6 !== r[0] && 2 !== r[0])
                  )
                ) {
                  o = 0;
                  continue;
                }
                if (3 === r[0] && (!i || (r[1] > i[0] && r[1] < i[3]))) {
                  o.label = r[1];
                  break;
                }
                if (6 === r[0] && o.label < i[1]) {
                  ((o.label = i[1]), (i = r));
                  break;
                }
                if (i && o.label < i[2]) {
                  ((o.label = i[2]), o.ops.push(r));
                  break;
                }
                (i[2] && o.ops.pop(), o.trys.pop());
                continue;
            }
            r = t.call(e, o);
          } catch (e) {
            ((r = [6, e]), (a = 0));
          } finally {
            n = i = 0;
          }
        if (5 & r[0]) throw r[1];
        return { value: r[0] ? r[1] : void 0, done: !0 };
      })([r, s]);
    };
  }
}
function r(e, t, n) {
  if (n || 2 === arguments.length)
    for (var a, i = 0, r = t.length; i < r; i++)
      (!a && i in t) ||
        (a || (a = Array.prototype.slice.call(t, 0, i)), (a[i] = t[i]));
  return e.concat(a || Array.prototype.slice.call(t));
}
(Object.create, Object.create);
