// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Le = [
    { key: "title", label: "Suggested use-case title", multiline: !1 },
    { key: "problemToSolve", label: "Problem to solve", multiline: !0 },
    { key: "currentProcess", label: "Current process", multiline: !0 },
    { key: "peopleAffected", label: "People affected", multiline: !0 },
    {
      key: "frequencyAndEffort",
      label: "Frequency and estimated effort",
      multiline: !0,
    },
    { key: "systemsInvolved", label: "Systems involved", multiline: !0 },
    {
      key: "informationCategories",
      label: "Information categories",
      multiline: !0,
    },
    { key: "currentAiActivity", label: "Current AI activity", multiline: !0 },
    { key: "desiredOutcome", label: "Desired outcome", multiline: !0 },
    {
      key: "possibleMeasuresOfSuccess",
      label: "Possible measures of success",
      multiline: !0,
    },
    { key: "openQuestions", label: "Open questions", multiline: !0 },
    { key: "suggestedNextStep", label: "Suggested next step", multiline: !0 },
  ],
  ke = [
    {
      id: "sensitivePatient",
      label: "Patient or other confidential information may be involved",
      test: function (e) {
        return (
          Array.isArray(e.informationCategories) &&
          (e.informationCategories.includes("patient") ||
            e.informationCategories.includes("otherConfidential"))
        );
      },
    },
    {
      id: "sensitiveEmployeeCustomer",
      label: "Employee or customer information may be involved",
      test: function (e) {
        return (
          Array.isArray(e.informationCategories) &&
          (e.informationCategories.includes("employee") ||
            e.informationCategories.includes("customer"))
        );
      },
    },
    {
      id: "unsureInformation",
      label: "The employee is unsure about the information involved",
      test: function (e) {
        return (
          Array.isArray(e.informationCategories) &&
          e.informationCategories.includes("unsure")
        );
      },
    },
    {
      id: "externalAiInUse",
      label: "An AI tool may already be in use for this work",
      test: function (e) {
        return "yes" === e.aiAlreadyUsed;
      },
    },
    {
      id: "multipleSystems",
      label: "Multiple systems may need to be connected",
      test: function (e) {
        var t = (e.systemsInvolved || "").toLowerCase();
        return (
          !!t.trim() &&
          [",", " and ", ";", "/", "+"].some(function (e) {
            return t.includes(e);
          })
        );
      },
    },
    {
      id: "automatedDecisions",
      label: "Automated decisions or actions may be involved",
      test: function (e) {
        var t = ""
          .concat(e.desiredOutcome || "", " ")
          .concat(e.painPoints || "", " ")
          .concat(e.workToImprove || "")
          .toLowerCase();
        return [
          "automatically decide",
          "auto-approve",
          "automatically approve",
          "without a person",
          "without human review",
          "no human review",
          "automatically reject",
          "automatically send",
        ].some(function (e) {
          return t.includes(e);
        });
      },
    },
  ];
