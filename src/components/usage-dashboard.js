// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var mt = {
    idea: {
      title: "Explore an AI idea",
      description: "Turn ideas into safe, valuable AI use.",
      icon: P,
      tone: "teal",
    },
    toolCheck: {
      title: "Check a tool or task",
      description: "Review tools and tasks for safe use.",
      icon: T,
      tone: "blue",
    },
    teamUsage: {
      title: "Register team AI use",
      description: "Tell us how your team uses AI.",
      icon: U,
      tone: "violet",
    },
    helpTraining: {
      title: "Get help or training",
      description: "Find guidance, training, and expert support.",
      icon: F,
      tone: "gold",
    },
    feedback: {
      title: "Share feedback",
      description: "Help us improve the AI CoE experience.",
      icon: H,
      tone: "cyan",
    },
  },
  _t = [
    {
      key: "openai_api_spend_mtd",
      label: "OpenAI API spend this month",
      source: "AI Usage Daily",
      tone: "teal",
    },
    {
      key: "openai_api_requests_mtd",
      label: "OpenAI API requests this month",
      source: "AI Usage Daily",
      tone: "blue",
    },
    {
      key: "openai_api_tokens_mtd",
      label: "OpenAI API tokens this month",
      source: "AI Usage Daily",
      tone: "violet",
    },
    {
      key: "open_coe_alerts",
      label: "Open CoE alerts",
      source: "AI CoE Incidents",
      tone: "gold",
    },
  ];
