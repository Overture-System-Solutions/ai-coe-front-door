// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Qt = (function () {
  function e(e) {
    this.context = e;
  }
  return (
    (e.prototype.getMetrics = function () {
      return a(this, void 0, void 0, function () {
        var t,
          n,
          a,
          r,
          o,
          s,
          c,
          d,
          l,
          u,
          f,
          p,
          m = this;
        return i(this, function (i) {
          switch (i.label) {
            case 0:
              return [
                4,
                Promise.all([
                  this.getUsageItems()
                    .then(function (e) {
                      return { succeeded: !0, value: e };
                    })
                    .catch(function (e) {
                      return { succeeded: !1, value: [], error: e };
                    }),
                  this.getIncidentItems()
                    .then(function (e) {
                      return { succeeded: !0, value: e };
                    })
                    .catch(function (e) {
                      return { succeeded: !1, value: [], error: e };
                    }),
                ]),
              ];
            case 1:
              return (
                (t = i.sent()),
                (n = t[0]),
                (a = t[1]),
                (r = n.value),
                (o = a.value),
                (s = n.succeeded),
                (c = a.succeeded),
                s || console.warn("AI Usage Daily is unavailable", n.error),
                c || console.warn("AI CoE Incidents is unavailable", a.error),
                (d = o
                  .filter(function (e) {
                    return "open" === String(e.Status || "").toLowerCase();
                  })
                  .map(function (e) {
                    return m.mapAlert(e);
                  })
                  .sort(function (e, t) {
                    return (
                      m.dateValue(t.detectedAt) - m.dateValue(e.detectedAt)
                    );
                  })),
                (l = this.buildUsageMetrics(r)),
                c &&
                  l.push({
                    metricKey: "open_coe_alerts",
                    metricLabel: "Open CoE alerts",
                    source: e.incidentsListTitle,
                    currentValue: d.length,
                    unit: "count",
                    scope: "Organization",
                    refreshedAt:
                      null === (p = d[0]) || void 0 === p
                        ? void 0
                        : p.detectedAt,
                    dataStatus: d.length > 0 ? "Attention" : "Clear",
                  }),
                (f = (u = s && c)
                  ? r.length > 0
                    ? "Usage and incident data loaded from SharePoint."
                    : "The SharePoint lists are connected and awaiting usage data."
                  : s || c
                    ? "One SharePoint data source is unavailable."
                    : "SharePoint usage and incident data are unavailable."),
                [2, { connected: u, metrics: l, alerts: d, message: f }]
              );
          }
        });
      });
    }),
    (e.prototype.getUsageItems = function () {
      return a(this, void 0, void 0, function () {
        var t;
        return i(this, function (n) {
          return (
            (t = [
              "MetricType",
              "BucketStartEpoch",
              "BucketStart",
              "BucketEndEpoch",
              "Requests",
              "InputTokens",
              "OutputTokens",
              "Amount",
              "Currency",
            ].join(",")),
            [
              2,
              this.getAllItems(
                e.usageListTitle,
                "$select=".concat(t, "&$orderby=BucketStart desc&$top=5000"),
              ),
            ]
          );
        });
      });
    }),
    (e.prototype.getIncidentItems = function () {
      return a(this, void 0, void 0, function () {
        var t;
        return i(this, function (n) {
          return (
            (t = [
              "Id",
              "Title",
              "Category",
              "Severity",
              "Status",
              "Provider",
              "DetectedAt",
              "Details",
            ].join(",")),
            [
              2,
              this.getAllItems(
                e.incidentsListTitle,
                "$select=".concat(t, "&$orderby=DetectedAt desc&$top=5000"),
              ),
            ]
          );
        });
      });
    }),
    (e.prototype.getAllItems = function (e, t) {
      return a(this, void 0, void 0, function () {
        var n, a, r, o, s, c, d;
        return i(this, function (i) {
          switch (i.label) {
            case 0:
              ((n = this.context.pageContext.web.absoluteUrl.replace(
                /\/$/,
                "",
              )),
                (a = e.replace(/'/g, "''")),
                (r = ""
                  .concat(n, "/_api/web/lists/getbytitle('")
                  .concat(a, "')/items?")
                  .concat(t)),
                (o = []),
                (i.label = 1));
            case 1:
              return r
                ? [
                    4,
                    this.context.spHttpClient.get(
                      r,
                      Kt.SPHttpClient.configurations.v1,
                      {
                        headers: {
                          Accept: "application/json;odata=nometadata",
                        },
                      },
                    ),
                  ]
                : [3, 6];
            case 2:
              return (s = i.sent()).ok ? [3, 4] : [4, s.text()];
            case 3:
              throw (
                (c = i.sent()),
                new Error(
                  ""
                    .concat(e, " returned ")
                    .concat(s.status, ": ")
                    .concat(c.slice(0, 240)),
                )
              );
            case 4:
              return [4, s.json()];
            case 5:
              return (
                (d = i.sent()),
                o.push.apply(o, d.value || []),
                (r = d["@odata.nextLink"] || d["odata.nextLink"]),
                [3, 1]
              );
            case 6:
              return [2, o];
          }
        });
      });
    }),
    (e.prototype.buildUsageMetrics = function (t) {
      if (0 === t.length) return [];
      var n = new Date(),
        a = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)),
        i = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)),
        r = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)),
        o = this.sumPeriod(t, a, i),
        s = this.sumPeriod(t, r, a),
        c = this.latestBucketStart(t),
        d = a.toISOString(),
        l = i.toISOString();
      return [
        {
          metricKey: "openai_api_spend_mtd",
          metricLabel: "OpenAI API spend this month",
          source: e.usageListTitle,
          currentValue: o.amount,
          previousValue: s.amount,
          unit: "USD",
          periodStart: d,
          periodEnd: l,
          scope: "Organization",
          refreshedAt: c,
          dataStatus: "Current",
        },
        {
          metricKey: "openai_api_requests_mtd",
          metricLabel: "OpenAI API requests this month",
          source: e.usageListTitle,
          currentValue: o.requests,
          previousValue: s.requests,
          unit: "count",
          periodStart: d,
          periodEnd: l,
          scope: "Organization",
          refreshedAt: c,
          dataStatus: "Current",
        },
        {
          metricKey: "openai_api_tokens_mtd",
          metricLabel: "OpenAI API tokens this month",
          source: e.usageListTitle,
          currentValue: o.tokens,
          previousValue: s.tokens,
          unit: "count",
          periodStart: d,
          periodEnd: l,
          scope: "Organization",
          refreshedAt: c,
          dataStatus: "Current",
        },
      ];
    }),
    (e.prototype.sumPeriod = function (e, t, n) {
      var a = this;
      return e.reduce(
        function (e, i) {
          var r = a.bucketDate(i);
          if (!r || r < t || r >= n) return e;
          var o = String(i.MetricType || "").toLowerCase();
          return (
            "cost" === o && (e.amount += a.numberValue(i.Amount)),
            "completions" === o &&
              ((e.requests += a.numberValue(i.Requests)),
              (e.tokens +=
                a.numberValue(i.InputTokens) + a.numberValue(i.OutputTokens))),
            e
          );
        },
        { amount: 0, requests: 0, tokens: 0 },
      );
    }),
    (e.prototype.latestBucketStart = function (e) {
      var t = this,
        n = e.reduce(
          function (e, n) {
            var a = t.bucketDate(n);
            return a && (!e || a > e) ? a : e;
          },
          void 0,
        );
      return null == n ? void 0 : n.toISOString();
    }),
    (e.prototype.bucketDate = function (e) {
      if (e.BucketStart) {
        var t = new Date(e.BucketStart);
        if (!Number.isNaN(t.getTime())) return t;
      }
      if (
        "number" == typeof e.BucketStartEpoch &&
        ((t = new Date(1e3 * e.BucketStartEpoch)), !Number.isNaN(t.getTime()))
      )
        return t;
    }),
    (e.prototype.mapAlert = function (e) {
      return {
        id: this.numberValue(e.Id),
        title: String(e.Title || "AI CoE incident"),
        category: String(e.Category || "Incident"),
        severity: String(e.Severity || "Info"),
        status: String(e.Status || "Open"),
        provider: String(e.Provider || "Not specified"),
        detectedAt: e.DetectedAt,
        details: String(e.Details || ""),
      };
    }),
    (e.prototype.numberValue = function (e) {
      var t = "number" == typeof e ? e : Number(e);
      return Number.isFinite(t) ? t : 0;
    }),
    (e.prototype.dateValue = function (e) {
      if (!e) return 0;
      var t = new Date(e).getTime();
      return Number.isNaN(t) ? 0 : t;
    }),
    (e.usageListTitle = "AI Usage Daily"),
    (e.incidentsListTitle = "AI CoE Incidents"),
    e
  );
})();
