// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function Dt(e) {
  var t = e.text;
  return f().createElement(
    "div",
    { className: "py-16 text-center", role: "status", "aria-live": "polite" },
    f().createElement(
      "p",
      { className: "text-base", style: { color: "var(--color-ink-muted)" } },
      t,
    ),
  );
}
function It(e) {
  var t = this,
    n = e.workflowId,
    r = e.resumeDraft,
    o = e.onExit,
    s = e.onDraftsChanged,
    c = fe[n],
    d = (0, u.useReducer)(ye, null),
    l = d[0],
    p = d[1],
    m = (0, u.useState)(!0),
    _ = m[0],
    h = m[1],
    b = (0, u.useState)(!1),
    g = b[0],
    v = b[1];
  (0, u.useEffect)(
    function () {
      var e = !1;
      return (
        a(t, void 0, void 0, function () {
          var t;
          return i(this, function (a) {
            switch (a.label) {
              case 0:
                return ((t = null), r ? [4, Ee(n)] : [3, 2]);
              case 1:
                ((t = a.sent()), (a.label = 2));
              case 2:
                return (
                  e || (p({ type: "RESET", session: ve(c, t) }), h(!1)),
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
  var y = (0, u.useMemo)(
      function () {
        return l ? me(c, l.answers) : [];
      },
      [c, l],
    ),
    S = l
      ? y.findIndex(function (e) {
          return e.id === l.currentStepId;
        })
      : -1,
    D = S >= 0 ? y[S] : y[0];
  if (_ || !l)
    return f().createElement(
      "div",
      null,
      f().createElement(xt, { workflow: c, onExit: o }),
      f().createElement(Dt, { text: "Setting things up…" }),
    );
  var I =
    "review" === l.phase
      ? "Confirm"
      : "review" === l.editReturnTarget
        ? "Save & return to review"
        : S >= y.length - 1
          ? "Review my answers"
          : "Continue";
  return f().createElement(
    "div",
    null,
    f().createElement(xt, { workflow: c, onExit: o }),
    ("form" === l.phase || "review" === l.phase) &&
      f().createElement(at, { current: S, total: y.length, phase: l.phase }),
    f().createElement(
      "div",
      { className: "overture-card rounded-2xl p-6 sm:p-8" },
      0 === S &&
        "form" === l.phase &&
        !l.editReturnTarget &&
        f().createElement(
          "p",
          {
            className: "mb-5 text-[15px]",
            style: { color: "var(--color-ink-muted)" },
          },
          "A few quick questions. You can save your progress and come back any time.",
        ),
      "form" === l.phase &&
        f().createElement(st, {
          step: D,
          value: l.answers[D && D.id],
          error: D && l.errors[D.id],
          onAnswer: function (e) {
            return (
              (t = D.id),
              void p({ type: "ANSWER", stepId: t, value: e })
            );
            var t;
          },
        }),
      "review" === l.phase &&
        f().createElement(ct, {
          workflow: c,
          steps: y,
          answers: l.answers,
          onEdit: function (e) {
            p({
              type: "GOTO",
              stepId: e,
              phase: "form",
              editReturnTarget: "review",
            });
          },
        }),
      "submitting" === l.phase &&
        f().createElement(Dt, { text: "Putting your summary together…" }),
      "result" === l.phase &&
        f().createElement(dt, {
          headerIntro: c.resultIntro,
          headerSubtext: _e(c, l.answers),
          summaryText: ge(c, l.answers, y),
          downloadFilename: "overture-ai-coe-".concat(c.id, "-summary.txt"),
          onStartOver: function () {
            return v(!0);
          },
          onDone: o,
        }),
      ("form" === l.phase || "review" === l.phase) &&
        f().createElement(ut, {
          onBack:
            "review" === l.phase
              ? function () {
                  var e = y[y.length - 1];
                  p({ type: "GOTO", stepId: e.id, phase: "form" });
                }
              : function () {
                  if ("review" !== l.editReturnTarget)
                    if (S <= 0) o();
                    else {
                      var e = y[S - 1];
                      p({ type: "GOTO", stepId: e.id, phase: "form" });
                    }
                  else
                    p({
                      type: "GOTO",
                      stepId: l.currentStepId,
                      phase: "review",
                    });
                },
          onContinue:
            "review" === l.phase
              ? function () {
                  return a(this, void 0, void 0, function () {
                    var e;
                    return i(this, function (t) {
                      switch (t.label) {
                        case 0:
                          return (
                            p({ type: "SET_PHASE", phase: "submitting" }),
                            [4, xe.submitWorkflow(n, l.answers)]
                          );
                        case 1:
                          return ((e = t.sent()), [4, Ae(n)]);
                        case 2:
                          return (
                            t.sent(),
                            s(n, !1),
                            p({ type: "SET_RESULT", result: e }),
                            [2]
                          );
                      }
                    });
                  });
                }
              : function () {
                  var e = he(D, l.answers);
                  if (e) p({ type: "SET_ERROR", stepId: D.id, message: e });
                  else if ("review" !== l.editReturnTarget)
                    if (S >= y.length - 1)
                      p({
                        type: "GOTO",
                        stepId: l.currentStepId,
                        phase: "review",
                      });
                    else {
                      var t = y[S + 1];
                      p({ type: "GOTO", stepId: t.id, phase: "form" });
                    }
                  else
                    p({
                      type: "GOTO",
                      stepId: l.currentStepId,
                      phase: "review",
                    });
                },
          continueLabel: I,
          onSaveDraft: function () {
            return a(this, void 0, void 0, function () {
              var e;
              return i(this, function (t) {
                switch (t.label) {
                  case 0:
                    return [
                      4,
                      we(n, {
                        answers: l.answers,
                        currentStepId: l.currentStepId,
                        phase: "review" === l.phase ? "review" : "form",
                      }),
                    ];
                  case 1:
                    return (
                      (e = t.sent()),
                      p({
                        type: "SET_NOTICE",
                        text: e.ok
                          ? "Draft saved on this device."
                          : "We could not save a draft right now. Your answers are still here for this session.",
                      }),
                      e.ok && s(n, !0),
                      [2]
                    );
                }
              });
            });
          },
          onStartOver: function () {
            return v(!0);
          },
          notice: l.notice,
        }),
    ),
    f().createElement(ft, {
      open: g,
      title: "Start over?",
      body: "This will clear your answers for this topic. You can't undo this.",
      confirmLabel: "Start over",
      cancelLabel: "Keep my answers",
      onConfirm: function () {
        return a(this, void 0, void 0, function () {
          return i(this, function (e) {
            switch (e.label) {
              case 0:
                return (v(!1), [4, Ae(n)]);
              case 1:
                return (
                  e.sent(),
                  s(n, !1),
                  p({ type: "RESET", session: ve(c, null) }),
                  [2]
                );
            }
          });
        });
      },
      onCancel: function () {
        return v(!1);
      },
    }),
  );
}
function xt(e) {
  var t = e.workflow,
    n = e.onExit;
  return f().createElement(
    "div",
    { className: "mb-5" },
    f().createElement(
      "button",
      {
        type: "button",
        onClick: n,
        className:
          "overture-link inline-flex items-center gap-1 rounded-lg text-sm font-medium",
      },
      f().createElement(K, { className: "h-4 w-4", "aria-hidden": "true" }),
      "All topics",
    ),
    f().createElement(
      "h1",
      { className: "mt-2 text-xl sm:text-2xl font-semibold" },
      t.title,
    ),
  );
}
