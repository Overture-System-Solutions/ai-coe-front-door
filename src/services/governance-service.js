// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Kt = c(909),
  Wt = (function () {
    function e(e) {
      this.context = e;
    }
    return (
      (e.prototype.submitWorkflow = function (e, t) {
        return a(this, void 0, void 0, function () {
          var n, a, r, o, s, c, d, l, u, f, p, m, _, h, b, g, v, y;
          return i(this, function (i) {
            switch (i.label) {
              case 0:
                ((n = this.createIntakeId()),
                  (a = this.asRecord(t)),
                  (r = this.asRecord(a.originalAnswers || t)),
                  (o = this.asRecord(a.requestedBy || a.contact)),
                  (s = this.evaluateFlags(a, r)),
                  (c = "".concat(this.workflowLabel(e), " — ").concat(n)),
                  (d = new Date().toISOString()),
                  (l = String(
                    o.name ||
                      r.name ||
                      this.context.pageContext.user.displayName ||
                      "Unknown",
                  )),
                  (u = String(
                    o.email ||
                      r.email ||
                      this.context.pageContext.user.email ||
                      "",
                  )),
                  (f = JSON.stringify(t)),
                  (p = this.context.pageContext.web.absoluteUrl.replace(
                    /\/$/,
                    "",
                  )),
                  (i.label = 1));
              case 1:
                return (
                  i.trys.push([1, 5, , 6]),
                  [
                    4,
                    this.createListItem("AI CoE Pilot Intakes", {
                      Title: c,
                      IntakeId: n,
                      WorkflowType: e,
                      PilotWorkflowVersion: String(a.workflowVersion || "2.1"),
                      Status: "Submitted - Pilot",
                      Priority: s.requiresReview ? "High" : "Normal",
                      RequestorName: l,
                      RequestorEmail: u,
                      SubmittedAt: d,
                      CompanyDataOrWorkflow: s.companyDataOrWorkflow,
                      SensitiveOrRegulated: s.sensitiveOrRegulated,
                      HumanReview: String(r.humanReview || "Not specified"),
                      ToolName: String(
                        r.toolName || r.aiToolName || a.workflowOrService || "",
                      ),
                      RoutingOutcome: String(
                        a.outcome ||
                          (s.requiresReview
                            ? "AI CoE governance review"
                            : "AI CoE service queue"),
                      ),
                      PayloadJson:
                        f.length > 6e4
                          ? "".concat(f.slice(0, 59940), "...[truncated]")
                          : f,
                      PilotOnly: !this.isGovernanceWorkflow(e),
                    }),
                  ]
                );
              case 2:
                return (
                  (m = i.sent()),
                  (_ = void 0),
                  (h = void 0),
                  this.isGovernanceWorkflow(e)
                    ? [
                        4,
                        this.createListItem("AI CoE Use Cases", {
                          Title: c,
                          CoEID: n,
                          SubmitterEmail: u,
                          BusinessProblem: this.businessProblem(e, a, r),
                          BusinessOwnerEmail: u,
                          DataSensitivity: s.dataSensitivity,
                          ExternalUsers: s.externalUsers,
                          AutonomousActions: s.autonomousActions,
                          EstimatedMonthlyCost: this.estimatedMonthlyCost(r),
                          Status: "Submitted",
                          IntakeProcessed: !1,
                          TriageComplete: !1,
                          ApprovalRequested: !1,
                          LastStatusChanged: d,
                          PilotMeasure: this.pilotMeasure(a, r),
                        }),
                      ]
                    : [3, 4]
                );
              case 3:
                ((b = i.sent()),
                  (_ = b.Id || b.ID),
                  (h = _
                    ? ""
                        .concat(
                          p,
                          "/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=",
                        )
                        .concat(_)
                    : void 0),
                  (i.label = 4));
              case 4:
                return (
                  (g = m.Id || m.ID),
                  [
                    2,
                    {
                      connected: !0,
                      intakeId: n,
                      itemId: g,
                      itemUrl: g
                        ? ""
                            .concat(
                              p,
                              "/Lists/AICoEPilotIntakes/DispForm.aspx?ID=",
                            )
                            .concat(g)
                        : void 0,
                      governanceItemId: _,
                      governanceItemUrl: h,
                      message: this.isGovernanceWorkflow(e)
                        ? "Submission received and queued for AI CoE intake and triage."
                        : "Submission received and added to the AI CoE service queue.",
                    },
                  ]
                );
              case 5:
                return (
                  (v = i.sent()),
                  (y = v instanceof Error ? v.message : String(v)),
                  console.error("Overture AI CoE submission failed", v),
                  [
                    2,
                    {
                      connected: !1,
                      intakeId: n,
                      message:
                        "SharePoint could not create the AI CoE record. ".concat(
                          y,
                        ),
                    },
                  ]
                );
              case 6:
                return [2];
            }
          });
        });
      }),
      (e.prototype.getAdminDashboardData = function () {
        return a(this, void 0, void 0, function () {
          var e, t, n, a, r, o;
          return i(this, function (i) {
            switch (i.label) {
              case 0:
                return (
                  i.trys.push([0, 2, , 3]),
                  [
                    4,
                    Promise.all([
                      this.getListItems(
                        "AI CoE Pilot Intakes",
                        "Id,Title,IntakeId,WorkflowType,PilotWorkflowVersion,Status,Priority,RequestorName,RequestorEmail,SubmittedAt,CompanyDataOrWorkflow,SensitiveOrRegulated,HumanReview,ToolName,RoutingOutcome,PayloadJson,PilotOnly,Created,Modified",
                        "SubmittedAt desc",
                        200,
                      ),
                      this.getListItems(
                        "AI CoE Use Cases",
                        "Id,Title,CoEID,SubmitterEmail,BusinessProblem,BusinessOwnerEmail,DataSensitivity,ExternalUsers,AutonomousActions,EstimatedMonthlyCost,Status,RiskTier,ApproverEmail,ApprovalRequested,ApprovalOutcome,ApprovalComments,IntakeProcessed,TriageComplete,NextReviewDate,LastStatusChanged,PilotMeasure,Created,Modified",
                        "Created desc",
                        200,
                      ),
                      this.getListItems(
                        "AI CoE Decisions",
                        "Id,Title,UseCaseID,Decision,ApproverEmail,DecisionDate,Comments,Created,Modified",
                        "DecisionDate desc",
                        100,
                      ),
                    ]),
                  ]
                );
              case 1:
                return (
                  (e = i.sent()),
                  (t = e[0]),
                  (n = e[1]),
                  (a = e[2]),
                  [
                    2,
                    {
                      connected: !0,
                      intakes: t,
                      useCases: n,
                      decisions: a,
                      message: "SharePoint governance data refreshed.",
                    },
                  ]
                );
              case 2:
                return (
                  (r = i.sent()),
                  (o = r instanceof Error ? r.message : String(r)),
                  console.error("Overture AI CoE dashboard refresh failed", r),
                  [
                    2,
                    {
                      connected: !1,
                      intakes: [],
                      useCases: [],
                      decisions: [],
                      message:
                        "The dashboard could not load SharePoint data. ".concat(
                          o,
                        ),
                    },
                  ]
                );
              case 3:
                return [2];
            }
          });
        });
      }),
      (e.prototype.createListItem = function (e, t) {
        return a(this, void 0, void 0, function () {
          var n, a, r, o, s;
          return i(this, function (i) {
            switch (i.label) {
              case 0:
                return (
                  (n = this.context.pageContext.web.absoluteUrl.replace(
                    /\/$/,
                    "",
                  )),
                  (a = e.replace(/'/g, "''")),
                  (r = ""
                    .concat(n, "/_api/web/lists/getbytitle('")
                    .concat(a, "')/items")),
                  [
                    4,
                    this.context.spHttpClient.post(
                      r,
                      Kt.SPHttpClient.configurations.v1,
                      {
                        headers: {
                          Accept: "application/json;odata=nometadata",
                          "Content-Type": "application/json;odata=nometadata",
                        },
                        body: JSON.stringify(t),
                      },
                    ),
                  ]
                );
              case 1:
                return (o = i.sent()).ok ? [3, 3] : [4, o.text()];
              case 2:
                throw (
                  (s = i.sent()),
                  new Error(
                    ""
                      .concat(e, " returned ")
                      .concat(o.status, ": ")
                      .concat(s.slice(0, 500)),
                  )
                );
              case 3:
                return [2, o.json()];
            }
          });
        });
      }),
      (e.prototype.getListItems = function (e, t, n, r) {
        return a(this, void 0, void 0, function () {
          var a, o, s, c, d, l;
          return i(this, function (i) {
            switch (i.label) {
              case 0:
                return (
                  (a = this.context.pageContext.web.absoluteUrl.replace(
                    /\/$/,
                    "",
                  )),
                  (o = e.replace(/'/g, "''")),
                  (s =
                    ""
                      .concat(a, "/_api/web/lists/getbytitle('")
                      .concat(o, "')/items") +
                    "?$select="
                      .concat(t, "&$orderby=")
                      .concat(encodeURIComponent(n), "&$top=")
                      .concat(r)),
                  [
                    4,
                    this.context.spHttpClient.get(
                      s,
                      Kt.SPHttpClient.configurations.v1,
                      {
                        headers: {
                          Accept: "application/json;odata=nometadata",
                        },
                      },
                    ),
                  ]
                );
              case 1:
                return (c = i.sent()).ok ? [3, 3] : [4, c.text()];
              case 2:
                throw (
                  (d = i.sent()),
                  new Error(
                    ""
                      .concat(e, " returned ")
                      .concat(c.status, ": ")
                      .concat(d.slice(0, 500)),
                  )
                );
              case 3:
                return [4, c.json()];
              case 4:
                return (
                  (l = i.sent()),
                  [2, Array.isArray(l.value) ? l.value : []]
                );
            }
          });
        });
      }),
      (e.prototype.evaluateFlags = function (e, t) {
        var n = r(
            r(
              [],
              Array.isArray(t.sensitiveCategories) ? t.sensitiveCategories : [],
              !0,
            ),
            Array.isArray(t.informationCategories)
              ? t.informationCategories
              : [],
            !0,
          ).map(String),
          a = [
            "patient",
            "employee",
            "customer",
            "otherConfidential",
            "regulated",
            "unsure",
          ],
          i = ["yes", "unsure"],
          o = n.some(function (e) {
            return a.indexOf(e) >= 0;
          }),
          s =
            i.indexOf(String(t.companyDataOrWorkflow || "")) >= 0 ||
            n.some(function (e) {
              return "public" !== e && "none" !== e;
            }),
          c =
            i.indexOf(
              String(t.outputSharedExternally || t.externalUsers || ""),
            ) >= 0,
          d =
            i.indexOf(String(t.aiTakesAction || t.autonomousActions || "")) >=
            0,
          l = Array.isArray(e.reviewIndicators) ? e.reviewIndicators : [];
        return {
          companyDataOrWorkflow: s,
          sensitiveOrRegulated: o,
          externalUsers: c,
          autonomousActions: d,
          requiresReview:
            s ||
            o ||
            c ||
            d ||
            l.length > 0 ||
            String(e.outcome || "")
              .toLowerCase()
              .includes("review"),
          dataSensitivity: o ? "Restricted" : s ? "Confidential" : "Internal",
        };
      }),
      (e.prototype.isGovernanceWorkflow = function (e) {
        return (
          ["idea", "toolCheck-review-request", "teamUsage"].indexOf(e) >= 0
        );
      }),
      (e.prototype.businessProblem = function (e, t, n) {
        var a = this.asRecord(t.confirmedSummary),
          i = [
            a.problemToSolve,
            a.purpose,
            n.painPoints,
            n.workToImprove,
            n.helpWith,
            n.toolPurpose,
            n.specificTaskDetail,
            n.aiProjectDetail,
            n.chooseToolGoal,
            t.outcome,
          ].filter(function (e) {
            return "string" == typeof e && e.trim();
          });
        return i.length > 0
          ? String(i[0]).slice(0, 12e3)
          : "".concat(
              this.workflowLabel(e),
              " submitted through the AI CoE Front Door.",
            );
      }),
      (e.prototype.pilotMeasure = function (e, t) {
        var n = this.asRecord(e.confirmedSummary);
        return [
          n.desiredOutcome,
          n.possibleMeasuresOfSuccess,
          t.desiredOutcome,
          t.successMeasure,
          t.benefitObserved,
        ]
          .filter(function (e) {
            return "string" == typeof e && e.trim();
          })
          .join("\n\n")
          .slice(0, 12e3);
      }),
      (e.prototype.estimatedMonthlyCost = function (e) {
        var t = e.estimatedMonthlyCost,
          n = "number" == typeof t ? t : Number.parseFloat(String(t || "0"));
        return Number.isFinite(n) && n >= 0 ? n : 0;
      }),
      (e.prototype.asRecord = function (e) {
        return e && "object" == typeof e && !Array.isArray(e) ? e : {};
      }),
      (e.prototype.createIntakeId = function () {
        var e = new Date();
        return "OVT-AICOE-"
          .concat(
            [
              e.getUTCFullYear(),
              this.padTwo(e.getUTCMonth() + 1),
              this.padTwo(e.getUTCDate()),
            ].join(""),
            "-",
          )
          .concat(Math.random().toString(36).slice(2, 10).toUpperCase());
      }),
      (e.prototype.padTwo = function (e) {
        return e < 10 ? "0".concat(e) : String(e);
      }),
      (e.prototype.workflowLabel = function (e) {
        return (
          {
            idea: "AI idea",
            toolCheck: "Tool or task check",
            "toolCheck-review-request": "CoE review request",
            teamUsage: "Existing team AI use",
            helpTraining: "Help or training",
            feedback: "Front-door feedback",
          }[e] || e
        );
      }),
      e
    );
  })();
const qt = Wt;
