// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function nt(e) {
  var t = e.icon,
    n = void 0 === t ? R : t,
    a = e.children;
  return f().createElement(
    "div",
    {
      className:
        "overture-notice flex gap-3 rounded-xl px-4 py-3 text-[15px] leading-relaxed",
    },
    f().createElement(n, {
      className: "h-5 w-5 flex-shrink-0 mt-0.5",
      "aria-hidden": "true",
    }),
    f().createElement("div", { className: "min-w-0" }, a),
  );
}
function at(e) {
  var t = e.current,
    n = e.total,
    a = e.phase,
    i = e.completeLabel,
    r = Math.max(n, 1),
    o = "form" !== a,
    s = n > 0 ? Math.round(((t + 1) / n) * 100) : 0,
    c = "Just getting started";
  return (
    o
      ? (c = i || ("result" === a ? "All done" : "Review your answers"))
      : s >= 75
        ? (c = "Almost there")
        : s >= 40 && (c = "Making progress"),
    f().createElement(
      "div",
      { className: "mb-6" },
      f().createElement(
        "div",
        {
          className: "flex gap-1.5",
          role: "progressbar",
          "aria-valuenow": o ? 100 : s,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-label": "Progress: ".concat(c),
        },
        Array.from({ length: r }).map(function (e, n) {
          var a = o || n <= t;
          return f().createElement("span", {
            key: n,
            className:
              "overture-progress-segment h-1.5 flex-1 rounded-full ".concat(
                a ? "is-filled" : "",
              ),
          });
        }),
      ),
      f().createElement(
        "p",
        {
          className: "mt-2 text-sm",
          style: { color: "var(--color-ink-muted)" },
        },
        c,
      ),
    )
  );
}
function it(e) {
  var t = e.step,
    n = e.value,
    a = e.onChange,
    i = "multiselect" === t.type;
  return f().createElement(
    "div",
    { role: "group", "aria-label": t.title, className: "grid gap-3" },
    t.options.map(function (e) {
      var o = i ? Array.isArray(n) && n.includes(e.value) : n === e.value;
      return f().createElement(
        "button",
        {
          key: e.value,
          type: "button",
          "aria-pressed": o,
          onClick: function () {
            return (function (e) {
              if (i) {
                var o,
                  s = Array.isArray(n) ? n : [],
                  c = t.options.find(function (t) {
                    return t.value === e;
                  }),
                  d = t.options
                    .filter(function (e) {
                      return e.exclusive;
                    })
                    .map(function (e) {
                      return e.value;
                    });
                ((o = s.includes(e)
                  ? s.filter(function (t) {
                      return t !== e;
                    })
                  : c && c.exclusive
                    ? [e]
                    : r(
                        r(
                          [],
                          s.filter(function (e) {
                            return !d.includes(e);
                          }),
                          !0,
                        ),
                        [e],
                        !1,
                      )),
                  a(o));
              } else a(e);
            })(e.value);
          },
          className:
            "overture-choice w-full rounded-xl px-5 py-4 text-left text-base font-medium",
        },
        f().createElement(
          "span",
          { className: "flex items-center justify-between gap-3" },
          f().createElement("span", null, e.label),
          o &&
            f().createElement(N, {
              className: "h-5 w-5 flex-shrink-0",
              color: "var(--color-primary)",
              "aria-hidden": "true",
            }),
        ),
      );
    }),
  );
}
function rt(e) {
  var t = e.step,
    n = e.value,
    a = e.onChange;
  return f().createElement("input", {
    type: "text",
    id: t.id,
    value: n || "",
    onChange: function (e) {
      return a(e.target.value);
    },
    placeholder: t.placeholder || "",
    className: "overture-input w-full rounded-xl px-4 py-3 text-base",
  });
}
function ot(e) {
  var t = e.step,
    n = e.value,
    a = e.onChange;
  return f().createElement("textarea", {
    id: t.id,
    value: n || "",
    onChange: function (e) {
      return a(e.target.value);
    },
    placeholder: t.placeholder || "",
    rows: 4,
    className: "overture-input w-full rounded-xl px-4 py-3 text-base",
  });
}
function st(e) {
  var t = e.step,
    n = e.value,
    a = e.error,
    i = e.onAnswer;
  return t
    ? f().createElement(
        "div",
        { className: "space-y-5" },
        f().createElement(
          "div",
          null,
          f().createElement(
            "h2",
            { className: "text-xl font-semibold leading-snug" },
            t.title,
          ),
          t.help &&
            f().createElement(
              "p",
              {
                className: "mt-1.5 text-[15px]",
                style: { color: "var(--color-ink-muted)" },
              },
              t.help,
            ),
        ),
        "notice" === t.type
          ? f().createElement(nt, { icon: R }, t.body)
          : f().createElement(
              f().Fragment,
              null,
              t.showSafetyNotice &&
                f().createElement(
                  nt,
                  { icon: R },
                  "Do not enter patient information or other sensitive personal information.",
                ),
              ("select" === t.type ||
                "sensitiveCheck" === t.type ||
                "multiselect" === t.type) &&
                f().createElement(it, { step: t, value: n, onChange: i }),
              "text" === t.type &&
                f().createElement(rt, { step: t, value: n, onChange: i }),
              "textarea" === t.type &&
                f().createElement(ot, { step: t, value: n, onChange: i }),
              !t.required &&
                f().createElement(
                  "p",
                  {
                    className: "text-sm",
                    style: { color: "var(--color-ink-muted)" },
                  },
                  "This question is optional.",
                ),
            ),
        a &&
          f().createElement(
            "p",
            {
              className: "flex items-center gap-2 text-sm font-medium",
              style: { color: "var(--color-info-text)" },
              role: "status",
            },
            f().createElement(R, {
              className: "h-4 w-4 flex-shrink-0",
              "aria-hidden": "true",
            }),
            a,
          ),
      )
    : null;
}
function ct(e) {
  var t = e.workflow,
    n = e.steps,
    a = e.answers,
    i = e.onEdit,
    r = n.filter(function (e) {
      return "notice" !== e.type;
    });
  return f().createElement(
    "div",
    { className: "space-y-6" },
    f().createElement(
      "div",
      null,
      f().createElement(
        "h2",
        { className: "text-xl font-semibold" },
        "Check your answers",
      ),
      f().createElement(
        "p",
        {
          className: "mt-1.5 text-[15px]",
          style: { color: "var(--color-ink-muted)" },
        },
        "Take a look below. You can change anything before you confirm.",
      ),
    ),
    f().createElement(
      "ul",
      { className: "space-y-3" },
      r.map(function (e) {
        var t = be(e, a[e.id]);
        return f().createElement(
          "li",
          {
            key: e.id,
            className:
              "overture-card flex items-start justify-between gap-4 rounded-xl px-4 py-3",
          },
          f().createElement(
            "div",
            { className: "min-w-0" },
            f().createElement(
              "p",
              {
                className: "text-sm font-medium",
                style: { color: "var(--color-ink-muted)" },
              },
              e.title,
            ),
            f().createElement(
              "p",
              { className: "mt-0.5 text-base break-words" },
              t ||
                f().createElement(
                  "span",
                  {
                    className: "italic",
                    style: { color: "var(--color-ink-muted)" },
                  },
                  "Not answered",
                ),
            ),
          ),
          f().createElement(
            "button",
            {
              type: "button",
              onClick: function () {
                return i(e.id);
              },
              className:
                "overture-btn-secondary flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
            },
            "Edit",
          ),
        );
      }),
    ),
    f().createElement(
      nt,
      { icon: R },
      f().createElement(
        "strong",
        {
          className: "block font-semibold",
          style: { color: "var(--color-info-text)" },
        },
        "What happens after you confirm",
      ),
      f().createElement("span", null, _e(t, a)),
    ),
  );
}
function dt(e) {
  var t = e.headerIntro,
    n = e.headerSubtext,
    r = e.summaryText,
    o = e.downloadFilename,
    s = e.onStartOver,
    c = e.onDone,
    d = (0, u.useState)("idle"),
    l = d[0],
    p = d[1],
    m = Ce();
  return f().createElement(
    "div",
    { className: "space-y-6" },
    f().createElement(
      "div",
      { className: "flex items-start gap-3" },
      f().createElement(B, {
        className: "h-7 w-7 flex-shrink-0 mt-0.5",
        color: "var(--color-primary)",
        "aria-hidden": "true",
      }),
      f().createElement(
        "div",
        null,
        f().createElement("h2", { className: "text-xl font-semibold" }, t),
        f().createElement(
          "p",
          {
            className: "mt-1.5 text-[15px]",
            style: { color: "var(--color-ink-muted)" },
          },
          n,
        ),
      ),
    ),
    f().createElement(
      nt,
      { icon: R },
      m && m.connected
        ? f().createElement(
            f().Fragment,
            null,
            f().createElement(
              "strong",
              { className: "block font-semibold" },
              "Submission received: ",
              m.intakeId,
            ),
            f().createElement(
              "span",
              null,
              m.message,
              " This acknowledgement is not an approval decision.",
            ),
          )
        : f().createElement(
            f().Fragment,
            null,
            f().createElement(
              "strong",
              { className: "block font-semibold" },
              "The AI CoE record was not created.",
            ),
            f().createElement(
              "span",
              null,
              m && m.message
                ? m.message
                : "Copy or download the summary and report the issue to the AI CoE administrator.",
            ),
          ),
    ),
    f().createElement(
      "div",
      { className: "overture-card rounded-xl p-4" },
      f().createElement(
        "pre",
        {
          className: "whitespace-pre-wrap break-words font-sans text-sm",
          style: { fontFamily: "var(--font-sans)" },
        },
        r,
      ),
    ),
    f().createElement(
      "div",
      { className: "flex flex-wrap gap-3" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: function () {
            return a(this, void 0, void 0, function () {
              return i(this, function (e) {
                switch (e.label) {
                  case 0:
                    return (
                      e.trys.push([0, 2, , 3]),
                      [4, navigator.clipboard.writeText(r)]
                    );
                  case 1:
                    return (
                      e.sent(),
                      p("copied"),
                      setTimeout(function () {
                        return p("idle");
                      }, 2500),
                      [3, 3]
                    );
                  case 2:
                    return (e.sent(), p("failed"), [3, 3]);
                  case 3:
                    return [2];
                }
              });
            });
          },
          className:
            "overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        f().createElement(j, { className: "h-4 w-4", "aria-hidden": "true" }),
        "copied" === l ? "Copied!" : "Copy summary",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          onClick: function () {
            try {
              var e = new Blob([r], { type: "text/plain" }),
                t = URL.createObjectURL(e),
                n = document.createElement("a");
              ((n.href = t),
                (n.download = o),
                document.body.appendChild(n),
                n.click(),
                document.body.removeChild(n),
                URL.revokeObjectURL(t));
            } catch (e) {}
          },
          className:
            "overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        f().createElement(V, { className: "h-4 w-4", "aria-hidden": "true" }),
        "Download summary",
      ),
      f().createElement(
        "span",
        { className: "sr-only", role: "status", "aria-live": "polite" },
        "copied" === l ? "Summary copied to clipboard." : "",
      ),
    ),
    "failed" === l &&
      f().createElement(
        "p",
        { className: "text-sm", style: { color: "var(--color-info-text)" } },
        "We could not copy automatically. You can select the text above and copy it yourself.",
      ),
    f().createElement(
      "div",
      {
        className: "flex flex-wrap gap-3 pt-4",
        style: { borderTop: "1px solid var(--color-line)" },
      },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: s,
          className:
            "overture-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-medium",
        },
        f().createElement(z, { className: "h-4 w-4", "aria-hidden": "true" }),
        "Start a new one",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          onClick: c,
          className:
            "overture-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-medium",
        },
        "Back to all topics",
      ),
    ),
  );
}
function lt(e) {
  var t = e.onSaveDraft,
    n = e.onStartOver,
    a = e.notice,
    i = e.showSaveDraft,
    r = void 0 === i || i;
  return f().createElement(
    "div",
    { className: "flex flex-wrap items-center gap-x-5 gap-y-2" },
    r &&
      f().createElement(
        "button",
        {
          type: "button",
          onClick: t,
          className:
            "overture-link inline-flex items-center gap-1.5 rounded-lg text-sm font-medium",
        },
        f().createElement(G, { className: "h-4 w-4", "aria-hidden": "true" }),
        "Save draft",
      ),
    f().createElement(
      "button",
      {
        type: "button",
        onClick: n,
        className:
          "overture-btn-ghost inline-flex items-center gap-1.5 rounded-lg text-sm font-medium",
      },
      f().createElement(z, { className: "h-4 w-4", "aria-hidden": "true" }),
      "Start over",
    ),
    a &&
      f().createElement(
        "span",
        {
          role: "status",
          "aria-live": "polite",
          className: "text-sm font-medium",
          style: { color: "var(--color-primary-dark)" },
        },
        a,
      ),
  );
}
function ut(e) {
  var t = e.onBack,
    n = e.onContinue,
    a = e.continueLabel,
    i = e.onSaveDraft,
    r = e.onStartOver,
    o = e.notice;
  return f().createElement(
    "div",
    {
      className: "mt-8 pt-5",
      style: { borderTop: "1px solid var(--color-line)" },
    },
    f().createElement(
      "div",
      { className: "flex flex-wrap items-center justify-between gap-3" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: t,
          className:
            "overture-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-base font-medium",
        },
        f().createElement(K, { className: "h-5 w-5", "aria-hidden": "true" }),
        "Back",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          onClick: n,
          className:
            "overture-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-base font-semibold",
        },
        a,
        f().createElement(W, { className: "h-5 w-5", "aria-hidden": "true" }),
      ),
    ),
    f().createElement(
      "div",
      { className: "mt-3" },
      f().createElement(lt, { onSaveDraft: i, onStartOver: r, notice: o }),
    ),
  );
}
function ft(e) {
  var t = e.open,
    n = e.title,
    a = e.body,
    i = e.confirmLabel,
    r = e.cancelLabel,
    o = e.onConfirm,
    s = e.onCancel,
    c = (0, u.useRef)(null);
  return (
    (0, u.useEffect)(
      function () {
        t && c.current && c.current.focus();
      },
      [t],
    ),
    t
      ? f().createElement(
          "div",
          {
            className:
              "fixed inset-0 z-50 flex items-center justify-center p-4",
            style: { backgroundColor: "rgba(30, 42, 46, 0.45)" },
            onClick: s,
          },
          f().createElement(
            "div",
            {
              role: "alertdialog",
              "aria-modal": "true",
              "aria-labelledby": "overture-confirm-title",
              onClick: function (e) {
                return e.stopPropagation();
              },
              onKeyDown: function (e) {
                "Escape" === e.key && s();
              },
              className:
                "overture-card w-full max-w-sm rounded-2xl p-6 shadow-lg",
            },
            f().createElement(
              "h3",
              {
                id: "overture-confirm-title",
                className: "text-lg font-semibold",
              },
              n,
            ),
            f().createElement(
              "p",
              {
                className: "mt-2 text-[15px]",
                style: { color: "var(--color-ink-muted)" },
              },
              a,
            ),
            f().createElement(
              "div",
              { className: "mt-5 flex flex-wrap justify-end gap-3" },
              f().createElement(
                "button",
                {
                  ref: c,
                  type: "button",
                  onClick: s,
                  className:
                    "overture-btn-secondary rounded-xl px-4 py-2 text-base font-medium",
                },
                r,
              ),
              f().createElement(
                "button",
                {
                  type: "button",
                  onClick: o,
                  className:
                    "overture-btn-primary rounded-xl px-4 py-2 text-base font-semibold",
                },
                i,
              ),
            ),
          ),
        )
      : null
  );
}
function pt() {
  return f().createElement(
    "svg",
    {
      className: "ai-hero-network",
      viewBox: "0 0 760 300",
      role: "img",
      "aria-label": "Abstract connected network",
      preserveAspectRatio: "xMidYMid slice",
    },
    f().createElement(
      "defs",
      null,
      f().createElement(
        "radialGradient",
        { id: "ai-node-glow", cx: "35%", cy: "30%", r: "75%" },
        f().createElement("stop", {
          offset: "0",
          stopColor: "#74F1EE",
          stopOpacity: "0.85",
        }),
        f().createElement("stop", {
          offset: "0.45",
          stopColor: "#17BFC8",
          stopOpacity: "0.48",
        }),
        f().createElement("stop", {
          offset: "1",
          stopColor: "#0A4069",
          stopOpacity: "0.08",
        }),
      ),
      f().createElement(
        "linearGradient",
        { id: "ai-line", x1: "0", y1: "0", x2: "1", y2: "1" },
        f().createElement("stop", {
          offset: "0",
          stopColor: "#7B6BD9",
          stopOpacity: "0.25",
        }),
        f().createElement("stop", {
          offset: "0.55",
          stopColor: "#2DCDD2",
          stopOpacity: "0.8",
        }),
        f().createElement("stop", {
          offset: "1",
          stopColor: "#B4F8F3",
          stopOpacity: "0.35",
        }),
      ),
    ),
    f().createElement(
      "g",
      { fill: "none", stroke: "url(#ai-line)", strokeWidth: "1.2" },
      f().createElement("path", { d: "M10 252 C140 28 360 42 742 172" }),
      f().createElement("path", { d: "M18 290 C190 70 430 30 750 240" }),
      f().createElement("path", { d: "M92 310 C230 105 430 105 698 -5" }),
      f().createElement("path", { d: "M190 302 C320 115 550 25 752 82" }),
      f().createElement("path", { d: "M42 164 C230 218 380 142 726 54" }),
      f().createElement("path", { d: "M152 16 C275 98 452 208 742 205" }),
      f().createElement("path", { d: "M284 8 C360 92 500 146 740 287" }),
      f().createElement("path", { d: "M15 210 C160 110 420 210 700 114" }),
    ),
    f().createElement(
      "g",
      { fill: "url(#ai-node-glow)", stroke: "#42E3E0", strokeOpacity: "0.5" },
      f().createElement("circle", { cx: "575", cy: "135", r: "88" }),
      f().createElement("circle", { cx: "420", cy: "58", r: "48" }),
      f().createElement("circle", { cx: "460", cy: "270", r: "62" }),
      f().createElement("circle", { cx: "685", cy: "255", r: "36" }),
    ),
    f().createElement(
      "g",
      { fill: "#39E0DC", stroke: "#061B35", strokeWidth: "4" },
      f().createElement("circle", { cx: "77", cy: "235", r: "8" }),
      f().createElement("circle", { cx: "255", cy: "205", r: "6" }),
      f().createElement("circle", { cx: "357", cy: "156", r: "6" }),
      f().createElement("circle", { cx: "512", cy: "203", r: "7" }),
      f().createElement("circle", { cx: "650", cy: "170", r: "6" }),
    ),
    f().createElement(
      "g",
      { fill: "#A98DF3", stroke: "#A98DF3" },
      f().createElement("circle", { cx: "218", cy: "101", r: "6" }),
      f().createElement("circle", { cx: "331", cy: "85", r: "4" }),
      f().createElement("circle", { cx: "538", cy: "44", r: "5" }),
    ),
    f().createElement(
      "g",
      { fill: "none", stroke: "#B8FBF5", strokeOpacity: "0.8" },
      f().createElement("circle", { cx: "337", cy: "153", r: "22" }),
      f().createElement("circle", { cx: "651", cy: "170", r: "23" }),
      f().createElement("circle", { cx: "575", cy: "135", r: "112" }),
    ),
  );
}
