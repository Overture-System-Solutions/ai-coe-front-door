// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
function St(e) {
  var t = e.drafts,
    n = e.onSelect,
    a = e.siteUrl,
    i = e.usageMetricsService,
    r = e.isAdmin,
    o = e.onOpenAdmin,
    s = a ? "".concat(a.replace(/\/$/, ""), "/").concat(ce) : "../".concat(ce);
  return f().createElement(
    "div",
    { className: "ai-home" },
    r &&
      f().createElement(
        "div",
        { className: "ai-home-adminbar" },
        f().createElement("span", null, "AI CoE administration"),
        f().createElement(
          "button",
          { type: "button", onClick: o },
          f().createElement(Z, { "aria-hidden": "true" }),
          " Open admin dashboard",
        ),
      ),
    f().createElement(
      "section",
      { className: "ai-hero", "aria-labelledby": "ai-hero-title" },
      f().createElement(
        "div",
        { className: "ai-hero-copy" },
        f().createElement(
          "span",
          { className: "ai-hero-badge" },
          "OVERTURE AI COE",
        ),
        f().createElement(
          "h1",
          { id: "ai-hero-title" },
          "AI, safely put to work.",
        ),
        f().createElement(
          "p",
          null,
          "Ideas, guidance, training, and governance—start in the right place.",
        ),
        f().createElement(
          "button",
          {
            type: "button",
            className: "ai-hero-cta",
            onClick: function () {
              var e = document.getElementById("ai-coe-paths");
              e && e.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          "Choose your path ",
          f().createElement(te, { "aria-hidden": "true" }),
        ),
      ),
      f().createElement(pt, null),
    ),
    f().createElement(
      "section",
      { className: "ai-path-section", "aria-labelledby": "ai-coe-paths" },
      f().createElement("h2", { id: "ai-coe-paths" }, "How can we help?"),
      f().createElement(
        "div",
        { className: "ai-home-grid" },
        pe.map(function (e) {
          var a = mt[e],
            i = a.icon;
          return f().createElement(
            "button",
            {
              key: e,
              type: "button",
              onClick: function () {
                return n(e, !!t[e]);
              },
              className: "ai-service-card ai-service-card--".concat(a.tone),
            },
            f().createElement(i, {
              className: "ai-service-icon",
              "aria-hidden": "true",
            }),
            f().createElement(
              "span",
              { className: "ai-service-copy" },
              f().createElement(
                "span",
                { className: "ai-service-title" },
                a.title,
              ),
              f().createElement(
                "span",
                { className: "ai-service-description" },
                a.description,
              ),
              t[e] &&
                f().createElement(
                  "span",
                  { className: "ai-draft-badge" },
                  "Resume draft",
                ),
            ),
            f().createElement(te, {
              className: "ai-service-arrow",
              "aria-hidden": "true",
            }),
          );
        }),
      ),
    ),
    f().createElement(
      "nav",
      {
        className: "ai-resource-strip",
        "aria-label": "Popular AI CoE resources",
      },
      f().createElement(
        "a",
        { href: s, className: "ai-resource-link" },
        f().createElement(ne, { "aria-hidden": "true" }),
        f().createElement("span", null, "AI policy"),
        f().createElement(W, { "aria-hidden": "true" }),
      ),
      f().createElement(
        "button",
        {
          type: "button",
          className: "ai-resource-link",
          onClick: function () {
            return n("toolCheck", !!t.toolCheck);
          },
        },
        f().createElement(ae, { "aria-hidden": "true" }),
        f().createElement("span", null, "Approved tools"),
        f().createElement(W, { "aria-hidden": "true" }),
      ),
      f().createElement(
        "button",
        {
          type: "button",
          className: "ai-resource-link",
          onClick: function () {
            return n("helpTraining", !!t.helpTraining);
          },
        },
        f().createElement(ie, { "aria-hidden": "true" }),
        f().createElement("span", null, "Upcoming training"),
        f().createElement(W, { "aria-hidden": "true" }),
      ),
    ),
    f().createElement(bt, { usageMetricsService: i }),
  );
}
