// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var Se = {
    submitWorkflow: function (e, t) {
      return a(this, void 0, void 0, function () {
        return i(this, function (e) {
          return [
            2,
            {
              connected: !1,
              message:
                "The SharePoint governance service is not initialized. Open this experience from the Overture AI CoE site.",
            },
          ];
        });
      });
    },
  },
  De = Se,
  Ie = null,
  xe = {
    submitWorkflow: function (e, t) {
      return a(this, void 0, void 0, function () {
        return i(this, function (n) {
          switch (n.label) {
            case 0:
              return [4, De.submitWorkflow(e, t)];
            case 1:
              return [2, (Ie = n.sent())];
          }
        });
      });
    },
  };
function Ce() {
  return Ie;
}
var Oe = "overture-ai-coe-front-door:draft:";
function we(e, t) {
  return a(this, void 0, void 0, function () {
    return i(this, function (n) {
      try {
        return (
          window.localStorage.setItem(Oe + e, JSON.stringify(t)),
          [2, { ok: !0 }]
        );
      } catch (e) {
        return [2, { ok: !1 }];
      }
    });
  });
}
function Ee(e) {
  return a(this, void 0, void 0, function () {
    var t;
    return i(this, function (n) {
      try {
        return (t = window.localStorage.getItem(Oe + e))
          ? [2, JSON.parse(t)]
          : [2, null];
      } catch (e) {
        return [2, null];
      }
    });
  });
}
function Ae(e) {
  return a(this, void 0, void 0, function () {
    return i(this, function (t) {
      try {
        window.localStorage.removeItem(Oe + e);
      } catch (e) {}
      return [2];
    });
  });
}