function Me(e) {
  return ke
    .filter(function (t) {
      return t.test(e);
    })
    .map(function (e) {
      return e.label;
    });
}
function Pe(e, t) {
  return Me(t).length > 0
    ? "".concat(
        e.whatHappensNext,
        " Since some review indicators were noted, it may also need a closer look before moving forward.",
      )
    : e.whatHappensNext;
}
function Te(e, t) {
  if (!e) return "";
  var n = String(e).trim();
  return n.length > t ? "".concat(n.slice(0, t - 1).trim(), "…") : n;
}
function Ue(e, t) {
  var n = Object.fromEntries(
      e.steps.map(function (e) {
        return [e.id, e];
      }),
    ),
    a = be(n.frequency, t.frequency) || "Not specified",
    i = be(n.timeSpent, t.timeSpent) || "Not specified",
    r = be(n.informationCategories, t.informationCategories) || "Not specified",
    o = be(n.aiAlreadyUsed, t.aiAlreadyUsed) || "Not specified";
  return {
    title: t.workToImprove ? Te(t.workToImprove, 70) : "Untitled idea",
    problemToSolve: t.painPoints || "Not specified",
    currentProcess: t.workToImprove || "Not specified",
    peopleAffected: t.peopleInvolved || "Not specified",
    frequencyAndEffort: "".concat(a, "; ").concat(i),
    systemsInvolved: t.systemsInvolved || "Not specified",
    informationCategories: r,
    currentAiActivity:
      "yes" === t.aiAlreadyUsed
        ? "Yes".concat(t.aiToolName ? " — ".concat(t.aiToolName) : "")
        : o,
    desiredOutcome: t.desiredOutcome || "Not specified",
    possibleMeasuresOfSuccess: t.successMeasure || "Not specified",
    openQuestions:
      "This draft was created without AI assistance, so it closely follows the original answers.",
    suggestedNextStep: "An AI CoE team member will review this idea.",
  };
}
function Fe(e, t) {
  return a(this, void 0, void 0, function () {
    var n, a, r, o, s, c, d;
    return i(this, function (i) {
      switch (i.label) {
        case 0:
          return (
            (n = t
              .filter(function (e) {
                return "notice" !== e.type;
              })
              .map(function (t) {
                return ""
                  .concat(t.title, "\n")
                  .concat(be(t, e[t.id]) || "Not specified");
              })
              .join("\n\n")),
            (a = "Here are an employee's answers about a work idea:\n\n".concat(
              n,
              "\n\nWrite the JSON summary object described in your instructions.",
            )),
            [
              4,
              fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1e3,
                  system:
                    'You help an AI Center of Excellence turn a plain-language description of a work idea into a short, structured internal summary for review. Use ONLY the information given below. Do not invent numbers, benefits, sponsors, technical solutions, or risks that were not stated. If something was not answered or is unclear, write "Not specified" for that field rather than guessing. Write in clear, plain language, at roughly a fifth-to-eighth grade reading level. Respond ONLY with a single valid JSON object and nothing else — no markdown fences, no commentary. The JSON object must have exactly these string keys: title, problemToSolve, currentProcess, peopleAffected, frequencyAndEffort, systemsInvolved, informationCategories, currentAiActivity, desiredOutcome, possibleMeasuresOfSuccess, openQuestions, suggestedNextStep.',
                  messages: [{ role: "user", content: a }],
                }),
              }),
            ]
          );
        case 1:
          if (!(r = i.sent()).ok)
            throw new Error("The summary request failed.");
          return [4, r.json()];
        case 2:
          return (
            (o = i.sent()),
            (s = (o.content || [])
              .filter(function (e) {
                return "text" === e.type;
              })
              .map(function (e) {
                return e.text;
              })
              .join("\n")),
            (c = s.replace(/```json|```/g, "").trim()),
            [
              2,
              {
                title: (d = JSON.parse(c)).title || "Untitled idea",
                problemToSolve: d.problemToSolve || "Not specified",
                currentProcess: d.currentProcess || "Not specified",
                peopleAffected: d.peopleAffected || "Not specified",
                frequencyAndEffort: d.frequencyAndEffort || "Not specified",
                systemsInvolved: d.systemsInvolved || "Not specified",
                informationCategories:
                  d.informationCategories || "Not specified",
                currentAiActivity: d.currentAiActivity || "Not specified",
                desiredOutcome: d.desiredOutcome || "Not specified",
                possibleMeasuresOfSuccess:
                  d.possibleMeasuresOfSuccess || "Not specified",
                openQuestions: d.openQuestions || "None noted",
                suggestedNextStep: d.suggestedNextStep || "Not specified",
              },
            ]
          );
      }
    });
  });
}
function He(e) {
  return "undefined" != typeof crypto && crypto.randomUUID
    ? "".concat(e, "-").concat(crypto.randomUUID())
    : ""
        .concat(e, "-")
        .concat(Date.now(), "-")
        .concat(Math.random().toString(36).slice(2, 10));
}
function Re(e, t) {
  var n = t.summaryDraft,
    a = t.answers,
    i = Me(a),
    r = [];
  return (
    r.push("Overture AI CoE — ".concat(e.title)),
    r.push("AI CoE submission summary"),
    r.push("Created: ".concat(new Date().toLocaleString())),
    r.push(""),
    Le.forEach(function (e) {
      (r.push(e.label), r.push((n && n[e.key]) || "Not specified"), r.push(""));
    }),
    r.push("Review indicators"),
    r.push(
      i.length
        ? i
            .map(function (e) {
              return "- ".concat(e);
            })
            .join("\n")
        : "None noted based on the answers given.",
    ),
    r.push(""),
    r.push(Pe(e, a)),
    r.join("\n")
  );
}
