#!/usr/bin/env python3
"""
Local mock for the CloudWave AI CoE UI <-> flow contract v0.1. Zero dependencies (stdlib only).

  python3 mock_server.py [--port 8787] [--mock-dir ./mock]

Routes (POST, JSON body = the contract 'request' object):
  /api/CreateOrResumeWork | /api/GetWorkStatus | /api/ListMyWork | /api/SubmitEvidenceResponse | /api/RequestDecisionReadiness
Matching: by operation + WorkID (+ EvidencePacketID / Requester where present) against the recorded pairs; the most
specific match wins; unknown WorkID -> the recorded NOT_FOUND error; a repeated IdempotencyKey returns the identical
response (replay-safe). GET /api/_pairs lists what is loaded. CORS is open for localhost SPFx workbench use.
This is a development stand-in for Brian's flows. It performs no tenant action and holds no state beyond memory.
"""
import argparse, json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ARGS = argparse.ArgumentParser(); ARGS.add_argument("--port", type=int, default=8787); ARGS.add_argument("--mock-dir", default=str(Path(__file__).resolve().parent / "mock"))
A = ARGS.parse_args()
MOCK = Path(A.mock_dir)
PAIRS = {}
for op_dir in sorted(p for p in MOCK.iterdir() if p.is_dir()):
    PAIRS[op_dir.name] = [(f.stem, json.loads(f.read_text())) for f in sorted(op_dir.glob("*.json"))]
SEEN = {}

def score(req, rec):
    s = 0
    for k in ("WorkID", "EvidencePacketID", "Requester"):
        if k in req or k in rec:
            if req.get(k) != rec.get(k): return -1
            s += 1
    if req.get("Context", {}).get("IdempotencyKey") == rec.get("Context", {}).get("IdempotencyKey"): s += 10
    return s

class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, indent=1).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*"); self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self): self._send(204, {})
    def do_GET(self):
        if self.path == "/api/_pairs": return self._send(200, {op: [n for n, _ in v] for op, v in PAIRS.items()})
        self._send(404, {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "use POST /api/<Operation>", "ReceiptID": "RCPT-MOCK-404", "RetryAllowed": False})
    def do_POST(self):
        op = self.path.rsplit("/", 1)[-1]
        if op not in PAIRS: return self._send(404, {"Result": "FAIL", "ErrorClass": "UNKNOWN_OPERATION", "Message": f"{op} not in contract", "ReceiptID": "RCPT-MOCK-404", "RetryAllowed": False})
        try: req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0) or b"{}")
        except Exception: return self._send(400, {"Result": "FAIL", "ErrorClass": "VALIDATION_FAILED", "Message": "body is not JSON", "ReceiptID": "RCPT-MOCK-400", "RetryAllowed": True})
        key = (op, req.get("Context", {}).get("IdempotencyKey"))
        if key[1] and key in SEEN: return self._send(200, SEEN[key])
        best, best_s = None, -1
        for _, pair in PAIRS[op]:
            s = score(req, pair["request"])
            if s > best_s: best, best_s = pair, s
        if best is None or best_s < 0:
            resp = {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "No recorded pair matches this request (mock).", "ReceiptID": "RCPT-MOCK-NOMATCH", "RetryAllowed": False}
        else:
            resp = best["response"]
        if key[1]: SEEN[key] = resp
        self._send(200 if resp.get("Result") == "PASS" else 409 if resp.get("Result") == "RECONCILIATION_REQUIRED" else 403 if resp.get("Result") == "DENIED" else 422, resp)
    def log_message(self, fmt, *args): sys.stderr.write("mock %s\n" % (fmt % args))

print(f"UI<->flow contract mock on http://localhost:{A.port}/api/<Operation>  ({sum(len(v) for v in PAIRS.values())} pairs from {MOCK})")
ThreadingHTTPServer(("127.0.0.1", A.port), H).serve_forever()
