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
  - The answer does not depend on the order. The longest possible gap between two events of one date is 24 h whichever comes first, and a true track cannot move more than 24 h x the vessel's speed within one date, so a wrong order inside a date cannot produce a hop above the limit (360 nautical miles at 15 knots). Events of different dates are ordered by their windows. Ties of timed events fall back to row order too.
- **Event key when merging rows: start text + end text + position rounded to 1e-4 degrees (about 11 m); station names and file names are not part of it.**
  - One station cast (all depths, all variables) has one time and one position, so its rows are one event; the same station in several files has the same time and position, so it is one event across files.
  - The station name is left out on purpose: a row of a cast with a mistyped latitude must appear as its own event (same time, other place). Files that disagree slightly on time or position for one station are joined later by the 10 km run, not by the key.
- **Time and the longest possible gap.** A written time is a window: a date is the whole UTC day, a time to the minute is that minute, to the second that second. The gap used is (latest the later event may start) minus (earliest the earlier event may end): same date = 24 h, adjacent dates = 48 h, and so on, and a minute adds its own minute. A date is never read as 00:00 (OBIS's `date_start` does, and the research counts 5% of timed records at exactly T00:00). Month and year precision are not used. Times without a zone are read as UTC, one zone for the whole file. An `eventDate` interval uses the END of the previous event and the START of the next (GTSPP FAQ wording), and intervals that overlap in time are not timed at all (a mooring spans other stations).
- **A single impossible pair (first or last event, or two bad events in a row) uses only the 40-knot limit and is an info.** One pair cannot say which event is wrong; reporting it at 15 knots would turn every fast transit into a note. The pair is not reported when either event already has a two-sided finding (one event, one finding). Wording, by Michal's decision: "the position or the time of one of these two events is wrong".
- **Groups.** A group needs at least 3 events. A cruise column groups by its values (the column wins over the tick, per file); files without one form ONE group only when the user ticked "one cruise of one ship", and then all those files are one track. With neither, the rule does not run and the report says how to switch it on (`notChecked.shipSpeed`); a group that cannot be judged says so too (`notChecked.shipSpeedFew`).
- **"Probably more than one ship": 20% of the places, at least 5.** When that share of a group's places is named in findings, the text adds that the data probably come from several ships or cruises. A true error is rare; this is not a published number. CoastDOM (a global compilation) under a wrong tick names 3 places in 4.
- **The declaration is stored only in the companion mapping file** (the sidecar CSV, row `(setting),singleCruise=yes`). No localStorage, cookie or module state: it starts unticked for every upload, or from a mapping file dropped with the files.

**Measured (24.10.2026; real data, never in the repository; local folder `ship-speed-2026-10-24`)**
- OBIS AMT12 and AMT13 (James Clark Ross, `eventDate` intervals) and the AMT13 net hauls, with the declaration: 0 findings.
- OBIS JERICO / Simon Stevin (day and month swapped in `eventDate`): one ROW-SHIP-SPEED-PAIR, 117 km in at most 0.5 h, at least 126 knots; the second hop of the research (22.6 knots) is below the lone-pair limit and not reported.
- IO PAN files of `2026-10-16` with the declaration, 3 rules, classified in the report of the session that wrote the rule: true errors (`lat = lon` rows, the shifted row of the water-column file), copied time stamps, one collateral flag on a correct event between two wrong ones, and CoastDOM as false alarms by construction (a global compilation; the tick does not hold).
- ChEssBase (no `eventDate`) without the declaration: not run, reported as not checked.
