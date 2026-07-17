# NauSlo Web

Przeglądarkowa wersja aplikacji NauSlo, przygotowana na podstawie projektu Android `NauSlo2`.

## Co zostało przeniesione

- zestawy słówek i edycja par polski–angielski,
- nauka etapami z powtórkami wcześniejszych zestawów,
- losowanie 4 zestawów,
- losowanie 40 słówek,
- sesja adaptacyjna z pulą 30 słówek,
- tryb „Wszystko losowo”,
- podpowiedzi literowe,
- przykłady w Reverso Context,
- licznik odpowiedzi i podsumowanie sesji,
- zapis lokalny w przeglądarce,
- import i eksport danych,
- działanie offline po zainstalowaniu jako PWA.

## Ważne: dane ze starej aplikacji

Kod projektu Android nie zawiera zapisanych zestawów. Są one przechowywane w prywatnej pamięci aplikacji na telefonie.

1. W starej aplikacji wybierz `Eksportuj`.
2. Przenieś utworzony plik TXT na iPhone'a, np. przez iCloud Drive.
3. W NauSlo Web wejdź w `Import i eksport`.
4. Wybierz plik TXT.

Eksport Androida nie zapisuje nazw ani granic zestawów, dlatego wszystkie pary z pliku TXT zostaną zaimportowane do jednego nowego zestawu. Po migracji używaj kopii JSON — zachowują pełną strukturę danych.

## Test na komputerze z Windows

Dwukrotne otwarcie `index.html` pozwoli sprawdzić większość funkcji, ale instalacja PWA i tryb offline wymagają serwera HTTP/HTTPS.

Jeżeli masz Pythona:

```powershell
cd NauSlo2_web
python -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

Możesz też uruchomić dołączony plik `start-local.bat`.

## Uruchomienie na iPhonie

Aplikacja musi być umieszczona pod adresem HTTPS. Najprostsze opcje to GitHub Pages, Netlify lub Cloudflare Pages. Projekt jest statyczny — nie wymaga kompilowania ani serwera aplikacyjnego.

### GitHub Pages

1. Utwórz nowe repozytorium na GitHubie.
2. Wgraj zawartość folderu `NauSlo2_web` do głównego katalogu repozytorium.
3. Wejdź w `Settings → Pages`.
4. Wybierz publikację z gałęzi `main` i katalogu `/root`.
5. Otwórz otrzymany adres na iPhonie w Safari.
6. Naciśnij `Udostępnij → Do ekranu początkowego`.

Po pierwszym poprawnym otwarciu aplikacja może działać offline. Dane są lokalne dla konkretnej przeglądarki i urządzenia, dlatego regularnie eksportuj kopię JSON.

## Synchronizacja Android ↔ iPhone

Ta wersja nie ma serwera ani kont użytkowników. Dane nie synchronizują się automatycznie między urządzeniami. Można je przenosić kopią JSON.

Automatyczna synchronizacja wymaga dodania backendu, np. Supabase lub Firebase, oraz mechanizmu logowania.

## Pliki

- `index.html` — punkt wejścia,
- `app.js` — cała logika aplikacji,
- `styles.css` — wygląd i układ mobilny,
- `manifest.webmanifest` — instalacja PWA,
- `sw.js` — pamięć offline,
- `icons/` — ikony aplikacji.
