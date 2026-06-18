# HMS_Python → HMS_JS business rules migration

HMS_Python must not duplicate clinical business logic. Point the Python backend at HMS_JS internal endpoints (see [BUSINESS-RULES.md](./BUSINESS-RULES.md)).

## Environment

```env
# HMS_Python
HMS_JS_INTERNAL_BASE=http://127.0.0.1:3000
HMS_JS_INTERNAL_KEY=<same as INTERNAL_API_KEY on HMS_JS>
```

## Python client pattern

```python
import os, httpx

BASE = os.environ["HMS_JS_INTERNAL_BASE"].rstrip("/")
KEY = os.environ["HMS_JS_INTERNAL_KEY"]

def check_duplicate_patient(payload: dict) -> dict:
    r = httpx.post(
        f"{BASE}/internal/check-duplicate-patient",
        json=payload,
        headers={"X-HMS-Internal-Key": KEY},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()
```

Replace `clinical_gate_service.py` (and similar) calls incrementally.

## UI banner (until migration complete)

Show a fixed banner on HMS_Python clinical screens listing features still using local rules, e.g.:

- Patient duplicate check
- Lab/rad new-test gate
- OPD prescription gate
- Follow-up eligibility
- Payment ticket validity

Remove each line as the Python UI switches to the corresponding `/internal/*` endpoint.

## CI parity

Add a job that runs `npm run test:rules` on HMS_JS and equivalent scenarios against HMS_Python once proxied. Any divergence fails the build.
