// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function Nt(e) {
  var t = e.workflow,
    n = e.session,
    a = e.onEditAnswer,
    i = e.onRemoveTheme,
    r = e.onConfirm,
    o = n.answers,
    s = n.themes,
    c = me(t, o).filter(function (e) {
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
        "Check your feedback",
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
      nt,
      { icon: R },
      "This feedback is connected to your organization account and should not be considered anonymous.",
    ),
    f().createElement(
      "ul",
      { className: "space-y-3" },
      c.map(function (e) {
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
              be(e, o[e.id]) ||
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
                return a(e.id);
              },
              className:
                "overture-btn-secondary flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
            },
            "Edit",
          ),
        );
      }),
    ),
    s.length > 0 &&
      f().createElement(
        "div",
        null,
        f().createElement(
          "h3",
          {
            className: "text-sm font-semibold",
            style: { color: "var(--color-ink-muted)" },
          },
          "Suggested themes",
        ),
        f().createElement(
          "p",
          {
            className: "mt-1 text-sm",
            style: { color: "var(--color-ink-muted)" },
          },
          "These are suggestions to help the AI CoE spot patterns — not a final classification of your feedback. Remove any that don't fit.",
        ),
        f().createElement(
          "div",
          { className: "mt-2 flex flex-wrap gap-2" },
          s.map(function (e, t) {
            return f().createElement(
              "span",
              {
                key: "".concat(e, "-").concat(t),
                className:
                  "overture-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
              },
              e,
              f().createElement(
                "button",
                {
                  type: "button",
                  onClick: function () {
                    return i(t);
                  },
                  "aria-label": "Remove suggested theme: ".concat(e),
                  className: "overture-link rounded-full",
                },
                f().createElement($, {
                  className: "h-3.5 w-3.5",
                  "aria-hidden": "true",
                }),
              ),
            );
          }),
        ),
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
      f().createElement("span", null, et(o)),
    ),
    f().createElement(
      "div",
      { className: "flex flex-wrap gap-3 pt-2" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: r,
          className:
            "overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        "Confirm my feedback",
        f().createElement(W, { className: "h-5 w-5", "aria-hidden": "true" }),
      ),
    ),
  );
}
function Bt(e, t) {
  var n = (t && t.answers) || {},
    a = me(e, n),
    i = (t && t.currentStepId) || null;
  (i &&
    a.some(function (e) {
      return e.id === i;
    })) ||
    (i = a[0] ? a[0].id : null);
  var r = t && "review" === t.phase ? "review" : "form";
  return {
    answers: n,
    currentStepId: i,
    phase: r,
    editReturnTarget: null,
    errors: {},
    notice: t ? "Picking up where you left off." : null,
    themes: (t && t.themes) || [],
  };
}
function jt(e, t) {
  var a, i, r;
  switch (t.type) {
    case "ANSWER":
      return n(n({}, e), {
        answers: n(n({}, e.answers), ((a = {}), (a[t.stepId] = t.value), a)),
        errors: n(n({}, e.errors), ((i = {}), (i[t.stepId] = void 0), i)),
        notice: null,
      });
    case "SET_ERROR":
      return n(n({}, e), {
        errors: n(n({}, e.errors), ((r = {}), (r[t.stepId] = t.message), r)),
      });
    case "GOTO":
      return n(n({}, e), {
        currentStepId: t.stepId,
        phase: t.phase || e.phase,
        editReturnTarget:
          void 0 !== t.editReturnTarget ? t.editReturnTarget : null,
        notice: null,
      });
    case "SET_PHASE":
      return n(n({}, e), { phase: t.phase });
    case "SET_NOTICE":
      return n(n({}, e), { notice: t.text });
    case "SET_THEMES":
      return n(n({}, e), { themes: t.themes, phase: "review" });
    case "REMOVE_THEME":
      return n(n({}, e), {
        themes: e.themes.filter(function (e, n) {
          return n !== t.index;
        }),
      });
    case "RESET":
      return t.session;
    default:
      return e;
  }
}
function Vt(e) {
  var t = this,
    n = e.resumeDraft,
    r = e.onExit,
    o = e.onDraftsChanged,
    s = fe.feedback,
    c = (0, u.useReducer)(jt, null),
    d = c[0],
    l = c[1],
    p = (0, u.useState)(!0),
    m = p[0],
    _ = p[1],
    h = (0, u.useState)(!1),
    b = h[0],
    g = h[1];
  (0, u.useEffect)(
    function () {
      var e = !1;
      return (
        a(t, void 0, void 0, function () {
          var t;
          return i(this, function (a) {
            switch (a.label) {
              case 0:
                return ((t = null), n ? [4, Ee("feedback")] : [3, 2]);
              case 1:
                ((t = a.sent()), (a.label = 2));
              case 2:
                return (
                  e || (l({ type: "RESET", session: Bt(s, t) }), _(!1)),
                  [2]
                );
            }
          });
        }),
        function () {
          e = !0;
        }
      );
    },
    [n],
  );
  var v = (0, u.useMemo)(
      function () {
        return d ? me(s, d.answers) : [];
      },
      [d],
    ),
    y = d
      ? v.findIndex(function (e) {
          return e.id === d.currentStepId;
        })
      : -1,
    S = y >= 0 ? v[y] : v[0];
  function D() {
    return a(this, void 0, void 0, function () {
      var e;
      return i(this, function (t) {
        switch (t.label) {
          case 0:
            return [
              4,
              we("feedback", {
                answers: d.answers,
                currentStepId: d.currentStepId,
                phase: "review" === d.phase ? "review" : "form",
                themes: d.themes,
              }),
            ];
          case 1:
            return (
              (e = t.sent()),
              l({
                type: "SET_NOTICE",
                text: e.ok
                  ? "Draft saved on this device."
                  : "We could not save a draft right now. Your answers are still here for this session.",
              }),
              e.ok && o("feedback", !0),
              [2]
            );
        }
      });
    });
  }
  if (m || !d)
    return f().createElement(
      "div",
      null,
      f().createElement(xt, { workflow: s, onExit: r }),
      f().createElement(Dt, { text: "Setting things up…" }),
    );
  var I =
    "review" === d.editReturnTarget
      ? "Save & return to review"
      : y >= v.length - 1
        ? "Review my feedback"
        : "Continue";
  return f().createElement(
    "div",
    null,
    f().createElement(xt, { workflow: s, onExit: r }),
    ("form" === d.phase || "review" === d.phase) &&
      f().createElement(at, { current: y, total: v.length, phase: d.phase }),
    f().createElement(
      "div",
      { className: "overture-card rounded-2xl p-6 sm:p-8" },
      0 === y &&
        "form" === d.phase &&
        !d.editReturnTarget &&
        f().createElement(
          "div",
          { className: "mb-5" },
          f().createElement(
            nt,
            { icon: R },
            "This feedback is connected to your organization account and should not be considered anonymous.",
          ),
        ),
      "form" === d.phase &&
        f().createElement(st, {
          step: S,
          value: d.answers[S && S.id],
          error: S && d.errors[S.id],
          onAnswer: function (e) {
            return (
              (t = S.id),
              void l({ type: "ANSWER", stepId: t, value: e })
            );
            var t;
          },
        }),
      "generating" === d.phase &&
        f().createElement(Dt, { text: "Looking at your feedback…" }),
      "review" === d.phase &&
        f().createElement(Nt, {
          workflow: s,
          session: d,
          onEditAnswer: function (e) {
            l({
              type: "GOTO",
              stepId: e,
              phase: "form",
              editReturnTarget: "review",
            });
          },
          onRemoveTheme: function (e) {
            l({ type: "REMOVE_THEME", index: e });
          },
          onConfirm: function () {
            return a(this, void 0, void 0, function () {
              var e;
              return i(this, function (t) {
                switch (t.label) {
                  case 0:
                    return (
                      l({ type: "SET_PHASE", phase: "submitting" }),
                      (e = $e(s, d.answers, d.themes)),
                      [4, xe.submitWorkflow("feedback", e)]
                    );
                  case 1:
                    return (t.sent(), [4, Ae("feedback")]);
                  case 2:
                    return (
                      t.sent(),
                      o("feedback", !1),
                      l({ type: "SET_PHASE", phase: "result" }),
                      [2]
                    );
                }
              });
            });
          },
        }),
      "submitting" === d.phase &&
        f().createElement(Dt, { text: "Putting your feedback together…" }),
      "result" === d.phase &&
        f().createElement(dt, {
          headerIntro: "Thank you for your feedback.",
          headerSubtext: et(d.answers),
          summaryText: tt(s, d),
          downloadFilename: "overture-ai-coe-feedback.txt",
          onStartOver: function () {
            return g(!0);
          },
          onDone: r,
        }),
      "form" === d.phase &&
        f().createElement(ut, {
          onBack: function () {
            if ("review" !== d.editReturnTarget)
              if (y <= 0) r();
              else {
                var e = v[y - 1];
                l({ type: "GOTO", stepId: e.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "review" });
          },
          onContinue: function () {
            var e = he(S, d.answers);
            if (e) l({ type: "SET_ERROR", stepId: S.id, message: e });
            else if ("review" !== d.editReturnTarget)
              if (y >= v.length - 1)
                !(function () {
                  a(this, void 0, void 0, function () {
                    var e;
                    return i(this, function (t) {
                      switch (t.label) {
                        case 0:
                          return (
                            l({ type: "SET_PHASE", phase: "generating" }),
                            [4, Ze(d.answers)]
                          );
                        case 1:
                          return (
                            (e = t.sent()),
                            l({ type: "SET_THEMES", themes: e }),
                            [2]
                          );
                      }
                    });
                  });
                })();
              else {
                var t = v[y + 1];
                l({ type: "GOTO", stepId: t.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "review" });
          },
          continueLabel: I,
          onSaveDraft: D,
          onStartOver: function () {
            return g(!0);
          },
          notice: d.notice,
        }),
      "review" === d.phase &&
        f().createElement(
          "div",
          {
            className: "mt-6 pt-4",
            style: { borderTop: "1px solid var(--color-line)" },
          },
          f().createElement(lt, {
            onSaveDraft: D,
            onStartOver: function () {
              return g(!0);
            },
            notice: d.notice,
          }),
        ),
    ),
    f().createElement(ft, {
      open: b,
      title: "Start over?",
      body: "This will clear your answers for this topic. You can't undo this.",
      confirmLabel: "Start over",
      cancelLabel: "Keep my answers",
      onConfirm: function () {
        return a(this, void 0, void 0, function () {
          return i(this, function (e) {
            switch (e.label) {
              case 0:
                return (g(!1), [4, Ae("feedback")]);
              case 1:
                return (
                  e.sent(),
                  o("feedback", !1),
                  l({ type: "RESET", session: Bt(s, null) }),
                  [2]
                );
            }
          });
        });
      },
      onCancel: function () {
        return g(!1);
      },
    }),
  );
}
