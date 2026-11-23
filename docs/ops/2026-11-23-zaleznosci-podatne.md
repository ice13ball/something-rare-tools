# Podatne zależności — 23.11.2026

Zlecenie Michała przez sesję AI-Wall: handoff `HANDOFF-STRAZNIK-ZALEZNOSCI-REPO-2026-11-23.md`. Strażnik liczył 2 pozycje.

Repozytorium ma jeden ekosystem: npm (`package-lock.json`). Nie ma plików Pythona.

| pakiet | waga | rodzaj | było | jest | poprawka |
|---|---|---|---|---|---|
| body-parser | wysoka | pośrednia, przez `express` 4.22.3 | 1.20.8 | 1.20.9 | GHSA-27r3-jxmh-p828: DoS przez bajty po skompresowanym ciele żądania. Zmienia się tylko lockfile; wersja mieści się w zakresie `~1.20.5`, który deklaruje express. |
| vite | umiarkowana | bezpośrednia, dev | 6.4.4 | 6.4.6 | GHSA-8g5g-mxqh-grgj: obejście `server.fs.deny` zapytaniem. Dotyczy tylko serwera deweloperskiego. Wersja przypięta dokładnie, bez zmiany wersji głównej. |

Po zmianie `npm audit` pokazuje 0 podatności. Nic nie zostaje otwarte.
Sprawdzenie: pełny `npm test` (typecheck + 9517 testów, w tym zbiór wzorcowy) i `npm run build` przechodzą.
Wdrożenie: tylko po zgodzie Michała. Zmiana wpływa na produkcję tylko przez body-parser w serwerze express.
