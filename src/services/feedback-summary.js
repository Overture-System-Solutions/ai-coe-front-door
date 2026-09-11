// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Xe = {
  clear: {
    resolutionStatus: "Reached a clear next step",
    clarityRating: "Clear",
    confidenceInNextStep: "High",
  },
  somewhat: {
    resolutionStatus: "Partially reached a next step",
    clarityRating: "Somewhat clear",
    confidenceInNextStep: "Medium",
  },
  notClear: {
    resolutionStatus: "Did not reach a clear next step",
    clarityRating: "Not clear",
    confidenceInNextStep: "Low",
  },
  notApplicable: {
    resolutionStatus: "Not applicable",
    clarityRating: "Not applicable",
    confidenceInNextStep: "Not applicable",
  },
};
function Ze(e) {
  return a(this, void 0, void 0, function () {
    var e, t, n, a, r;
    return i(this, function (i) {
      switch (i.label) {
        case 0:
          return [2, []];
        case 1:
          return (
            i.trys.push([1, 4, , 5]),
            [
              4,
              fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1e3,
                  system: void 0,
                  messages: [{ role: "user", content: void 0 }],
                }),
              }),
            ]
          );
        case 2:
          return (e = i.sent()).ok ? [4, e.json()] : [2, []];
        case 3:
          return (
            (t = i.sent()),
            (n = (t.content || [])
              .filter(function (e) {
                return "text" === e.type;
              })
              .map(function (e) {
                return e.text;
              })
              .join("\n")),
            (a = n.replace(/```json|```/g, "").trim()),
            (r = JSON.parse(a)) && Array.isArray(r.themes)
              ? [
                  2,
                  r.themes
                    .filter(function (e) {
                      return "string" == typeof e && e.trim();
                    })
                    .slice(0, 4),
                ]
              : [2, []]
          );
        case 4:
          return (i.sent(), [2, []]);
        case 5:
          return [2];
      }
    });
  });
}
function $e(e, t, n) {
  var a = Object.fromEntries(
      e.steps.map(function (e) {
        return [e.id, e];
      }),
    ),
    i = (function (e) {
      return Xe[e.gotClearNextStep] || Xe.notApplicable;
    })(t);
  return {
    recordId: He("feedback"),
    createdAt: new Date().toISOString(),
    workflowId: e.id,
    workflowVersion: e.workflowVersion,
    workflowOrService:
      be(a.serviceInvolved, t.serviceInvolved) || "Not specified",
    resolutionStatus: i.resolutionStatus,
    easeRating: be(a.easeRating, t.easeRating) || "Not specified",
    clarityRating: i.clarityRating,
    confidenceInNextStep: i.confidenceInNextStep,
    positiveFeedback: t.positiveFeedback || "Not specified",
    frictionPoints: t.frictionPoints || "Not specified",
    suggestedImprovement: t.suggestedImprovement || "Not specified",
    suggestedThemes: n,
    followUpPermission: "yes" === t.followUpPermission ? "Yes" : "No",
    contact:
      "yes" === t.followUpPermission
        ? { name: t.contactName || "", email: t.contactEmail || "" }
        : null,
    status: "confirmed",
  };
}
function et(e) {
  var t =
    "yes" === e.followUpPermission
      ? " Since you said it's okay to reach out, they may contact you about it."
      : " Since you asked not to be contacted, they will not contact you about this feedback.";
  return ""
    .concat("Someone from the AI CoE team will read this feedback.")
    .concat(t, " The feedback is recorded in the AI CoE service queue.");
}
function tt(e, t) {
  var n = t.answers,
    a = t.themes,
    i = $e(e, n, a),
    r = [];
  return (
    r.push("Overture AI CoE — ".concat(e.title)),
    r.push(
      "This feedback is connected to your organization account and is not anonymous.",
    ),
    r.push("AI CoE submission summary"),
    r.push("Created: ".concat(new Date().toLocaleString())),
    r.push(""),
    r.push("Workflow or service involved: ".concat(i.workflowOrService)),
    r.push("Resolution status: ".concat(i.resolutionStatus)),
    r.push("Ease rating: ".concat(i.easeRating)),
    r.push("Clarity rating: ".concat(i.clarityRating)),
    r.push("Confidence in next step: ".concat(i.confidenceInNextStep)),
    r.push(""),
    r.push("What helped:"),
    r.push(i.positiveFeedback),
    r.push(""),
    r.push("What was confusing or difficult:"),
    r.push(i.frictionPoints),
    r.push(""),
    r.push("Suggested improvement:"),
    r.push(i.suggestedImprovement),
    r.push(""),
    r.push("Suggested themes (not a final classification):"),
    r.push(
      a.length
        ? a
            .map(function (e) {
              return "- ".concat(e);
            })
            .join("\n")
        : "None suggested.",
    ),
    r.push(""),
    r.push("May the CoE contact you about this? ".concat(i.followUpPermission)),
    i.contact &&
      i.contact.name &&
      r.push(
        "Contact: "
          .concat(i.contact.name)
          .concat(i.contact.email ? " (".concat(i.contact.email, ")") : ""),
      ),
    r.push(""),
    r.push(et(n)),
    r.join("\n")
  );
}
