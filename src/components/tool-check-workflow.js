// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function Lt(e) {
  var t = e.workflow,
    n = e.answers,
    r = e.decision,
    o = e.onEditAnswer,
    s = e.onStartOver,
    c = e.onDone,
    d = e.onRequestReview,
    l = (0, u.useMemo)(
      function () {
        return Object.fromEntries(
          t.steps.map(function (e) {
            return [e.id, e];
          }),
        );
      },
      [t],
    ),
    p = (0, u.useMemo)(
      function () {
        return (function (e, t, n) {
          var a = Object.fromEntries(
              e.steps.map(function (e) {
                return [e.id, e];
              }),
            ),
            i = [];
          return (
            i.push("Overture AI CoE — ".concat(e.title)),
            i.push(
              "Guidance prototype — routing only, not an approval decision",
            ),
            i.push("Policy reference: ".concat(le)),
            i.push("Created: ".concat(new Date().toLocaleString())),
            i.push(""),
            i.push("Result: ".concat(n.label)),
            i.push(""),
            i.push("Why you're seeing this:"),
            n.reasons.forEach(function (e) {
              return i.push("- ".concat(e));
            }),
            i.push(""),
            i.push("Next steps:"),
            n.nextSteps.forEach(function (e) {
              return i.push("- ".concat(e));
            }),
            i.push(""),
            i.push("Answers that shaped this result:"),
            n.contributingStepIds.forEach(function (e) {
              var n = a[e];
              n &&
                i.push(
                  ""
                    .concat(n.title, ": ")
                    .concat(be(n, t[e]) || "Not answered"),
                );
            }),
            i.push(""),
            i.push(
              "A person must confirm the final answer. Company information and business workflows require the Overture review path described in policy.",
            ),
            i.join("\n")
          );
        })(t, n, r);
      },
      [t, n, r],
    ),
    m = (0, u.useState)("idle"),
    _ = m[0],
    h = m[1],
    b = Ce(),
    g = "reviewNeeded" === r.outcomeKey || "gap" === r.outcomeKey;
  return f().createElement(
    "div",
    { className: "space-y-6" },
    f().createElement(
      "div",
      null,
      f().createElement(
        "span",
        {
          className:
            "overture-badge inline-block rounded-full px-3 py-1 text-xs font-medium",
        },
        "Guidance prototype",
      ),
      f().createElement(
        "h2",
        { className: "mt-3 text-xl font-semibold leading-snug" },
        r.label,
      ),
    ),
    f().createElement(
      nt,
      { icon: R },
      "This is routing guidance, not an approval decision. A person can still confirm anything you see here — that's what a CoE review request is for.",
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "h3",
        {
          className: "text-sm font-semibold",
          style: { color: "var(--color-ink-muted)" },
        },
        "Why you're seeing this",
      ),
      f().createElement(
        "ul",
        { className: "mt-2 list-disc space-y-1.5 pl-5 text-base" },
        r.reasons.map(function (e, t) {
          return f().createElement("li", { key: t }, e);
        }),
      ),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "h3",
        {
          className: "text-sm font-semibold",
          style: { color: "var(--color-ink-muted)" },
        },
        "Next steps",
      ),
      f().createElement(
        "ul",
        { className: "mt-2 list-disc space-y-1.5 pl-5 text-base" },
        r.nextSteps.map(function (e, t) {
          return f().createElement("li", { key: t }, e);
        }),
      ),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "h3",
        {
          className: "text-sm font-semibold",
          style: { color: "var(--color-ink-muted)" },
        },
        "Answers that shaped this result",
      ),
      f().createElement(
        "ul",
        { className: "mt-3 space-y-3" },
        r.contributingStepIds.map(function (e) {
          var t = l[e];
          return t
            ? f().createElement(
                "li",
                {
                  key: e,
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
                    t.title,
                  ),
                  f().createElement(
                    "p",
                    { className: "mt-0.5 text-base break-words" },
                    be(t, n[e]) ||
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
                      return o(e);
                    },
                    className:
                      "overture-btn-secondary flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                  },
                  "Edit",
                ),
              )
            : null;
        }),
      ),
    ),
    f().createElement(
      nt,
      { icon: R },
      b && b.connected
        ? f().createElement(
            f().Fragment,
            null,
            f().createElement(
              "strong",
              { className: "block font-semibold" },
              "Guidance record created: ",
              b.intakeId,
            ),
            f().createElement(
              "span",
              null,
              "This routing result was recorded for audit. Use the buttons below to copy or download it, or create a governed CoE review request.",
            ),
          )
        : f().createElement(
            "span",
            null,
            "The guidance record could not be created. Copy or download this guidance and report the issue to the AI CoE administrator.",
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
        p,
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
                      [4, navigator.clipboard.writeText(p)]
                    );
                  case 1:
                    return (
                      e.sent(),
                      h("copied"),
                      setTimeout(function () {
                        return h("idle");
                      }, 2500),
                      [3, 3]
                    );
                  case 2:
                    return (e.sent(), h("failed"), [3, 3]);
                  case 3:
                    return [2];
                }
              });
            });
          },
          className:
            "overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        f().createElement(j, { className: "h-4 w-4", "aria-hidden": "true" }),
        "copied" === _ ? "Copied!" : "Copy summary",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          onClick: function () {
            try {
              var e = new Blob([p], { type: "text/plain" }),
                t = URL.createObjectURL(e),
                n = document.createElement("a");
              ((n.href = t),
                (n.download = "overture-ai-coe-guidance-summary.txt"),
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
        "copied" === _ ? "Summary copied to clipboard." : "",
      ),
    ),
    "failed" === _ &&
      f().createElement(
        "p",
        { className: "text-sm", style: { color: "var(--color-info-text)" } },
        "We could not copy automatically. You can select the text above and copy it yourself.",
      ),
    f().createElement(
      "div",
      {
        className: "pt-4",
        style: { borderTop: "1px solid var(--color-line)" },
      },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: d,
          className:
            "inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold ".concat(
              g ? "overture-btn-primary" : "overture-btn-secondary",
            ),
        },
        g
          ? "Create a CoE review request"
          : "Want a second opinion? Create a CoE review request",
      ),
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
function kt(e) {
  var t = e.contact,
    n = e.onChange,
    a = e.onCancel,
    i = e.onSubmit,
    r = e.error;
  return f().createElement(
    "div",
    { className: "space-y-5" },
    f().createElement(
      "div",
      null,
      f().createElement(
        "h2",
        { className: "text-xl font-semibold" },
        "Create a CoE review request",
      ),
      f().createElement(
        "p",
        {
          className: "mt-1.5 text-[15px]",
          style: { color: "var(--color-ink-muted)" },
        },
        "Add your name and team so the AI CoE team knows who to follow up with. Your guidance answers come along automatically.",
      ),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "label",
        {
          className: "block text-sm font-medium",
          style: { color: "var(--color-ink-muted)" },
        },
        "Your name",
      ),
      f().createElement("input", {
        type: "text",
        value: t.name,
        onChange: function (e) {
          return n("name", e.target.value);
        },
        placeholder: "Your name",
        className:
          "overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base",
      }),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "label",
        {
          className: "block text-sm font-medium",
          style: { color: "var(--color-ink-muted)" },
        },
        "Your team",
      ),
      f().createElement("input", {
        type: "text",
        value: t.team,
        onChange: function (e) {
          return n("team", e.target.value);
        },
        placeholder: "Your team or department",
        className:
          "overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base",
      }),
    ),
    f().createElement(
      "div",
      null,
      f().createElement(
        "label",
        {
          className: "block text-sm font-medium",
          style: { color: "var(--color-ink-muted)" },
        },
        "Work email",
      ),
      f().createElement(
        "p",
        { className: "text-sm", style: { color: "var(--color-ink-muted)" } },
        "This is optional. Add it if you would like a reply.",
      ),
      f().createElement("input", {
        type: "text",
        value: t.email,
        onChange: function (e) {
          return n("email", e.target.value);
        },
        placeholder: "name@example.com",
        className:
          "overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base",
      }),
    ),
    r &&
      f().createElement(
        "p",
        {
          className: "flex items-center gap-2 text-sm font-medium",
          style: { color: "var(--color-info-text)" },
        },
        f().createElement(R, {
          className: "h-4 w-4 flex-shrink-0",
          "aria-hidden": "true",
        }),
        r,
      ),
    f().createElement(
      "div",
      { className: "flex flex-wrap gap-3 pt-2" },
      f().createElement(
        "button",
        {
          type: "button",
          onClick: a,
          className:
            "overture-btn-secondary rounded-xl px-4 py-2.5 text-base font-medium",
        },
        "Back to result",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          onClick: i,
          className:
            "overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold",
        },
        "Create review request",
      ),
    ),
  );
}
function Mt(e, t) {
  var n = (t && t.answers) || {},
    a = me(e, n),
    i = (t && t.currentStepId) || null;
  (i &&
    a.some(function (e) {
      return e.id === i;
    })) ||
    (i = a[0] ? a[0].id : null);
  var r = t && "result" === t.phase && t.decision ? "result" : "form";
  return {
    answers: n,
    currentStepId: i,
    phase: r,
    editReturnTarget: null,
    errors: {},
    notice: t ? "Picking up where you left off." : null,
    decision: (t && t.decision) || null,
    contact: { name: "", team: "", email: "" },
    contactError: null,
  };
}
function Pt(e, t) {
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
    case "SET_DECISION":
      return n(n({}, e), { decision: t.decision, phase: "result" });
    case "SET_CONTACT_FIELD":
      return n(n({}, e), {
        contact: n(n({}, e.contact), ((o = {}), (o[t.key] = t.value), o)),
        contactError: null,
      });
    case "SET_CONTACT_ERROR":
      return n(n({}, e), { contactError: t.message });
    case "RESET":
      return t.session;
    default:
      return e;
  }
}
function Tt(e) {
  var t = this,
    n = e.resumeDraft,
    r = e.onExit,
    o = e.onDraftsChanged,
    s = fe.toolCheck,
    c = (0, u.useReducer)(Pt, null),
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
                return ((t = null), n ? [4, Ee("toolCheck")] : [3, 2]);
              case 1:
                ((t = a.sent()), (a.label = 2));
              case 2:
                return (
                  e || (l({ type: "RESET", session: Mt(s, t) }), _(!1)),
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
            return (
              l({ type: "SET_PHASE", phase: "evaluating" }),
              [4, Ve.evaluate(d.answers)]
            );
          case 1:
            return (
              (e = t.sent()),
              l({ type: "SET_DECISION", decision: e }),
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
    "result" === d.editReturnTarget
      ? "Save & review result"
      : y >= v.length - 1
        ? "See guidance"
        : "Continue";
  return f().createElement(
    "div",
    null,
    f().createElement(xt, { workflow: s, onExit: r }),
    f().createElement(
      "div",
      { className: "mb-5" },
      f().createElement(
        "span",
        {
          className:
            "overture-badge inline-block rounded-full px-3 py-1 text-xs font-medium",
        },
        "Guidance prototype — routing only, not a policy decision",
      ),
    ),
    "form" === d.phase &&
      f().createElement(at, { current: y, total: v.length, phase: "form" }),
    f().createElement(
      "div",
      { className: "overture-card rounded-2xl p-6 sm:p-8" },
      0 === y &&
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
      "evaluating" === d.phase &&
        f().createElement(Dt, { text: "Looking at your answers…" }),
      "result" === d.phase &&
        d.decision &&
        f().createElement(Lt, {
          workflow: s,
          answers: d.answers,
          decision: d.decision,
          onEditAnswer: function (e) {
            l({
              type: "GOTO",
              stepId: e,
              phase: "form",
              editReturnTarget: "result",
            });
          },
          onStartOver: function () {
            return g(!0);
          },
          onDone: r,
          onRequestReview: function () {
            l({ type: "SET_PHASE", phase: "reviewContact" });
          },
        }),
      "reviewContact" === d.phase &&
        f().createElement(kt, {
          contact: d.contact,
          onChange: function (e, t) {
            l({ type: "SET_CONTACT_FIELD", key: e, value: t });
          },
          onCancel: function () {
            l({ type: "SET_PHASE", phase: "result" });
          },
          onSubmit: function () {
            return a(this, void 0, void 0, function () {
              var e;
              return i(this, function (t) {
                switch (t.label) {
                  case 0:
                    return d.contact.name.trim() && d.contact.team.trim()
                      ? (l({ type: "SET_PHASE", phase: "reviewSubmitting" }),
                        (e = (function (e, t, n, a) {
                          return {
                            requestId: He("review-request"),
                            createdAt: new Date().toISOString(),
                            workflowId: e.id,
                            workflowVersion: e.workflowVersion,
                            originalAnswers: t,
                            outcome: n.label,
                            reasons: n.reasons,
                            contributingAnswers: n.contributingStepIds,
                            policyGapRecord:
                              "gap" === n.outcomeKey ? ze(e, t, n) : null,
                            requestedBy: a,
                            status: "confirmed",
                          };
                        })(s, d.answers, d.decision, d.contact)),
                        [4, xe.submitWorkflow("toolCheck-review-request", e)])
                      : (l({
                          type: "SET_CONTACT_ERROR",
                          message:
                            "Please add your name and team so the AI CoE team knows who to follow up with.",
                        }),
                        [2]);
                  case 1:
                    return (t.sent(), [4, Ae("toolCheck")]);
                  case 2:
                    return (
                      t.sent(),
                      o("toolCheck", !1),
                      l({ type: "SET_PHASE", phase: "reviewResult" }),
                      [2]
                    );
                }
              });
            });
          },
          error: d.contactError,
        }),
      "reviewSubmitting" === d.phase &&
        f().createElement(Dt, {
          text: "Putting your review request together…",
        }),
      "reviewResult" === d.phase &&
        f().createElement(dt, {
          headerIntro: "Your review request is ready",
          headerSubtext:
            "This review request has entered the AI CoE intake and triage process.",
          summaryText: Ge(s, d.answers, d.decision, d.contact),
          downloadFilename: "overture-ai-coe-review-request.txt",
          onStartOver: function () {
            return g(!0);
          },
          onDone: r,
        }),
      "form" === d.phase &&
        f().createElement(ut, {
          onBack: function () {
            if ("result" !== d.editReturnTarget)
              if (y <= 0) r();
              else {
                var e = v[y - 1];
                l({ type: "GOTO", stepId: e.id, phase: "form" });
              }
            else l({ type: "GOTO", stepId: d.currentStepId, phase: "result" });
          },
          onContinue: function () {
            var e = he(S, d.answers);
            if (e) l({ type: "SET_ERROR", stepId: S.id, message: e });
            else if ("result" !== d.editReturnTarget)
              if (y >= v.length - 1) D();
              else {
                var t = v[y + 1];
                l({ type: "GOTO", stepId: t.id, phase: "form" });
              }
            else D();
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
                      we("toolCheck", {
                        answers: d.answers,
                        currentStepId: d.currentStepId,
                        phase: "result" === d.phase ? "result" : "form",
                        decision: d.decision,
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
                      e.ok && o("toolCheck", !0),
                      [2]
                    );
                }
              });
            });
          },
          onStartOver: function () {
            return g(!0);
          },
          notice: d.notice,
        }),
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
                return (g(!1), [4, Ae("toolCheck")]);
              case 1:
                return (
                  e.sent(),
                  o("toolCheck", !1),
                  l({ type: "RESET", session: Mt(s, null) }),
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
