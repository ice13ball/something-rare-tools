# QC sources for rule thresholds (researched 2026-10-16)

The ONLY allowed source of numeric thresholds in `src/core/rules/`. Each value was read in the cited document.
Rows marked DERIVED or "NO CITABLE THRESHOLD FOUND" must not be used as rule thresholds.


Date of research: 2026-10-16. Every source below was downloaded/opened in this session (text extracted and grepped; the page/section was read). "Verified = yes" means the quote was read in the opened document. Where a number is MY OWN derivation from a published table it is labelled DERIVED and must not be presented as a published threshold.


Legend for flags used by the sources: Argo QC flag 4 = bad, 3 = probably bad.

---------------------------------------------------------------------------

## Item 1. Global physical range tests

### 1a. Argo CTD (physical) - Argo Quality Control Manual for CTD and Trajectory Data, v3.9, 20 Feb 2025
URL: https://archimer.ifremer.fr/doc/00228/33951/32470.pdf (landing/DOI: https://doi.org/10.13155/33951 -> https://archimer.ifremer.fr/doc/00228/33951/)
Location: section 2.1.2 "Quality control tests on vertical profiles", Test 6 "Global range test", printed p.12 (= PDF p.12).

| quantity | min | max | unit | exact quote | source URL | page/section | verified |
|---|---|---|---|---|---|---|---|
| Pressure (PRES) | -5 (hard); -5 to -2.4 = "probably bad" | NO upper limit stated | dbar | "Pressure cannot be less than –5 dbar. Pressure in the range –5 to –2.4 dbar should be considered 'probably bad'." Action: "If PRES < –5dbar, then PRES_QC = '4'..."; "If –5dbar <= PRES <= –2.4dbar, then PRES_QC = '3'" | https://archimer.ifremer.fr/doc/00228/33951/32470.pdf | 2.1.2, Test 6, p.12 | yes |
| Temperature (TEMP) | -2.5 | 40.0 | degC | "Temperature should be in the range –2.5 to 40.0°C." | same | 2.1.2, Test 6, p.12 | yes |
| Practical salinity (PSAL) | 2 | 41.0 | psu | "Salinity should be in the range 2 to 41.0 psu." | same | 2.1.2, Test 6, p.12 | yes |
| Temperature, Red Sea (regional) | 21.0 | 40.0 | degC | "Temperature should be in the range 21.0 to 40.0°C." (Red Sea) | same | Test 7, p.12 | yes |
| Salinity, Red Sea (regional) | 2 | 41.0 | psu | "Salinity should be in the range 2 to 41.0 psu." | same | Test 7, p.12 | yes |
| Temperature, Mediterranean (regional) | 10.0 | 40.0 | degC | "Temperature should be in the range 10.0 to 40.0°C." | same | Test 7, p.12 | yes |
| Salinity, Mediterranean (regional) | 2 | 40.0 | psu | "Salinity should be in the range 2 to 40.0 psu." | same | Test 7, p.12 | yes |

Caveat: Argo's range is defined for profiling-float CTD data, "a gross filter ... The ranges need to accommodate all the expected extremes encountered in the ocean". Seawater only: brackish/estuarine or porewater salinity below 2 would fail (that is by design for the open ocean).

### 1b. Argo BGC - dissolved oxygen: Argo Quality Control Manual for Dissolved Oxygen Concentration, v2.2, 15 Oct 2025
URL: https://archimer.ifremer.fr/doc/00354/46542/123086.pdf (DOI https://doi.org/10.13155/46542)
Location: section 2.2.1 "Common Argo real-time quality control tests on vertical profiles", "6. Global range test", printed p.9.

| quantity | min | max | unit | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|---|---|
| Dissolved oxygen (DOXY) | -5 | 600 | micromoles/kg | "DOXY in range [−5, 600] micromoles/kg" ; "Values that fail this test should be flagged with a QC = '4'" | https://archimer.ifremer.fr/doc/00354/46542/123086.pdf | 2.2.1, Test 6, p.9 | yes |
| TEMP_DOXY | -2.5 | 40.0 | degC | "TEMP_DOXY in range [−2.5, 40.0] °C" | same | same | yes |

### 1c. Argo BGC - pH: BGC-Argo quality control manual for pH, v1.1 (document date printed "September 15, 2026")
URL: https://archimer.ifremer.fr/doc/00866/97828/134495.pdf (DOI https://doi.org/10.13155/97828; landing https://archimer.ifremer.fr/doc/00866/97828/)
Location: "6. Global range test", Test 6 spans printed p.9-10 (values at top of p.10).

| quantity | min | max | unit | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|---|---|
| pH, in situ, total scale (PH_IN_SITU_TOTAL) - raw | 7.0 | 8.8 | pH units (total scale) | "PH_IN_SITU_TOTAL in range [7.0 8.8]" | https://archimer.ifremer.fr/doc/00866/97828/134495.pdf | Test 6, p.10 | yes |
| pH adjusted (PH_IN_SITU_TOTAL_ADJUSTED) | 7.3 | 8.5 | pH units | "PH_IN_SITU_TOTAL_ADJUSTED in range [7.3 8.5]" ; "Values that fail this test should be flagged with a QC = '4'" | same | Test 6, p.10 | yes |

