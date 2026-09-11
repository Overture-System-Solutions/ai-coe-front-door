// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Ke = [
    { key: "headline", label: "Tool and team", multiline: !1 },
    { key: "purpose", label: "What it helps with", multiline: !0 },
    { key: "usage", label: "How it's used", multiline: !0 },
    {
      key: "informationHandling",
      label: "Information involved",
      multiline: !0,
    },
    { key: "benefitNoted", label: "Benefit observed", multiline: !0 },
    {
      key: "concernsNoted",
      label: "Problems, limitations, or concerns",
      multiline: !0,
    },
    { key: "oversight", label: "How it's reviewed", multiline: !0 },
    { key: "requestedFollowUp", label: "What you'd like next", multiline: !1 },
  ],
  We = [
    {
      id: "companyDataOrWorkflow",
      label:
        "Company information or an ongoing business workflow is involved or unclear",
      test: function (e) {
        return (
          "yes" === e.companyDataOrWorkflow ||
          "unsure" === e.companyDataOrWorkflow
        );
      },
    },
    {
      id: "sensitivePatientConfidential",
      label: "Patient or other confidential information may be involved",
      test: function (e) {
        return (
          Array.isArray(e.sensitiveCategories) &&
          (e.sensitiveCategories.includes("patient") ||
            e.sensitiveCategories.includes("otherConfidential"))
        );
      },
    },
    {
      id: "sensitiveEmployeeCustomer",
      label: "Employee or customer information may be involved",
      test: function (e) {
        return (
          Array.isArray(e.sensitiveCategories) &&
          (e.sensitiveCategories.includes("employee") ||
            e.sensitiveCategories.includes("customer"))
        );
      },
    },
    {
      id: "sensitiveUnsure",
      label: "It's unclear whether sensitive information is involved",
      test: function (e) {
        return (
          Array.isArray(e.sensitiveCategories) &&
          e.sensitiveCategories.includes("unsure")
        );
      },
    },
    {
      id: "automatedAction",
      label: "The tool can take actions in another system",
      test: function (e) {
        return "yes" === e.aiTakesAction;
      },
    },
    {
      id: "noHumanReview",
      label: "The output isn't reviewed by a person before it's used",
      test: function (e) {
        return "no" === e.humanReview;
      },
    },
    {
      id: "notCentrallySupported",
      label: "This tool may not be centrally supported today",
      test: function (e) {
        return "personal" === e.sourceType || "free" === e.sourceType;
      },
    },
  ];
function qe(e) {
  return We.filter(function (t) {
    return t.test(e);
  }).map(function (e) {
    return e.label;
  });
}
function Qe(e, t) {
  var n = Object.fromEntries(
      e.steps.map(function (e) {
        return [e.id, e];
      }),
    ),
    a = be(n.usageScope, t.usageScope) || "Not specified",
    i = be(n.frequency, t.frequency) || "Not specified",
    r = be(n.sourceType, t.sourceType) || "Not specified",
    o = be(n.sensitiveCategories, t.sensitiveCategories) || "Not specified",
    s = be(n.humanReview, t.humanReview) || "Not specified",
    c = be(n.followUpPreference, t.followUpPreference) || "Not specified",
    d = [];
  (t.informationEntered && d.push(t.informationEntered),
    "yes" === t.companyDataOrWorkflow
      ? d.push(
          "Company information or an ongoing business workflow is involved.",
        )
      : "no" === t.companyDataOrWorkflow
        ? d.push(
            "No company information or ongoing business workflow was reported.",
          )
        : d.push(
            "Company-information or business-workflow involvement is unclear.",
          ),
    d.push("Information categories: ".concat(o, ".")),
    "yes" === t.filesUploaded
      ? d.push(
          "Files are uploaded".concat(
            t.fileTypeDetail ? " (".concat(t.fileTypeDetail, ")") : "",
            ".",
          ),
        )
      : "no" === t.filesUploaded && d.push("No files are uploaded."));
  var l = ["Output is reviewed by a person: ".concat(s, ".")];
  return (
    "yes" === t.aiTakesAction
      ? l.push(
          "It can take actions in another system".concat(
            t.actionSystemDetail ? " (".concat(t.actionSystemDetail, ")") : "",
            ".",
          ),
        )
      : "no" === t.aiTakesAction &&
        l.push("It does not take actions in another system."),
    {
      headline: t.toolName
        ? ""
            .concat(t.toolName, " — ")
            .concat(t.departmentOrWork || "team not specified")
        : "Untitled tool disclosure",
      purpose: t.toolPurpose || "Not specified",
      usage: "".concat(a, "; ").concat(i, "; ").concat(r, "."),
      informationHandling: d.join(" "),
      benefitNoted: t.benefitObserved || "Not specified",
      concernsNoted: t.concernsExperienced || "None noted.",
      oversight: l.join(" "),
      requestedFollowUp: c,
    }
  );
}
function Ye(e) {
  var t = (
      Array.isArray(e.sensitiveCategories) ? e.sensitiveCategories : []
    ).some(function (e) {
      return [
        "patient",
        "employee",
        "customer",
        "otherConfidential",
        "unsure",
      ].includes(e);
    }),
    n = "yes" === e.aiTakesAction,
    a =
      "yes" === e.companyDataOrWorkflow || "unsure" === e.companyDataOrWorkflow,
    i = [
      "Thank you for helping Overture understand real AI use and improve support.",
    ];
  return (
    !a || ("personal" !== e.sourceType && "free" !== e.sourceType)
      ? (a || t || n) &&
        i.push(
          "Since company information, a business workflow, sensitive information, or an automated action may be involved, please pause that part of the process until the required review is complete. Submit it through TESS with manager endorsement. Everything else you've shared is still helpful.",
        )
      : i.push(
          "Please pause entering company information into this personal or free tool. Submit the use through TESS with manager endorsement so Overture can confirm an approved path.",
        ),
    i.push(
      (function (e) {
        switch (e.followUpPreference) {
          case "guidance":
            return "Since you'd like guidance on using it well, someone from the AI CoE may follow up with some pointers.";
          case "training":
            return "Since you'd like training on this tool, someone from the AI CoE may follow up about that.";
          case "alternative":
            return "Since you're interested in an approved alternative, someone from the AI CoE may follow up with options.";
          default:
            return "You didn't ask for anything further right now, and that's perfectly fine — thank you again for sharing this.";
        }
      })(e),
    ),
    i.join(" ")
  );
}
function Je(e, t) {
  var n = t.summaryDraft,
    a = t.answers,
    i = qe(a),
    r = [];
  return (
    r.push("Overture AI CoE — ".concat(e.title)),
    r.push("AI CoE submission summary"),
    r.push("Created: ".concat(new Date().toLocaleString())),
    r.push(""),
    Ke.forEach(function (e) {
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
    r.push(Ye(a)),
    r.join("\n")
  );
}
