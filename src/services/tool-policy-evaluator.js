// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Ne = {
  fits: {
    label: "This appears eligible for a standard-use check",
    defaultNextSteps: [
      "Confirm the tool and task still match Overture's current approved-use guidance.",
      "Keep a person reviewing the output before it is used or shared.",
      "If company information, workflow integration, or the task changes, submit a TESS review with manager endorsement before proceeding.",
    ],
  },
  safeguards: {
    label: "Additional safeguards and confirmation are needed",
    defaultNextSteps: [
      "Pause this use until the tool status, data boundary, and human checkpoint are confirmed.",
      "If company information or a business workflow is involved, submit a TESS review with manager endorsement.",
    ],
  },
  reviewNeeded: {
    label: "Please request a CoE review before proceeding",
    defaultNextSteps: [
      "Pause this AI use until the required review is complete.",
      "Submit the request through TESS with manager endorsement.",
      "You don't need to add any sensitive details — the answers you already gave are enough to start.",
    ],
  },
  gap: {
    label: "Current guidance does not answer this yet",
    defaultNextSteps: [
      "This is a gap in current guidance, not a decision about your idea.",
      "Use TESS or contact the AI CoE to confirm the current approved-use guidance before proceeding.",
      "If you can, find out the exact name of the tool — that helps a lot.",
    ],
  },
};
function Be(e, t, n, a) {
  var i = Ne[e];
  return {
    outcomeKey: e,
    label: i.label,
    reasons: t,
    nextSteps: a && a.length ? a : i.defaultNextSteps,
    contributingStepIds: r([], new Set(n), !0),
  };
}
function je(e) {
  var t = Array.isArray(e.sensitiveCategories) ? e.sensitiveCategories : [],
    n = t.some(function (e) {
      return [
        "patient",
        "employee",
        "customer",
        "otherConfidential",
        "regulated",
      ].includes(e);
    }),
    a = t.includes("unsure"),
    i = "approved" === e.toolApprovalStatus,
    o = "notApproved" === e.toolApprovalStatus,
    s = "unknown" === e.toolApprovalStatus,
    c = "yes" === e.outputSharedExternally,
    d = "yes" === e.aiTakesAction,
    l = "no" === e.humanReview,
    u = "always" === e.humanReview,
    f = "sometimes" === e.humanReview,
    p = "yes" === e.aiDecisionImportance,
    m = "yes" === e.filesUploaded,
    _ = "no" === e.toolKnown,
    h = "yes" === e.companyDataOrWorkflow,
    b = "unsure" === e.companyDataOrWorkflow,
    g = [
      "toolApprovalStatus",
      "companyDataOrWorkflow",
      "filesUploaded",
      "outputSharedExternally",
      "aiDecisionImportance",
      "aiTakesAction",
      "humanReview",
    ].filter(function (t) {
      return "unknown" === e[t] || "unsure" === e[t];
    });
  if (h || b)
    return Be(
      "reviewNeeded",
      [
        b
          ? "You weren't sure whether company information or a business workflow would be involved. That needs confirmation before proceeding."
          : "This would involve company information or become part of a business workflow.",
      ],
      ["companyDataOrWorkflow"],
    );
  if (n || a)
    return Be(
      "reviewNeeded",
      [
        a
          ? "You weren't sure whether sensitive information would be involved. When that's unclear, a closer look is the safer next step."
          : "This may involve patient, employee, customer, confidential, or regulated information.",
      ],
      ["sensitiveCategories"],
    );
  if (o)
    return Be(
      "reviewNeeded",
      ["You noted this tool isn't approved yet, as far as you know."],
      ["toolApprovalStatus"],
    );
  if (d && l)
    return Be(
      "reviewNeeded",
      [
        "AI would take an action in another system, and no one would review the result first.",
      ],
      ["aiTakesAction", "humanReview"],
    );
  if (c && !i)
    return Be(
      "reviewNeeded",
      [
        "The output would leave Overture, and this tool isn't confirmed as approved.",
      ],
      ["outputSharedExternally", "toolApprovalStatus"],
    );
  if (s || _ || g.length >= 2)
    return Be(
      "gap",
      [
        "There isn't enough clear information yet to point to specific guidance.",
      ],
      r(["toolKnown", "toolApprovalStatus"], g, !0),
    );
  if (i && "no" === e.companyDataOrWorkflow && !m && !c && !p && !d && (u || f))
    return Be(
      "fits",
      [
        "The tool is reported as approved, no company or sensitive information is involved, the task is not an ongoing workflow, and a person stays involved.",
      ],
      [
        "toolApprovalStatus",
        "companyDataOrWorkflow",
        "sensitiveCategories",
        "humanReview",
      ],
    );
  var v = [];
  return (
    m &&
      v.push(
        "Files would be uploaded, so the approved tool, allowed file types, and data boundary need confirmation.",
      ),
    c &&
      v.push(
        "The output would be shared outside Overture, so a person should check it first.",
      ),
    p &&
      v.push(
        "AI would be part of an important decision, so a person should stay in the loop.",
      ),
    d &&
      v.push(
        "AI would take an action in another system, so a check-in point would help.",
      ),
    u ||
      v.push(
        "Having a person review the output every time, not just sometimes, would help here.",
      ),
    s && v.push("Confirming the tool's status would help close this out."),
    0 === v.length &&
      v.push("A few small safeguards would help make this a clearer fit."),
    Be(
      "safeguards",
      v,
      [
        "toolApprovalStatus",
        "companyDataOrWorkflow",
        "filesUploaded",
        "outputSharedExternally",
        "aiDecisionImportance",
        "aiTakesAction",
        "humanReview",
      ],
      v,
    )
  );
}
var Ve = {
  evaluate: function (e) {
    return a(this, void 0, void 0, function () {
      return i(this, function (t) {
        switch (t.label) {
          case 0:
            return [
              4,
              new Promise(function (e) {
                return setTimeout(e, 400);
              }),
            ];
          case 1:
            return (t.sent(), [2, n({ mode: "prototype" }, je(e))]);
        }
      });
    });
  },
};
function ze(e, t, n) {
  return {
    recordId: He("policy-gap"),
    createdAt: new Date().toISOString(),
    workflowId: e.id,
    type: "policy-gap",
    originalAnswers: t,
    outcome: n.label,
    reasons: n.reasons,
    contributingAnswers: n.contributingStepIds,
    status: "open",
  };
}
function Ge(e, t, n, a) {
  var i = [];
  return (
    i.push("Overture AI CoE — CoE review request"),
    i.push("Related to: ".concat(e.title)),
    i.push("AI CoE submission summary"),
    i.push("Policy reference: ".concat(le)),
    i.push("Created: ".concat(new Date().toLocaleString())),
    i.push(""),
    i.push(
      "Requested by: "
        .concat(a.name || "Not specified", " (")
        .concat(a.team || "Not specified", ")"),
    ),
    a.email && i.push("Email: ".concat(a.email)),
    i.push(""),
    i.push("Guidance result so far: ".concat(n.label)),
    i.push(""),
    i.push("Reasons:"),
    n.reasons.forEach(function (e) {
      return i.push("- ".concat(e));
    }),
    i.push(""),
    i.push("Original answers:"),
    me(e, t).forEach(function (e) {
      if ("notice" !== e.type) {
        var n = be(e, t[e.id]);
        n && i.push("".concat(e.title, ": ").concat(n));
      }
    }),
    i.push(""),
    i.push(
      "This review request enters the AI CoE intake and triage process for follow-up and decision logging.",
    ),
    i.join("\n")
  );
}
