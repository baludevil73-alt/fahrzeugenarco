# Narco City – gemeinsamer Fahrzeugbestand

## Stand 17.10.2026

Implementierung für `baludevil73-alt/fahrzeugenarco`, Projekt `icokbduvtfowqqujcvyy`.
**Noch nicht auf GitHub Pages freigeben:** Das echte Admin-App-Konto ist noch nicht registriert/bestätigt. Abschließender Browserdurchlauf mit echter Anmeldung und Bildern steht deshalb aus.

Die Datenbankeinrichtung aus `database-setup.sql` wurde über den Supabase SQL Editor bereits ausgeführt. Der private Bucket blieb privat. Vorher waren neun Policies vorhanden: vier für Fahrzeuge, vier für Bilder, eine für die eigene Freigabe; keine alten Owner-Policies. RLS war überall aktiv. Unnötige Rechte einschließlich TRUNCATE wurden entzogen. Neue Admin-Hilfsfunktionen liegen in einem nicht über die Data API freizugebenden Schema `vehicle_private`; öffentliche RPCs laufen als Invoker. Rollen werden niemals aus Benutzer-Metadaten oder der eingegebenen E-Mail abgeleitet.

## Nächste Schritte zur Inbetriebnahme

1. Die neue Seite lokal über HTTP öffnen (zum Beispiel `http://127.0.0.1:4174/` während der bereitgestellte Testserver läuft). **Registrieren** mit `w.ms197331@gmail.com` und eigenem neuen Passwort, E-Mail bestätigen. Alternativ im Supabase Dashboard unter Authentication → Users diese Adresse einladen und den Einladungsprozess selbst abschließen. Ein Dashboard-Konto ist kein Auth-Benutzer der App. Kein Passwort im Chat senden.
2. Unter Authentication → URL Configuration die Site URL `https://baludevil73-alt.github.io/fahrzeugenarco/` und diese exakte Redirect URL hinterlegen. Für den lokalen Test zusätzlich die konkret verwendete lokale URL erlauben. E-Mail-Bestätigung muss aktiviert bleiben.
3. `admin-bootstrap.sql` einmal als Projektadministrator ausführen. Es verweigert die Ausführung, solange genau diese bestätigte Adresse nicht als regulärer Auth-Benutzer existiert. Keine automatische Admin-Vergabe allein anhand von Frontend-E-Mail oder Benutzer-Metadaten.
4. Echter Browsertest: Admin anmelden, zweites Konto registrieren, vor Freigabe keinen Zugriff erlauben, freigeben, gemeinsames Erstellen/Bearbeiten/Löschen testen, Bild hochladen/anzeigen/exportieren und Freigabe entziehen. Zwei Browser dürfen veraltete Änderungen nicht gegenseitig überschreiben. Ausgeloggte Benutzer dürfen weder Daten noch private Bilder neu abrufen. Bereits ausgestellte Bildlinks sind höchstens fünf Minuten gültig.
5. Original-Sicherung `narco-city-sicherung-2026-10-17.json` mit 29 Fahrzeugen und 29 Bildern auswählen. Diese Datei war im Codex-Arbeitsbereich nicht vorhanden; ihre realen Inhalte sind noch nicht verifiziert. Die Vorschau muss die erwarteten Zahlen zeigen. Erst dann neue Fahrzeuge übernehmen; Export und Importprotokoll sichern und alle Bilder prüfen. Lokale Originaldaten unter `narcoCityVehicles_v1` und alte lokale Zugänge werden niemals gelöscht oder überschrieben, auch nicht nach Bestätigung. Die Übernahme lokaler Daten funktioniert nur unter derselben Website-Origin und im ursprünglichen Browser; auf der lokalen Test-Origin stattdessen die Sicherungsdatei verwenden.
6. Erst nach bestandenem Echttest den Branch in den Pages-Branch übernehmen, Pages-Bereitstellung abwarten und die Live-URL erneut prüfen. GitHub-Schreibzugriff wurde mit einem Dry Run bestätigt.

