# Contributing to KesslerX

Thank you for contributing to the KesslerX Orbital Safety Decision Support Platform. To ensure system reliability and aerospace safety standards, all contributions must adhere to the guidelines below.

---

## 1. Safety Non-Negotiables for Contributors

1. **Decision Support Only**: Never add automated execution of spacecraft maneuvers or commands. Every new maneuver output must include:
   `"Decision support only — human approval required."`
2. **Zero Random Physical Parameters**: Never use random number generators (`random`, `Math.random`) for physical parameters (miss distance, $\Delta v$, fuel cost, collision probability, or TCA).
3. **Data Provenance**: Every new data-driven component or endpoint must include source and mode metadata (`DataEnvelope<T>` or `ProvenanceBadge`).
4. **Secret Hygiene**: Never commit API keys, service account JSON files, or private tokens.

---

## 2. Development Workflow

### Setup
```bash
git clone https://github.com/Anish1302D/KesslerX.git
cd KesslerX
npm ci
cd backend
python -m venv venv
# activate venv
pip install -r requirements.txt
```

### Pre-Commit Checklist
Before submitting a pull request, run the following commands and ensure all pass with zero errors:

```bash
# 1. Zero ESLint errors and warnings
npx eslint .

# 2. Production build passes cleanly
npm run build

# 3. All frontend Vitest tests pass
npm test -- --run

# 4. All backend Pytest tests pass
pytest -q backend
```

---

## 3. Pull Request Standards

- Provide a concise description of changes and affected orbital mechanics or UI components.
- Include unit tests for any new endpoints or React components.
- Do not remove existing tests.
- Keep the dark aerospace visual identity consistent with existing Orbitron and Space Grotesk typography.

