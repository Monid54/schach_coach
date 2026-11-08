# Schach-Coach

Persönlicher Schachtrainer als iPhone-Web-App: Chess.com-Sync, Analyse mit Stockfish 19 (lokal im Browser), Review mit Bewertungsgraph, Puzzles aus eigenen Fehlern, Eröffnungs-Statistik. Keine Server, keine Tokens.

## Installation (GitHub Pages, ca. 5 Min.)
1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `schach-coach`.
2. Alle Dateien dieses Ordners hochladen (Add file → Upload files; Ordner `engine`, `vendor`, `icons` mit Inhalt).
3. Settings → Pages → Source: **GitHub Actions**.
4. Nach 1–2 Min. ist die App unter `https://<dein-name>.github.io/schach-coach/` erreichbar.
5. iPhone: Link in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**.
6. In der App unter *Setup* den Chess.com-Benutzernamen eintragen.

## Updates
Geänderte Dateien auf `main` pushen. Die Action `.github/workflows/pages.yml` deployt automatisch und setzt die Cache-Version in `sw.js` auf den Commit-Hash. App zweimal öffnen.
Voraussetzung: Settings → Pages → Source: **GitHub Actions**.

## Lizenzen
Stockfish (GPLv3, `engine/LICENSE-stockfish.txt`), chess.js (BSD, `vendor/LICENSE-chessjs.txt`). Wegen GPL muss das Repo öffentlich bleiben oder der Quellcode anderweitig verfügbar sein.
