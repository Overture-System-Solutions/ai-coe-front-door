/* New, deliberately simulated SPFx host. Never connects to a tenant or AI provider. */
(function () {
  "use strict";
  const requests = [];
  const lists = Object.fromEntries([
    "AI CoE Pilot Intakes", "AI CoE Use Cases", "AI CoE Decisions",
    "AI Usage Daily", "AI CoE Incidents",
  ].map(name => [name, []]));
  let WebPart;
  let nextId = 1;
  const block = () => { throw new Error("External network blocked in offline recovery preview"); };
  window.fetch = async () => block();
  window.XMLHttpRequest = function () { this.open = block; this.send = block; };
  window.WebSocket = block;
  window.EventSource = block;
  window.open = block;
  Object.defineProperty(window.navigator, "sendBeacon", { value: block, configurable: true });
  document.addEventListener("click", event => {
    const link = event.target.closest && event.target.closest("a[href]");
    if (link && !link.href.startsWith("blob:") && !link.href.startsWith("#")) event.preventDefault();
  });
  async function request(method, url, options) {
    const match = String(url).match(/getbytitle\('((?:[^']|'')+)'\)\/items/);
    const list = match && match[1].replace(/''/g, "'");
    if (!list || !Object.hasOwn(lists, list)) throw new Error("Unknown simulated SharePoint list");
    const body = options && options.body ? JSON.parse(options.body) : null;
    requests.push({ method, list, body, simulated: true });
    let result;
    if (method === "POST") {
      result = { ...body, Id: nextId++ };
      lists[list].push(result);
    } else result = { value: lists[list].slice() };
    return { ok: true, status: method === "POST" ? 201 : 200,
      json: async () => result, text: async () => JSON.stringify(result) };
  }
  function BaseClientSideWebPart() {
    this.context = {
      pageContext: {
        user: { displayName: "Local Preview (fictional)", email: "preview@example.invalid" },
        web: { absoluteUrl: location.origin + "/simulated-site", permissions: { hasPermission: () => true } },
      },
      spHttpClient: {
        get: (url, config, options) => request("GET", url, options),
        post: (url, config, options) => request("POST", url, options),
      },
    };
    this.domElement = document.getElementById("app");
  }
  window.define = function (id, dependencies, factory) {
    const values = {
      react: window.React,
      "react-dom": window.ReactDOM,
      "@microsoft/sp-core-library": { Version: { parse: value => ({ toString: () => value }) } },
      "@microsoft/sp-webpart-base": { BaseClientSideWebPart },
      "@microsoft/sp-page-context": { SPPermission: { manageWeb: "simulated-manage-web" } },
      "@microsoft/sp-http": { SPHttpClient: { configurations: { v1: {} } } },
    };
    if (dependencies.some(name => !values[name])) throw new Error("Unsupported SPFx dependency");
    WebPart = factory(...dependencies.map(name => values[name])).default;
  };
  window.RecoveryPreview = {
    mode: "OFFLINE_SIMULATION", requests, lists,
    async mount() {
      if (!WebPart) throw new Error("Build/load the recovered bundle before mounting");
      this.webpart = new WebPart();
      await this.webpart.onInit();
      this.webpart.render();
      return this.webpart;
    },
  };
})();
