# Vjetar DHMZ (iPhone, SwiftUI, iOS 17+)

Pregled ALADIN/HR prognoze vjetra (i temperature, oblaka, oborine) na 72 h, plus tekstualna prognoza za nautičare.

## Pokretanje

**Opcija A – XcodeGen**
```
brew install xcodegen
cd VjetarDHMZ
xcodegen
open VjetarDHMZ.xcodeproj
```

**Opcija B – ručno**
1. Xcode → File → New → Project → iOS App (SwiftUI), ime `VjetarDHMZ`, minimum iOS 17.
2. Obriši generirane `ContentView.swift` i `VjetarDHMZApp.swift`.
3. Povuci svih 7 `.swift` datoteka iz mape `VjetarDHMZ/` u projekt.
4. Odaberi svoj Team u Signing & Capabilities → Run na iPhoneu.

Nisu potrebne dozvole ni API ključevi (sve je HTTPS).

## Izvori
- Karte: `https://prognoza.hr/aladinHR/<sloj>_<NN>.png`, NN = 00…72 (sat prognoze)
  - vjetar: `web_uv10_HRv8_` (cijela HR), `web_uv10_SENJ_` (Istra+Kvarner), `web_uv10_MASL_` (Zadar), `web_uv10_SPLI_` (Split), `web_uv10_DUBR_` (Dubrovnik)
  - `web_t02m_` temperatura, `web_naob_` naoblaka, `web_ob_uk_` oborina
- Nautička prognoza: `https://meteo.hr/prognoze.php?section=prognoze_specp&param=jadran` (HTML se parsira u tekst)

## Napomene
- Početak modela čita se OCR-om (Vision) iz natpisa „START MODELA“ na slici, pa aplikacija zna točno vrijeme za svaki frame; ako OCR zakaže, prikazuje se „Vrijeme modela nepoznato”, bez nagađanja datuma.
- Animacija učitava slike redom i čeka preuzimanje prije sljedećeg koraka. Zaustavlja se pri pogrešci i odlasku aplikacije u pozadinu.
- Prognoza za nautičare osvježava se povlačenjem. Karte se osvježavaju u Postavkama i nakon 30 min pri povratku u aplikaciju.

## GitHub
`.github/workflows/build.yml` na svaki push generira projekt (XcodeGen), provjerava da se kompajlira i izgradi nepotpisani `.ipa`
(Actions → zadnji run → Artifacts → `VjetarDHMZ-unsigned-ipa`). Taj `.ipa` se može potpisati i instalirati na iPhone
preko Sideloadly / AltStore svojim Apple ID-jem. Za App Store/TestFlight treba plaćeni Apple Developer račun.

## Novi prikaz
- Mali pomični tabovi: Istra + Kvarner, Zadar, Split, Dubrovnik i HR.
- Karta ispunjava raspoloživi ekran; povuci za pomicanje, povećaj s dva prsta.
- „Cijela karta” otkriva cijelu sliku i legendu; dvostruki dodir mijenja način prikaza.
- Pokreni/Pauza i vremenska traka od 0 do 72 sata, u koracima od jednog sata.
- Datumi i sati prikazani su u vremenskoj zoni Europe/Zagreb.
- Podržan je uspravni i vodoravni položaj iPhonea.

## Slanje na GitHub
U repozitorij prenesi sadržaj ove mape, uključujući skrivenu mapu `.github`.
Datoteka `project.yml` mora biti u korijenu repozitorija.
Workflow se pokreće i ručno kroz Actions → Build iOS → Run workflow.
GitHub repozitorij sam po sebi ne instalira aplikaciju na iPhone: izrađeni IPA je nepotpisan i treba Apple potpis.

## Provjera ove izmjene
Swift provjera tipova za iOS Simulator prošla je lokalno. Preuzimanje stvarne karte Splita provjereno je putem HTTPS-a.
Interakcije na fizičkom iPhoneu i potpisivanje nisu provjereni. GitHub Actions tek treba pokrenuti nakon prijenosa.
