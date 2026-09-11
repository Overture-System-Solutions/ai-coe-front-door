// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function me(e, t) {
  return e.steps.filter(function (e) {
    return !e.showIf || e.showIf(t);
  });
}
function _e(e, t) {
  var n = e.whatHappensNext;
  return (function (e, t) {
    return e.steps.some(function (e) {
      return (
        "sensitiveCheck" === e.type &&
        ("yes" === t[e.id] || "unsure" === t[e.id])
      );
    });
  })(e, t)
    ? n +
        " Since this may involve patient, employee, or customer information, it may also need a closer look before moving forward."
    : n;
}
function he(e, t) {
  if (!e || "notice" === e.type) return null;
  if (!e.required) return null;
  var n = t[e.id];
  switch (e.type) {
    case "select":
    case "sensitiveCheck":
      return n ? null : "Please pick one option so we can keep going.";
    case "multiselect":
      return Array.isArray(n) && 0 !== n.length
        ? null
        : "Please pick at least one option so we can keep going.";
    case "text":
      return n && String(n).trim()
        ? null
        : "Please fill in this box before continuing.";
    case "textarea":
      return n && String(n).trim()
        ? null
        : "Please add a few words before continuing. Even a short sentence is fine.";
    default:
      return null;
  }
}
function be(e, t) {
  if (null == t || "" === t) return "";
  if ("select" === e.type || "sensitiveCheck" === e.type) {
    var n = e.options.find(function (e) {
      return e.value === t;
    });
    return n ? n.label : String(t);
  }
  return "multiselect" === e.type
    ? Array.isArray(t) && 0 !== t.length
      ? t
          .map(function (t) {
            var n = e.options.find(function (e) {
              return e.value === t;
            });
            return n ? n.label : t;
          })
          .join(", ")
      : ""
    : String(t);
}
function ge(e, t, n) {
  var a = [];
  return (
    a.push("Overture AI CoE — ".concat(e.title)),
    a.push("AI CoE submission summary"),
    a.push("Created: ".concat(new Date().toLocaleString())),
    a.push(""),
    n.forEach(function (e) {
      if ("notice" !== e.type) {
        var n = be(e, t[e.id]);
        n && (a.push(e.title), a.push(n), a.push(""));
      }
    }),
    a.push(_e(e, t)),
    a.join("\n")
  );
}
function ve(e, t) {
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
    result: null,
    notice: t ? "Picking up where you left off." : null,
  };
}
function ye(e, t) {
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
    case "SET_RESULT":
      return n(n({}, e), { result: t.result, phase: "result" });
    case "SET_NOTICE":
      return n(n({}, e), { notice: t.text });
    case "RESET":
      return t.session;
    default:
      return e;
  }
}
