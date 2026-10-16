# Rules

Generated from `src/core/rules/` by `scripts/rules-doc.ts` — do not edit by hand.
Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts`.
Every number a rule compares against is listed here with its source (`docs/research/qc-sources.md`).

| id | severity | category | thresholds | citations |
|---|---|---|---|---|
| IN-NO-DATA-FILE | error | input | — | — |
| IN-RECORD-INACCESSIBLE | error | input | — | — |
| IN-HOST-NOT-ALLOWED | warning | input | — | — |
| IN-FETCH-BLOCKED | warning | input | — | — |
| IN-LAYOUT-UNSUPPORTED | error | input | — | — |
| IN-ENCODING-FALLBACK | info | input | — | — |
| IN-DECIMAL-COMMA | info | input | — | — |
| IN-DATE1904 | info | input | — | [Microsoft Support, Date systems in Excel](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487), 1900 and 1904 date systems; "The difference between the two date systems is 1,462 days." |
| LIC-MISSING | error | A | — | — |
| LIC-FREE-TEXT | warning | A | — | — |
| LIC-RESTRICTION-CONFLICT | warning | A | — | — |
| LIC-DATACITE-EMPTY | warning | A | — | — |
| LIC-MISMATCH | warning | A | — | — |
| META-EMPTY-LINK | warning | A | — | — |
| META-NO-VERSION | info | A | — | — |
| META-NO-EXTENT | info | A | — | — |
| META-DATE-OUTSIDE-EXTENT | warning | A | — | — |
| META-POINT-OUTSIDE-BBOX | warning | A | — | — |
| META-VARIABLE-MISSING | warning | A | — | — |
| META-NO-DATES | error | A | — | — |
| ROW-LAT-RANGE | error | B | latitude.min = -90 degrees<br>latitude.max = 90 degrees | [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11<br>[GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44 |
| ROW-LON-RANGE | error | B | longitude.min = -180 degrees<br>longitude.max = 180 degrees | [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 3 "Impossible location test", p.11<br>[GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44 |
| ROW-LON-360 | info | B | — | [GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Test 1.3 "Impossible Location", PDF p.44 |
| ROW-LAT-EQ-LON | error | B | — | — |
| ROW-RAGGED | error | B | — | — |
| ROW-NON-NUMERIC | warning | B | — | — |
| ROW-NA-VARIANT | warning | B | — | — |
| ROW-STATION-MOVED | warning | B | — | — |
| ROW-DATE-UNPARSEABLE | warning | B | — | [W3C Note, Date and Time Formats (profile of ISO 8601)](https://www.w3.org/TR/NOTE-datetime), Formats: complete date YYYY-MM-DD<br>[DataCite Metadata Schema 4.6, property Date](https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/), section 8 Date, allowed formats |
| ROW-DATE-MISSING | info | B | — | — |
| ROW-YEAR-OUTLIER | warning | B | — | — |
| ROW-DATE-YYMMDD | info | B | — | — |
| ROW-TZ-UNKNOWN | info | B | — | — |
| ROW-UNIT-MISSING | warning | B | — | — |
| ROW-DEPTH-SIGN | info | B | — | — |
| ROW-DM-COORDS | info | B | — | — |
| XF-DUPLICATE-SAMPLES | info | C | — | — |
| XF-DATE-CONFLICT | warning | C | — | — |
| XF-STATION-ALIAS | info | C | — | — |
| XF-UNIT-CONFLICT | warning | C | — | [Lauvset et al. (2024), GLODAPv2.2023, Earth System Science Data 16, 2047](https://essd.copernicus.org/articles/16/2047/2024/), section 3.1 (per-litre to per-kilogram conversion with seawater density)<br>[Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44 (GitHub-hosted copy)](https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf), PDF p.23, check values of seawater density |
| XF-POSITION-SWAP | warning | C | — | — |
| XF-POSITION-CONFLICT | warning | C | — | — |
| CHEM-UNIT-PAIR | warning | C | molarMass.C = 12.011 g/mol<br>molarMass.N = 14.007 g/mol<br>molarMass.P = 30.974 g/mol<br>molarMass.Si = 28.085 g/mol | [CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "6 C carbon 12.011 ± 0.002"<br>[CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "7 N nitrogen 14.007 ± 0.001"<br>[CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "15 P phosphorus 30.974 ± 0.001"<br>[CIAAW, Abridged Standard Atomic Weights (2024)](https://ciaaw.org/abridged-atomic-weights.htm), table, "14 Si silicon 28.085 ± 0.001" |
| CHEM-DIC-GT-TA | warning | C | — | [TEOS-10 Manual, IOC Manuals and Guides 56](https://www.teos-10.org/pubs/TEOS-10_Manual.pdf), Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)<br>[Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)<br>[Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3](https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf), SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg) |
| CHEM-RANGE | warning | C | temperature.min = -2.5 °C<br>temperature.max = 40 °C<br>salinity.min = 2 psu<br>salinity.max = 41 psu<br>pressure.min = -5 dbar<br>oxygen.min = -5 µmol/kg<br>oxygen.max = 600 µmol/kg<br>pH.min = 6.5 pH units<br>pH.max = 9 pH units | [Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)](https://archimer.ifremer.fr/doc/00228/33951/32470.pdf), section 2.1.2, Test 6 "Global range test", p.12<br>[Argo Quality Control Manual for Dissolved Oxygen Concentration, v2.2 (15 Oct 2025)](https://archimer.ifremer.fr/doc/00354/46542/123086.pdf), section 2.2.1, Test 6 "Global range test", p.9<br>[GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)](https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf), Annex B, Table 2.1 "Global Impossible Parameter Values" (row pH, unit listed as none), PDF p.64 |