## Verhalten und Grenzen

- Jede freigegebene Person darf alle Fahrzeuge und Bilder bearbeiten. Nur der hinterlegte Admin kann Freigaben und den Migrationsimport ausführen. Neue Konten erhalten keinen automatischen Zugriff.
- Import ergänzt, ersetzt nie den Bestand. SHA-256-Schlüssel und serverseitige Belege verhindern Wiederholung auch nach späterem Löschen eines importierten Fahrzeugs. Kategorie + normalisiertes Kennzeichen verhindert weitere Dubletten, Konflikte werden übersprungen. Ohne Kennzeichen erkennt der Hash nur inhaltlich identische Datensätze. Abweichende Einträge sind manuell zu prüfen.
- Jede Importzeile wird atomar mit ihrem Beleg geschrieben. Bei Netzwerkfehlern darf der Import erneut gestartet werden; bereits übernommene Zeilen bleiben erhalten. Vorher hochgeladene, anschließend nicht referenzierte Bilder können als sichere Restdateien übrig bleiben. Automatische Bildlöschung ist bewusst nicht eingebaut; beim Löschen eines Fahrzeugs bleibt dessen Bild zur Wiederherstellung erhalten.
- Bilder werden im privaten Bucket gespeichert. Kurzlebige signierte URLs werden nur im Arbeitsspeicher der Seite verwendet. Export lädt die Bilder vollständig und bricht bei fehlenden Bildern ab.
- Für Bearbeitungen und Löschungen wird die geladene Serverversion geprüft. Trigger schützen Ersteller und Erstellungsdatum. Fehler schreiben nicht in die lokalen Originaldaten.
- Fremde Bild-URLs und SVG werden beim Import abgewiesen; keine automatischen Abrufe externer Adressen. PNG/JPEG/WebP/GIF bis 10 MB. Nicht unterstützte Altdaten bleiben in der Originaldatei und müssen vor Import separat geprüft werden.
- Feste Supabase-JS-Version 2.99.2 ist lokal gebündelt, ohne Laufzeit-CDN. SHA-256: `9a992da4959420f562cc2d46434ac1b9447481d6001f6b77514b9eb12a3185bb`. Nur ein `sb_publishable_`-Key ist im Frontend enthalten.

## Prüfung

`node --test tests/migration.test.js`: fünf bestandene Tests für unveränderte Quellen, Arrays/Backups, Dubletten, Kennzeichenkonflikte, ungültige Werte/Bildquellen und synthetische 29 Fahrzeuge mit Bildern. Dieser Test ersetzt nicht die Prüfung der echten Sicherungsdatei.

Zusätzlich live in einer vollständig zurückgerollten SQL-Transaktion bestanden: anonymer Zugriff verweigert, wartender Benutzer ohne Zugriff, keine Selbstfreigabe, Admin-Freigabe und Benutzerliste, gemeinsamer Zugriff, Importwiederholung/Kennzeichen-Deduplizierung, veraltetes Update blockiert, Ersteller unverändert, private Storage-Metadaten nur für freigegebene Benutzer, Schreibzugriff nach Entzug verweigert, kein TRUNCATE-Recht. Storage-Dateioperationen über die HTTP-API mit echter Sitzung bleiben noch zu testen. Es wurden keine Testkonten dauerhaft angelegt.

Browser: Anmeldeseite lädt, keine doppelten Element-IDs, keine sichtbaren Bestandstabellen ohne Anmeldung, keine Browserfehler. Syntaxprüfung bestanden.

Offizielle Referenzen: [Auth](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [private Storage-Zugriffe](https://supabase.com/docs/guides/storage/security/access-control), [signierte URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).

Supabase Security Advisor nach erneuter Analyse: 0 Fehler, 0 Warnungen. Anonyme HTTP-Tests: Fahrzeug- und Freigabetabellen 401, Admin-RPC 401, privater Bildlink verweigert (400). Registrierung ist aktiviert, E-Mail-Bestätigung ist erforderlich (mailer_autoconfirm=false).