Note: this is a float pH-sensor open-ocean range; raw [7.0, 8.8] is the looser one. The Euro-Argo cheat sheet (https://www.euro-argo.eu/content/download/154250/file/Cheat_sheets_BGCArgo.pdf, Jan 2021, opened, p.? pH sheet) lists the pH RTQC "Range test: [7.3, 8.5]" - superseded by the manual above for raw values.

### 1d. Argo BGC - nitrate: BGC-Argo quality control manual for nitrate concentration, v1.1, 1 Oct 2025
URL: https://archimer.ifremer.fr/doc/00732/84370/123085.pdf (DOI https://doi.org/10.13155/84370)
Location: "6. Global range test", PDF p.10.

| quantity | min | max | unit | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|---|---|
| Nitrate (NITRATE) - raw | -15 | 65 | micromole/kg | "NITRATE in range [-15 65] micromole/kg" | https://archimer.ifremer.fr/doc/00732/84370/123085.pdf | Test 6, PDF p.10 | yes |
| Nitrate adjusted | -2 | 50 | micromole/kg | "NITRATE_ADJUSTED in range [-2 50] micromole/kg" ; "Values that fail this test should be flagged with a QC = '4' for NITRATE." | same | Test 6, PDF p.10 | yes |

WARNING (a web-search summary claimed the Euro-Argo cheat sheet gives nitrate [-0.1, 50] umol/kg. I opened the cheat sheet: that "[-0.1, 50] umol kg-1" line is on the CHLOROPHYLL-a sheet, not nitrate. Do not use it for nitrate.)

### 1e. GTSPP - GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, 1st rev. ed., 2010 (v1.0)
URL: https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf (also https://www.jodc.go.jp/info/ioc_doc/Manual/mg22.pdf not opened; OBPS handle https://repository.oceanbestpractices.org/handle/11329/96 not opened)
Location: Annex B, "Test 2.1 Global Impossible Parameter Values", Table 2.1, Annex B pp.47-48 (PDF p.64). The rule: "The test begins by examining if the parameter value exceeds the maximum recorded in table 2.1 below... then tested against the minimum".

Units in this table are as published (note several are per LITRE / per m3, not per kg).

| quantity | min | max | unit (as published) | exact quote (row) | URL | page/section | verified |
|---|---|---|---|---|---|---|---|
| Water Temperature | -2.0 | 40 | degreesC | "Water Temperature  -2.0  40  degreesC" | https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf | Annex B, Table 2.1, PDF p.64 | yes |
| Salinity | 0 | 41 | psu | "Salinity  0  41  psu" | same | same | yes |
| Depth | 0 | 10000 | m | "Depth  0  10000  m" | same | same | yes |
| Sounding | 0 | 10,000 | M | "Sounding 0 10,000 M" | same | same | yes |
| Dissolved Oxygen | 0 | 650 | millimoles/m3 | "Dissolved Oxygen  0  650  millimoles/m3" (= umol/L numerically) | same | same | yes |
| Nitrate | 0 | 50 | micromoles/lt | "Nitrate  0  50  micromoles/lt" | same | same | yes |
| Nitrite | 0 | 4 | micromoles/lt | row "Nitrite 0 4 micromoles/lt" | same | same | yes |
| Phosphate | 0 | 4 | micromoles/lt | "Phosphate  0  4  micromoles/lt" | same | same | yes |
| Silicate | 0 | 300 | micromoles/lt | "Silicate  0  300  micromoles/lt" | same | same | yes |
| pH | 6.5 | 9.0 | none | "pH  6.5  9.0  none" | same | same | yes |
| Alkalinity | 800 | 4000 | micromoles/lt | "Alkalinity  800  4000  micromoles/lt" (history: "8 Mar, 2002: The maximum value for alkalinity was changed to 4000") | same | same | yes |
| Carbonate alkalinity | 800 | 2300 | micromoles/lt | row "Carbonate alkalinity 800 2300 micromoles/lt" | same | same | yes |
| Total DIC / TCO2 | - | - | - | NOT in the table | same | same | yes (absent) |
| Chlorophyll-a | 0 | 30 | milligrams/m3 | row | same | same | yes |

Caveat: the GTSPP table was written for real-time operational data (GTS) and uses per-litre units for chemistry. Alkalinity 800-4000 is deliberately very loose.

### 1f. WOD - World Ocean Database 2018 User's Manual (prerelease, Version 0.10, 2 Oct 2018; Garcia et al.)
URL: https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf
Location: "8. Range checks on observed level data" (printed p.34; PDF p.44), Table 11 (PDF p.45), Appendix 11 "Acceptable ranges of observed variables as a function of depth, by basin" (PDF p.78 onward, printed pp.68-94).
Quote (p.34): "Broad ranges have been established as a function of depth and oceanic basins ... for each variable. The range for a variable, in each region, is set large enough to encompass variations for all seasons and years." and "The ranges in these appendices do not represent the minimum and maximum values in the basins, but rather indicates extent of values beyond which the data are believed to be erroneous."

IMPORTANT: WOD ranges are NOT global scalars: they are tables per ocean basin x 33 standard depths (App. 11.1 T, 11.2 S, 11.3 O2, 11.4 PO4, 11.5 SiO4, 11.6 NO3, 11.7 pH, 11.8 Chl, 11.9 Alkalinity). A single global min/max must be DERIVED by taking the extreme over all cells. I did that (DERIVED, my computation from the parsed tables; not a published value). Use the table itself (basin+depth lookup) if you want a citable rule. Standard units in WOD18 Table 11: T degC; S dimensionless; O2, PO4, SiO4, NO3 umol/kg; pH dimensionless; Chl ug/l; Alkalinity table header says millimole per kilogram.

| quantity | DERIVED global envelope min | DERIVED global envelope max | unit | example of a published row (verbatim) | verified |
|---|---|---|---|---|---|
| Temperature (App 11.1) | -3.0 (Arctic) | 35.0 | degC | N. Atlantic 0 m: "-2.10  35.00"; Arctic 0 m "-3.00  20.00" | yes (tables read) |
| Salinity (11.2) | 0.0 | 50.0 | unitless | N. Atlantic 0 m "5.00  40.00" | yes |
| Dissolved oxygen (11.3) | 0 | 523 (marginal seas; open basins up to 479) | umol/kg | N. Atlantic 0 m "0  479" | yes |
| Phosphate (11.4) | 0 | 4.5 open basins; 60 in marginal-sea tables | umol/kg | S. Pacific 0 m "0.00  4.50" | yes |
| Silicate (11.5) | 0 | 250 open basins; 360 (Black Sea) | umol/kg | row Black Sea 0 m "0.00  360.00" | yes |
| Nitrate (11.6) | 0 | 60 for the 2nd table; first table contains a 500 cell (looks anomalous, not investigated); 125 for marginal seas | umol/kg | - | partially: do not use the 500 without reading the basin |
| pH (11.7) | 6.0 | 9.3 | unitless | N. Atlantic 0 m "7.50  8.70"; Coastal N. Atlantic 0 m "6.30  9.20" | yes |
| Alkalinity (11.9) | 0 | 3.1 | mmol/kg (=3100 umol/kg) | N. Atlantic 0 m "2.00  2.80"; coastal "0.00  2.80" | yes |

Also from WOD18 section 1.4.1/WOD23 intro (https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/wod_intro.pdf = WOD 2023, NOAA Atlas NESDIS 97, PDF p.35, section 1.4.1): "A lower level of quality control was done on pCO2, Dissolved Inorganic Carbon (DIC), ... Only initial range checks were applied to these variables. These ranges, a single minimum and maximum for all oceans were taken from the WOCE Data Reporting Requirements (WOCE Publication 90-1 Revision 2)." -> the actual DIC range is in WOCE 90-1 Rev 2, which I did NOT find/open. => DIC global range: NO CITABLE THRESHOLD FOUND.
Note WOD23 intro says the automatic checks use "minimum/maximum range assessment for 31 ocean areas at 102 standard levels" (WOD23 version differs from the WOD18 prerelease: 33 standard levels).

### 1g. SeaDataNet - SeaDataNet Data Quality Control Procedures, v2.0, May 2010
URL: https://nodc.ogs.it/repository/documents/guidelines/SeaDataNetQCproceduresV2May2010.pdf (the nodc.inogs.it host did not respond)
Location: section 4 "Automatic checks", PDF p.7. It lists "(iv) Global range test - Tests that observed parameter values are within the expected extremes encountered in the oceans" but gives NO numeric values and defers to GTSPP/Argo/MyOcean. => no numbers (verified yes).

### 1h. IOOS QARTOD - Manual for Real-Time Quality Control of Dissolved Oxygen Observations, v2.1, Aug 2018
URL: https://cdn.ioos.noaa.gov/attachments/2018/08/QARTOD_DOSecondUpdate_final.pdf ; Test 4 "Gross Range Test (Required)", PDF p.28 (printed p.16).
Quote: "Test specifications to be established locally by operator. Examples: DO_SENSOR_MAX = 99.9 mg/L (limited by the character output field, for example); DO_USER_MAX = 16 mg/L; DO_USER_MIN = 0 mg/L". => QARTOD gives only an EXAMPLE (0-16 mg/L), explicitly operator-defined; do NOT cite it as a threshold. Verified yes.

### 1i. GLODAP (Olsen et al. 2016 ESSD 8, 297; Lauvset et al. 2024 ESSD 16, 2047)
URLs: https://essd.copernicus.org/articles/8/297/2016/ (PDF read: https://essd.copernicus.org/articles/8/297/2016/essd-8-297-2016.pdf) ; https://essd.copernicus.org/articles/16/2047/2024/ (PDF https://essd.copernicus.org/articles/16/2047/2024/essd-16-2047-2024.pdf).
Quote (Olsen 2016, sect. 3.1 Primary quality control, PDF p.3): "The primary QC was carried out following routines outlined in Sabine et al. (2005) and Tanhua et al. (2010), primarily by inspecting property–property plots. Outliers showing up in two or more different property–property plots were generally flagged as such."
=> GLODAP primary QC is visual/expert, NOT numeric range tests. Lauvset 2024 sect. 3.1 says the same family of procedure and gives no numeric TA/DIC range limits (searched text for ranges: none). => GLODAP numeric TA/DIC range tests: NO CITABLE THRESHOLD FOUND. (Verified yes, both PDFs read/grepped.)
Cross-check limit stated in Lauvset 2024 sect. 3.2.2: "initial minimum adjustment limit for alkalinity of 4 µmol kg−1" - this is a secondary-QC adjustment threshold, not a data range.

### 1j. Not found
- Porewater: no published global range test found for porewater pH/alkalinity/nutrients in any of the above (all are water-column tests). => NO CITABLE THRESHOLD FOUND for porewater ranges.
- Sediment-water / porewater DIC upper bound: NO CITABLE THRESHOLD FOUND.

---------------------------------------------------------------------------

## Item 2. Position and date checks

| test | rule | exact quote | URL | section/page | verified |
|---|---|---|---|---|---|
| Argo Test 3 "Impossible location test" | lat -90..90, lon -180..180 | "Latitude in range −90° to 90°  • Longitude in range −180° to 180°". Action: flag position '4' | https://archimer.ifremer.fr/doc/00228/33951/32470.pdf | 2.1.2, Test 3, p.11 | yes |
| Argo Test 2 "Impossible date test" | JULD >= 17167 and < current UTC date. JULD = days since 1950-01-01; 17167 = 1997-01-01 (I verified arithmetically: 1950-01-01 + 17167 d = 1997-01-01) | "This test requires that the Julian day of a float profile be later than 1st January 1997 and earlier than the current date of the check (in UTC time). Hence if JULD = number of days elapsed since 1st January 1950, then this test checks that: 17167 <= JULD < UTC date of check" | same | 2.1.2, Test 2, p.11 | yes |
| GTSPP 1.3 "Impossible Location" | lat between 90S and 90N inclusive; lon between 180W and 180E | "PART 1 begins by checking if the latitude lies between 90 degrees south and 90 degrees north inclusive." / "the longitude must lie between 180 degrees west and 180 degrees east. Note that longitudes given using a different co-ordinate system must be converted." (rules 1.3.1 "plus or minus 90 degrees", 1.3.13 "plus or minus 180 degrees") | https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf | Annex B, Test 1.3, PDF p.44 | yes |
| GTSPP 1.2 "Impossible Date and Time" | month 1-12, day valid for month/year, hour 0-23, minute 0-59, not later than present; real-time data within 30 days of present | "tests if the month is a value between 1 and 12"; "This test allows for real-time data by testing data derived from this source has a date that is within 30 days of the present." | same | Annex B, Test 1.2, PDF p.23 | yes |
| SeaDataNet section 4 | date/time + position validity | "Month between 1 and 12 / Day in range expected for month / Hour between 0 and 23 / Minute between 0 and 59"; "Latitude in range -90 to 90 / Longitude in range -180 to 180" | https://nodc.ogs.it/repository/documents/guidelines/SeaDataNetQCproceduresV2May2010.pdf | 4 (i),(ii), PDF p.7 | yes |

Note for a lon convention check: Argo and SeaDataNet both require [-180,180]; GTSPP says other systems "must be converted" (so 0-360 is not valid raw).
Note: Argo's 1997 lower date bound is Argo-specific (programme start) and must NOT be reused for historical bottle data.

---------------------------------------------------------------------------

## Item 3. Carbonate system plausibility

### 3a. Is there a citable statement "TA normally exceeds DIC"? 
NO CITABLE STATEMENT FOUND as a rule. What I did find and read:

| item | value | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|
| Definitions (so the inequality can be reasoned about, NOT a rule) | CT = [CO2*]+[HCO3-]+[CO3 2-]; AT = [HCO3-] + 2[CO3 2-] + [B(OH)4-] + [OH-] + [HPO4 2-] + 2[PO4 3-] + [SiO(OH)3-] + [NH3] + [HS-] + ... - [H+]F - [HSO4-] - [HF] - [H3PO4] | "CT = [CO*2] + [HCO3–] + [CO32–]" (eq. 12); "AT = [HCO3−] + 2[CO32−] + [B(OH)−4] + [OH−] + ..." (eq. 13) | Dickson, Sabine & Christian (2007) Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3 / IOCCP Report 8: https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf | Chapter 2, section 4.1 and 4.2 (Chapter 2 pp.3-4) | yes |
| Standard Seawater TA and DIC (shows TA > DIC for S=35 reference seawater) | TA = 0.0023 (SP/35) mol/kg = 2300 umol/kg at SP 35; DIC = 0.00208 (SP/35) mol/kg = 2080 umol/kg at SP 35 | "For Standard Seawater our best estimates of TA and DIC are 0.0023 (SP/35) mol kg−1 and 0.00208 (SP/35) mol kg−1 respectively" (I confirmed the "/35" by viewing the page image; text layer drops the slash) | TEOS-10 Manual, IOC Manuals and Guides 56: https://www.teos-10.org/pubs/TEOS-10_Manual.pdf | Appendix A.4, printed pp.80-81 (PDF p.90-91) | yes |
| Oceanic scope of DIC method | 1800-2300 | "The method is suitable for the assay of oceanic levels of total dissolved inorganic carbon (1800–2300 µmol kg–1) and also for higher levels such as are found in the Black Sea (3800–4300 µmol kg–1)." | Dickson et al. 2007 Guide, SOP 2 section 1, PDF p.39 of the all-in-one file | yes |
| Oceanic scope of TA method | 2000-2500 | "The method is suitable for the assay of oceanic levels of total alkalinity (2000–2500 µmol kg–1) and can be adapted easily to measure higher levels such as those that have been observed in the Black Sea (3200–4600 µmol kg–1)." | same Guide, SOP 3a section 1, PDF p.53 | yes |
| TA lower values | "Lower values may be encountered in coastal and surface polar waters." | "The method is suitable for assaying oceanic levels of total alkalinity (2000–2500 µmol kg–1). Lower values may be encountered in coastal and surface polar waters." | same Guide, SOP 3b section 1, PDF p.73 | yes |

Important: these "oceanic levels" are the scope of an analytical method (calibration range), NOT QC thresholds. They are citable as "typical open-ocean ranges", with that wording only.
The Guide contains no sentence that TA > DIC (I grepped for it). TEOS-10 gives the two Standard Seawater values only. Whether TA > DIC can be turned into a hard rule is therefore your inference, not a citation. From the definitions, AT - CT = [CO3 2-] - [CO2*] + [B(OH)4-] + [OH-] + ... - [H+] - ..., so TA < DIC can happen in CO2-rich/low-pH waters (my reasoning, uncited) - so a TA<DIC check should at best be a WARNING, never an error, and I have no citation making it a rule.

### 3b. GLODAP range tests for TA/DIC
NO CITABLE THRESHOLD FOUND (see 1i; GLODAP primary QC is by inspection of property-property plots).
GLODAP accuracy statement (not a range): Olsen 2016 abstract, "consistent to better than ... 4 µmol kg−1 in dissolved inorganic carbon, 6 µmol kg−1 in total alkalinity, 0.005 in pH" (https://essd.copernicus.org/articles/8/297/2016/, abstract; verified yes).

Typical ranges quoted for TA/DIC in a QC document: GTSPP alkalinity 800-4000 umol/L, carbonate alkalinity 800-2300 umol/L (item 1e); WOD18 alkalinity App. 11.9 (0-3.1 mmol/kg envelope; open ocean rows 2.0-2.8 mmol/kg at surface in N. Atlantic) (item 1f). No document found with a DIC global range.

---------------------------------------------------------------------------

## Item 4. Unit conversions

| quantity | value | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|
| Carbon: standard atomic weight (interval) | [12.0096, 12.0116] | "6 C carbon [12.0096, 12.0116]" (Standard Atomic Weights 2024) | https://ciaaw.org/atomic-weights.htm | table | yes |
| Carbon: abridged/conventional | 12.011 +- 0.002 | "6 C carbon 12.011 ± 0.002" (Abridged Standard Atomic Weights 2024) | https://ciaaw.org/abridged-atomic-weights.htm | table | yes |
| Nitrogen | abridged 14.007 +- 0.001 | "7 N nitrogen 14.007 ± 0.001" ; interval [14.006 43, 14.007 28] | https://ciaaw.org/abridged-atomic-weights.htm ; https://ciaaw.org/atomic-weights.htm | tables | yes |
| Oxygen | abridged 15.999 +- 0.001 | "8 O oxygen 15.999 ± 0.001" ; interval [15.999 03, 15.999 77] | same | tables | yes |
| Silicon | abridged 28.085 +- 0.001 | "14 Si silicon 28.085 ± 0.001" ; interval [28.084, 28.086] | same | tables | yes |
| Phosphorus | abridged 30.974 +- 0.001 | "15 P phosphorus 30.974 ± 0.001" ; 30.973 761 998(5) | same | tables | yes |
Element pages also opened: https://ciaaw.org/carbon.htm, nitrogen.htm, oxygen.htm, silicon.htm, phosphorus.htm (yes). Note: CIAAW's abridged tables are the "conventional"-style 5-significant-figure values; for the 2024 table the carbon standard value is an interval, 12.011 is the abridged number.
O2 molar mass (gas, not in the CIAAW table): derive 2 x 15.999 = 31.998 (my arithmetic).

| quantity | value | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|
| umol/L to umol/kg via density: practice in GLODAP | default: density at reported salinity, 22 degC, 1 atm (nutrients); oxygen: ml/L factor 44.66; density from salinity and draw temperature | "The default conversion procedure for nutrients was to use seawater density at reported salinity, an assumed measurement temperature of 22 °C, and pressure of 1 atm. For oxygen, the factor 44.66 was used for the “milliliters of oxygen” to “micromoles of oxygen” conversion, while the density required for the “per liter” to “per kilogram” conversion was calculated from the reported salinity and draw temperatures whenever possible." (cites Jiang et al. 2022) | https://essd.copernicus.org/articles/16/2047/2024/ (PDF .../essd-16-2047-2024.pdf p.8) | section 3.1 | yes |
| Seawater density check values (UNESCO/EOS-80) | S=35, t=5 degC, p=0: 1027.67547 kg/m3; S=35, t=25 degC, p=0: 1023.34306 kg/m3; S=35, t=5 degC, p=10000 dbar: 1069.48914 kg/m3 | table "S  t(oC)  p(dbars)  p(S,t,p)": "35 5 0 1027.67547 ... 25 0 1023.34306" | UNESCO Technical Papers in Marine Science 44 (Fofonoff & Millard 1983): https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf (a GitHub-hosted copy; the official UNESCO URL returned HTML, not the PDF) | PDF p.23 ("check values") | yes |
| Relation | umol/kg = (umol/L) / rho(kg/L) | derivation; no single sentence found that states it in the TEOS-10 manual | - | - | NO CITABLE sentence found |
| TEOS-10 | density of seawater is the reciprocal of specific volume | "The density of seawater ρ is the reciprocal of the specific volume." | https://www.teos-10.org/pubs/TEOS-10_Manual.pdf | Section 2.8 (line near eq. 2.8.x; not page-checked) | yes (quote) |

"Typical seawater density range": NO CITABLE "typical range" sentence found. Citable anchor points are only the EOS-80 check values above (about 1023-1028 kg/m3 for S=35, 5-25 degC, surface; up to 1069 kg/m3 at 10000 dbar). A conversion factor of ~1.02-1.03 kg/L for surface seawater follows from those points but the range statement itself is my inference.

---------------------------------------------------------------------------

## Item 5. Ship speed / maximum plausible speed between stations

NO CITABLE SHIP-SPEED THRESHOLD FOUND in the 16.10.2026 pass. (Superseded 24.10.2026: the 23.10 research found two citable numbers, marine-qc 40 knots and MEDATLAS 15 knots; see "Ship speed" at the end of this file. The table below stays as read on 16.10.) What exists:

| source | what it says | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|
| Argo Test 5 (for floats, not ships) | drift speed must not exceed 3 m/s | "In all cases we would not expect the drift speed to exceed 3 ms−1." | https://archimer.ifremer.fr/doc/00228/33951/32470.pdf | 2.1.2, Test 5, p.12 | yes (float/surface drift only - do NOT apply to ships) |
| GTSPP Test 1.5 Impossible Speed | per-platform lookup table, no global number | "It makes use of a table of platform identifiers that records the maximum speed possible for each." ; "If it is not [a known identifier], no test of the speed may be performed" | https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf | Annex B, Test 1.5, PDF p.53 | yes (no number in the manual; I searched "knots", "m/s") |
| WOD18 Speed check | qualitative | "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform." | https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf | section 4 "Speed check", printed p.31 (PDF p.41) | yes (no number) |
| SeaDataNet | lists "Check ship speed between stations to look for incorrect position or date/time" | same quote | https://nodc.ogs.it/repository/documents/guidelines/SeaDataNetQCproceduresV2May2010.pdf | section 5.1, PDF p.8 | yes (no number) |

=> Any numeric ship-speed limit in your checker (e.g. 25-30 kn) would be invented. Options: make it a user-configurable parameter with no default claim, or cite Argo's 3 m/s ONLY for platforms that drift.

---------------------------------------------------------------------------

## Item 6. "Same station at different positions" tolerance

NO CITABLE THRESHOLD FOUND. I checked the GTSPP manual, SeaDataNet QC procedures v2, WOD18 manual (the "duplicate cast checks" concern duplicate casts, not station revisits) and ran a web search for ICES station dictionary / OceanSITES / SeaDataNet tolerance language - no published tolerance for the maximum separation of repeated occupations of one named station was found. I did NOT open the ICES Station Dictionary or OceanSITES manuals themselves (so "not found" is for what I opened/searched, not proof of absence).

---------------------------------------------------------------------------

## Item 7. NERC Vocabulary Server (NVS)

Collection pages (opened, HTTP 200):
- P01 (BODC parameter usage vocabulary): https://vocab.nerc.ac.uk/collection/P01/current/
- P06 (BODC-approved data storage units): https://vocab.nerc.ac.uk/collection/P06/current/

Single-concept lookup (tested, all HTTP 200):
- HTML: https://vocab.nerc.ac.uk/collection/P06/current/<CODE>/
- JSON-LD: same URL with `?_profile=nvs&_mediatype=application/ld+json` (content-type application/ld+json) - or send header `Accept: application/ld+json`. RDF/XML: `?_profile=nvs&_mediatype=application/rdf+xml` or Accept application/rdf+xml. Turtle: Accept text/turtle. NOTE: `Accept: application/json` returns HTML, not JSON. `?_profile=skos&_mediatype=application/ld+json` returns a @graph including broader/narrower concepts.
- SPARQL endpoint: https://vocab.nerc.ac.uk/sparql/sparql (GET `?query=...`, header `Accept: application/sparql-results+json`; worked). Use `skos:prefLabel` filtered by `STRSTARTS(STR(?c),"http://vocab.nerc.ac.uk/collection/P06/current/")`; results also contain version URIs like .../UPOX/1/.
- Identifier form on each page: `SDN:P06::UPOX`.

P06 codes, each concept page opened (https://vocab.nerc.ac.uk/collection/P06/current/<CODE>/) on 2026-10-16:

| unit wanted | P06 code | prefLabel on page | altLabel on page | URL | verified |
|---|---|---|---|---|---|
| micromoles per litre | UPOX | Micromoles per litre | umol/l | https://vocab.nerc.ac.uk/collection/P06/current/UPOX/ | yes |
| micromoles per kilogram | KGUM | Micromoles per kilogram | umol/kg | https://vocab.nerc.ac.uk/collection/P06/current/KGUM/ | yes |
| milligrams per litre | UMGL | Milligrams per litre | mg/l | https://vocab.nerc.ac.uk/collection/P06/current/UMGL/ | yes |
| degrees Celsius | UPAA | Degrees Celsius | degC | https://vocab.nerc.ac.uk/collection/P06/current/UPAA/ | yes |
| decibars | UPDB | Decibars | dbar | https://vocab.nerc.ac.uk/collection/P06/current/UPDB/ | yes |
| metres | ULAA | Metres | m | https://vocab.nerc.ac.uk/collection/P06/current/ULAA/ | yes |
| dimensionless | UUUU | Dimensionless | Dmnless | https://vocab.nerc.ac.uk/collection/P06/current/UUUU/ | yes |
| practical salinity units | PSUX | Practical salinity units | PSU | https://vocab.nerc.ac.uk/collection/P06/current/PSUX/ | yes (definition on page: "One PSU equals one gram (10^-3 of the SI unit of mass) of salt (Na+Cl-) per kilogram ... of seawater" - note this definition conflicts with PSS-78 unitless practical salinity; for practical salinity P06 UUUU/"Dimensionless" is the safer choice, but that is my opinion, not a citation) |
| pH units | UUPH | pH units | pH units | https://vocab.nerc.ac.uk/collection/P06/current/UUPH/ | yes |
| nanomoles per litre | UPNM | Nanomoles per litre | nmol/l | https://vocab.nerc.ac.uk/collection/P06/current/UPNM/ | yes |

P01 examples seen only via SPARQL result labels (concept pages not individually opened): PSLTZZ01 "Practical salinity of the water body", TEMPPR01 "Temperature of the water body". If you need P01 codes for DOXY/TA/DIC/pH/nutrients, they must be looked up by label (P01 is large); I did not verify any such code.
Also seen (NVS R11 collection via web search snippet, not opened by me): Argo QC test IDs - not verified.

---------------------------------------------------------------------------

## Item 8. Missing-value conventions (optional)

| convention | value | exact quote | URL | page/section | verified |
|---|---|---|---|---|---|
| GLODAPv2.2023 exchange files | -999 | "Missing numbers are indicated by −999." | https://essd.copernicus.org/articles/16/2047/2024/ | section 3.1 (PDF p.8) | yes |
| GLODAPv2 (2016) product csv / MATLAB | -9999 / NaN | "Missing data are set to −9999 in the csv files and NaN in the MATLAB files." (re: product files, section on file contents) | https://essd.copernicus.org/articles/8/297/2016/essd-8-297-2016.pdf | PDF p.16 | yes |
| GLODAP adjustment table | -999 "No data exist for this variable for the cruise in question" | Table 3 | same | PDF p.8 | yes |
Not found / not opened: SeaDataNet ODV format specification (I located only biology-variant ODV guideline PDFs on https://www.seadatanet.org/Standards/Data-Transport-Formats and did not open them), PANGAEA, WOD missing-value codes. => NO CITABLE LIST of generic NA tokens ("NA","N/A","NaN","-") found; a generic token list in the checker would be a convention, not a citation. The WOCE exchange missing value is -999 (as used by GLODAP), which is citable only via GLODAP's statement above.

---------------------------------------------------------------------------

## Item 9. Dates

| item | statement | exact quote | URL | verified |
|---|---|---|---|---|
| DataCite date format | YYYY, YYYY-MM-DD, YYYY-MM-DDThh:mm:ssTZD or any W3CDTF level; ISO 8601 (RKMS-ISO8601) for ranges | "Allowed values, examples, other constraints: YYYY, YYYY-MM-DD, YYYY-MM-DDThh:mm:ssTZD or any other format or level of granularity described in W3CDTF. Use RKMS-ISO8601 standard for depicting date ranges. Example: 2004-03-02/2005-06-02." | https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/ (DataCite Metadata Schema 4.6, section 8 Date) | yes |
| W3C date/time profile of ISO 8601 | formats | "Complete date: YYYY-MM-DD (eg 1997-07-16)" ; "the "T" appears literally ... as specified in ISO 8601" ; "hh = two digits of hour (00 through 23) (am/pm NOT allowed)" | https://www.w3.org/TR/NOTE-datetime | yes |
| ISO 8601 itself | https://www.iso.org/iso-8601-date-and-time-format.html returned HTTP 403 to my fetch | - | NOT opened (cite the W3C note or DataCite page instead, or open iso.org manually) | no |
| Excel 1900 date system | serial = days since Jan 1, 1900; worked example | "In the 1900 date system, dates are calculated by using January 1, 1900, as a starting point. ... if you enter July 5, 2011, Excel converts the date to the serial number 40729. This is the default date system in Excel for Windows, Excel 2016 for Mac, and Excel for Mac 2011." | https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487 | yes |
| Excel 1904 date system | | "In the 1904 date system, dates are calculated by using January 1, 1904, as a starting point. ... July 5, 2011, ... serial number 39267. This is the default date system in earlier versions of Excel for Mac." ; "The difference between the two date systems is 1,462 days." | same | yes |
| Excel epoch 1899-12-30 | NOT stated as such by Microsoft. It is IMPLIED by the worked example: 2011-07-05 minus serial 40729 = 1899-12-30 (I checked: (2011-07-05 - 1899-12-30) = 40729 days; 2011-07-05 - 1904-01-01 = 39267 days; difference 1462). The literal text "days elapsed since January 1, 1900" would give 40727, so the page's prose is not consistent with its own example (Excel's 1900-leap-year compatibility quirk). | - | the page above; the page https://learn.microsoft.com/en-us/office/troubleshoot/excel/wrongly-assumes-1900-is-leap-year opened but body required authorization (not readable); https://learn.microsoft.com/en-us/office/troubleshoot/excel/1900-and-1904-date-system is marked "Content retirement" | yes for the worked example; the epoch itself: derived, cite as "implied by Microsoft's example", not as a quote |
| Excel DATE function | "By default, Microsoft Excel for Windows uses the 1900 date system, which means the first date is January 1, 1900." | https://support.microsoft.com/en-us/office/date-function-e36c0c8c-4104-49da-ab83-82328b832349 | yes |
| OOXML flag for 1904 | workbook property date1904 exists (DocumentFormat.OpenXml WorkbookProperties.Date1904) | "Represents the following attribute in the schema: date1904" | https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.workbookproperties.date1904 | yes (property only; description text thin) |

---------------------------------------------------------------------------

## Source list (all opened this session)
- Argo CTD QC manual v3.9: https://archimer.ifremer.fr/doc/00228/33951/32470.pdf
- Argo DOXY QC manual v2.2: https://archimer.ifremer.fr/doc/00354/46542/123086.pdf
- Argo pH QC manual v1.1: https://archimer.ifremer.fr/doc/00866/97828/134495.pdf
- Argo nitrate QC manual v1.1: https://archimer.ifremer.fr/doc/00732/84370/123085.pdf
- Euro-Argo BGC cheat sheets (Jan 2021): https://www.euro-argo.eu/content/download/154250/file/Cheat_sheets_BGCArgo.pdf
- (opened, not a QC manual, no thresholds: pH/nitrate DAC processing docs https://archimer.ifremer.fr/doc/00460/57195/61336.pdf , https://archimer.ifremer.fr/doc/00350/46121/55922.pdf)
- GTSPP RT QC manual (IOC MG 22 rev.1): https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf
- WOD18 User's Manual (prerelease v0.10): https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf
- WOD23 intro (NOAA Atlas NESDIS 97): https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/wod_intro.pdf
- SeaDataNet QC procedures v2: https://nodc.ogs.it/repository/documents/guidelines/SeaDataNetQCproceduresV2May2010.pdf
- QARTOD DO manual v2.1: https://cdn.ioos.noaa.gov/attachments/2018/08/QARTOD_DOSecondUpdate_final.pdf
- GLODAPv2: https://essd.copernicus.org/articles/8/297/2016/ ; GLODAPv2.2023: https://essd.copernicus.org/articles/16/2047/2024/
- Dickson, Sabine & Christian 2007 Guide: https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf
- TEOS-10 Manual: https://www.teos-10.org/pubs/TEOS-10_Manual.pdf
- UNESCO TP44: https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf
- CIAAW: https://ciaaw.org/atomic-weights.htm , https://ciaaw.org/abridged-atomic-weights.htm
- NVS: https://vocab.nerc.ac.uk/collection/P06/current/ , .../P01/current/ , concept pages UPOX KGUM UMGL UPAA UPDB ULAA UUUU PSUX UUPH UPNM; SPARQL https://vocab.nerc.ac.uk/sparql/sparql
- DataCite 4.6 Date: https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/ ; W3C: https://www.w3.org/TR/NOTE-datetime
- Microsoft: https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487 ; https://support.microsoft.com/en-us/office/date-function-e36c0c8c-4104-49da-ab83-82328b832349

## Things that went wrong / traps found during research
1. A web-search summary attributed "[-0.1, 50] umol/kg" to Argo nitrate. FALSE: it is the chlorophyll line of the cheat sheet. Real nitrate Argo range: [-15, 65] raw, [-2, 50] adjusted.
2. WebSearch summaries elsewhere were not evidence; only text I opened is cited.
3. The Argo pH manual copy carries version date "September 15, 2026" (as printed).
4. WOD18 manual is a "prerelease" (v0.10); WOD23 intro describes the same method with 31 areas/102 levels. Tables are per basin and depth, so no single global WOD min/max exists.
5. GTSPP chemistry units are per litre; Argo/WOD are per kg - do not mix without conversion.

---------------------------------------------------------------------------

## Decisions: which numbers the rules use (2026-10-16)

| Rule | Threshold(s) | Source |
|---|---|---|
| ROW-LAT-RANGE / ROW-LON-RANGE | lat −90..90, lon −180..180 | Argo CTD manual v3.9, Tests 2–3, p.11 |
| CHEM-RANGE | temperature −2.5..40.0 °C; practical salinity 2..41.0; pressure ≥ −5 dbar; dissolved oxygen −5..600 µmol/kg; pH 6.5..9.0 | Argo CTD v3.9 Test 6 p.12; Argo oxygen v2.2 Test 6 p.9; GTSPP MG22 Annex B Table 2.1 (pH) |
| CHEM-UNIT-PAIR | molar masses C 12.011, N 14.007, P 30.974, Si 28.085 g/mol | CIAAW abridged atomic weights |
| CHEM-DIC-GT-TA | no numeric threshold — relation TA > DIC in seawater (Standard Seawater TA 2300, DIC 2080 µmol/kg at S = 35) | TEOS-10 manual App. A.4; Dickson et al. 2007 (oceanic levels) |
| XF-UNIT-CONFLICT | no numeric threshold — µmol/L and µmol/kg differ by the seawater density factor | GLODAPv2.2023 §3.1; UNESCO Tech. Pap. 44 |
| Excel serial dates | 1900 and 1904 date systems | Microsoft "Date systems in Excel" |

Not shipped for lack of a citable threshold (ship speed was shipped on 24.10.2026, see the end of this file): a distance
tolerance for "same station at different positions" (ROW-STATION-MOVED and XF-POSITION-CONFLICT ship as
pattern checks without a distance threshold); nutrient and DIC global ranges (seawater ranges do not
apply to porewater, and DIC has no citable global range); porewater ranges.

## Stated choices for position checks (2026-10-23) — NOT published thresholds

These numbers are the tool's own choices, stated in the rule texts. No citable source gives them.
- **ROW-ON-LAND.** Positions are judged only when they are at least 50 km inside land or an inland lake, as measured on Natural Earth 1:10m (public domain), rasterised at 0.01° to 0.05° cells by `scripts/land-mask.py`. Cells near perennial rivers and canals (Natural Earth river lines, about 7 km on each side), three sea canals, sea-connected lakes and the Syvash lagoons make no claim.
  - The published test is Argo QC Manual v3.9, section 2.1.2, Test 4 "Position on land test", p.11 (verified in the opened PDF). It names no distance.
  - The 50 km is measured, not tuned to a count:
    - at 5 km, inner Svalbard fjords (IO PAN) were called land;
    - at 20 km, 40 CoastDOM v1 rows on small rivers that Natural Earth does not draw were still called land;
    - at 50 km, CoastDOM keeps 2 rows ("Baltic Sea" placed 50 km inland), and ChEssBase flags 98 rows, all among OBIS's 100 ON_LAND records. OBIS's 100 include 5 it dropped for taxonomy (NO_MATCH), not for position.
- **ROW-ON-LAND-NEAR.** This note covers positions 10–50 km inside, with no sign hint. Michal decided on two levels on 23.10.2026.
  - The 10 km floor was measured by the AI-Wall thread on production: 4 703 OBIS sea positions from 41 fjord, Arctic and lagoon regions read 0 cells at ≥ 10 km and 12 at 5 km. The set is `test_fiordy.csv` in GOLDEN_DIR, and the test asserts 0 findings.
  - ChEssBase: the note fires only for Loihi Seamount (line 3480). The stored float position of Grey Whale Carcass falls in a 5 km cell: a known limitation.
  - CoastDOM gives 269 note rows:
    - rivers and estuaries: Tyne, Hastings, Clarence and others;
    - lagoons: Lake Macquarie, Wallis Lake, St Georges Basin;
    - inland position errors with sea salinity: "Gulf of Trieste" 53 rows on the Slovenian karst, "Baltic Sea" 4 in Kashubia, "Guanabara Bay" 1;
    - 1 likely correct station at the head of a Kimberley tidal inlet (−16.502, 124.404), which Natural Earth draws as land. Michal accepted this cost (decision 23.10, variant A).
  - Trade-off: no position on an island less than about 100 km across (Hawaii's Big Island, Crete, Puerto Rico) can be called land, and river corridors make no claim within 200 km of the sea (a gross error beyond that is still found).
  - OpenStreetMap land polygons (what OBIS uses) are finer, but they are ODbL: attribution plus share-alike on a derived grid, and a source about 1 000 times larger. At a 50 km band the resolution gains nothing, so we use Natural Earth.
- **ROW-STATION-MOVED, sign pattern.** It applies when the two positions are, as written, ≥ 100 km apart, and, with one sign flipped, ≤ 50 km apart and ≥ 10 times closer. Menez Gwen (ChEssBase): 5 423 km as written, 1.2 km once flipped.
- **ROW-STATION-SPREAD.** It applies to a station whose positions are more than 10 km apart (note level). This is far above a ship's position error on station and below the size of a named area. Item 6 above still holds: there is no published tolerance.

## Ship speed (2026-10-24): ROW-SHIP-SPEED, ROW-SHIP-SPEED-UNUSUAL, ROW-SHIP-SPEED-PAIR

Source of the design: `AI-Wall/handoff/HANDOFF-SR-TOOLS-PREDKOSC-STATKU.md` and the research of 23.10.2026. The two limits are citable; everything else below is a stated choice of the tool, with its reason. Michal's decisions of 24.10 are marked.

**Cited limits (opened and read on 24.10.2026)**
- **40 knots, ROW-SHIP-SPEED and ROW-SHIP-SPEED-PAIR.** Met Office `marine-qc`, documentation page "Track check", section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." https://marine-qc.readthedocs.io/en/latest/track_check.html
  - That check compares ONE pair. Applying 40 knots on BOTH sides of an event, with the previous-to-next hop not exceeding it, is Michal's decision (24.10) and borrows the both-sides logic of marine-qc's own "Speed check" and "combined track check" (a report fails only when the speeds on both sides are too high) and of iQuam. It is not literally marine-qc's extreme check.
- **15 knots, ROW-SHIP-SPEED-UNUSUAL.** MEDATLAS Protocol Part I (SISMER/IFREMER, v3, Dec 2001), section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity > maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)". https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf
  - MEDATLAS applies it to one pair; the two-sided form at this level is Michal's decision (24.10). The wording says "unusual for a research vessel", never "impossible".
- Sources that name the date or time, not only the position, as the possible error (hence the wording): WOD18 manual section 4 "Speed check", printed p.31; GTSPP MG22 Annex B Test 1.5; SeaDataNet QC v2.0 section 5.1. None gives a number (Item 5 above).

**Stated choices (NOT published thresholds)**
- **Minimum separation 10 km.** Two consecutive events closer than 10 km are one place (parallel casts, a mothership and its boats, two casts on one station, the same station written in two files with slightly different positions): they are joined into one run and no speed is computed between them.
  - Reason: it is the tool's own size of "one station" (ROW-STATION-SPREAD uses the same 10 km, far above a ship's drift during a cast), so the two rules agree on what one place is.
  - IOOS QARTOD's 20 km (Location Test, RANGEMAX) is a displacement limit set by the operator, not a separation, and a larger value would hide pairs with short gaps (below about 16 minutes at 40 knots) for no gain on the pairs that matter. Two stations 10 to 29 km apart that carry the same minute are therefore reported (IO PAN: JMW4-Deep and Yol2, SGD9 and SGD29).
  - Rounding is not absorbed by this number. Each distance is reduced by the rounding of the two written positions (half a unit of the last written decimal, along both axes), which is the idea of the "minimum separation in time and space" of iQuam / marine-qc, derived from the data instead of a constant.
- **Order of events that share a date and have no time of day: date, then original row order across the files.** Files concatenated from one cruise are usually chronological, and this is the only information there is.
  - The answer does not depend on the order: whenever the time windows of two consecutive events overlap (two rows of one date, or a date-only row and a timed row of that day), the gap is the longer of both orders, so the sort cannot shorten it. A date-only row is therefore never pinned to midnight against the timed rows of its day (review 24.10: a CTD file with times plus a biology file with dates only, one cruise). Events of different dates are ordered by their windows. Ties of timed events fall back to row order too.
- **Event key when merging rows: start text + end text + position rounded to 1e-4 degrees (about 11 m); station names and file names are not part of it.**
  - One station cast (all depths, all variables) has one time and one position, so its rows are one event; the same station in several files has the same time and position, so it is one event across files.
  - The station name is left out on purpose: a row of a cast with a mistyped latitude must appear as its own event (same time, other place). Files that disagree slightly on time or position for one station are joined later by the 10 km run, not by the key.
- **Time and the longest possible gap.** A written time is a window: a date is the whole UTC day, a time to the minute is that minute, to the second that second. The gap used is (latest the later event may start) minus (earliest the earlier event may end): same date = 24 h, adjacent dates = 48 h, and so on, and a minute adds its own minute. A date is never read as 00:00 (OBIS's `date_start` does, and the research counts 5% of timed records at exactly T00:00). Month and year precision are not used. Times without a zone are read as UTC, one zone for the whole file. An `eventDate` interval uses the END of the previous event and the START of the next (GTSPP FAQ wording), and intervals that overlap in time are not timed at all (a mooring spans other stations).
- **A single impossible pair (first or last event, or two bad events in a row) uses only the 40-knot limit and is an info.** One pair cannot say which event is wrong; reporting it at 15 knots would turn every fast transit into a note. The pair is not reported when either event already has a two-sided finding (one event, one finding). A two-sided case where one hop is above 40 knots and the other only above 15 knots is not an "unusual" note but this impossible pair (review 24.10: a cast row written 0.5 degrees off at the same minute gave 1797 knots). Wording, by Michal's decision: "the position or the time of one of these two events is wrong".
- **Groups.** A group needs at least 3 events. A cruise column groups by its values (the column wins over the tick, per file); files without one form ONE group only when the user ticked "one cruise of one ship", and then all those files are one track. With neither, the rule does not run and the report says how to switch it on (`notChecked.shipSpeed`); a group that cannot be judged says so too (`notChecked.shipSpeedFew`).
- **"Probably more than one ship": more than a third of the places, at least 8.** Each finding blames one place (a pair counts once). When findings blame that share of a group's places, the text adds that the data probably come from several ships or cruises. A true error is rare; this is not a published number. CoastDOM (a global compilation) under a wrong tick names 3 places in 4.
- **The declaration is stored only in the companion mapping file** (the sidecar CSV, row `(setting),singleCruise=yes`). No localStorage, cookie or module state: it starts unticked for every upload, or from a mapping file dropped with the files.

**Measured (24.10.2026; real data, never in the repository; local folder `ship-speed-2026-10-24`)**
- OBIS AMT12 and AMT13 (James Clark Ross, `eventDate` intervals) and the AMT13 net hauls, with the declaration: 0 findings.
- OBIS JERICO / Simon Stevin (day and month swapped in `eventDate`): one ROW-SHIP-SPEED-PAIR, 117 km in at most 0.5 h, at least 126 knots; the second hop of the research (22.6 knots) is below the lone-pair limit and not reported.
- IO PAN files of `2026-10-16` with the declaration, 3 rules, classified in the report of the session that wrote the rule: true errors (`lat = lon` rows, the shifted row of the water-column file), copied time stamps, one collateral flag on a correct event between two wrong ones, and CoastDOM as false alarms by construction (a global compilation; the tick does not hold).
- ChEssBase (no `eventDate`) without the declaration: not run, reported as not checked.

## OBIS / Darwin Core basic checks (2026-10-24): ROW-ZERO-COORD, ROW-NO-COORD, ROW-DEPTH-MIN-MAX, ROW-DEPTH-RANGE, ROW-DATE-FUTURE, ROW-INVISIBLE-CHAR, ROW-STATION-SPREAD-FAR, DWC-*

Source of the design: `AI-Wall/handoff/HANDOFF-SR-TOOLS-KONTROLE-OBIS.md` and the comparison of 24.10.2026 (`research-obis-vs-tools-2026-10-24.md`). No external call: every rule works on the parsed data only. Sources read on 24.10.2026: obis-qc `obisqc/location.py`, `time.py`, `fields.py`, `absence.py`, `util/vocabularies.py`, `util/misc.py` (master); obistools `R/check_fields.R`, `R/check_eventids.R`, `R/check_depth.R`; EMODnet Biocheck README; OBIS Manual `common_qc.md`, `common_formatissues.md`; GBIF `basis_of_record_2022-02-02.xml`; NOAA "How deep is the ocean?". Where the obis-qc README and its code differ, the code is used (as in the research).

**Cited numbers and lists**
- **Depth, ROW-DEPTH-RANGE: -100000 and 11000 m, inclusive.** obis-qc `location.py`: `misc.check_float(record.get("minimumDepthInMeters"), [-100000, 11000])`, and the same for the maximum; `check_float` tests `valid_range[0] <= value <= valid_range[1]`. Out of range sets `DEPTH_OUT_OF_RANGE`; text that is not a number sets no flag there (here it is ROW-NON-NUMERIC).
  - Physical maximum: NOAA National Ocean Service, https://oceanservice.noaa.gov/facts/oceandepth.html (last updated 2026-09-23): "Challenger Deep is approximately 10,935 meters (35,876 feet) deep." obis-qc's 11000 m lies above it, so every value over the bound is deeper than any ocean floor. The rule cites NOAA as the reason and uses OBIS's number as the threshold: a second, lower threshold (10 935 m) would be our own and would flag values OBIS accepts; the 65 m between the two is left alone.
- **basisOfRecord: the eight identifiers of the GBIF vocabulary** `basis_of_record_2022-02-02.xml` (the file obis-qc reads at run time): PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence, MaterialCitation. Compared in lower case with the ends trimmed (`fields.py`: `.lower() in [value.lower() ...]`).
  - The lists disagree: the obis-qc README names nine (it has Event and Taxon, no MaterialCitation) and Biocheck names seven (no MaterialCitation). The code of the pipeline is what runs at OBIS, so its list is used.
- **occurrenceStatus: absent, present, notDetected, detected**, compared in lower case (`absence.py`). The README calls `absent` and `present` deprecated; the code accepts them, so do we.
- **Required terms** (obistools `check_fields`, error): eventDate, decimalLongitude, decimalLatitude, scientificName, scientificNameID, occurrenceStatus, basisOfRecord. Recommended (warning, and only when the caller asks for level "warning"): minimumDepthInMeters, maximumDepthInMeters. OBIS Manual `common_formatissues.md`: "the eight required terms for OBIS": occurrenceID or eventID, and the above, with scientificNameID marked "(strongly recommended)".
  - **The sources disagree on scientificNameID**: the code lists it as required, the Manual as strongly recommended. Chosen: the Manual, so it is DWC-RECOMMENDED (warning), not an error. Reason: the Manual is what a data provider reads, and a missing LSID is a gap in the match, not a malformed record.
- **eventID duplicated, parentEventID without an eventID**: obistools `check_eventids` (both errors); Biocheck: "if the parentEventID field is populated, it must be populated with an existing eventID". **A loop** in the hierarchy: GBIF OccurrenceIssue `PARENT_EVENT_INFINITE_LINEAGE`. **occurrenceID unique**: Biocheck, "the Primary Key for the occurrence table".
- **(0, 0)**: obis-qc `ZERO_COORD` (drops the record); Biocheck "0-0 coordinates". **No position**: obis-qc `NO_COORD` (drops the record).
- **Date in the future**: obis-qc `time.py`: `if ms_end > date_to_millis(datetime.date.today())` sets `DATE_IN_FUTURE`: the calendar day of the END of the interval against today's date.
- **Invisible characters**: OBIS Manual `common_qc.md`, "Hidden characters and non-breaking spaces": the no-break space U+00A0, "tabs, line breaks within a cell, and zero-width spaces (U+200B)"; OBIS "removes leading and trailing whitespace from values during processing, but does not change spaces inside a value".

**Stated choices (NOT published thresholds or lists)**
- **What is Darwin Core input.** A Darwin Core Archive, or a table whose header names at least 3 different terms of a list of terms that are not ordinary words (`DWC_NAMES` in `src/core/checks/dwc.ts`: occurrenceID, eventID, scientificName, basisOfRecord, eventDate, decimalLatitude, ...), each spelled exactly as Darwin Core spells it (snake_case and spaced headers such as `scientific_name` or `Scientific Name` do not count either, so such a table is not judged; case counts: `scientificName` counts, `ScientificName` and `scientificname` do not, so a plain biology export with Station, Date, ScientificName, Kingdom, LifeStage, Count is not Darwin Core), AND at least one record-kind term (occurrenceID, eventID, parentEventID, scientificName, scientificNameID, taxonID, basisOfRecord, occurrenceStatus). "depth", "date", "station", "year", "locality" and "id" are not on the list, so a CTD or chemistry sheet is never Darwin Core. Occurrence or Event: a table with any occurrence-side term is Occurrence; one with only eventID or parentEventID is Event; an archive says so itself (meta.xml).
  - Not run on non-Darwin Core input: required and recommended terms, empty values of required columns, the vocabularies, eventID, parentEventID and occurrenceID, and the invisible-character check of name and identifier columns. Run on every table: ROW-ZERO-COORD, ROW-NO-COORD, the depth rules, ROW-DATE-FUTURE, and the invisible-character check of the station, cruise and sample-identifier columns.
  - **Every sheet of a workbook** that is Darwin Core input is judged, whether or not the layout builds it as a data table (the OBIS three-sheet template: event, occurrence, emof; only emof has measurements).
  - An occurrence table that carries eventIDs (at least one value) is the occurrence side of an event/occurrence pair: eventDate, the position and the depths live in the event table, so they are neither required nor recommended there; without eventIDs they are.
  - A repeated eventID: in a Darwin Core Archive Event core every repeat is an error (one row per event); elsewhere (a flattened sheet repeats its eventID per depth level) only an eventID whose rows disagree on eventDate or the position is (dates compared by their parsed value, coordinates as numbers: 60.5 and 60.50 agree), one identifier for different events.
  - An Event core needs eventID, eventDate and the position; the taxon terms belong to the Occurrence extension, which is not read. obistools `check_eventids` also asks for a parentEventID column; this tool does not (a flat event table without parents is valid).
  - A Darwin Core Archive's core `id` column stands for the record identifier where no occurrenceID or eventID column exists.
- **ROW-NO-COORD.** A row counts when its latitude or longitude CELL is blank (not text: that is ROW-NON-NUMERIC; not next to an NA variant in the other coordinate: that is ROW-NA-VARIANT), some other row of the same sheet has both, the row has at least two other filled cells (a line with only an event name or a heading is not a record: PANGAEA 964012 has 531 of them), and no cell reads as a summary label (Total, Mean, Average, Median, Min, Max, SD, Count). A sheet that writes the position once per station block is not missing positions: a row with BOTH cells blank is not counted when its station (without a station column: its date; with a cruise column the cruise belongs to the key, so K1 of cruise A does not vouch for K1 of cruise B) has a position on another row, or when its station (without a station column: its date) is blank and it follows a positioned row of its block, whatever its date or time cell holds; a row with only one coordinate blank always counts (PANGAEA 964012 line 35059 stays). Accepted miss (review 24.10): a sheet with neither a station nor a date column whose only position is on its first row reads as one block and gets no ROW-NO-COORD; its shape is that of a CTD profile with the position written once at the top, and the tool cannot tell the two apart without guessing. In a Darwin Core event hierarchy (eventID and parentEventID columns) an event is not missing a position when it is the parent of another event or an ancestor has one: OBIS gives a child the parent's position.
- **Date in the future: "today" is a UTC calendar day handed in by the caller** (`RowContext.today`, `RunOptions.today`; the system clock is read once, in `runChecks`, never inside a rule). A value is future only when it can have begun nowhere on Earth yet (`earliestUtcDayOf`): a date-only value (a year or month by its first day) begins at 00:00 in the latest zone in use, UTC+14, which is 10:00 UTC of the day before; a time without a zone may be that zone's wall clock, so 14 hours are taken off; a time with a zone or Z is the instant it is. So a user east of Greenwich is never told that his own today is in the future: with today = 24 October, 25 October is not reported and 26 October is. (obis-qc compares the plain calendar day with its own today and would report the 25th; this is a stated difference.) A year or month counts by its first day: obis-qc expands a reduced date to the end of the period and would flag the current year and month; this tool does not. An interval counts by its end. A YY-MM-DD date is left to ROW-DATE-YYMMDD, which already names the century it chose. A future row is not also reported by ROW-YEAR-OUTLIER.
- **Depth.** The two bounds of a Darwin Core table are read from their own columns (minimumDepthInMeters, maximumDepthInMeters, found by header, whatever the confirm step mapped to the single depth slot). Minimum greater than maximum is judged only where both are numbers. For any other depth column the bounds are metres and positive down: a column whose convention is "up" (declared, an elevation, or negative values) is judged after its sign is turned, so a negative value of an upward convention is never an error; a column whose unit is stated and is not metres, or whose header says feet, fathoms, cm, mm or km (`Depth (ft)`, `depth_ft`), is not judged.
- **Vocabularies:** one finding per distinct value outside the list, with all its rows; after 10 distinct values the rest share one finding. Blank cells are DWC-TERM-EMPTY's business.
- **Invisible characters:** the ends of a value are trimmed first (as OBIS does), so only a character inside a value counts, and a zero-width one at an end (trimming leaves it). The set: U+00A0 and the other Unicode spaces (U+1680, U+2000 to U+200A, U+202F, U+205F, U+3000), U+200B to U+200D, U+2060, U+FEFF, tab, line break, U+2028, U+2029. A byte-order mark at the start of the file is removed by the parser and never reaches a value. Columns: station, cruise and sample identifier on every table; on Darwin Core input also scientificName and the classification names, every identifier term (ending in ID), catalogNumber, recordNumber, fieldNumber, basisOfRecord and occurrenceStatus. Free text (remarks, locality, verbatim fields) is not checked: nothing matches it exactly.
- **Empty values:** a blank in a required column is an error, except eventDate, decimalLatitude and decimalLongitude, where only a column empty in every row is reported (single blanks are ROW-DATE-MISSING and ROW-NO-COORD; with no date anywhere, data or metadata, META-NO-DATES says it and the empty-column finding stays silent). A recommended column is judged when missing or empty in every row.
- **ROW-STATION-SPREAD-FAR: above 1000 km a warning.** The 1000 km was already the point where the text said one position is "almost certainly wrong"; it is the tool's own choice, not a published number. 10 to 1000 km stays the note ROW-STATION-SPREAD. ChEssBase: Axial Seamount, 9 669 km.
- **Overlaps.** (0, 0) is reported as ROW-ZERO-COORD only, not as ROW-LAT-EQ-LON and not as META-POINT-OUTSIDE-BBOX; ship speed, station spread, station moved and the cross-file position checks already skip latitude = longitude, which includes (0, 0).

**Left out, with the reason**
- **Extension eventIDs** (obistools `check_extension_eventids`): the archive reader reads the core table only. Reading the extension's id column means tokenising a second, possibly very large table (an eMoF extension runs to millions of rows) under the same row cap, a partial-read rule for it, a limit on the number of extensions and a coreid-versus-eventID rule: not a small change. Left out; the report says so for every Darwin Core Archive (`notChecked.dwcExtensions`).
- **DATE_BEFORE_MIN:** the `min_year` the OBIS pipeline passes is unconfirmed (code default 1582, README "year 0"): no citable bound.
- **NO_DEPTH, coordinateUncertaintyInMeters:** not asked for in this package.
- **Anything that needs WoRMS, a bathymetry grid or xylookup** (species names, scientificNameID resolution, depth against the seabed): an external call, a separate decision. "Species names and taxonomy" stays in the "does not check" list.

**Measured (24.10.2026; real data, never in the repository)**
- IO PAN files, PANGAEA 965985, POC after the fix, both Zenodo workbooks, fjord positions: no new finding. PANGAEA 964012: one ROW-NO-COORD, line 35059, a real gap (latitude 42.76, longitude cell empty). ChEssBase (as a table and as a Darwin Core Archive): no new Darwin Core finding (its eventDate column is empty in all 3 715 rows, which META-NO-DATES already reports); Axial Seamount is now the warning ROW-STATION-SPREAD-FAR. The four ship-speed files are 7-column extracts of OBIS records (no occurrenceStatus, basisOfRecord): DWC-TERM-MISSING (occurrenceStatus, basisOfRecord) and DWC-RECOMMENDED (scientificNameID), as the rule says for a table in that shape; they carry eventIDs, so eventDate, position and depth are not asked of them. Per-file list: `kontrole-obis-golden.md` in the job folder.

## Depth direction (2026-10-24): ROW-DEPTH-SIGN and the depth proposal

Stated choice, not a published threshold. Revised the same day (Michal / coordinator): a first version made every bare "Depth [m]" "not stated" and fired the note on 5 of 11 good golden files; that was noise.

Decision. A header that is a depth word ("depth", "Depth [m]", "depth_m", "water depth", PANGAEA "Depth water [m]") IS evidence of the downward convention: by definition depth is the vertical distance
below the surface. CF Standard Name Table, standard_name `depth`: "Depth is the vertical distance below the surface" (positive down; quoted from memory, I am not certain of the exact wording; the "height" /
"altitude" names are the upward ones). So the proposal keeps `down`, high confidence, as before.

| Evidence | Direction | Note |
|---|---|---|
| depth word in the header, no negative value | down | no |
| any negative value (also with "below" or "positive down" in the header, and with values of both signs) | up | no |
| header says elevation / altitude | up | no |
| NERC P01 depth code; Darwin Core minimum/maximumDepthInMeters (defined as metres below the surface) | down | no |
| header is not a depth word, but has a down word (below, beneath, under, down(wards), BSL, BSF, mbsl, mbsf, mbgl, bgl), no negative value | down | no (the down words only keep a non-depth-word header from being a default; there are no "up" words in the code, and no direction word overrides the values) |
| header is not a depth word, no down word, not P01, no negative value | **not stated**, low-confidence | fires |

The "not stated" row is, in practice, reached only by hand-mapped columns (the mapping editor starts them at "not stated"); a name-recognised depth column always has a depth word, elevation, a P01 code or a Darwin Core term.

Mixed signs (checked, NOT changed): any negative value still means `up`. Leaving a column with both signs undecided was tried and reverted: `crossfile` matches depths across files with this
sign, and in the golden set porewater3m has 296 negative and 15 positive depth values, so "not stated" turned its XF-DATE-CONFLICT with the anions file (positive depths) into a miss. ROW-DEPTH-SIGN
therefore does not fire for mixed signs, and cannot double-report with ROW-DEPTH-RANGE (which is about values outside the physical range). The last row is reached in practice only through the user's own
mapping (the mapping editor already starts a hand-mapped depth column at "not stated"); it is kept as a guard. The default changes nothing downstream: `crossfile` treats "unknown" like "down" and the
clean CSV writes a note only for "up". Not used: the metadata record (recognition reads one sheet), the unit. Not added: "height" as an elevation word ("wave height", "height above seafloor").

## Oxygen outside µmol/kg (2026-10-24): CHEM-RANGE

The cited oxygen range (Argo DOXY, item 1b) is per kilogram. Oxygen in mL/L, mg/L or µmol/L is not converted: a per-volume value needs the density of the water (temperature,
salinity, pressure) to become per-mass, and the tool does not guess it. The report names that in "what this tool does not check" (`notChecked.oxygenUnit`) whenever an oxygen column
with values has a unit other than µmol/kg. A column with no unit at all is ROW-UNIT-MISSING's, and is not repeated in that note.

## Coverage of Zenodo and DataCite records (2026-10-24): bbox and temporalExtent

Read only what states where and when the DATA were collected: Zenodo `metadata.locations` (legacy list of `{lat, lon, place}` and InvenioRDM `{features:[{geometry}]}` GeoJSON, any geometry
type, its positions) and `metadata.dates` of type `collected`; DataCite `geoLocations` (point, box, polygon as the box of its vertices; `inPolygonPoint` is a point inside, not a vertex) and `dates`
of dateType `Collected` (and `Coverage`, a dateType added in DataCite schema 4.6, not in 4.5). DataCite 4.0-4.5 dateType
values: Accepted, Available, Copyrighted, Collected, Created, Issued, Submitted, Updated, Valid, Withdrawn, Other. Only Collected means coverage; Valid is the validity of the resource (not the
period the data cover) and the others describe the record. Zenodo `publication_date` and the created / issued / available / valid dates are never used. A place name without coordinates
and the repository address are not locations. Shapes off the globe (|lat| > 90, |lon| > 180, south > north) are dropped; a single box may cross the antimeridian (west > east) and is kept;
several shapes with a crossing box, or longitudes spread over more than half the globe, become all longitudes (a superset, never a narrower wrong box).
Several collected dates merge to the earliest start and latest end; an open end stays open.

Known limit (left as is): the legacy Zenodo JSON carries only point locations; boxes and polygons exist only in free text there. A Zenodo record with a box and no collected dates still gets META-NO-EXTENT.
Free-text collected dates ("2023-04 to 2023-05") and EDTF qualifiers ("2020?", "2020~") give no temporal extent (never a wrong one); only ISO-like ends (YYYY, YYYY-MM, YYYY-MM-DD, optional time) or ".." are read.

---------------------------------------------------------------------------

## Converter (/convert) — stage 0 spike, 25.10.2026: spreadsheet -> Darwin Core Archive (Event core + Occurrence + eMoF + EML) for an OBIS node (researched 2026-10-25)

Scope: facts needed to build the browser-only converter. Not rule thresholds. Every item below was opened or run in this session.
"Verified = yes" means I read the quote in the opened document or ran the command and saw the output. Anything else is marked UNVERIFIED.
Helper scripts and raw listings (an NVS SPARQL search, a script that opened every URI below: 74 fetches, all HTTP 200, and the archive builder and self-check of Item 6) were kept outside the repository.

How concepts were found: SPARQL on `https://vocab.nerc.ac.uk/sparql/sparql` (prefLabel regex over `http://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/`), then each URI opened as `https://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/` (HTML, HTTP 200) and as `...?_profile=nvs&_mediatype=application/ld+json` (read `skos:prefLabel`, `owl:deprecated`, `skos:definition`). In the NVS data `owl:deprecated` is the literal string "false" / "true".

---------------------------------------------------------------------------

### Item 1. NERC vocabularies for eMoF

#### 1a. What the OBIS Manual says (opened 2026-10-25)
- https://manual.obis.org/format_emof.html - eMoF "strongly recommended" over MeasurementOrFact for Event core. Columns suggested: eventID, occurrenceID, measurementType, measurementValue, measurementUnit, measurementTypeID, measurementValueID, measurementUnitID, measurementRemarks. Quote: "For measurementTypeID, measurementUnitID, and measurementValueID you must use controlled vocabulary terms." sampleSizeValue / sampleSizeUnit / samplingEffort / samplingProtocol "can be documented as separate measurements on different rows"; the sampleSizeUnit goes to measurementUnit.
- https://manual.obis.org/vocabulary.html - the rules:
  - measurementUnitID: P06 ("BODC-approved data storage units"); examples Metres ULAA, Days UTAA, Percent UPCT, mg/L UMGL.
  - measurementValueID: "for measurementValues that are non-numerical (e.g. sampling related, sex or life stage designation)"; "NOT used for standardizing numeric measurements". Collections: Sex S10, Lifestage S11, Sampling instruments L22 (SeaVoX Device Catalogue), Instrument categories L05, Vessels C17, Habitats C35 (EUNIS L3), Behaviour = ICES, not NERC. Also allowed: DOI or OBP handle of a protocol document.
  - measurementTypeID: "P01 codes are required for the measurementTypeID field when using NERC vocabulary"; "all P01 codes should be generalized ... do not select species-specific codes. Instead, only choose codes for 'biological entities specified elsewhere'".
  - Q01 "has been deprecated and the terms have been remapped to P01 codes". Sampling examples given: DSPSSP01 sub-sampling protocol, LENTRACK, MTHHGHT1, NMSPINST name of sampling instrument, AZDRZZ01 sample duration.
  - "You should not use any deprecated concepts for any measurement ID."
  - New terms: request via https://github.com/nvs-vocabs/OBISVocabs/issues (or vocab.services@bodc.ac.uk).
  - Manual typo seen: the Height example URL is printed as `.../MTHHGHT1/0` (stray "0"); the real URI is `.../MTHHGHT1/` (opened, HTTP 200).
- Manual inconsistency to design around: format_event.html says sex/lifestage terms "will be included in extendedMeasurementOrFact table not the Event Core or Occurrence extension"; format_occurrence.html says measurements "can remain in the Occurrence table as long as they can be mapped to the appropriate DwC term (e.g. DwC:Occurrence:sex)". Both layouts are therefore accepted; the eMoF layout is the stated preference.

#### 1b. GENERIC concepts (safe to propose automatically)
All rows: HTTP 200 on `https://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/`, `owl:deprecated` = false, verified yes. Base URI for every row: `http://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/` (http + trailing slash; this is the form BioCheck's reference tables use, see Item 2).

measurementTypeID (P01):

| need | code | preferred label | OBIS manual says |
|---|---|---|---|
| raw count per sample | P01/OCOUNT01 | Count of biological entity specified elsewhere | not named in the manual; BioCheck treats it as a "no unit/value ID needed" type (Item 2) |
| density per m3 (water) | P01/SDBIOL01 | Abundance of biological entity specified elsewhere per unit volume of the water body | not named (generic rule only); BioCheck treats it as a biological quantity |
| density per m2 (bed, benthos) | P01/SDBIOL02 | Abundance of biological entity specified elsewhere per unit area of the bed | not named |
| density per m2 (water body, e.g. surface) | P01/ABIOLA01 | Abundance of biological entity specified elsewhere per unit area of the water body | not named; not in BioCheck's quantity list (UNVERIFIED effect) |
| wet-weight biomass per m3 | P01/SDBIOL04 | Wet weight biomass of biological entity specified elsewhere per unit volume of the water body | not named |
| wet-weight biomass per m2 (bed) | P01/SDBIOL05 | Wet weight biomass of biological entity specified elsewhere per unit area of the bed | not named |
| dry-weight biomass per m3 | P01/SDBIOL09 | Dry weight biomass of biological entity specified elsewhere per unit volume of the water body | not named |
| dry-weight biomass per m2 (bed) | P01/SDBIOL08 | Dry weight biomass of biological entity specified elsewhere per unit area of the bed | not named |
| AFDW biomass per m3 / per m2 (bed) | P01/SDBIOL07 / SDBIOL03 | Ash-free dry weight biomass of ... per unit volume of the water body / per unit area of the bed | not named |
| wet / dry weight in the assayed sample (not per volume) | P01/OWETBM01, P01/ODRYBM01 | Wet / Dry weight biomass (in assayed sample) of biological entity specified elsewhere | not named |
| sampled water volume | P01/VOLWBSMP | Volume of sample from the water body | not named; in BioCheck "sampling descriptors" list |
| sampled area (grab / corer, bed) | P01/AREABEDS | Area of sample {sampled area} from the bed | not named; in BioCheck list |
| sampled sediment volume | P01/VOLSEDSM | Volume of sample from the sediment | not named; in BioCheck list |
| sampling device name | P01/NMSPINST | Name of sampling instrument | named in manual (vocabulary.html) |
| mesh size | P01/MSHSIZE1 | Mesh size of sample collector | not named; in BioCheck list |
| life stage | P01/LSTAGE01 | Development stage of biological entity specified elsewhere | not named; value from S11 |
| sex | P01/ENTSEX01 | Sex of biological entity specified elsewhere | not named; value from S10 |
| collector mouth area / diameter | P01/MTHAREA1, P01/DSAMPA01 | Area of sample collector (aperture) {mouth area}; Diameter of sample collector (aperture) | MTHHGHT1 (height) named in manual; same family |
| sub-sampling fraction | P01/SSAMPC01 | Sub-sampling coefficient | not named; BioCheck "no unit/value ID needed" |
| sample duration / track length / sub-sampling protocol | P01/AZDRZZ01, LENTRACK, DSPSSP01 | Sample duration; Length of sampling track; Description of sub-sampling protocol | all three named in manual |

measurementUnitID (P06). The units used in the examples above:

| unit | code | preferred label | notes |
|---|---|---|---|
| #/m3 | P06/UPMM | Number per cubic metre | verified |
| #/m2 | P06/UPMS | Number per square metre | verified |
| g/m2 | P06/UGMS | Grams per square metre | verified |
| g/m3 | P06/UGMC | Grams per cubic metre | verified |
| mg/m3 | P06/UMMC | Milligrams per cubic metre | verified |
| mg/m2 | P06/UMMS | Milligrams per square metre | verified |
| m3 | P06/MCUB | Cubic metres | verified |
| m2 | P06/UMSQ | Square metres | verified |
| um | P06/UMIC | Micrometres (microns) | verified |
| mm | P06/UXMM | Millimetres | definition read: "Unit of length which is one thousandth of a metre" |
| m | P06/ULAA | Metres | named in manual |
| dimensionless | P06/UUUU | Dimensionless | definition: "A quantity with the dimension of 1" |

TRAP: P06/UCNT is labelled "Counts" but its definition is "A proprietary unit for RDI ADCP instruments, which is proportional to decibels (dB) and used to measure echo intensity". Never map a plain count to UCNT. For OCOUNT01 BioCheck does not require a unit ID (Item 2); whether OBIS wants UUUU there is UNVERIFIED (manual silent).

measurementValueID (non-numeric values):

| need | concept | preferred label | notes |
|---|---|---|---|
| sex | S10/S102, S103, S104, S105 | female, male, not specified, indeterminate | all verified; S10 also holds S106 female+indeterminate, S107 hermaphrodite, S108 male+female (listed by SPARQL, not opened) |
| life stage, generic | S11/S1116, S1127, S1128, S1122, S1130, S115, S1131, S1152 | adult, juvenile, larva, egg, nauplius, copepodite, not specified, indeterminate | verified; S11 has ~170 entries incl. copepodite C1..C5 (S111.., S1112 = copepodite C5), nauplius N1..N6 (S1140.. ) - S1115 "N1-6" is DEPRECATED (true), so always filter on `owl:deprecated` |
| device category | L05/22, 24, 50, 51 | plankton nets, benthos samplers, sediment grabs, unconsolidated sediment corers | verified; L05 71, 72 (scallop dredges) are deprecated |

#### 1c. METHOD-SPECIFIC / device-specific concepts (propose only after the user confirms the method)
| concept | code | label | verified |
|---|---|---|---|
| Bongo net (generic) | L22/NETT0176 | Bongo net | yes, dep=false |
| WP-2 net | L22/TOOL0979 | WP-2 net | yes |
| WP-2 standard net (UNESCO 1968) | L22/NETT0168 | WP-2 standard net as described by UNESCO Working Party 2 (1968) | yes |
| Multinet | L22/NETT0187 only | Hydro-Bios MultiNet Mammoth | yes. SPARQL regex `multinet|multi.?net|Hydro-?Bios` found NO generic "MultiNet" and no Midi/Maxi variant. Fallback: L05/22 plankton nets, or free text + NMSPINST |
| Van Veen grab | L22/TOOL0653 | Van Veen grab | yes |
| Box corer | L22/TOOL1177 | Unspecified box corer | yes (several named box corers exist, e.g. TOOL1469 Reineck) |
| Volume filtered, by flowmeter / by geometry and distance | P01/VOLFFMXX, VOLFDGDT, (VOLFFMDT, VOLFMCXX) | Volume of sample (filtered) from the water body by flow meter / ... by computation from sampling device geometry and estimated distance travelled | VOLFFMXX, VOLFDGDT opened; the others seen in SPARQL |
| Density per m3 in a given size fraction, etc. | many | e.g. USPBIOSV (per unit volume of the sediment), WWBIOL01/02, ADBIOL01/02 (per unit length / time) | seen in SPARQL; WWBIOL01 opened via SPARQL listing only |
| Mesh of sieve used for sorting | P01/MSHSIZE2, MSHSIZE3 | Mesh size of sampling processor (lower / upper sieve) | MSHSIZE2 opened |

Species-specific P01 codes exist in huge numbers (e.g. "Abundance of Chaetoceros ... by optical microscopy"); the manual forbids them, so a converter must never propose them.

Caveats:
- BioCheck still lists deprecated P01 SDBIOL10 in its quantity list (`files/workingEnvironment.R`); in NVS SDBIOL10 is deprecated (opened, true, replaced by PCOV7736). Deprecated codes are flagged by BioCheck ("This measurementTypeID is deprecated"), so the converter must resolve `owl:deprecated` at proposal time and at export time.
- Q01 codes: deprecated, remapped to P01 (manual). BioCheck's `BODCeffort` still accepts the string "Q01" and `Q0100002` (instrument) - legacy.

---------------------------------------------------------------------------

### Item 2. BioCheck (LifeWatch / EMODnet Biology QC tool)

Web app: https://rshiny.lifewatch.be/BioCheck/ (opened; Shiny page, tabs "Data overview", "Issues found", "Issues on map", "Invalid Event/Occurrence/eMoF Records", "OBIS Event Hierarchy tree", "About"; takes an IPT URL or an uploaded zipped DwC-A; says it checks "the EMODnet Biology Data Quality Criteria"). The About tab is rendered by the Shiny server and I did not read it.
Source: https://github.com/EMODnet/EMODnetBiocheck (R package; README says the Shiny app is built from it), cloned at commit 701e6e7 (2026-10-08). It imports `obistools` (`github::iobis/obistools`, cloned at 9df1c36, 2024-03-14) and reads archives with `finch::dwca_read`. UNVERIFIED: that the deployed Shiny app runs exactly this commit.
Check list as documented: README.md "Integrity Checks" / "Format Checks" tables (lines 62-120). Severity below is from the code: `level =` in R/checkdataset.R or obistools.

#### 2a. Checks and severity (code lines are R/checkdataset.R unless stated)
| check | severity | where |
|---|---|---|
| eventID and parentEventID columns must BOTH exist; duplicate eventID; parentEventID without a matching eventID | error | obistools R/check_eventids.R:12-52, called at checkdataset.R:343 |
| extension eventID not in core (Occurrence, eMoF) | error | obistools check_eventids.R:64-76; checkdataset.R:346, 350 |
| eMoF occurrenceID not in Occurrence | error | checkdataset.R:355, 385 |
| eMoF eventID differs from the eventID of its occurrence | error | checkdataset.R:364 |
| duplicate occurrenceID in Occurrence | error | checkdataset.R:398 |
| Event: datasetName and institutionCode columns missing ("Required field X is missing") | error | checkdataset.R:799-807 |
| required fields on leaf events (after inheritance): eventDate, decimalLongitude, decimalLatitude, scientificName, scientificNameID, occurrenceStatus, basisOfRecord - missing column or empty value | error | obistools check_fields.R:13-37; applied to `ev_flat` = flattened events that are not parents, checkdataset.R:816-817 |
| recommended minimumDepthInMeters / maximumDepthInMeters missing or empty | warning | obistools check_fields.R:15, 47-70 |
| eventDate not ISO 8601 (single date, or interval "a/b"; regex allows `T`, seconds, `Z` or +hh:mm; end may be shorter than start) | error | obistools check_eventdate.R:1-65; checkdataset.R:1370 |
| lat/lon not numeric, both 0 | error | checkdataset.R:1004-1011, 1055 |
| coordinates on land (3000 m buffer) | warning | obistools check_onland.R:55-57; checkdataset.R:1044 |
| depth deeper than GEBCO + 150 m margin, negative offshore | warning; min > max depth = error | obistools check_depth.R:29-34, 122; checkdataset.R:1048 |
| occurrenceStatus not in {present, absent} | error | checkdataset.R:1266 |
| no occurrence with occurrenceStatus "present" | warning | checkdataset.R:1275 |
| basisOfRecord not in PreservedSpecimen, FossilSpecimen, LivingSpecimen, HumanObservation, MachineObservation, MaterialSample, Occurrence | error | checkdataset.R:1297 |
| scientificNameID does not resolve to a WoRMS LSID | warning | checkdataset.R:1645 |
| potential duplicate occurrence (field combination) | warning | checkdataset.R:1526 |
| marine taxon on land | warning | checkdataset.R:1584, 1615 |
| datasetName differs from IPT title / has several values | warning | checkdataset.R:1319-1349 |
| eMoF: NULL measurementValue; exact duplicate rows; same measurementType(ID) twice on the same occurrence or event | error | checkdataset.R:601, 648-696 |
| eMoF: biological quantity (P01 in BioCheck's quantity list) = 0 on a "present" or status-empty occurrence | error; other value 0 on present = warning | checkdataset.R:611, 626 |
| eMoF: type/unit/value ID not resolving to NVS terms, or deprecated; missing measurementTypeID | reported in mof_issues (no `level` column) | checkdataset.R:536-600; README "Format Checks" |
| eMoF: no sampling instrument type (NMSPINST / Q0100002); no sampling descriptor/effort type | warning | checkdataset.R:556, 563 |

#### 2b. Specific questions
- Parent events without coordinates or date: ALLOWED. Required-field checks run on `flatten_event()` leaves (obistools flatten.R:7-69: a child inherits every Event-core field from its parent when empty), and `filter(!eventID %in% Event$parentEventID)` drops parents (checkdataset.R:816-817). The "eventDate NA does not seem to be a valid date" message is filtered out for parents (checkdataset.R:1372, 1391). A parent that HAS a malformed date still errors. OBIS manual agrees: format_event.html (inheritance) and common_formatissues.html ("the eventDate for the parent events does not need to be provided - only the dates for the actual samples are required"). But the manual also warns GBIF does not inherit: populate coordinates in children. Verified yes.
- coordinateUncertaintyInMeters: NOT required by BioCheck. Only checked "numeric" (checkdataset.R:1016-1021). It appears in a commented-out older required list (lines 62-63). OBIS manual lists it as optional ("Other terms you should consider adding").
- parentEventID resolution: error, see 2a. The column must exist even for flat data (check_eventids returns "Field parentEventID is missing" otherwise; check_eventids.R:12-20).
- eventType: not validated. It is only read for the summary table (checkdataset.R:204-205, uses `eventType`, falling back to old `type`). OBIS manual: "At this time, there is no Darwin Core event type term" (common_formatissues.html), example values cruise / station / sample.
- occurrenceStatus absent: an empty value is an error ("Empty value for required field", check_fields.R:27-37), although eMoF logic treats NA as present (checkdataset.R:611). An absent COLUMN is an error too. Valid values present / absent only.
- basisOfRecord: allowed list in 2a; HumanObservation passes.
- duplicate occurrenceIDs: error (checkdataset.R:398).
- Reading the archive: `finch::dwca_read` (importiptdata.R:36). The EML file is found through the `metadata` attribute of `<archive>` in meta.xml (finch R/dwca.R:127-134); BioCheck itself only uses EML title and temporalCoverage (importiptdata.R:44-56). eMoF `eventID` is taken from the extension's coreid (`eMoF$eventID <- eMoF$id`, importiptdata.R:127), so the eMoF table needs coreid = eventID.
- EML version: BioCheck does NOT validate EML; it only parses it with `EML::read_eml` via finch (DESCRIPTION: EML >= 2.0.0). Whether that parser accepts the 2.2.0 namespace: UNVERIFIED (no R available here; I did not run it).
- BioCheck reference tables (snapshot files/BODCparameters_20260101.csv, BODCunits_20260101.csv, BODCvalues_20251101.csv) store URIs as `http://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/`. The join is an exact string match (checkdataset.R:565-600), so `https://` or a missing trailing slash would show as "does not resolve" (inference from the join code; not tested live). I checked every ID used in the synthetic archive against these CSVs (`selfcheck.py`): all found, none deprecated.
- BioCheck "no unit/value ID needed" and "sampling descriptor" lists (files/workingEnvironment.R:17-37): nomofvalues = OCOUNT01, SSAMPC01; effort = Q01, AREABEDS, VOLWBSMP, LENTRACK, AZDRZZ01, VOLFFMXX, SZCLBIO1, MSHSIZE1/2/3, DSAMPA01, MTHAREA1, MTHHGHT1, MTHWDTH1, DSPSSP01, VOLXXXXX, VOLFFMDT, VOLFDGDT, VOLFMCXX, VOLSEDSM, VOLSPOPC, WASPXX01, ...; instrument = NMSPINST, Q0100002.

---------------------------------------------------------------------------

### Item 3. EML 2.2.0 vs 2.1.1

Facts (all verified yes):
- gbif/ipt latest release `ipt-3.3.7`, published 2026-10-16 (GitHub API `repos/gbif/ipt/releases`, 30 releases read).
- docs/en/modules/ROOT/pages/releases.adoc:223 (cloned commit f7fcd19, 2026-10-16): "3.1.0 - October 2024 ... This major release introduces support for EML 2.2.0."
- The IPT WRITES 2.2.0: its EML library `org.gbif:gbif-metadata-profile-eml:3.0` (IPT pom.xml:46, 357-358; jar from repository.gbif.org, unzipped) contains `templates/eml-ipt.ftl` whose root is `<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" ... xsi:schemaLocation="https://eml.ecoinformatics.org/eml-2.2.0 https://rs.gbif.org/schema/eml-gbif-profile/1.3/eml.xsd">`. Older templates (1.0..1.2, namespace `eml://ecoinformatics.org/eml-2.1.1`) remain in the jar.
- The IPT ACCEPTS both on upload: ResourceManagerImpl.java:510-531 maps namespace `eml://ecoinformatics.org/eml-2.1.1` -> GBIF profile 1.2 and `https://eml.ecoinformatics.org/eml-2.2.0` -> profile 1.3, anything else throws "Unsupported EML version or unrecognized namespace".
- GBIF schema repository https://rs.gbif.org/schema/eml-gbif-profile/ lists 1.0 .. 1.3 (1.3 last modified 2024-08-27); `1.3/eml.xsd` has targetNamespace `https://eml.ecoinformatics.org/eml-2.2.0`.
- OBIS Manual https://manual.obis.org/eml.html: "OBIS uses the GBIF EML profile (version 1.1)"; minimum "Title, Citation, Contact and Abstract"; licences: CC-0 preferred, CC-BY accepted, CC-BY-NC least preferred. Profile 1.1 is two generations behind the IPT, so the manual text is stale documentation rather than a requirement; I found no OBIS statement rejecting 2.2.0.
- BioCheck: no EML validation (Item 2).
- UNVERIFIED: which IPT version a given OBIS node runs (a node on IPT < 3.1.0 would reject 2.2.0 by the logic above); whether the OBIS harvester reads 2.2.0 from every node. I did not contact any node.

Recommendation: write EML 2.2.0 with GBIF profile 1.3 as default, because it is what the current IPT (3.3.7) writes and validates, and a hand-made 2.1.1 file is the "legacy" path in the IPT code. Offer a "legacy EML 2.1.1 / profile 1.1" switch (namespace `eml://ecoinformatics.org/eml-2.1.1`, schemaLocation `http://rs.gbif.org/schema/eml-gbif-profile/1.1/eml.xsd`) for nodes on an old IPT, and tell the user to ask the node which IPT version it runs. CC-BY-4.0 is expressed as `<intellectualRights><para>... <ulink url="http://creativecommons.org/licenses/by/4.0/legalcode"><citetitle>Creative Commons Attribution (CC-BY) 4.0 License</citetitle></ulink>`; the IPT's supported-licence set contains exactly that URL (Constants.java:~138-145). I validated the synthetic eml.xml against the local copy of `rs.gbif.org/schema/eml-gbif-profile/1.3/eml.xsd` (`xmllint --schema`: "validates").

---------------------------------------------------------------------------

### Item 4. WoRMS REST

Spec: the Swagger page https://www.marinespecies.org/rest/ loads `https://www.marinespecies.org/rest/api-docs/openapi.yaml` (found in the page's swagger_ui JS; downloaded 81 KB, HTTP 200). Verified yes for all lines below.
- `AphiaRecordsByMatchNames` (openapi.yaml:512-): description ends "Limited to 50 names at once for performance reasons". Params: `scientificnames[]` (required, array), `authorships[]`, `marine_only` (default true), `extant_only` (default true), `match_authority`.
  Ran: 50 repeated names -> HTTP 200 (47 801 bytes); 51 -> HTTP 400 `"scientificnames must not exceed 50 element(s)."`. So the limit is enforced server-side at 50.
- `AphiaRecordsByNames` (exact): "Limited to 500 names at once" (openapi.yaml:667).
- Rate limits: none documented. grep of openapi.yaml for rate/throttl/limit/requests found only "Limit to marine/extant" parameter text, and the page https://www.marinespecies.org/aphia.php?p=webservice (opened) states none. Unwritten limits: UNVERIFIED. Responses carry `cache-control: no-store`, so the client must cache results itself.
- CORS. Command run: `curl -s -D - -o /dev/null -H 'Origin: https://tools.something-rare.com' 'https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=Calanus%20finmarchicus&marine_only=false'`
  Output headers: `HTTP/2 200`, `content-type: application/json`, `access-control-allow-origin: *`, `access-control-allow-headers: X-Requested-With, Content-Type, Accept, Origin, Authorization`, `access-control-allow-methods: GET, POST, OPTIONS`. Also an OPTIONS preflight with `Access-Control-Request-Headers: content-type` returned 200 with the same three headers. So a browser can call it directly; keep to GET (long GET URLs with 50 names are ~2 KB, fine).
- Response (first record): AphiaID 104464, `lsid` field present. Run result for names used later (marine_only=false):

| name | AphiaID | status | rank | lsid |
|---|---|---|---|---|
| Calanus finmarchicus | 104464 | accepted | Species | urn:lsid:marinespecies.org:taxname:104464 |
| Oithona similis | 106656 | accepted | Species | urn:lsid:marinespecies.org:taxname:106656 |
| Pseudocalanus | 104165 | accepted | Genus | urn:lsid:marinespecies.org:taxname:104165 |
| Acartia longiremis | 104257 | "alternative representation" | Species | urn:lsid:marinespecies.org:taxname:104257 |
| Limecola balthica | 880017 | unaccepted | Species | urn:lsid:marinespecies.org:taxname:880017 |
| Amphiura filiformis | 125080 | accepted | Species | urn:lsid:marinespecies.org:taxname:125080 |

  Converter consequence: the response carries `status` and `valid_AphiaID`; unaccepted and "alternative representation" hits need a user decision. OBIS manual says scientificName must hold "the originally documented" name and scientificNameID the WoRMS LSID (common_formatissues.html, verified); whether OBIS wants the unaccepted or the valid LSID is UNVERIFIED. OBIS "does not parse LSIDs from other sources" (same page).

---------------------------------------------------------------------------

### Item 5. NVS (CORS and formats)

Commands run (Python urllib / curl equivalent, `Origin: https://tools.something-rare.com`), 2026-10-25:

| request | status | content-type | Access-Control-Allow-Origin | other |
|---|---|---|---|---|
| GET `https://vocab.nerc.ac.uk/sparql/sparql?query=SELECT%20*%20WHERE%7B%3Fs%20%3Fp%20%3Fo%7D%20LIMIT%201` | 200 | application/sparql-results+json; charset=utf-8 | `*` | `Access-Control-Allow-Credentials: true`; server Apache/Fuseki; `Cache-Control: must-revalidate,no-cache,no-store`; body is valid SPARQL JSON, 1 binding |
| OPTIONS same URL (preflight, `Access-Control-Request-Headers: content-type`) | 200 | - | `*` | Allow-Methods `GET,POST,DELETE,PUT,HEAD,OPTIONS,PATCH`; Allow-Headers `Accept,Origin,X-Requested-With,Content-Type,Last-Modified,Authorization`; Max-Age 1800 |
| GET `https://vocab.nerc.ac.uk/collection/P01/current/SDBIOL01/?_profile=nvs&_mediatype=application/ld+json` | 200 | application/ld+json | `*` | server uvicorn; content-length 3335 |
| OPTIONS same concept URL | 405 | - | `*` | no Allow-Methods header |

Consequence: the SPARQL endpoint and the concept pages can be called from the browser with a plain GET (no custom headers, so no preflight). A POST with `Content-Type: application/x-www-form-urlencoded` is also a "simple" request; JSON POSTs would preflight. The concept endpoint answers a preflight with 405, so do not send non-safelisted headers to it. Whole-collection download (P01 ~50 000 concepts, BioCheck's CSV is 20 MB) is not suited to the browser; use SPARQL search per query, or ship a small pre-built generic list (Item 1b) plus live search.
SPARQL gotcha seen: `skos:inScheme <.../collection/P01/current/>` returned nothing; filtering `str(?c)` with regex `^http://vocab.nerc.ac.uk/collection/P01/current/[^/]+/$` works (and excludes versioned `/<CODE>/<n>/` URIs, which the endpoint also returns). `owl:deprecated` comes back as "true"/"false" literals.
UNVERIFIED: rate limits of NVS (none documented that I found; I did not search for a policy page).

---------------------------------------------------------------------------

### Item 6. Synthetic Event-core DwC-A (built, not uploaded)

Archive (kept outside the repository; files at the zip root: meta.xml, eml.xml, event.txt, occurrence.txt, extendedmeasurementorfact.txt). All values invented except taxon names, WoRMS LSIDs and NVS URIs. An offline self-check mimicking the BioCheck rules in Item 2 gave 20 PASS, "ALL OK". That self-check is a re-implementation, not BioCheck; the real BioCheck run is the last section below.

Design choices and their evidence:
- Event: 1 cruise (`SYN2023_CRUISE01`, 2023-06-14/2023-06-16) -> 2 stations -> 3 samples; eventType text cruise / station / sample (manual example). Cruise position DERIVED: stations at (55.50 N, 2.50 E) and (55.90 N, 3.10 E); bounding-box midpoint 55.7000 N, 2.8000 E; coordinateUncertaintyInMeters = 29151 = haversine distance from the midpoint to the farthest box corner (29 150.6 m), rounded up. The haversine HALF-DIAGONAL is 29 119.4 m (script output), 31 m smaller than the corner distance on a sphere, so a circle of the half-diagonal would not quite contain the corners; the OBIS definition is "the radius of the smallest circle around the given position containing the whole location" (darwin_core.html), so use the corner distance. georeferenceRemarks says it is derived. Stations and samples carry their own coordinates (100 m uncertainty) because GBIF does not inherit from parents (format_event.html). geodeticDatum = EPSG:4326 as the manual requires.
- Samples have minimumDepthInMeters / maximumDepthInMeters (0-50, 0-25, 0-50) because BioCheck warns when they are missing on leaf events. Bathymetry at the two stations was NOT checked: BioCheck warns if depth > GEBCO + 150 m, and warns if a point is on land; I expect neither in the central North Sea but this is UNVERIFIED.
- Event also has datasetName and institutionCode columns (BioCheck error if absent) and an empty parentEventID value for the cruise.
- Occurrence: 6 records; WoRMS LSIDs from the REST run in Item 4 (Calanus finmarchicus 104464, Oithona similis 106656, Pseudocalanus genus 104165). "Pseudocalanus sp." is written as scientificName "Pseudocalanus" + taxonRank genus + scientificNameID of the genus + identificationQualifier "sp." + verbatimIdentification "Pseudocalanus sp." The manual's rule (darwin_core.html: scientificName = lowest accurate rank, qualifier in identificationQualifier) is verified; that "sp." itself belongs in identificationQualifier is my convention (the manual's examples show cf., aff., ?), UNVERIFIED. One absent record (SYN2023-S2-O5, Oithona similis, occurrenceStatus absent, organismQuantity 0, organismQuantityType "individuals"); the other organismQuantity cells are empty because OBIS "recommends to add measurements to eMoF".
- basisOfRecord = HumanObservation. OBIS manual (darwin_core.html): "HumanObservation (e.g bird sighting, benthic sample but specimens were discarded after counting)"; PreservedSpecimen would additionally require institutionCode, collectionCode and catalogNumber; MaterialSample is "physical sample was taken, and may have been preserved or destroyed". A converter should ask which applies and default to HumanObservation only when no collection is declared.
- eMoF (21 rows): per sample event NMSPINST (value + L22 valueID), VOLWBSMP (m3, MCUB), MSHSIZE1 (um, UMIC); per present occurrence OCOUNT01 (no unit) and SDBIOL01 (UPMM) with density = count / volume (e.g. 246 / 12.3 = 20.0); for the absent record SDBIOL01 = 0; one LSTAGE01 row with S11/S1112. Absent zero is not flagged by BioCheck because the 0-check only fires for present/empty status (checkdataset.R:611, 626).
- meta.xml: core `http://rs.tdwg.org/dwc/terms/Event` with `<id index="0"/>`; extension `.../terms/Occurrence` with `<coreid index="1"/>` (its eventID column is index 1, occurrenceID index 0); extension `http://rs.iobis.org/obis/terms/ExtendedMeasurementOrFact` with `<coreid index="0"/>`. From the extension definition https://rs.gbif.org/extension/obis/extended_measurement_or_fact_2023-08-28.xml (opened): `measurementTypeID`, `measurementValueID`, `measurementUnitID` live in the OBIS namespace `http://rs.iobis.org/obis/terms/`, the other measurement terms and occurrenceID in the dwc namespace, and the extension has no eventID property (the link is the coreid). `<archive ... metadata="eml.xml">` is required for BioCheck's reader (Item 2).
- eml.xml: EML 2.2.0 / GBIF profile 1.3 (Item 3), CC-BY-4.0 via `ulink`. Validation: `xmllint --noout archive/meta.xml archive/eml.xml` -> no output (well-formed); `xmllint --noout --schema eml.xsd archive/eml.xml` against the downloaded 1.3 schemas (xml.xsd made local) -> "validates". Text files were checked by selfcheck.py only (tab counts, ID joins, vocabulary resolution against BioCheck's CSV tables).

---------------------------------------------------------------------------

### Open risks (for the converter design)
1. RESOLVED in the live BioCheck run below (the zip was run through the app: no issues, behaviour consistent with Item 2, and the About tab names the code read there). Strictly, equality of the deployed app with GitHub master is not proven, only consistent.
2. UNVERIFIED which EML version the target OBIS node's IPT/harvester accepts; the OBIS manual still names profile 1.1.
3. RESOLVED in the live BioCheck run below: the temporal cover was read from the EML 2.2.0, so BioCheck parses it.
4. Station positions not checked against land or GEBCO; the live run below does not cover it. UNVERIFIED.
5. NVS is a third party: a few `owl:deprecated` flips (e.g. SDBIOL10, S1115) show the list changes; resolve at runtime and cache with a date.
6. Deliberate gaps: no real-data validation, no benthos example in the archive (SDBIOL02 / AREABEDS / Van Veen / box corer concepts are verified in Item 1 but not exercised in Item 6), no sex rows (S10 verified only).

#### Live BioCheck run of the synthetic archive (25.10.2026, run by hand)

`synthetic-event-core.zip` (invented values; 1 cruise, 2 stations, 3 samples, 6 occurrences including 1 absence, 21 eMoF rows; EML 2.2.0) uploaded by hand through "File → Upload DwC archive" at https://rshiny.lifewatch.be/BioCheck/, tree option "no":

- **Issues found:** "No general issues detected in this dataset". The tabs Invalid Event / Occurrence / eMoF Records are empty.
- **Data overview:** event types read from `eventType` as text (cruise 1, station 2, sample 3). basisOfRecord HumanObservation, 5 present and 1 absent. The temporal cover was read from the EML (2023-06-14 to 2023-06-16), so BioCheck parses EML 2.2.0. Every P01/P06/L22/S11 URI resolved to its label.
- **The derived cruise position is accepted:** the midpoint of the stations' bounding box, with `coordinateUncertaintyInMeters`, raises no issue.
- **Unit note:** BioCheck lists the standard unit of SDBIOL01 as "Number per millilitre" next to our "Number per cubic metre". This is shown, not flagged. The converter writes the unit the user gave, with its P06, and does not convert it.
- **Tool fault:** with "Add event hierarchy tree? yes", the same archive produced only "argument is of length zero" (a BioCheck R error). With "no" it loads normally. Use "no" in acceptance runs, or note the fault.
- The About tab confirms the app is built on EMODnet/EMODnetBiocheck + iobis/obistools, the code read above.

---------------------------------------------------------------------------

## Converter (/convert) — stage 4 verification, 25.10.2026: the WoRMS opt-in

Settles the item left UNVERIFIED in the stage 0 spike, Item 4 ("whether OBIS wants the unaccepted or the valid LSID").

- **Which LSID.** OBIS Manual, "Darwin Core" (https://manual.obis.org/darwin_core.html), section "Taxonomy and identification", opened 2026-10-25: "A WoRMS LSID should be added in scientificNameID (strongly recommended term). The LSID used for scientificNameID should correspond to the name provided to the scientificName field, even if it is not the currently accepted scientific name. OBIS will use this identifier to pull the taxonomic information from the World Register of Marine Species (WoRMS) into OBIS and attach it to your dataset. This information includes: Taxonomic classification (kingdom through species); The accepted name in case of invalid names or synonyms; AphiaID; IUCN red list category". Same section: scientificName "should always contain the originally recorded full scientific name, even if the name is currently a synonym". So: the matched record's OWN AphiaID, never valid_AphiaID; scientificName never replaced. "Match Taxonomic Names" (https://manual.obis.org/name_matching.html): "The WoRMS LSID is used for DwC:scientificNameID"; ambiguous matches (homonyms) are to be checked and resolved by the data provider.
- **WoRMS answers, observed with curl 2026-10-25** (the test fixtures are hand-written from them, reduced to the fields the code reads: test/helpers/wormsFixtures.ts): HTTP 200 with an array holding one array per name sent, in order; a name without match is `[]`; a batch in which NOTHING matches is HTTP 204 with an empty body. Seen match types: `exact`, `near_1` ("Calanus finmarchicu"), `phonetic` ("Oithona similus"); `exact_genus` and `exact_subgenus` never appeared in these calls (the page treats them as not automatic). Homonym/ambiguous: "Oithona" and "Aurelia" return two records, both `exact`, one accepted and one unaccepted of another kingdom. Unaccepted: "Sagitta elegans" is one `exact` record, status unaccepted, AphiaID 105450, valid_AphiaID 105440 (Parasagitta elegans). Habitat flags are 0, 1 or null (the unaccepted homonym has null). The responses set a `PHPSESSID` cookie and `cache-control: no-store`; the page sends `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`.
- **BioCheck, "No sampling descriptors/effort present".** EMODnet/EMODnetBiocheck R/checkdataset.R lines 562-566 (master 701e6e7, 2026-10-08): `if (sum(grepl(paste(BODCeffort, collapse="|"), unique(eMoF$measurementTypeID))) == 0)` raises level "warning", field "measurementType". data/BODCeffort.rda (bzip2 R object, decoded) holds 29 codes: AREABEDS, VOLWBSMP, LENTRACK, AZDRZZ01, VOLFFMXX, SZCLBIO1, PRSZSPLW, MSHSIZE2, DSSPXTMT, DSSPPRMT, DSAMPA01, MTHHGHT1, MTHAREA1, MTHWDTH1, DSSPMT01, MSHSIZE1, NMSPPF01, DSPSSP01, PRSZSPUP, MSHSIZE3, WASPXX01, COREWDTH, VOLXXXXX, VOLFFMDT, VOLFDGDT, VOLFMCXX, VOLSEDSM, VOLSPOPC, M91BA36A. Our VOLWBSMP, AREABEDS and MSHSIZE1 are on it (yes). The match is a substring match of the measurementTypeID URI.
- **EML citation identifier.** IPT installations serve `<citation identifier="https://doi.org/10.15472/ssc1ui">` (https://ipt.biodiversidad.co/sibm/eml.do?r=coleccionanelidosmhnmc) and `identifier="https://doi.org/10.82144/00c3e9b1"` (https://ipt.env.duke.edu/eml.do?r=zd_326); an IPT dataset without a DOI has a bare `<citation>`. The converter writes the DOI as a https://doi.org/ address, and keeps the slug when there is no DOI.


---------------------------------------------------------------------------

## Converter (/convert) — stage 5 verification, 25.10.2026: NERC suggestions for measured variables and the NVS opt-in

What stage 5 added and what was checked for it. Helper scripts and raw responses were kept outside the repository (full NVS records stay out of the repo and its history; the tests use hand-written fixtures reduced to the fields the code reads).

### Part A1. Which name is written after the user chose a WoRMS result (settles the stage 4 wording "scientificName is never replaced")

- OBIS Manual, "Darwin Core" (https://manual.obis.org/darwin_core.html), section "Taxonomy and identification", opened 2026-10-25: "verbatimIdentification should be used to record the taxon identification as it appeared in the original record, unaltered, with hybrid formulas, informal descriptions, misspellings, etc." and "The LSID used for scientificNameID should correspond to the name provided to the scientificName field, even if it is not the currently accepted scientific name."
- OBIS Manual, "Match Taxonomic Names" (https://manual.obis.org/name_matching.html), opened 2026-10-25: "In these cases scientificNameID should reflect the name in the scientificName field, even if this name is not accepted. If you or the data provider can confirm with certainty that the name in scientificName can be changed to an accepted name, then verbatimIdentification must be populated with the scientific name as it was originally documented. In general, it is good practice to populate verbatimIdentification with the original taxon identification." Same page, for the fuzzy results (phonetic, near_1 to near_3): "Take care to ensure the correct species name is selected given the information in the original documentation." and the typo example "Thunus" instead of "Thunnus" "would prevent proper linking of data to the corresponding LSID".
- Darwin Core terms (https://dwc.tdwg.org/terms/), opened 2026-10-25. scientificName: "The full scientific name, with authorship and date information if known. When forming part of a dwc:Identification, this should be the name in lowest level taxonomic rank that can be determined." verbatimIdentification: "A string representing the classification as it appeared in the original record." with the note "This term is meant to allow the capture of an unaltered original identification/determination, including identification qualifiers, hybrid formulas, uncertainties, etc. This term is meant to be used in addition to dwc:geologicalMaterialNames or dwc:scientificName (and dwc:identificationQualifier etc.), not instead of it."
- Rule built from these: an exact match (a synonym included) keeps scientificName as written; a result the USER chose among non-exact ones (near, phonetic, genus, several results) writes the chosen record's own `scientificname`, so the LSID belongs to the name written; verbatimIdentification keeps the sheet's spelling; the occurrenceID is built from the sheet's text and does not change. The page shows, for every offered result, how scientificName would be written. UNVERIFIED: whether OBIS itself would prefer to keep a misspelling in scientificName and rely on the LSID; the manual says the opposite ("Match with a register ... helps to avoid misspelled or unused terms").
- Part A2: two names of one sample that resolve to the same taxon: CONV-TAXON-SAME-EVENT is judged after the lookup and groups by scientificNameID when there is one (else by the written name); it names the sheet's own spellings and never sums.

### Part B2. NERC concepts verified for measured variables (opened 2026-10-25)

Each opened as `https://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/?_profile=nvs&_mediatype=application/ld+json`: HTTP 200, `owl:deprecated` = "false", no redirect. The URI written is `http://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/` (http, trailing slash). P01 (measurementTypeID), `generic` = may be proposed (the user still confirms it), `method` = only offered (plan trap T12):

| variable | code | kind | per | preferred label (NVS) |
|---|---|---|---|---|
| temperature | TEMPPR01 | generic | - | Temperature of the water body |
| temperature | TEMPP901 | method | - | Temperature (ITS-90) of the water body |
| temperature | TEMPST01 | method | - | Temperature of the water body by CTD or STD |
| salinity | PSLTZZ01 | generic | - | Practical salinity of the water body |
| salinity | PSALST01 | method | - | Practical salinity of the water body by CTD and computation using UNESCO 1983 algorithm |
| salinity | PSALMV01 | method | - | Practical salinity of the water body by moving vessel profiler (MVP) and computation using UNESCO 1983 algorithm |
| oxygen | DOXYZZXX | generic | volume | Concentration of oxygen {O2 CAS 7782-44-7} per unit volume of the water body [dissolved plus reactive particulate phase] |
| oxygen | DOXMZZXX | generic | mass | Concentration of oxygen {O2 CAS 7782-44-7} per unit mass of the water body [dissolved plus reactive particulate phase] |
| pH | PHXXZZXX | generic | - | pH (unspecified scale) of the water body |
| pH | PHXXSP02 | method | - | pH (total scale) {pH[T]} of the water body by spectrophotometry |
| nitrate | NTRAZZXX | generic | volume | Concentration of nitrate {NO3- CAS 14797-55-8} per unit volume of the water body [unknown phase] |
| nitrite | NTRIZZXX | generic | volume | Concentration of nitrite {NO2- CAS 14797-65-0} per unit volume of the water body [unknown phase] |
| nitrate+nitrite | NTRZZZXX | generic | volume | Concentration of nitrate+nitrite {NO3+NO2} per unit volume of the water body [unknown phase] |
| ammonium | AMONZZXX | generic | volume | Concentration of ammonium {NH4+ CAS 14798-03-9} per unit volume of the water body [unknown phase] |
| phosphate | PHOSZZXX | generic | volume | Concentration of phosphate {PO43- CAS 14265-44-2} per unit volume of the water body [unknown phase] |
| phosphate | PHOSKGD5 | method | mass | ... per unit mass of the water body [dissolved plus reactive particulate <0.2um phase] by filtration and colorimetric autoanalysis |
| silicate | SLCAZZXX | generic | volume | Concentration of silicate {SiO44- CAS 17181-37-2} per unit volume of the water body [unknown phase] |
| silicate | SLCAKGD5 | method | mass | ... per unit mass of the water body [dissolved plus reactive particulate <0.2um phase] by filtration and colorimetric autoanalysis |
| chlorophyll | CPHLZZXX | method (narrower: chlorophyll-a) | volume | Concentration of chlorophyll-a {chl-a CAS 479-61-8} per unit volume of the water body [particulate >unknown phase] |
| DIC | TCO2ZZXX | method | volume | Concentration of total inorganic carbon {TCO2 CAS 7440-44-0} per unit volume of the water body [dissolved plus reactive particulate phase] |
| DIC | TCO2KG02 | method | mass | ... per unit mass ... by acidification and CO2 quantification by gas analyser |
| TA | ALKYZZXX | method | volume | Total alkalinity per unit volume of the water body |
| TA | ALKYPOTK | method | mass | Total alkalinity per unit mass of the water body by potentiometry |
| pCO2 | PCO2EG01 | method | - | Partial pressure of carbon dioxide {CO2 CAS 124-38-9} {pCO2} in the water body by equilibration with air, drying and infra-red gas analysis |
| POC | CORGCAP1 | method | volume | Concentration of organic carbon {organic_C CAS 7440-44-0} {POC} per unit volume of the water body [particulate >GF/F phase] by filtration, acidification and elemental analysis |
| PON | NTOTCAP1 | method | volume | Concentration of total nitrogen {total_N} {PON} per unit volume of the water body [particulate >GF/F phase] by filtration, acidification and elemental analysis |
| d15N | D15NEAM1 | method | - | Enrichment of nitrogen-15 in total nitrogen {15N_in_total_N CAS 14390-96-6} {delta(15)N} in the water body [particulate >GF/F phase] by filtration, acidification, combustion and mass spectrometry |

The "unknown phase" concepts (NTRAZZXX, NTRIZZXX, NTRZZZXX, AMONZZXX, PHOSZZXX, SLCAZZXX) name no method and no phase, so they may be proposed; a nutrient given per unit MASS has no verified generic concept: nothing is proposed, the method-specific one (PHOSKGD5, SLCAKGD5) is offered, and the NVS search is the way to another. Oxygen: DOXYZZXX for a unit per volume (µmol/L, mg/L), DOXMZZXX for a unit per mass (µmol/kg); with another unit (mL/L, %, no unit) nothing is proposed and both are offered.

P06 (measurementUnitID), all opened the same way, owl:deprecated "false": UPOX Micromoles per litre, KGUM Micromoles per kilogram, UMGL Milligrams per litre, UPNM Nanomoles per litre, MMPL Millimoles per litre, UGPL Micrograms per litre, UMMC Milligrams per cubic metre, UGMC Grams per cubic metre, UPAA Degrees Celsius, UUUU Dimensionless, PSUX Practical salinity units, UUPH pH units, UATM Microatmospheres, UPPT Parts per thousand, ULAA Metres. The alias table matches the unit of the column's unit field in the mapping table, not the header text: /check's recogniser has already turned a header unit it knows into its own spelling (degC or a bare c into °C, ppt into ‰), so a header ppt reaches the converter as ‰ and is offered Parts per thousand, which the user sees and confirms or not. The strings "ppt", "c" and "mL/L" themselves have no alias (mL/L: no concept verified). UNOPENED / dropped: UMLL and USMV (guessed codes, not confirmed in the time of the run).

### Part B3. The NVS opt-in: facts it is built on (checked 2026-10-25)

- SPARQL: `GET https://vocab.nerc.ac.uk/sparql/sparql?query=<percent-encoded query>`. WITH `Accept: application/sparql-results+json` it answers `application/sparql-results+json; charset=utf-8` (`{"head":{"vars":["c","l","d"]},"results":{"bindings":[{"c":{"type":"uri","value":...},"l":{"type":"literal","xml:lang":"en","value":...},"d":{"type":"literal","value":"false"}}]}}`); WITHOUT it the same URL answers `application/sparql-results+xml`. `Access-Control-Allow-Origin: *`. `Accept` is a CORS-safelisted request header, so the request needs no preflight. A search of one word took 1-3 s.
- Query shape used: `?c skos:prefLabel ?l . OPTIONAL { ?c owl:deprecated ?d } FILTER(REGEX(STR(?c), "^http://vocab[.]nerc[.]ac[.]uk/collection/P01/current/[^/]+/$")) FILTER(CONTAINS(LCASE(STR(?l)), "<word>") || CONTAINS(LCASE(STR(?c)), "<word>")) ORDER BY STRLEN(STR(?l)) ?l LIMIT 20` (shortest labels first: with alphabetical order the typed words "Temperature of the water body" returned 20 other labels and not TEMPPR01). The character class `[.]` avoids a backslash in the fixed text; the typed word is escaped as a SPARQL string literal (backslash, double quote, line breaks and control characters; and a backslash before u/U, because SPARQL 1.1 section 19.2 turns \uXXXX into its character before parsing).
- Fallback by code: `GET https://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/?_profile=nvs&_mediatype=application/ld+json` answered 200, `application/ld+json`, ACAO `*`, NO redirect (checked with redirects disabled; the page requests with `redirect: 'error'`), the concept as a top-level JSON-LD node (`@id` = the concept address, `skos:prefLabel` as `{"@language":"en","@value":...}`, `owl:deprecated` as the string "false"). A preflight to it gets 405: plain GET, no header.
- Deprecated concepts exist in the vocabulary (the OBIS Manual: "You should not use any deprecated concepts for any measurement ID"). The page shows a concept that is not stated current as deprecated and cannot be chosen; the worker refuses a pick with `deprecated` other than literally false.
- Operator: the NERC Vocabulary Server is run by the British Oceanographic Data Centre (BODC) at the National Oceanography Centre (NOC). UNVERIFIED: rate limits (none found documented).
- The CSP of /convert alone gained `https://vocab.nerc.ac.uk` in `connect-src` (server/headers.ts PAGE_CONNECT_HOSTS); no other path, DATA_HOSTS or the fetch proxy knows it.


## Converter (/convert) — stage 6 verification, 25.10.2026: separate environmental and CTD profile files

What stage 6 added (a sheet marked "profile / environment of this cruise") and what was checked for it. No threshold was added; the two NERC concepts below are the only new identifiers.

### Part 1. PRESPR01 and UPDB (opened 2026-10-25)

Each opened as `https://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/?_profile=nvs&_mediatype=application/ld+json` (curl, no redirect followed): HTTP 200, `Content-Type: application/ld+json`, no redirect, `owl:deprecated` = "false", `skos:note` = "accepted".

| collection | code | URI written | prefLabel (NVS) | altLabel | notes |
|---|---|---|---|---|---|
| P01 (measurementTypeID) | PRESPR01 | `http://vocab.nerc.ac.uk/collection/P01/current/PRESPR01/` | Pressure (spatial coordinate) exerted by the water body by profiling pressure sensor and correction to read zero at sea level | Pres_Z | definition: "The force per unit area exerted by the water column on a mobile sensor located in the water column." Version 2, current. sameAs R03/PRES and OG1/PRES. |
| P06 (measurementUnitID) | UPDB | `http://vocab.nerc.ac.uk/collection/P06/current/UPDB/` | Decibars | dbar | sameAs qudt.org DeciBAR. Version 2, current. Its definition field on NVS reads "Unavailable". |

- PRESPR01 names a profiling pressure sensor corrected to zero at sea level: it is the right concept for the pressure column of a CTD file and a less exact one for a pressure that came another way. The converter writes it for every pressure column of a profile sheet and offers no other pressure concept; a pressure that is not in decibars gets no unit identifier (a warning, CONV-UNIT-NO-P06) and a pressure without a unit is written without one. UPDB is written only for a unit that reads as decibars (dbar, db, decibar, decibars).
- The URI form is the one of every code of `src/core/convert/vocab.ts` (http, trailing slash: the form BioCheck's reference tables join on). Both were also listed (UPDB: opened 2026-10-16, Item 7) before; PRESPR01 had not been opened before this stage.
- No depth is derived from a pressure: the UNESCO formula is not applied in this version (the depth of a pressure-only level stays empty).

### Part 2. eventType of a profile level, and the hierarchy

- OBIS Manual, "Event core" (https://manual.obis.org/format_event.html, read 2026-10-25): `eventType` is one of the terms to "consider adding", with parentEventID and eventRemarks; "Add and fill the parentEventID, eventType, and eventRemarks fields as applicable. Identify the hierarchical event structure in your data, if present, and create new records for parent events".
- OBIS Manual, "Common data formatting issues", "How to handle mixed date information" (https://manual.obis.org/common_formatissues.html, read 2026-10-25): "We have added a column here for “Event Type” for the sake of example. At this time, there is no Darwin Core event type term, however there is discussion for its creation." Its example values are cruise, station and sample (three levels: the cruise, "the station sites", "the samples themselves").
- So `eventType` is free text. The stage 1 values stay (cruise, station, sample); a row of a profile file is written as **`profile level`**: the nature of the event in the same plain style, one depth of a profile (a CTD scan or a bottle), which is not a sample of a biology sheet. BioCheck does not validate eventType (it only reads it for its summary table, stage 0, Item 2b).
- Hierarchy chosen: cruise > station > profile level, with **no cast level** between a station and its levels. The manual's example has three levels and says a hierarchy helps to give each event its own date and duration; a level has its own date and position when the sheet gives them, and the station's extent covers its levels. A cast event would need a cast column, which the sheet mapping has no role for, and would multiply the events (one more per cast); repeated casts at one station are told apart by the level's own code (a code column), and the tool blocks a repeated ID instead of merging the casts (CONV-ID-DUPLICATE, kind level).
- The extent of a station includes its levels (they are its children): derived date = the earliest start to the latest end of samples and levels; position = the midpoint of the bounding box of both, with an uncertainty that covers all; depth = the shallowest minimum to the deepest maximum (`src/core/convert/events.ts`).

### Part 3. Inheritance and what BioCheck needs on a leaf

- BioCheck checks the required terms (eventDate, decimalLatitude, decimalLongitude) on the leaf events after inheritance (stage 0, Item 2b: obistools `flatten_event` gives a child every Event-core field of its parent that it leaves empty; `check_fields`; checkdataset.R:816-817). The OBIS Manual agrees ("child events will inherit information from the parent event when the field is left empty") and warns that GBIF does not inherit.
- A level with no position or date of its own therefore inherits from its station. The converter takes that from the PARENT only (its station): with the station level flattened away there is no station, and a level without its own date or position is blocked (it never takes the cruise's); a station that has neither (an unmatched station whose profile sheet has no date or position column) does not lend its levels the whole cruise's range, and the level is blocked in the sheet's terms (CONV-PROFILE-LEVEL-INCOMPLETE). Reason: the row checks of the output tables (ROW-NO-COORD) do not raise for an event without a position that follows a positioned row in a table with no station or date column (the "accepted miss" of the position checks above), so the leaf check is made in the core where the sheet and the line are known.

### Part 4. Station matching and level IDs (plan 2.5, Q1b, 3.4)

- A profile row's station is matched EXACTLY: the trimmed station text and the cruise when there is one (the same `cruise:station` eventID the biology sheets build). Upper and lower case, spelling and leading zeros count; nothing is matched approximately. A profile station that matches no biology station gets its own station event and the warning CONV-PROFILE-STATION-UNMATCHED, which names the eventIDs (to accept before the export, plan 3.4).
- Level ID: `<station eventID>:<code>` with a code column (the column marked as the sample code); without one only with the user's explicit approval for that sheet, chosen per row: `<station eventID>:<depth>m` (stage 7: with the unit, see Part 4 of the stage 7 section) with the depth as written when its cell reads as a number (a decimal comma becomes a point), otherwise `<station eventID>:<pressure>dbar` with the pressure as written (only for a pressure column in decibars, so a depth of 5 and a pressure of 5 are two IDs). A row with neither, and every row without the approval and without a code column, blocks with CONV-SAMPLE-CODE-MISSING (profile text). Never derived from the order of the rows. The duplicate check compares the number, not its text (10 and 10.0 are one depth), and a code equal to a depth ID is a collision too. A repeated ID blocks (CONV-ID-DUPLICATE: kind `level` for profile rows only, kind `level-other` when a sample, station or cruise has the ID; each names what the rows' IDs were made of). A pressure column with no unit is written without one, with its own warning (CONV-PROFILE-PRESSURE-NO-UNIT).

### Part 5. Size

A profile sheet of 50 stations of 1000 levels (50 000 rows, with depth, pressure and two variables: 150 000 eMoF rows, 50 101 events) was converted, checked (Event table through the same checks as /check, Occurrence, eMoF and cross-table checks) and written (tables, meta.xml, deflated zip of about 1.2 MB) on the development machine in about 0.3 s, 0.6 s and 0.3 s (test/convert/stage6.test.ts; the test bounds each step well above that, to catch a quadratic loop, which would take minutes). The page receives counts and a few examples only (the worker keeps the records).

## Converter (/convert) — stage 7 verification, 26.10.2026: the two real public PANGAEA datasets

Third-party files (never copied into the repository; the tests use synthetic sheets with the same structure): Kosobokova & Hirche (2014), PANGAEA.839758 (wide Multinet counts, CC-BY-3.0) and Schauer & Rohardt (2010), PANGAEA.742586 (CTD, CC-BY-3.0). What the run on the unedited files showed, and what was decided:

### Part 1. PANGAEA header and names

- The table header of a PANGAEA file holds an ABBREVIATION plus the unit and the comment: `Short [unit] (comment)`; the header block `Parameter(s):` lists the LONG name of each parameter in column order: `Long name [unit] (Short) * PI: ... * METHOD/DEVICE: ... * COMMENT: ...`. In PANGAEA.839758 all 332 columns agree (the header of a column is `Short`, then ` [unit]`, then ` (comment)` when the parameter has a comment); in PANGAEA.742586 three columns carry a comment in the parameter list that the header leaves out (`ITS-90`, `PSU`), so the converter checks only that the abbreviation is what the header of the column starts with, not the whole header.
- Abbreviations collide: `S. polaris c3 [#/m**3]`, `P. polaris f` and three more stand for two genera each (five header pairs in the file). Long names do not collide, except three pairs that differ by the parameter COMMENT: `Calanus finmarchicus, c2` and `c3` (one column of each pair has `COMMENT: including Calanus glacialis`) and `Cirripedia, cypris, nauplii` (comments `1` and `2`). The converter keeps every such pair as two occurrences per sample, with the comment in `occurrenceRemarks`, and says so with the accepted warning CONV-TAXON-SAME-EVENT. Nothing is summed.
- occurrenceID of a wide sheet = `<sample eventID>:<long name>`. The long name is what the user sees in the list of names to approve, it is not an abbreviation that two genera share, and it does not change when a unit or a comment is edited; only when two columns share a long name is the comment (else the header) added in brackets, so the IDs stay unique without a counter.
- The header block's citation, title, authors, year and DOI, licence, coverage and abstract (when the file has one; neither of the two files does) feed the description of the dataset like a dropped metadata file (source: the file name, kind PANGAEA). PANGAEA's citation marks its title with ` [dataset]`; that marker is cut so that it does not disagree with the DataCite title of the same dataset.
- UTC: PANGAEA states that its Date/Time is UTC. https://wiki.pangaea.de/wiki/Data_submission (section on the data columns): "Date/Time of sampling/measurement provided in ISO format (YYYY-MM-DDThh:mm:ss) and in UTC. An additional column with local date/time may be provided." and https://wiki.pangaea.de/wiki/Event: "Date/Time is provided as ISO-format YYYY-MM-DD T hh:mm:ss, UTC" (both read 2026-10-26). So a time with no zone in the column PANGAEA calls `Date/Time` of a PANGAEA file is written with a Z and ROW-TZ-UNKNOWN is not raised for it; a local-time column has another name and is not read this way. /check is unchanged.

### Part 2. NERC concepts added (opened 2026-10-26)

Each opened as `https://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/?_profile=nvs&_mediatype=application/ld+json`: HTTP 200, `owl:deprecated` = "false".

| collection | code | preferred label (NVS) | kind |
|---|---|---|---|
| P01 | CNDCST01 | Electrical conductivity of the water body by CTD | method (offered, never proposed) |
| P01 | POTMCV01 | Potential temperature of the water body by computation using UNESCO 1983 algorithm | method |
| P01 | SIGTEQ01 | Sigma-theta of the water body by computation from salinity and potential temperature using UNESCO algorithm | method |
| P06 | MSCM | MilliSiemens per centimetre | unit (alias `mS/cm`) |
| P06 | UKMC | Kilograms per cubic metre | unit (alias `kg/m3`; `kg/m**3` folds to it) |

Potential temperature is its own variable (`potential temperature`, POTMCV01) and is never mapped to plain temperature (TEMPPR01). All three P01 concepts name a method (a CTD, a computation), so by the stage 5 rule they are offered in the list and the user chooses them.

### Part 3. Sampling device (NVS L22)

L22 (2441 concepts, read 2026-10-26) has `NETT0187` "Hydro-Bios MultiNet Mammoth" (already the device `multinet` of the converter) and no MultiNet Midi and no generic MultiNet; the two PANGAEA events name "Multiple opening/closing net, 150 µm meshsize". The Mammoth is a different instrument (larger mouth), so nothing is added and the Midi is not labelled as a Mammoth: the device of the acceptance run is the generic "plankton nets" (NVS L05 22), with the mesh size typed by the user.

### Part 4. Stations, casts and level IDs (changes of stage 7)

- The event labels of PANGAEA end with the cast of each device: a net cast `PS27/006-6` and a CTD cast `PS27/006-1` of one station differ only by that suffix. On the raw files only 1 of 64 CTD casts matched a net station by the exact text. The converter offers, per profile sheet and only when the user ticks it (never by itself), to match the stations ignoring a final hyphen and number on both sides. A base that more than one biology station has is not matched (never guessed). A matched level sits under the biology station; its own ID keeps the cast (`PS27:PS27/006-1:2.0m`), so two casts of one station stay apart. With the tick 33 of 64 casts matched (the others have no net sample); the 31 left over are the accepted warning CONV-PROFILE-STATION-UNMATCHED.
- A matched profile station more than 10 km (the tool's own limit, in the rule as `{limit}`) from the biology station it sits under is the accepted warning CONV-PROFILE-STATION-FAR, naming both stations and the distance (haversine, `greatCircleM` of `events.ts`). The review's example: `PS27/014-1` and `PS27/014-4`, 74 km apart; `PS27/007-1` and `PS27/007-5`, 26 km. The check is made for an exact match as well.
- Level IDs made of the depth carry their unit, as the pressure ones always did: `<station eventID>:<depth as written>m` and `<station eventID>:<pressure as written>dbar`. Without the unit a depth ID (`S1:2`) equalled a numeric sample code (`2`) of a station-prefixed sample, which gave 96 blocking duplicates on the real files.

### Part 5. Column names and stages

- A bracketed unit never belongs to a taxon name, a "(comment)" after the unit is a remark (kept in `occurrenceRemarks`). A "Depth bot" or "Depth, bottom" header is the maximum of a range, and a single depth column (PANGAEA's "Depth water", a mid-depth GEOCODE) next to a top and a bottom bound is ignored, so a 0-25 m haul stays 0-25 m.
- Stage words: copepodite(s), nauplius/nauplii, metanauplius, calyptopis, furcilia, zoea, megalopa, veliger, cypris/cyprid, egg(s), juvenile(s), adult(s), larva(e) (plurals written as the singular); a range of copepodite stages (`c1-c5`) is written as `C1-C5`; several stages of one name are written together (`cypris, nauplius`). lifeStage is free text in Darwin Core. "indeterminata" and "indet." are an identificationQualifier (`indet.`).
- WoRMS: an answer whose match_type is `exact` but whose name is not the name sent (the genus for a name the sheet spelled with a descriptor) is not automatic; the user chooses, and the page shows what scientificName would be written as. Of the 107 names of PANGAEA.839758 after the splits, 99 are single exact answers under the same name, 6 have several WoRMS records, 1 (`Foraminifera, planktic`) is an exact answer under another name, and 1 (`Ophiopluteus`) has none.
### Part 6. Review round (26.10.2026)

- A round-bracket unit (`(ind/m3)`) is stripped like a square one; a round bracket that is no unit stays (the subgenera `Sagitta (Parasagitta) elegans`, `Calanus (Calanus) finmarchicus`). A stage in the remark after the unit (`(c4)`, `(c5)`) is the stage of that column: it goes to the name, so each stage is a name of its own in the list and gets its own lifeStage.
- A remark after a comma that is no stage, qualifier or sex (`Foraminifera, planktic`) needs a decision (reason: a remark is left after the comma); the exact text stays in verbatimIdentification. A range with spaces (`c1 - c5`) splits like `c1-c5`.
- A sheet with only a bottom (or only a top) bound writes only maximumDepthInMeters (or only minimumDepthInMeters); the other end is not made up. One plain depth column is both ends.
- Cast-number matches are listed in full as an info line (CONV-PROFILE-STATION-CAST-MATCHED). A PANGAEA file whose Parameter(s) block cannot be matched to its columns says so (CONV-PANGAEA-NAMES-FALLBACK, info) and uses the table-header abbreviations.
- The duplicate pairs of PANGAEA.839758: `Calanus finmarchicus, c2` and `c3`, one column with the parameter comment "including Calanus glacialis", one without; in no one of the 158 samples are both columns above zero (45 and 17 samples for c2, 79 and 23 for c3), so they never write the same taxon twice into a sample. `Cirripedia, cypris, nauplii`, comments "1" and "2" (they say nothing else): both columns are above zero in two samples (`PS27/030-4`, nets 4 and 5), so those two samples hold the taxon twice, each record with its own occurrenceID and its comment; the accepted warning CONV-TAXON-SAME-EVENT says so, nothing is summed, and BioCheck's "potential duplicate record" for these four records is the same fact.

## Converter (/convert) — environmental data fixes, 26.10.2026: a local run on a private environmental data set

The defects came from a local run on files that must not go online (nothing of them is in the repository; the tests use invented files with the same patterns). What was researched for the fixes, and what was decided.

### Part 1. Environmental data alone is not an OBIS dataset (CONV-NO-OCCURRENCES)

- OBIS Manual, "How to format Occurrence tables" (https://manual.obis.org/format_occurrence.html, read 2026-10-26): "If your dataset structure is based on Occurrence core, or has an Occurrence extension (remember that all OBIS data have at least one occurrence record associated, regardless of what organization structure you have chosen), there are several terms that are required in your dataset by OBIS." Same manual, "Data formatting" (https://manual.obis.org/data_format.html): abiotic measurements (ENV-DATA) are "linked to either events or occurrences" in the eMoF, next to the occurrences of the same events. "Contribute" (https://manual.obis.org/contribute.html) lists abiotic measurements among the data OBIS accepts, and calls it "a common misconception that OBIS only accepts species occurrence data": they are accepted WITH species records, not instead of them. So an upload with no taxon gives an archive with no occurrence: blocked, in these words (CONV-NO-OCCURRENCES), and the empty Occurrence table is not run through the Darwin Core term check (it reported eventDate, decimalLatitude and decimalLongitude as missing from a table that has no row).
- A sheet marked as a profile file that gives no level at all (a description of columns, a sheet with no station column and no tick) says so (CONV-PROFILE-NOTHING-READ) instead of ending silently with nothing.

### Part 2. Sediment and porewater depth (CONV-SEAFLOOR-*)

- Darwin Core (https://dwc.tdwg.org/terms/, read 2026-10-26), minimumDistanceAboveSurfaceInMeters: "The lesser distance in a range of distance from a reference surface in the vertical direction, in meters. Use positive values for locations above the surface, negative values for locations below. If depth measures are given, the reference surface is the location given by the depth, otherwise the reference surface is the location given by the elevation." (maximumDistanceAboveSurfaceInMeters: the same with "greater".) Its own example: "For a 1.5 meter sediment core from the bottom of a lake (at depth 20m) ...: minimumDepthInMeters: 20, maximumDepthInMeters: 20, minimumDistanceAboveSurfaceInMeters: 0, maximumDistanceAboveSurfaceInMeters: -1.5".
- OBIS Manual, "Darwin Core" (https://manual.obis.org/darwin_core.html, read 2026-10-26): "If a depth is given (i.e. value >0), the reference surface is the location of the depth. This can be especially useful for sediment cores taken from the sea bottom (scenario 3 in Figure 2.2 and table below). In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value."
- Decision from these: the depth below the seafloor goes to minimum = maximumDistanceAboveSurfaceInMeters as a NEGATIVE number of metres, and the water depth of the site (`Site_depth_m`, `Depth of the site (m)`, `water depth`, `bottom depth`) goes to minimum = maximumDepthInMeters of the same event, so the reference surface is the seafloor and not the elevation. A depth below the seafloor with no site depth is the accepted warning CONV-SEAFLOOR-NO-SITE-DEPTH.
- The only unit conversion of the converter: centimetres to metres by moving the decimal point two places on the TEXT of the cell (`0.5` cm -> `-0.005`, `12.30` cm -> `-0.1230`; no float, no rounding, every digit kept); metres get the sign only. Any other unit (and no unit) is refused (CONV-SEAFLOOR-UNIT); a number written with an exponent has no exact plain text and is refused (CONV-SEAFLOOR-VALUE). The direction of the numbers is the role's `positive` setting, as for a plain depth. Counted downwards (the default) a positive number is a depth below the seafloor and is written as a negative distance, and a NEGATIVE number is a position above the seafloor (the water over the sediment) and is written as a positive distance, with the same digits (-2 cm is +0.02 m); nothing is refused for its sign. Counted upwards the sheet's own sign is kept. The exact shift is the same in both. The first local run on the real files showed a porewater column whose numbers were mostly negative (a depth below the seafloor written as a negative number) with a few positive ones (positions above it). The overlay proposes `upwards` only when the negative numbers are the MAJORITY of the filled non-zero numbers (a few negative numbers in a column that counts downwards are the overlying water and do not turn the direction round), shown with its reason at low confidence for the user to change. A column that has both signs, in either direction, is said once (CONV-SEAFLOOR-SIGNS, not blocking): how many cells have the minority sign, their lines, and where they are written (above or below the seafloor). A level ID made of such a depth ends in `cmasf` / `masf` (above the seafloor) instead of `cmbsf` / `mbsf` when the column counts upwards. A plain depth column in cm is still refused (CONV-DEPTH-UNIT), and its old advice "remove the unit if it is metres" is gone (it would have written centimetres as metres).
- One column = one depth: minimum = maximum. A top and a bottom column are not read: the two terms are the "lesser" and the "greater" distance, but the standard's own example lists the top as the minimum (0) and the bottom as the maximum (-1.5), so a pair of columns would have to settle an inconsistency of the standard. Not decided here.
- Recognition (conservative): a header that names the depth in a sediment, core or pore water (`Pore_water_Depth[cm]`, `depth below seafloor`, `sediment depth`, `głębokość w osadzie`, `Sedimenttiefe`, `profondeur dans le sédiment`, ...), and a plain `Depth` in centimetres only on a sheet that says it is about pore water, sediment or a core (a header or a text cell). Never a plain `Depth`. The water depth of the site (`Site_depth_m`, `Water depth [m]`, `Station depth`, `bottom depth`) is the depth of a sediment or porewater sheet's samples; on any other sheet it is the depth when it is the sheet's only depth column (as before), and it is ignored, with its reason, only when another column already gives the depth of each row.

### Part 3. NERC concepts added (opened 2026-10-26)

Each opened as `https://vocab.nerc.ac.uk/collection/<C>/current/<CODE>/?_profile=nvs&_mediatype=application/ld+json`: HTTP 200, no redirect, `owl:deprecated` = "false". The search for generic concepts was made with the NVS SPARQL endpoint on the preferred labels.

| collection | code | preferred label (NVS) | kind in the converter |
|---|---|---|---|
| P01 | OXYSZZ01 | Saturation of oxygen {O2 CAS 7782-44-7} in the water body [dissolved plus reactive particulate phase] | generic: proposed for oxygen in per cent |
| P01 | INDENS01 | Density of the water body by computation from absolute salinity and conservative temperature using UNESCO 2010 algorithm | method: offered for a seawater density |
| P01 | SIGTEQ01 | Sigma-theta of the water body by computation from salinity and potential temperature using UNESCO algorithm | (already listed) offered for a density too: it is a density ANOMALY |
| P01 | DOCGZZ01 | Concentration of organic carbon {organic_C CAS 7440-44-0} {DOC} per unit volume of the water body [dissolved plus reactive particulate specified elsewhere phase] | matrix: offered |
| P01 | CORGZZKG | Concentration of organic carbon {organic_C CAS 7440-44-0} {DOC} per unit mass of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | CLXXWBUP | Concentration of chloride {Cl- CAS 16887-00-6} per unit volume of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | RWS00021 | Concentration of sodium {Na CAS 7440-23-5} per unit volume of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | RWS00022 | Concentration of potassium {K CAS 7440-09-7} per unit volume of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | RWS00023 | Concentration of calcium {Ca CAS 7440-70-2} per unit volume of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | RWS00024 | Concentration of magnesium {Mg CAS 7439-95-4} per unit volume of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | S04DISP1 | Concentration of sulfate {SO4(2-) sulphate CAS 14808-79-8} per unit volume of the water body [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | SPHTMAXX | Concentration of sulfate {SO4(2-) sulphate CAS 14808-79-8} per unit volume of the sediment pore water [dissolved plus reactive particulate phase] | matrix: offered |
| P01 | NEWCXX09 | Concentration of calcium {Ca CAS 7440-70-2} per unit mass of the sediment pore water [dissolved plus reactive particulate <0.4/0.45um phase] | matrix: offered |
| P01 | NEWCXX08 | Concentration of magnesium {Mg CAS 7439-95-4} per unit mass of the sediment pore water [dissolved plus reactive particulate <0.4/0.45um phase] | matrix: offered |
| P06 | UPCT | Percent | unit (aliases `%`, `percent`) |
| P06 | UUUU | Dimensionless | unit: proposed for a confirmed practical salinity or pH with no unit (already in the table) |

- The matrix concepts name the water body or the sediment pore water: a sheet of pore water is not a sheet of the water body, so the converter does not guess the matrix. They are only OFFERED (never proposed), and the unit's dimension hides the ones of the other dimension. No generic concept for dissolved inorganic nitrogen (DIN) exists in P01 (searched for "inorganic nitrogen" and "DIN" in the preferred labels): none is added.
- Oxygen in per cent is SATURATION, a variable of its own; a concentration concept chosen for a `%` column raises the unit-mismatch warning (CONV-NERC-UNIT-MISMATCH), and `mL/L` is per unit volume, so the per-mass oxygen concept is not offered for it.

### Part 4. Decisions without a source (the tool's own choices)

- A level of a station visited on more than one date has the date in a depth-made ID: `<station>:<YYYY-MM-DD>:<depth>m` (or `dbar`, or `<depth><unit>bsf` for a depth in the sediment); the date is read from the data (a row with no date there has no ID), never from the order of the rows.
- A sheet with no station column: the user may tick "each distinct position is a station" (never automatic): the station ID is `<cruise>:<latitude>_<longitude>`, the two numbers as written.
- The ID of a level made of a depth in the sediment is `<station>:<number as written><cm|m>bsf` (`cmbsf`, `mbsf` are the usual abbreviations of centimetres and metres below the seafloor).
- A ragged row (ROW-RAGGED, raised by the parser) blocks the sheet and is not converted: its values are shifted against the header.
- A P01 code declared in a header (`SDN:P01::CODE`): a code the converter has verified is proposed first; a well-formed one (eight upper-case letters and digits) it has not verified is offered as "declared by the file" and written only after the user chose it, and the worker checks that the column's header declares exactly that code; a malformed one stays a measured variable with a note.


## Biomass concepts (converter, 2026-10-30)

Opened on 2026-10-30 in the NERC Vocabulary Server (SPARQL on the English prefLabel; owl:deprecated = false). The P01 biomass concepts SDBIOL03/04/05/07/08/09 are all "per unit area of the bed" or "per unit volume of the water body", so none of them states a mass in a sample or frame; the S06 parameter concepts state the kind of mass and nothing about a denominator.

| Concept | Code | Label |
|---|---|---|
| S06 | S0600088 | Wet weight biomass |
| S06 | S0600087 | Dry weight biomass |
| S06 | S0600086 | Ash-free dry weight biomass |
| P06 | UGRM | Grams |
| P06 | MGRM | Milligrams |
| P06 | KGXX | Kilograms |
