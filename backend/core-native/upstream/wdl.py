"""
Minimal Workflow Definition Language (Power Automate cloud flow) builder.
Produces the JSON the Power Platform solution format expects under Workflows/<Name>-<GUID>.json.
All connector calls are OpenApiConnection actions against connection references (solution-aware ALM).
"""
from __future__ import annotations
import json, uuid

SP_API = "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"
O365_API = "/providers/Microsoft.PowerApps/apis/shared_office365"
SP_REF = "aicoe_sharepointonline"
O365_REF = "aicoe_office365outlook"

SITE_PARAM = "aicoe_SiteUrl (aicoe_SiteUrl)"
MAIL_PARAM = "aicoe_NotificationEmail (aicoe_NotificationEmail)"
LABEL_PARAM = "aicoe_EnvironmentLabel (aicoe_EnvironmentLabel)"


def P(name: str) -> str:  # environment-variable-backed parameter reference
    return f"@parameters('{name}')"


class Flow:
    """Ordered action container. add() chains runAfter to the previous action unless run_after is given."""

    def __init__(self, name: str, description: str, trigger: dict, uses_mail: bool = False, literal: dict | None = None):
        self.name, self.description, self.trigger, self.uses_mail = name, description, trigger, uses_mail
        self.literal = literal  # {param: literal} -> literal-fallback mode (no env vars)
        self.actions: dict[str, dict] = {}
        self._last: str | None = None
        self.guid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cw-aicoe/3.0.0.0/{name}"))

    # ---- container helpers -------------------------------------------------------------
    def add(self, name: str, action: dict, run_after: dict | None = None, into: dict | None = None, last: list | None = None):
        """Add to top level (into=None) or into a block dict; `last` is a 1-element list tracking the block's tail."""
        container = self.actions if into is None else into
        if name in container: raise ValueError(f"duplicate action {name}")
        if run_after is None:
            prev = self._last if into is None else (last[0] if last else None)
            run_after = {prev: ["Succeeded"]} if prev else {}
        action = dict(action); action["runAfter"] = run_after
        container[name] = action
        if into is None: self._last = name
        elif last is not None: last[0] = name
        return name

    def wrap_after(self, anchor: str, scope_name: str):
        """Move every top-level action added after `anchor` into a new Scope named scope_name (first moved action gets runAfter {})."""
        names = list(self.actions); i = names.index(anchor) + 1
        moved = {n: self.actions.pop(n) for n in names[i:]}
        first = True
        for n, a in moved.items():
            if first: a["runAfter"] = {}; first = False
        self.actions[scope_name] = {"type": "Scope", "actions": moved, "runAfter": {anchor: ["Succeeded"]}}
        self._last = scope_name

    # ---- primitives --------------------------------------------------------------------
    @staticmethod
    def compose(inputs): return {"type": "Compose", "inputs": inputs}
    @staticmethod
    def parse(content: str, schema: dict): return {"type": "ParseJson", "inputs": {"content": content, "schema": schema}}
    @staticmethod
    def select(frm: str, sel): return {"type": "Select", "inputs": {"from": frm, "select": sel}}
    @staticmethod
    def filter(frm: str, where: str): return {"type": "Query", "inputs": {"from": frm, "where": where}}
    @staticmethod
    def init_var(name: str, vtype: str, value=None):
        v = {"name": name, "type": vtype}
        if value is not None: v["value"] = value
        return {"type": "InitializeVariable", "inputs": {"variables": [v]}}
    @staticmethod
    def set_var(name: str, value): return {"type": "SetVariable", "inputs": {"name": name, "value": value}}
    @staticmethod
    def append_var(name: str, value): return {"type": "AppendToArrayVariable", "inputs": {"name": name, "value": value}}
    @staticmethod
    def incr_var(name: str, by=1): return {"type": "IncrementVariable", "inputs": {"name": name, "value": by}}
    @staticmethod
    def scope(actions: dict): return {"type": "Scope", "actions": actions}
    @staticmethod
    def foreach(items: str, actions: dict, concurrency: int = 1):
        return {"type": "Foreach", "foreach": items, "actions": actions, "runtimeConfiguration": {"concurrency": {"repetitions": concurrency}}}
    @staticmethod
    def condition(expr: dict, then: dict, otherwise: dict | None = None):
        a = {"type": "If", "expression": expr, "actions": then}
        if otherwise is not None: a["else"] = {"actions": otherwise}
        return a
    @staticmethod
    def switch(expr: str, cases: dict[str, dict], default: dict | None = None):
        return {"type": "Switch", "expression": expr, "cases": {f"Case_{k}": {"case": k, "actions": v} for k, v in cases.items()}, "default": {"actions": default or {}}}
    @staticmethod
    def terminate(code: str, message: str, status: str = "Failed"):
        return {"type": "Terminate", "inputs": {"runStatus": status, "runError": {"code": code, "message": message}}}

    # ---- SharePoint connector ----------------------------------------------------------
    def _site(self): return self.literal["site"] if self.literal else P(SITE_PARAM)
    def _mail(self): return self.literal["mail"] if self.literal else P(MAIL_PARAM)
    def _label(self): return self.literal["label"] if self.literal else P(LABEL_PARAM)

    def _sp(self, op: str, params: dict):
        return {"type": "OpenApiConnection", "inputs": {"host": {"connectionName": "shared_sharepointonline", "operationId": op, "apiId": SP_API},
                                                        "parameters": {"dataset": self._site(), **params}, "authentication": "@parameters('$authentication')"}}
    def get_items(self, table: str, filt: str | None = None, top: int | str = 100, orderby: str | None = None):
        p = {"table": table, "$top": top}
        if filt: p["$filter"] = filt
        if orderby: p["$orderby"] = orderby
        return self._sp("GetItems", p)
    def get_item(self, table: str, item_id: str): return self._sp("GetItem", {"table": table, "id": item_id})
    def create_item(self, table: str, item: dict): return self._sp("PostItem", {"table": table, "item": item})
    def update_item(self, table: str, item_id: str, item: dict): return self._sp("PatchItem", {"table": table, "id": item_id, "item": item})
    def sp_http(self, method: str, uri: str, body: str | dict | None = None, headers: dict | None = None):
        p = {"parameters/method": method, "parameters/uri": uri,
             "parameters/headers": headers or {"Accept": "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose"}}
        if body is not None: p["parameters/body"] = body if isinstance(body, str) else json.dumps(body)
        return self._sp("HttpRequest", p)

    # ---- Outlook connector -------------------------------------------------------------
    def send_mail(self, to: str, subject: str, body: str):
        return {"type": "OpenApiConnection", "inputs": {"host": {"connectionName": "shared_office365", "operationId": "SendEmailV2", "apiId": O365_API},
                                                        "parameters": {"emailMessage/To": to, "emailMessage/Subject": subject, "emailMessage/Body": body, "emailMessage/Importance": "Normal"},
                                                        "authentication": "@parameters('$authentication')"}}

    # ---- definition --------------------------------------------------------------------
    def definition(self) -> dict:
        params = {"$connections": {"defaultValue": {}, "type": "Object"}, "$authentication": {"defaultValue": {}, "type": "SecureObject"}}
        if not self.literal:
            from model import ENV_VARS
            for schema, default, desc in ENV_VARS:
                params[f"{schema} ({schema})"] = {"defaultValue": default, "type": "String", "metadata": {"schemaName": schema, "description": desc}}
        refs = {"shared_sharepointonline": {"runtimeSource": "embedded", "connection": {"connectionReferenceLogicalName": SP_REF}, "api": {"name": "shared_sharepointonline"}}}
        if self.uses_mail:
            refs["shared_office365"] = {"runtimeSource": "embedded", "connection": {"connectionReferenceLogicalName": O365_REF}, "api": {"name": "shared_office365"}}
        return {"properties": {"connectionReferences": refs,
                               "definition": {"$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                                              "contentVersion": "1.0.0.0", "parameters": params,
                                              "triggers": {"Trigger": self.trigger}, "actions": self.actions,
                                              "description": self.description},
                               "templateName": None},
                "schemaVersion": "1.0.0.0"}


