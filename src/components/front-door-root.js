// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function zt(e) {
  var t = this,
    r = e.siteUrl,
    o = void 0 === r ? "" : r,
    s = e.usageMetricsService,
    c = e.governanceService,
    d = e.isAdmin,
    l = void 0 !== d && d,
    p = (0, u.useState)("home"),
    m = p[0],
    _ = p[1],
    h = (0, u.useState)(!1),
    b = h[0],
    g = h[1],
    v = (0, u.useState)({}),
    y = v[0],
    S = v[1];
  function D() {
    _("home");
  }
  function I(e, t) {
    S(function (a) {
      var i;
      return n(n({}, a), (((i = {})[e] = t), i));
    });
  }
  return (
    (0, u.useEffect)(function () {
      var e = !1;
      return (
        a(t, void 0, void 0, function () {
          var t, a, r, o, s;
          return i(this, function (c) {
            switch (c.label) {
              case 0:
                ((t = function (t) {
                  var a;
                  return i(this, function (i) {
                    switch (i.label) {
                      case 0:
                        return [4, Ee(t)];
                      case 1:
                        return (
                          (a = i.sent()),
                          e
                            ? [2, { value: void 0 }]
                            : (a &&
                                S(function (e) {
                                  var a;
                                  return n(n({}, e), (((a = {})[t] = !0), a));
                                }),
                              [2])
                        );
                    }
                  });
                }),
                  (a = 0),
                  (r = pe),
                  (c.label = 1));
              case 1:
                return a < r.length ? ((o = r[a]), [5, t(o)]) : [3, 4];
              case 2:
                if ("object" == typeof (s = c.sent())) return [2, s.value];
                c.label = 3;
              case 3:
                return (a++, [3, 1]);
              case 4:
                return [2];
            }
          });
        }),
        function () {
          e = !0;
        }
      );
    }, []),
    f().createElement(
      "div",
      { className: "overture-app min-h-screen" },
      f().createElement("style", null, se),
      f().createElement(
        "div",
        {
          className:
            "home" === m || "admin" === m
              ? "ai-home-shell"
              : "ai-workflow-shell",
        },
        "home" !== m &&
          "admin" !== m &&
          f().createElement(
            f().Fragment,
            null,
            f().createElement(
              "div",
              { className: "mb-6 flex items-center justify-between gap-3" },
              f().createElement(
                "p",
                { className: "text-sm font-semibold tracking-wide" },
                "Overture ",
                f().createElement(
                  "span",
                  { style: { color: "var(--color-primary)" } },
                  "AI CoE Lab",
                ),
              ),
              f().createElement(
                "span",
                {
                  className:
                    "overture-badge rounded-full px-3 py-1 text-xs font-medium",
                },
                "Governed intake · SharePoint connected",
              ),
            ),
            f().createElement("div", {
              className: "mb-8 h-px w-full",
              style: { backgroundColor: "var(--color-line)" },
            }),
          ),
        f().createElement(
          "main",
          null,
          "home" === m
            ? f().createElement(St, {
                drafts: y,
                onSelect: function (e, t) {
                  (g(t), _(e));
                },
                siteUrl: o,
                usageMetricsService: s,
                isAdmin: l,
                onOpenAdmin: function () {
                  return _("admin");
                },
              })
            : "admin" === m && l
              ? f().createElement(yt, {
                  governanceService: c,
                  siteUrl: o,
                  onExit: D,
                })
              : "idea" === m
                ? f().createElement(At, {
                    key: m,
                    resumeDraft: b,
                    onExit: D,
                    onDraftsChanged: I,
                  })
                : "toolCheck" === m
                  ? f().createElement(Tt, {
                      key: m,
                      resumeDraft: b,
                      onExit: D,
                      onDraftsChanged: I,
                    })
                  : "teamUsage" === m
                    ? f().createElement(Rt, {
                        key: m,
                        resumeDraft: b,
                        onExit: D,
                        onDraftsChanged: I,
                      })
                    : "feedback" === m
                      ? f().createElement(Vt, {
                          key: m,
                          resumeDraft: b,
                          onExit: D,
                          onDraftsChanged: I,
                        })
                      : f().createElement(It, {
                          key: m,
                          workflowId: m,
                          resumeDraft: b,
                          onExit: D,
                          onDraftsChanged: I,
                        }),
        ),
      ),
    )
  );
}
const Gt = (function (e) {
  function n() {
    return (null !== e && e.apply(this, arguments)) || this;
  }
  return (
    t(n, e),
    (n.prototype.render = function () {
      var e = this.props,
        t = e.isDarkTheme,
        n = e.userDisplayName,
        a = e.siteUrl,
        i = e.usageMetricsService,
        r = e.governanceService,
        o = e.isAdmin;
      return u.createElement(
        "section",
        {
          id: "overture-ai-coe-pilot",
          className: "aiCoeFrontDoor_e1833fe9",
          "data-theme": t ? "dark" : "light",
        },
        u.createElement(
          "span",
          { className: "signedInUser_e1833fe9" },
          "Signed in as ",
          n,
        ),
        u.createElement(zt, {
          siteUrl: a,
          usageMetricsService: i,
          governanceService: r,
          isAdmin: o,
        }),
      );
    }),
    n
  );
})(u.Component);
