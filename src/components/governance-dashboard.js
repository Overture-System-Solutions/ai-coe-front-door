// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function gt(e) {
  if (!e) return "Not available";
  var t = new Date(e);
  return Number.isNaN(t.getTime())
    ? String(e)
    : new Intl.DateTimeFormat(void 0, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(t);
}
function vt(e) {
  return Array.isArray(e)
    ? e.map(vt).filter(Boolean).join(", ")
    : e && "object" == typeof e
      ? JSON.stringify(e)
      : !0 === e
        ? "Yes"
        : !1 === e
          ? "No"
          : null == e || "" === e
            ? "Not provided"
            : String(e);
}
function yt(e) {
  var t,
    o,
    s,
    c,
    d = this,
    l = e.governanceService,
    p = e.siteUrl,
    m = e.onExit,
    _ = (0, u.useState)({
      loading: !0,
      data: null,
      message: "Loading governance data…",
    }),
    h = _[0],
    b = _[1],
    g = (0, u.useState)("all"),
    v = g[0],
    y = g[1],
    S = (0, u.useState)(""),
    D = S[0],
    I = S[1],
    x = (0, u.useState)(null),
    C = x[0],
    O = x[1];
  (0, u.useEffect)(
    function () {
      var e = !1;
      return (
        a(d, void 0, void 0, function () {
          var t;
          return i(this, function (n) {
            switch (n.label) {
              case 0:
                return l
                  ? [4, l.getAdminDashboardData()]
                  : (e ||
                      b({
                        loading: !1,
                        data: null,
                        message:
                          "The SharePoint governance service is unavailable.",
                      }),
                    [2]);
              case 1:
                return (
                  (t = n.sent()),
                  e || b({ loading: !1, data: t, message: t.message }),
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
    [l],
  );
  var w = h.data || { intakes: [], useCases: [], decisions: [], connected: !1 },
    E = (0, u.useMemo)(
      function () {
        var e = new Set(),
          t = w.intakes.map(function (t) {
            var n = String(t.IntakeId || ""),
              a = w.useCases.find(function (t) {
                var a =
                  (n && String(t.CoEID || "") === n) ||
                  (n && String(t.Title || "").includes(n));
                return (a && e.add(t.Id), a);
              });
            return {
              key: "intake-".concat(t.Id),
              intake: t,
              useCase: a,
              title: t.Title || (null == a ? void 0 : a.Title) || n,
              workflow: t.WorkflowType || "",
              requestor:
                t.RequestorName ||
                t.RequestorEmail ||
                (null == a ? void 0 : a.SubmitterEmail) ||
                "Unknown",
              requestorEmail:
                t.RequestorEmail ||
                (null == a ? void 0 : a.SubmitterEmail) ||
                "",
              submittedAt:
                t.SubmittedAt || t.Created || (null == a ? void 0 : a.Created),
              status:
                (null == a ? void 0 : a.Status) || t.Status || "Submitted",
              risk:
                (null == a ? void 0 : a.RiskTier) || t.Priority || "Unrated",
              governance: !!a || !1 === t.PilotOnly,
            };
          }),
          n = w.useCases
            .filter(function (t) {
              return !e.has(t.Id);
            })
            .map(function (e) {
              return {
                key: "usecase-".concat(e.Id),
                intake: null,
                useCase: e,
                title: e.Title || e.CoEID || "Use case ".concat(e.Id),
                workflow: "",
                requestor:
                  e.SubmitterEmail || e.BusinessOwnerEmail || "Unknown",
                requestorEmail: e.SubmitterEmail || e.BusinessOwnerEmail || "",
                submittedAt: e.Created,
                status: e.Status || "Submitted",
                risk: e.RiskTier || "Unrated",
                governance: !0,
              };
            });
        return r(r([], t, !0), n, !0).sort(function (e, t) {
          return (
            new Date(t.submittedAt || 0).getTime() -
            new Date(e.submittedAt || 0).getTime()
          );
        });
      },
      [w.intakes, w.useCases],
    ),
    A = D.trim().toLowerCase(),
    L = E.filter(function (e) {
      var t,
        n,
        a,
        i = String(e.status || "").toLowerCase(),
        r = String(e.risk || "").toLowerCase(),
        o =
          "all" === v ||
          ("governance" === v && e.governance) ||
          ("service" === v && !e.governance) ||
          ("attention" === v &&
            ("high" === r ||
              i.includes("information") ||
              i.includes("rejected"))),
        s = [
          e.title,
          e.requestor,
          e.requestorEmail,
          e.status,
          e.risk,
          null === (t = e.intake) || void 0 === t ? void 0 : t.IntakeId,
          null === (n = e.useCase) || void 0 === n ? void 0 : n.CoEID,
          null === (a = e.useCase) || void 0 === a ? void 0 : a.BusinessProblem,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
      return o && (!A || s.includes(A));
    }),
    k = w.useCases.filter(function (e) {
      return !["approved", "declined", "closed"].includes(
        String(e.Status || "").toLowerCase(),
      );
    }).length,
    M = E.filter(function (e) {
      return "high" === String(e.risk || "").toLowerCase();
    }).length,
    P = C
      ? (function (e) {
          if (!e) return {};
          if ("object" == typeof e) return e;
          try {
            return JSON.parse(e);
          } catch (t) {
            return { submission: String(e) };
          }
        })(null === (t = C.intake) || void 0 === t ? void 0 : t.PayloadJson)
      : {},
    T = C
      ? [
          ["Confirmed summary", P.confirmedSummary],
          ["Submitted answers", P.originalAnswers || P.answers],
        ].filter(function (e) {
          var t = e[1];
          return t && "object" == typeof t;
        })
      : [],
    U = String(p || "").replace(/\/$/, "");
  return f().createElement(
    "div",
    { className: "ai-admin-dashboard" },
    f().createElement(
      "div",
      { className: "ai-admin-toolbar" },
      f().createElement(
        "button",
        {
          type: "button",
          className: "overture-btn-ghost ai-admin-back",
          onClick: m,
        },
        f().createElement(K, { "aria-hidden": "true" }),
        " Front Door",
      ),
      f().createElement(
        "button",
        {
          type: "button",
          className: "overture-btn-secondary ai-admin-refresh",
          onClick: function () {
            return a(this, void 0, void 0, function () {
              var e;
              return i(this, function (t) {
                switch (t.label) {
                  case 0:
                    return l
                      ? (b(function (e) {
                          return n(n({}, e), {
                            loading: !0,
                            message: "Refreshing governance data…",
                          });
                        }),
                        [4, l.getAdminDashboardData()])
                      : (b({
                          loading: !1,
                          data: null,
                          message:
                            "The SharePoint governance service is unavailable.",
                        }),
                        [2]);
                  case 1:
                    return (
                      (e = t.sent()),
                      b({ loading: !1, data: e, message: e.message }),
                      [2]
                    );
                }
              });
            });
          },
          disabled: h.loading,
        },
        f().createElement(q, {
          className: h.loading ? "is-spinning" : "",
          "aria-hidden": "true",
        }),
        h.loading ? "Refreshing" : "Refresh",
      ),
    ),
    f().createElement(
      "header",
      { className: "ai-admin-header" },
      f().createElement(
        "div",
        null,
        f().createElement(
          "span",
          { className: "ai-usage-kicker" },
          "ADMINISTRATOR VIEW",
        ),
        f().createElement("h1", null, "AI CoE Admin Dashboard"),
        f().createElement(
          "p",
          null,
          "Review Front Door submissions, governance progress, risk, and recorded decisions.",
        ),
      ),
      f().createElement(
        "span",
        {
          className: "ai-admin-connection ".concat(
            w.connected ? "is-connected" : "",
          ),
        },
        w.connected ? "SharePoint connected" : "Connection issue",
      ),
    ),
    f().createElement(
      "section",
      {
        className: "ai-admin-metrics",
        "aria-label": "AI CoE administration summary",
      },
      f().createElement(
        "article",
        { className: "ai-admin-metric is-teal" },
        f().createElement(Q, { "aria-hidden": "true" }),
        f().createElement(
          "div",
          null,
          f().createElement("strong", null, w.intakes.length),
          f().createElement("span", null, "Front Door submissions"),
        ),
      ),
      f().createElement(
        "article",
        { className: "ai-admin-metric is-blue" },
        f().createElement(Y, { "aria-hidden": "true" }),
        f().createElement(
          "div",
          null,
          f().createElement("strong", null, k),
          f().createElement("span", null, "Open governance items"),
        ),
      ),
      f().createElement(
        "article",
        { className: "ai-admin-metric is-violet" },
        f().createElement(J, { "aria-hidden": "true" }),
        f().createElement(
          "div",
          null,
          f().createElement("strong", null, M),
          f().createElement("span", null, "High-priority items"),
        ),
      ),
      f().createElement(
        "article",
        { className: "ai-admin-metric is-gold" },
        f().createElement(B, { "aria-hidden": "true" }),
        f().createElement(
          "div",
          null,
          f().createElement("strong", null, w.decisions.length),
          f().createElement("span", null, "Recorded decisions"),
        ),
      ),
    ),
    !w.connected &&
      !h.loading &&
      f().createElement(
        "div",
        { className: "ai-admin-error", role: "alert" },
        h.message,
      ),
    f().createElement(
      "section",
      { className: "ai-admin-workspace" },
      f().createElement(
        "div",
        { className: "ai-admin-queue" },
        f().createElement(
          "div",
          { className: "ai-admin-queue-heading" },
          f().createElement(
            "div",
            null,
            f().createElement("h2", null, "Submission and governance queue"),
            f().createElement(
              "p",
              null,
              L.length,
              " of ",
              E.length,
              " records shown",
            ),
          ),
          f().createElement(
            "label",
            { className: "ai-admin-search" },
            f().createElement(X, { "aria-hidden": "true" }),
            f().createElement(
              "span",
              { className: "sr-only" },
              "Search records",
            ),
            f().createElement("input", {
              value: D,
              onChange: function (e) {
                return I(e.target.value);
              },
              placeholder: "Search records",
            }),
          ),
        ),
        f().createElement(
          "div",
          {
            className: "ai-admin-filters",
            role: "group",
            "aria-label": "Filter records",
          },
          [
            ["all", "All"],
            ["governance", "Governance"],
            ["service", "Service requests"],
            ["attention", "Needs attention"],
          ].map(function (e) {
            var t = e[0],
              n = e[1];
            return f().createElement(
              "button",
              {
                key: t,
                type: "button",
                className: v === t ? "is-active" : "",
                onClick: function () {
                  return y(t);
                },
              },
              n,
            );
          }),
        ),
        h.loading
          ? f().createElement(
              "div",
              { className: "ai-admin-empty" },
              "Loading live SharePoint records…",
            )
          : 0 === L.length
            ? f().createElement(
                "div",
                { className: "ai-admin-empty" },
                "No records match this view.",
              )
            : f().createElement(
                "div",
                { className: "ai-admin-records" },
                L.map(function (e) {
                  return f().createElement(
                    "button",
                    {
                      key: e.key,
                      type: "button",
                      className: "ai-admin-record ".concat(
                        (null == C ? void 0 : C.key) === e.key
                          ? "is-selected"
                          : "",
                      ),
                      onClick: function () {
                        return O(e);
                      },
                    },
                    f().createElement(
                      "span",
                      { className: "ai-admin-record-main" },
                      f().createElement("strong", null, e.title),
                      f().createElement(
                        "small",
                        null,
                        {
                          idea: "Explore an AI idea",
                          toolCheck: "Tool or task guidance",
                          "toolCheck-review-request": "Tool or task review",
                          teamUsage: "Register team AI use",
                          helpTraining: "Help or training",
                          feedback: "Feedback",
                        }[(t = e.workflow)] ||
                          t ||
                          "Governance use case",
                        " · ",
                        e.requestor,
                      ),
                    ),
                    f().createElement(
                      "span",
                      { className: "ai-admin-record-date" },
                      gt(e.submittedAt),
                    ),
                    f().createElement(
                      "span",
                      {
                        className: "ai-admin-pill is-".concat(
                          String(e.risk).toLowerCase().replace(/\s+/g, "-"),
                        ),
                      },
                      e.risk,
                    ),
                    f().createElement(
                      "span",
                      { className: "ai-admin-status" },
                      e.status,
                    ),
                    f().createElement(W, { "aria-hidden": "true" }),
                  );
                  var t;
                }),
              ),
      ),
      f().createElement(
        "aside",
        { className: "ai-admin-detail", "aria-live": "polite" },
        C
          ? f().createElement(
              f().Fragment,
              null,
              f().createElement(
                "div",
                { className: "ai-admin-detail-heading" },
                f().createElement(
                  "div",
                  null,
                  f().createElement(
                    "span",
                    { className: "ai-usage-kicker" },
                    "RECORD DETAIL",
                  ),
                  f().createElement("h2", null, C.title),
                ),
                f().createElement(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      return O(null);
                    },
                    "aria-label": "Close record details",
                  },
                  f().createElement($, { "aria-hidden": "true" }),
                ),
              ),
              f().createElement(
                "dl",
                { className: "ai-admin-detail-grid" },
                f().createElement(
                  "div",
                  null,
                  f().createElement("dt", null, "Status"),
                  f().createElement("dd", null, C.status),
                ),
                f().createElement(
                  "div",
                  null,
                  f().createElement("dt", null, "Risk / priority"),
                  f().createElement("dd", null, C.risk),
                ),
                f().createElement(
                  "div",
                  null,
                  f().createElement("dt", null, "Requestor"),
                  f().createElement("dd", null, C.requestor),
                ),
                f().createElement(
                  "div",
                  null,
                  f().createElement("dt", null, "Submitted"),
                  f().createElement("dd", null, gt(C.submittedAt)),
                ),
              ),
              (null === (o = C.useCase) || void 0 === o
                ? void 0
                : o.BusinessProblem) &&
                f().createElement(
                  "section",
                  { className: "ai-admin-detail-section" },
                  f().createElement("h3", null, "Business problem"),
                  f().createElement("p", null, C.useCase.BusinessProblem),
                ),
              T.map(function (e) {
                var t = e[0],
                  n = e[1];
                return f().createElement(
                  "section",
                  { className: "ai-admin-detail-section", key: t },
                  f().createElement("h3", null, t),
                  f().createElement(
                    "dl",
                    { className: "ai-admin-answer-list" },
                    Object.entries(n).map(function (e) {
                      var t = e[0],
                        n = e[1];
                      return f().createElement(
                        "div",
                        { key: t },
                        f().createElement(
                          "dt",
                          null,
                          (function (e) {
                            return String(e || "")
                              .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                              .replace(/[_-]+/g, " ")
                              .replace(/^./, function (e) {
                                return e.toUpperCase();
                              });
                          })(t),
                        ),
                        f().createElement("dd", null, vt(n)),
                      );
                    }),
                  ),
                );
              }),
              f().createElement(
                "div",
                { className: "ai-admin-detail-links" },
                (null === (s = C.intake) || void 0 === s ? void 0 : s.Id) &&
                  f().createElement(
                    "a",
                    {
                      href: ""
                        .concat(U, "/Lists/AICoEPilotIntakes/DispForm.aspx?ID=")
                        .concat(C.intake.Id),
                      target: "_blank",
                      rel: "noreferrer",
                    },
                    "Open intake record ",
                    f().createElement(ee, { "aria-hidden": "true" }),
                  ),
                (null === (c = C.useCase) || void 0 === c ? void 0 : c.Id) &&
                  f().createElement(
                    "a",
                    {
                      href: ""
                        .concat(
                          U,
                          "/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=",
                        )
                        .concat(C.useCase.Id),
                      target: "_blank",
                      rel: "noreferrer",
                    },
                    "Open governance record ",
                    f().createElement(ee, { "aria-hidden": "true" }),
                  ),
              ),
            )
          : f().createElement(
              "div",
              { className: "ai-admin-detail-empty" },
              f().createElement(Z, { "aria-hidden": "true" }),
              f().createElement("h2", null, "Select a record"),
              f().createElement(
                "p",
                null,
                "Choose a submission to see its answers, governance state, and SharePoint records.",
              ),
            ),
      ),
    ),
    f().createElement(
      "section",
      { className: "ai-admin-decisions" },
      f().createElement(
        "div",
        null,
        f().createElement("h2", null, "Recent decisions"),
        f().createElement("p", null, "Latest entries from AI CoE Decisions"),
      ),
      0 === w.decisions.length
        ? f().createElement("span", null, "No decisions recorded yet.")
        : f().createElement(
            "ul",
            null,
            w.decisions.slice(0, 5).map(function (e) {
              return f().createElement(
                "li",
                { key: e.Id },
                f().createElement("strong", null, e.Decision || e.Title),
                f().createElement(
                  "span",
                  null,
                  e.UseCaseID || "Use case not specified",
                ),
                f().createElement(
                  "time",
                  null,
                  gt(e.DecisionDate || e.Created),
                ),
              );
            }),
          ),
    ),
  );
}
