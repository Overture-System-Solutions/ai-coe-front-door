// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function Ct(e) {
  var t = e.message,
    n = e.onRetry,
    a = e.onSkip;
  return f().createElement(
    "div",
    { className: "space-y-5" },
    f().createElement(
      nt,
      { icon: R },
      t,
      " You can try again, or continue with a plain summary built directly from your answers.",
    ),
    f().createElement(
      "div",
      { className: "flex flex-wrap gap-3" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: n,
          className:
            "overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        "Try again",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          onClick: a,
          className:
            "overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        "Continue without AI help",
      ),
    ),
  );
}
function Ot(e) {
  var t = e.workflow,
    n = e.session,
    a = e.onUpdateField,
    i = e.onRegenerate,
    r = e.regenerating,
    o = e.onEditAnswer,
    s = e.onConfirm,
    c = n.answers,
    d = n.summaryDraft,
    l = n.summarySourceSnapshot,
    p = (0, u.useState)(!1),
    m = p[0],
    _ = p[1],
    h = me(t, c).filter(function (e) {
      return "notice" !== e.type;
    }),
    b = Me(c),
    g = !!l && l !== JSON.stringify(c);
  return f().createElement(
    "div",
    { className: "space-y-6" },
    f().createElement(
      "div",
      null,
      f().createElement(
        "h2",
        { className: "text-xl font-semibold" },
        "Here is a draft summary",
      ),
      f().createElement(
        "p",
        {
          className: "mt-1.5 text-[15px]",
          style: { color: "var(--color-ink-muted)" },
        },
        "This draft was written with AI assistance, based on your answers. Please check it and make any changes before continuing.",
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
        "Review indicators",
      ),
      b.length > 0
        ? f().createElement(
            "ul",
            { className: "mt-1 list-disc space-y-0.5 pl-5" },
            b.map(function (e) {
              return f().createElement("li", { key: e }, e);
            }),
          )
        : f().createElement(
            "span",
            null,
            "We didn't find any review indicators based on your answers.",
          ),
    ),
    f().createElement(
      "div",
      { className: "space-y-5" },
      Le.map(function (e) {
        return f().createElement(
          "div",
          { key: e.key },
          f().createElement(
            "label",
            {
              htmlFor: "summary-".concat(e.key),
              className: "block text-sm font-medium",
              style: { color: "var(--color-ink-muted)" },
            },
            e.label,
          ),
          e.multiline
            ? f().createElement("textarea", {
                id: "summary-".concat(e.key),
                value: (d && d[e.key]) || "",
                onChange: function (t) {
                  return a(e.key, t.target.value);
                },
                rows: 2,
                className:
                  "overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base",
              })
            : f().createElement("input", {
                id: "summary-".concat(e.key),
                type: "text",
                value: (d && d[e.key]) || "",
                onChange: function (t) {
                  return a(e.key, t.target.value);
                },
                className:
                  "overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base",
              }),
        );
      }),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "button",
        {
          type: "button",
          onClick: i,
          disabled: r,
          className:
            "overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
        },
        f().createElement(z, { className: "h-4 w-4", "aria-hidden": "true" }),
        r ? "Regenerating…" : "Regenerate summary",
      ),
      g &&
        f().createElement(
          "p",
          {
            className: "mt-2 text-sm",
            style: { color: "var(--color-info-text)" },
          },
          "Your answers have changed since this draft was written. You may want to regenerate the summary.",
        ),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "button",
        {
          type: "button",
          onClick: function () {
            return _(function (e) {
              return !e;
            });
          },
          className: "overture-link rounded-lg text-sm font-medium",
        },
        m ? "Hide my original answers" : "View or edit my original answers",
      ),
      m &&
        f().createElement(
          "ul",
          { className: "mt-3 space-y-3" },
          h.map(function (e) {
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
                  be(e, c[e.id]) ||
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
                    return o(e.id);
                  },
                  className:
                    "overture-btn-secondary flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                },
                "Edit",
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
      f().createElement("span", null, Pe(t, c)),
    ),
    f().createElement(
      "div",
      { className: "flex flex-wrap gap-3 pt-2" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: s,
          className:
            "overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        "Confirm this reflects my idea",
        f().createElement(W, { className: "h-5 w-5", "aria-hidden": "true" }),
      ),
    ),
  );
}
function wt(e, t) {
  var n = (t && t.answers) || {},
    a = me(e, n),
    i = (t && t.currentStepId) || null;
  (i &&
    a.some(function (e) {
      return e.id === i;
    })) ||
    (i = a[0] ? a[0].id : null);
  var r = t && "summary" === t.phase && t.summaryDraft ? "summary" : "form";
  return {
    answers: n,
    currentStepId: i,
    phase: r,
    editReturnTarget: null,
    errors: {},
    notice: t ? "Picking up where you left off." : null,
    summaryDraft: (t && t.summaryDraft) || null,
    summarySourceSnapshot: (t && t.summarySourceSnapshot) || null,
    summaryError: null,
  };
}
function Et(e, t) {
  var a, i, r, o;
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
    case "SET_SUMMARY_DRAFT":
      return n(n({}, e), {
        summaryDraft: t.draft,
        summarySourceSnapshot: JSON.stringify(e.answers),
        summaryError: null,
        phase: "summary",
      });
    case "SET_SUMMARY_ERROR":
      return n(n({}, e), { summaryError: t.message, phase: "summaryError" });
    case "UPDATE_SUMMARY_FIELD":
      return n(n({}, e), {
        summaryDraft: n(
          n({}, e.summaryDraft),
          ((o = {}), (o[t.key] = t.value), o),
        ),
      });
    case "RESET":
      return t.session;
    default:
      return e;
  }
}
function At(e) {
  var t = this,
    n = e.resumeDraft,
    r = e.onExit,
    o = e.onDraftsChanged,
    s = fe.idea,
    c = (0, u.useReducer)(Et, null),
    d = c[0],
    l = c[1],
    p = (0, u.useState)(!0),
    m = p[0],
    _ = p[1],
    h = (0, u.useState)(!1),
    b = h[0],
    g = h[1],
    v = (0, u.useState)(!1),
    y = v[0],
    S = v[1];
  (0, u.useEffect)(
    function () {
      var e = !1;
      return (
        a(t, void 0, void 0, function () {
          var t;
          return i(this, function (a) {
            switch (a.label) {
              case 0:
                return ((t = null), n ? [4, Ee("idea")] : [3, 2]);
              case 1:
                ((t = a.sent()), (a.label = 2));
              case 2:
                return (
                  e || (l({ type: "RESET", session: wt(s, t) }), _(!1)),
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
  var D = (0, u.useMemo)(
      function () {
        return d ? me(s, d.answers) : [];
      },
      [d],
    ),
    I = d
      ? D.findIndex(function (e) {
          return e.id === d.currentStepId;
        })
      : -1,
    x = I >= 0 ? D[I] : D[0];
  function C() {
    return a(this, void 0, void 0, function () {
      var e;
      return i(this, function (t) {
        switch (t.label) {
          case 0:
            return (
              l({ type: "SET_PHASE", phase: "generating" }),
              d.answers,
              l({ type: "SET_SUMMARY_DRAFT", draft: Ue(s, d.answers) }),
              [2]
            );
          case 1:
            return (
              t.trys.push([1, 3, , 4]),
              [4, Fe(d.answers, me(s, d.answers))]
            );
          case 2:
            return (
              (e = t.sent()),
              l({ type: "SET_SUMMARY_DRAFT", draft: e }),
              [3, 4]
            );
          case 3:
            return (
              t.sent(),
              l({
                type: "SET_SUMMARY_ERROR",
                message: "We could not create an AI-drafted summary right now.",
              }),
              [3, 4]
            );
          case 4:
            return [2];
        }
      });
    });
  }
  function O() {
    return a(this, void 0, void 0, function () {
      var e;
      return i(this, function (t) {
        switch (t.label) {
          case 0:
            return [
              4,
              we("idea", {
                answers: d.answers,
                currentStepId: d.currentStepId,
                phase: "summary" === d.phase ? "summary" : "form",
                summaryDraft: d.summaryDraft,
                summarySourceSnapshot: d.summarySourceSnapshot,
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
              e.ok && o("idea", !0),
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
  var w =
    "summary" === d.editReturnTarget
      ? "Save & return to summary"
      : I >= D.length - 1
        ? "Create my summary"
        : "Continue";
  return f().createElement(
    "div",
    null,
    f().createElement(xt, { workflow: s, onExit: r }),
    ("form" === d.phase || "summary" === d.phase) &&
      f().createElement(at, {
        current: "summary" === d.phase ? D.length - 1 : I,
        total: D.length,
        phase: "summary" === d.phase ? "review" : "form",
        completeLabel: "Review your draft summary",
      }),
    f().createElement(
      "div",
      { className: "overture-card rounded-2xl p-6 sm:p-8" },
      0 === I &&
        "form" === d.phase &&
        !d.editReturnTarget &&
        f().createElement(
          "p",
          {
            className: "mb-5 text-[15px]",
            style: { color: "var(--color-ink-muted)" },
          },
          "A few quick questions. You can save your progress and come back any time.",
        ),
      "form" === d.phase &&
        f().createElement(st, {
          step: x,
          value: d.answers[x && x.id],
          error: x && d.errors[x.id],
          onAnswer: function (e) {
            return (
              (t = x.id),
              void l({ type: "ANSWER", stepId: t, value: e })
            );
            var t;
          },
        }),
      "generating" === d.phase &&
        f().createElement(Dt, { text: "Creating your summary…" }),
      "summaryError" === d.phase &&
        f().createElement(Ct, {
          message: d.summaryError,
          onRetry: C,
          onSkip: function () {
            var e = Ue(s, d.answers);
            l({ type: "SET_SUMMARY_DRAFT", draft: e });
          },
        }),
      "summary" === d.phase &&
        f().createElement(Ot, {
          workflow: s,
          session: d,
          onUpdateField: function (e, t) {
            l({ type: "UPDATE_SUMMARY_FIELD", key: e, value: t });
          },
          onRegenerate: function () {
            return a(this, void 0, void 0, function () {
              var e;
              return i(this, function (t) {
                switch (t.label) {
                  case 0:
                    return (
                      S(!0),
                      d.answers,
                      l({ type: "SET_SUMMARY_DRAFT", draft: Ue(s, d.answers) }),
                      S(!1),
                      [2]
                    );
                  case 1:
                    return (
                      t.trys.push([1, 3, 4, 5]),
                      [4, Fe(d.answers, me(s, d.answers))]
                    );
                  case 2:
                    return (
                      (e = t.sent()),
                      l({ type: "SET_SUMMARY_DRAFT", draft: e }),
                      [3, 5]
                    );
                  case 3:
                    return (
                      t.sent(),
                      l({
                        type: "SET_NOTICE",
                        text: "We could not regenerate the summary right now. Your current draft is unchanged.",
                      }),
                      [3, 5]
                    );
                  case 4:
                    return (S(!1), [7]);
                  case 5:
                    return [2];
                }
              });
            });
          },
          regenerating: y,
          onEditAnswer: function (e) {
            l({
              type: "GOTO",
              stepId: e,
              phase: "form",
              editReturnTarget: "summary",
            });
          },
          onConfirm: function () {
            return a(this, void 0, void 0, function () {
              var e, t;
              return i(this, function (n) {
                switch (n.label) {
                  case 0:
                    return (
                      l({ type: "SET_PHASE", phase: "submitting" }),
                      (e = Me(d.answers)),
                      (t = (function (e, t, n, a) {
                        return {
                          submissionId: He("idea"),
                          createdAt: new Date().toISOString(),
                          workflowId: e.id,
                          workflowVersion: e.workflowVersion,
                          originalAnswers: t,
                          confirmedSummary: n,
                          reviewIndicators: a,
                          status: "confirmed",
                        };
                      })(s, d.answers, d.summaryDraft, e)),
                      [4, xe.submitWorkflow("idea", t)]
                    );
                  case 1:
                    return (n.sent(), [4, Ae("idea")]);
                  case 2:
                    return (
                      n.sent(),
                      o("idea", !1),
                      l({ type: "SET_PHASE", phase: "result" }),
                      [2]
                    );
                }
              });
            });
          },
        }),
      "submitting" === d.phase &&
        f().createElement(Dt, { text: "Putting your summary together…" }),
      "result" === d.phase &&
        f().createElement(dt, {
          headerIntro: s.resultIntro,
          headerSubtext: Pe(s, d.answers),
          summaryText: Re(s, d),
          downloadFilename: "overture-ai-coe-idea-summary.txt",
          onStartOver: function () {
            return g(!0);
          },
          onDone: r,
        }),
      "form" === d.phase &&
        f().createElement(ut, {
          onBack: function () {
            if ("summary" !== d.editReturnTarget)
              if (I <= 0) r();
              else {
                var e = D[I - 1];
                l({ type: "GOTO", stepId: e.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "summary" });
          },
          onContinue: function () {
            var e = he(x, d.answers);
            if (e) l({ type: "SET_ERROR", stepId: x.id, message: e });
            else if ("summary" !== d.editReturnTarget)
              if (I >= D.length - 1) C();
              else {
                var t = D[I + 1];
                l({ type: "GOTO", stepId: t.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "summary" });
          },
          continueLabel: w,
          onSaveDraft: O,
          onStartOver: function () {
            return g(!0);
          },
          notice: d.notice,
        }),
      "summary" === d.phase &&
        f().createElement(
          "div",
          {
            className: "mt-6 pt-4",
            style: { borderTop: "1px solid var(--color-line)" },
          },
          f().createElement(lt, {
            onSaveDraft: O,
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
                return (g(!1), [4, Ae("idea")]);
              case 1:
                return (
                  e.sent(),
                  o("idea", !1),
                  l({ type: "RESET", session: wt(s, null) }),
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
