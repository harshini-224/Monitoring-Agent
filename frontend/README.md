# CarePulse Frontend

Static multi-page frontend for CarePulse clinical operations.

## Run Without npm

The frontend is served directly by FastAPI. No npm install or npm scripts are required.

1. Start backend from `backend/`:

```bash
uvicorn app.main:app --reload
```

2. Open:

```text
http://127.0.0.1:8000/frontend/login.html
```

Root (`http://127.0.0.1:8000/`) redirects to the frontend login page.

## Shared Frontend Contracts

- `api-client.js`: centralized endpoints, retries, timeout, error normalization
- `state.js`: tiny store + request-gate helpers for stale-request protection
- `ui.js`: shared dialog/toast/empty/error/skeleton rendering
- `patient-utils.js`: shared patient formatting/status/timeline helpers

## Notes

- Keep page dialogs on `window.ui.dialog(...)` rather than creating per-page modal markup.
- Prefer `window.api.requestJson(...)` wrappers over direct `window.authFetch(...)` in feature pages.