function ht(e) {
  if (!e) return "Not refreshed yet";
  var t = new Date(e);
  return Number.isNaN(t.getTime())
    ? "Refresh date unavailable"
    : "Updated ".concat(
        t.toLocaleDateString(void 0, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      );
}
function bt(e) {
  var t = this,
    n = e.usageMetricsService,
    r = (0, u.useState)({
      loading: !0,
      metrics: [],
      alerts: [],
      connected: !1,
      message: "Connecting to SharePoint…",
    }),
    o = r[0],
    s = r[1];
  (0, u.useEffect)(
    function () {
      var e = !1;
      return (
        a(t, void 0, void 0, function () {
          var t;
          return i(this, function (a) {
            switch (a.label) {
              case 0:
                return n
                  ? [4, n.getMetrics()]
                  : (s({
                      loading: !1,
                      metrics: [],
                      alerts: [],
                      connected: !1,
                      message: "SharePoint telemetry service is unavailable.",
                    }),
                    [2]);
              case 1:
                return (
                  (t = a.sent()),
                  e ||
                    s({
                      loading: !1,
                      metrics: t.metrics || [],
                      alerts: t.alerts || [],
                      connected: t.connected,
                      message:
                        t.message || "SharePoint telemetry refresh completed.",
                    }),
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
  var c = o.metrics.reduce(function (e, t) {
    return ((e[t.metricKey] = t), e);
  }, {});
  return f().createElement(
    "section",
    { className: "ai-usage-section", "aria-labelledby": "ai-usage-heading" },
    f().createElement(
      "div",
      { className: "ai-usage-heading-row" },
      f().createElement(
        "div",
        null,
        f().createElement(
          "span",
          { className: "ai-usage-kicker" },
          "LIVE GOVERNANCE TELEMETRY",
        ),
        f().createElement(
          "h2",
          { id: "ai-usage-heading" },
          "AI operations snapshot",
        ),
      ),
      f().createElement(
        "span",
        {
          className: "ai-usage-connection ".concat(
            o.connected ? "is-connected" : "",
          ),
        },
        o.loading
          ? "Connecting…"
          : o.connected
            ? "SharePoint connected"
            : "Connection issue",
      ),
    ),
    f().createElement(
      "div",
      { className: "ai-usage-grid", "aria-live": "polite" },
      _t.map(function (e) {
        var t = c[e.key],
          n = o.loading || !t || "number" != typeof t.currentValue;
        return f().createElement(
          "article",
          {
            key: e.key,
            className: "ai-metric-card ai-metric-card--".concat(e.tone),
          },
          f().createElement(
            "div",
            { className: "ai-metric-topline" },
            f().createElement(
              "span",
              { className: "ai-metric-label" },
              (null == t ? void 0 : t.metricLabel) || e.label,
            ),
            f().createElement(
              "span",
              {
                className: "ai-metric-status ".concat(
                  n ? "is-pending" : "is-current",
                ),
              },
              n ? "Pending" : t.dataStatus || "Current",
            ),
          ),
          f().createElement(
            "strong",
            { className: "ai-metric-value ".concat(n ? "is-pending" : "") },
            o.loading
              ? "Loading…"
              : (function (e) {
                  if (!e || "number" != typeof e.currentValue)
                    return "Awaiting data";
                  if ("USD" === String(e.unit).toUpperCase())
                    return new Intl.NumberFormat(void 0, {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(e.currentValue);
                  var t = new Intl.NumberFormat(void 0, {
                    maximumFractionDigits: 1,
                  }).format(e.currentValue);
                  return "percent" === e.unit ? "".concat(t, "%") : t;
                })(t),
          ),
          f().createElement(
            "span",
            { className: "ai-metric-delta" },
            (function (e) {
              if (
                "open_coe_alerts" === (null == e ? void 0 : e.metricKey) &&
                "number" == typeof e.currentValue
              )
                return 0 === e.currentValue
                  ? "No open incidents"
                  : "".concat(e.currentValue, " requiring attention");
              if (
                !e ||
                "number" != typeof e.currentValue ||
                "number" != typeof e.previousValue
              )
                return "No comparison yet";
              if (0 === e.previousValue)
                return 0 === e.currentValue
                  ? "No change"
                  : "First measured activity";
              var t =
                ((e.currentValue - e.previousValue) / e.previousValue) * 100;
              return ""
                .concat(t > 0 ? "+" : "")
                .concat(t.toFixed(1), "% vs prior period");
            })(t),
          ),
          f().createElement(
            "div",
            { className: "ai-metric-meta" },
            f().createElement(
              "span",
              null,
              (null == t ? void 0 : t.source) || e.source,
            ),
            f().createElement(
              "span",
              null,
              ht(null == t ? void 0 : t.refreshedAt),
            ),
          ),
        );
      }),
    ),
    f().createElement(
      "div",
      { className: "ai-alerts-panel", "aria-live": "polite" },
      f().createElement(
        "div",
        { className: "ai-alerts-heading" },
        f().createElement(
          "strong",
          null,
          "AI CoE alerts and ChatGPT / Work overages",
        ),
        f().createElement(
          "span",
          null,
          o.alerts.length,
          " open organization alert",
          1 === o.alerts.length ? "" : "s",
        ),
      ),
      o.loading
        ? f().createElement(
            "p",
            { className: "ai-alerts-empty" },
            "Loading alerts…",
          )
        : 0 === o.alerts.length
          ? f().createElement(
              "div",
              { className: "ai-alerts-clear" },
              f().createElement(B, { "aria-hidden": "true" }),
              f().createElement(
                "span",
                null,
                "No open API, ChatGPT, or Work overage alerts.",
              ),
            )
          : f().createElement(
              "div",
              { className: "ai-alert-list" },
              o.alerts.slice(0, 3).map(function (e) {
                return f().createElement(
                  "article",
                  {
                    className: "ai-alert-item",
                    key: e.id || "".concat(e.title, "-").concat(e.detectedAt),
                  },
                  f().createElement(
                    "div",
                    { className: "ai-alert-item-heading" },
                    f().createElement("strong", null, e.title),
                    f().createElement(
                      "span",
                      {
                        className: "ai-alert-severity is-".concat(
                          String(e.severity).toLowerCase(),
                        ),
                      },
                      e.severity,
                    ),
                  ),
                  f().createElement(
                    "p",
                    null,
                    (function (e) {
                      if (!e) return "No additional details supplied.";
                      var t = String(e).replace(/\s+/g, " ").trim();
                      return t.length > 220
                        ? "".concat(t.slice(0, 217), "…")
                        : t;
                    })(e.details),
                  ),
                  f().createElement(
                    "div",
                    { className: "ai-alert-meta" },
                    f().createElement("span", null, e.provider),
                    f().createElement("span", null, e.category),
                    f().createElement("span", null, ht(e.detectedAt)),
                  ),
                );
              }),
            ),
    ),
    f().createElement(
      "p",
      { className: "ai-usage-note" },
      o.message,
      " Aggregate operational metrics and notification metadata only; prompts, conversations, and response content are not stored here.",
    ),
  );
}