def recurrence(frequency: str, interval: int, hours: list[int] | None = None, minutes: list[int] | None = None, tz="Eastern Standard Time") -> dict:
    r = {"frequency": frequency, "interval": interval, "timeZone": tz}
    if hours is not None or minutes is not None:
        r["schedule"] = {}
        if hours is not None: r["schedule"]["hours"] = [str(h) for h in hours]
        if minutes is not None: r["schedule"]["minutes"] = minutes
    return {"type": "Recurrence", "recurrence": r, "runtimeConfiguration": {"concurrency": {"runs": 1}}}


def manual_button(schema: dict | None = None) -> dict:
    return {"type": "Request", "kind": "Button", "inputs": {"schema": schema or {"type": "object", "properties": {}, "required": []}}}


# ---- expression helpers (strings) --------------------------------------------------------
def choice(v: str) -> dict: return {"Value": v}
def q(s: str) -> str: return "'" + s.replace("'", "''") + "'"
def item(field: str, loop: str | None = None) -> str:
    return f"items('{loop}')?['{field}']" if loop else f"item()?['{field}']"
def body_val(action: str) -> str: return f"body('{action}')?['value']"
def out(action: str, path: str = "") -> str: return f"outputs('{action}'){path}"
def cfg(key: str) -> str: return f"outputs('Cfg')?['{key}']"
def now() -> str: return "utcNow()"
def new_id(prefix: str) -> str:
    return f"concat('{prefix}-', formatDateTime(utcNow(),'yyyyMMddHHmmss'), '-', toUpper(substring(replace(guid(),'-',''),0,6)))"
