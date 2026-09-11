// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
const Yt = Qt,
  Jt = (function (e) {
    function n() {
      var t = (null !== e && e.apply(this, arguments)) || this;
      return ((t.isDarkTheme = !1), t);
    }
    return (
      t(n, e),
      (n.prototype.render = function () {
        var e = u.createElement(Gt, {
          isDarkTheme: this.isDarkTheme,
          userDisplayName: this.context.pageContext.user.displayName,
          siteUrl: this.context.pageContext.web.absoluteUrl,
          usageMetricsService: new Yt(this.context),
          governanceService: this.governanceService,
          isAdmin: this.context.pageContext.web.permissions.hasPermission(
            h.SPPermission.manageWeb,
          ),
        });
        p.render(e, this.domElement);
      }),
      (n.prototype.onInit = function () {
        var e;
        return (
          (this.governanceService = new qt(this.context)),
          (e = this.governanceService),
          (De = e && "function" == typeof e.submitWorkflow ? e : Se),
          Promise.resolve()
        );
      }),
      (n.prototype.onThemeChanged = function (e) {
        if (e) {
          this.isDarkTheme = Boolean(e.isInverted);
          var t = e.semanticColors;
          t &&
            (this.domElement.style.setProperty(
              "--bodyText",
              t.bodyText || null,
            ),
            this.domElement.style.setProperty("--link", t.link || null),
            this.domElement.style.setProperty(
              "--linkHovered",
              t.linkHovered || null,
            ));
        }
      }),
      (n.prototype.onDispose = function () {
        p.unmountComponentAtNode(this.domElement);
      }),
      Object.defineProperty(n.prototype, "dataVersion", {
        get: function () {
          return m.Version.parse("1.0");
        },
        enumerable: !1,
        configurable: !0,
      }),
      n
    );
  })(_.BaseClientSideWebPart);
