// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function Ut(e) {
  var t = e.workflow,
    n = e.session,
    a = e.onUpdateField,
    i = e.onResetSummary,
    r = e.onEditAnswer,
    o = e.onConfirm,
    s = n.answers,
    c = n.summaryDraft,
    d = n.summarySourceSnapshot,
    l = (0, u.useState)(!1),
    p = l[0],
    m = l[1],
    _ = me(t, s).filter(function (e) {
      return "notice" !== e.type;
    }),
    h = qe(s),
    b = !!d && d !== JSON.stringify(s);
  return f().createElement(
    "div",
    { className: "space-y-6" },
    f().createElement(
      "div",
      null,
      f().createElement(
        "h2",
        { className: "text-xl font-semibold" },
        "Here's a summary of what you shared",
      ),
      f().createElement(
        "p",
        {
          className: "mt-1.5 text-[15px]",
          style: { color: "var(--color-ink-muted)" },
        },
        "This is here to help, not to judge. You can edit anything below before confirming.",
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
      h.length > 0
        ? f().createElement(
            f().Fragment,
            null,
            f().createElement(
              "ul",
              { className: "mt-1 list-disc space-y-0.5 pl-5" },
              h.map(function (e) {
                return f().createElement("li", { key: e }, e);
              }),
            ),
            f().createElement(
              "span",
              { className: "mt-2 block" },
              "These just help the AI CoE know where to focus support — they aren't a judgment about how the tool is being used.",
            ),
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
      Ke.map(function (e) {
        return f().createElement(
          "div",
          { key: e.key },
          f().createElement(
            "label",
            {
              htmlFor: "disclosure-".concat(e.key),
              className: "block text-sm font-medium",
              style: { color: "var(--color-ink-muted)" },
            },
            e.label,
          ),
          e.multiline
            ? f().createElement("textarea", {
                id: "disclosure-".concat(e.key),
                value: (c && c[e.key]) || "",
                onChange: function (t) {
                  return a(e.key, t.target.value);
                },
                rows: 2,
                className:
                  "overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base",
              })
            : f().createElement("input", {
                id: "disclosure-".concat(e.key),
                type: "text",
                value: (c && c[e.key]) || "",
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
          className:
            "overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
        },
        f().createElement(z, { className: "h-4 w-4", "aria-hidden": "true" }),
        "Reset summary to my answers",
      ),
      b &&
        f().createElement(
          "p",
          {
            className: "mt-2 text-sm",
            style: { color: "var(--color-info-text)" },
          },
          "Your answers have changed since this summary was written. You may want to reset the summary to match.",
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
            return m(function (e) {
              return !e;
            });
          },
          className: "overture-link rounded-lg text-sm font-medium",
        },
        p ? "Hide my original answers" : "View or edit my original answers",
      ),
      p &&
        f().createElement(
          "ul",
          { className: "mt-3 space-y-3" },
          _.map(function (e) {
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
                  be(e, s[e.id]) ||
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
                    return r(e.id);
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
      f().createElement("span", null, Ye(s)),
    ),
    f().createElement(
      "div",
      { className: "flex flex-wrap gap-3 pt-2" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: o,
          className:
            "overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        "Confirm this reflects what's happening",
        f().createElement(W, { className: "h-5 w-5", "aria-hidden": "true" }),
      ),
    ),
  );
}
function Ft(e, t) {
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
  };
}
function Ht(e, t) {
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
        phase: "summary",
      });
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
function Rt(e) {
  var t = this,
    n = e.resumeDraft,
    r = e.onExit,
    o = e.onDraftsChanged,
    s = fe.teamUsage,
    c = (0, u.useReducer)(Ht, null),
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
                return ((t = null), n ? [4, Ee("teamUsage")] : [3, 2]);
              case 1:
                ((t = a.sent()), (a.label = 2));
              case 2:
                return (
                  e || (l({ type: "RESET", session: Ft(s, t) }), _(!1)),
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
              we("teamUsage", {
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
              e.ok && o("teamUsage", !0),
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
    "summary" === d.editReturnTarget
      ? "Save & return to summary"
      : y >= v.length - 1
        ? "See my summary"
        : "Continue";
  return f().createElement(
    "div",
    null,
    f().createElement(xt, { workflow: s, onExit: r }),
    ("form" === d.phase || "summary" === d.phase) &&
      f().createElement(at, {
        current: "summary" === d.phase ? v.length - 1 : y,
        total: v.length,
        phase: "summary" === d.phase ? "review" : "form",
        completeLabel: "Review your summary",
      }),
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
            "AI tools are already helping people with many kinds of work. Telling the AI CoE what is being used helps Overture provide better guidance, tools, and support.",
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
      "summary" === d.phase &&
        f().createElement(Ut, {
          workflow: s,
          session: d,
          onUpdateField: function (e, t) {
            l({ type: "UPDATE_SUMMARY_FIELD", key: e, value: t });
          },
          onResetSummary: function () {
            var e = Qe(s, d.answers);
            l({ type: "SET_SUMMARY_DRAFT", draft: e });
          },
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
                      (e = qe(d.answers)),
                      (t = (function (e, t, n, a) {
                        return {
                          recordId: He("disclosure"),
                          createdAt: new Date().toISOString(),
                          workflowId: e.id,
                          workflowVersion: e.workflowVersion,
                          originalAnswers: t,
                          confirmedSummary: n,
                          reviewIndicators: a,
                          requestedFollowUp: t.followUpPreference || "none",
                          status: "confirmed",
                        };
                      })(s, d.answers, d.summaryDraft, e)),
                      [4, xe.submitWorkflow("teamUsage", t)]
                    );
                  case 1:
                    return (n.sent(), [4, Ae("teamUsage")]);
                  case 2:
                    return (
                      n.sent(),
                      o("teamUsage", !1),
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
          headerIntro:
            "Thank you for helping us understand real AI use at Overture.",
          headerSubtext: Ye(d.answers),
          summaryText: Je(s, d),
          downloadFilename: "overture-ai-coe-ai-use-disclosure.txt",
          onStartOver: function () {
            return g(!0);
          },
          onDone: r,
        }),
      "form" === d.phase &&
        f().createElement(ut, {
          onBack: function () {
            if ("summary" !== d.editReturnTarget)
              if (y <= 0) r();
              else {
                var e = v[y - 1];
                l({ type: "GOTO", stepId: e.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "summary" });
          },
          onContinue: function () {
            var e = he(S, d.answers);
            if (e) l({ type: "SET_ERROR", stepId: S.id, message: e });
            else if ("summary" !== d.editReturnTarget)
              if (y >= v.length - 1) {
                var t = Qe(s, d.answers);
                l({ type: "SET_SUMMARY_DRAFT", draft: t });
              } else {
                var n = v[y + 1];
                l({ type: "GOTO", stepId: n.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "summary" });
          },
          continueLabel: I,
          onSaveDraft: D,
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
                return (g(!1), [4, Ae("teamUsage")]);
              case 1:
                return (
                  e.sent(),
                  o("teamUsage", !1),
                  l({ type: "RESET", session: Ft(s, null) }),
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
