/* Wegener's Dream 화면 문구 — 한국어·영어(027).
 *
 * 언어는 주소의 `lang=en` → 브라우저에 기억한 것(`wegener.lang`) → 한국어 순으로 정한다. 바꾸면 페이지를
 * 다시 불러온다 — 층서 칩·환경 나무·팝업·안내문을 모두 다시 그리는 것보다 확실하다(시점·투영은 주소에 남는다).
 *
 * - JS 가 만드는 문구: `T` 의 [한국어, 영어] 쌍을 `t(key, 값)` 으로 꺼낸다. `{이름}` 자리에 값이 들어간다
 * - 템플릿 문구: 템플릿이 한국어 원문이다. 영어일 때만 `DOM_EN` 으로 바꾼다 —
 *   `data-i18n="key"`(글자), `data-i18n-html="key"`(굵은 글씨 등이 든 문장),
 *   `data-i18n-attr="placeholder:key;title:key;aria-label:key"`(속성)
 * - 자료의 이름(층서 단위·퇴적 환경·국가)은 index.json 의 `en` 칸을 쓴다 — map.js 의 localizeIndex
 */
(function () {
  "use strict";

  var KEY = "wegener.lang";
  var fromHash = (location.hash.match(/lang=(ko|en)/) || [])[1];
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* 막힌 저장소 */ }
  var lang = fromHash || (stored === "en" ? "en" : "ko");

  var T = {
    // 시점·층서표
    "span.none": ["제한 없음", "No limit"],
    "span.le": ["{v} Myr 이하", "≤ {v} Myr"],
    "span.hidden": ["연대 범위가 {max} Myr 를 넘어 가린 {what} {n}곳.", "{n} {what} hidden (age range over {max} Myr)."],
    "what.coll": ["산지", "localities"],
    "what.taxcoll": ["산출 산지", "localities with occurrences"],
    "relief.note": ["배경: PaleoDEM {grid}, {w} 폭 그림.", "Background: PaleoDEM {grid}, {w}-px image."],
    "grid.6min": ["0.1° 격자", "0.1° grid"],
    "grid.1deg": ["1° 격자", "1° grid"],
    "chip.now": [" · 지금 지도", " · current map"],
    "chip.taxon": [" · {taxon} 산출 {n}건", " · {n} {taxon} occurrences"],
    "chrono.noage": ["절로 나뉘지 않았다", "not divided into ages"],
    "focus.inside": ["{unit} ({base}–{top} Ma) 안의 {age} 지도.", "{age} map within {unit} ({base}–{top} Ma)."],
    "focus.nearest": ["{unit} ({base}–{top} Ma) 안에는 지도 시점이 없다 — 가장 가까운 {age} 지도를 보인다.",
                      "No map falls within {unit} ({base}–{top} Ma) — showing the nearest, {age}."],
    "coast.none": ["이 시점 ±10 Myr 안에 해안선 자료가 없다.", "No coastline within ±10 Myr of this time."],
    "coast.nearest": ["가장 가까운 {age} 해안선을 그었다.", "Showing the nearest coastline, {age}."],
    // 퇴적 환경 나무
    "tog.open": ["펼치기", "Expand"],
    "tog.close": ["접기", "Collapse"],
    "env.count.occ": ["수: {taxon} 산출 건수(지금 지도)", "Counts: {taxon} occurrences (current map)"],
    "env.count.coll": ["수: 산지 수(지금 지도)", "Counts: localities (current map)"],
    // 산지
    "fossil.taxonOnly": ["분류군 찾기 결과만 보인다", "showing taxon search results only"],
    "fossil.all": ["{n}곳", "{n}"],
    "climate.paleoclim": ["PaleoClim: {what} — 육지만(바다는 자료가 없다). 온도계는 전 지구 평균이 없어 비운다.", "PaleoClim: {what} — land only (no ocean data). The thermometer is empty: there is no global mean."],
    "overview.loading": ["모든 시대 산지를 PBDB 에 묻는 중…", "Asking PBDB for localities of all ages…"],
    "overview.asking": ["{what} — 모든 시대 산지를 PBDB 에 묻는 중…", "{what} — asking PBDB for localities of all ages…"],
    "overview.status": ["{what} — 모든 시대 산지 {n}곳을 오늘날 자리에(0 Ma 지도). 시점을 옮기면 그 시대의 산지로.", "{what} — {n} localities of all ages at present-day positions (0 Ma map). Move in time to see each age."],
    "overview.truncated": [" 처음 {n}곳까지만 받았다.", " Only the first {n} were fetched."],
    "overview.count": ["모든 시대 {n}곳 · 오늘날 자리", "{n} of all ages · present-day positions"],
    "ovtip.more": ["누르면 산지 목록", "Click for the list"],
    "ovtip.occs": ["산출 {n}건 — 누르면 목록", "{n} occurrences — click for the list"],
    "ovtip.loading": ["산출을 PBDB 에서 읽는 중…", "Reading occurrences from PBDB…"],
    "ev.outside": ["지도 범위 앞 — 가장 오래된 지도는 540 Ma", "Before the map range — the oldest map is 540 Ma"],
    "ev.before": ["◀ 직전 {age}", "◀ Before · {age}"],
    "ev.at": ["사건 {age}", "Event · {age}"],
    "ev.after": ["직후 {age} ▶", "After · {age} ▶"],
    "ev.start": ["◀ 위기 전 {age}", "◀ Before · {age}"],
    "ev.end": ["위기 뒤 {age} ▶", "After · {age} ▶"],
    "suggest.formations": ["지층", "Formations"],
    "formation.meta": [" · 산지 {colls} · 산출 {occs}", " · {colls} localities · {occs} occurrences"],
    "formation.loading": ["PBDB 에서 지층의 산출을 읽는 중…", "Reading the formation's occurrences from PBDB…"],
    "formation.fail": ["PBDB 에 닿지 못했다.", "Could not reach PBDB."],
    "formation.age": ["시대", "Age"],
    "formation.lith": ["암상", "Lithology"],
    "formation.group": ["층군", "Group"],
    "formation.members": ["부층", "Members"],
    "formation.size": ["기록", "Records"],
    "formation.sizeVal": ["산지 {colls}곳 · 산출 {occs}건 (PBDB 지층 목록)", "{colls} localities · {occs} occurrences (PBDB strata)"],
    "formation.count": ["산출 {occs}건 · 속 {genera} · 종 {species}", "{occs} occurrences · {genera} genera · {species} species"],
    "formation.truncated": ["PBDB 한도 {n}건에서 잘렸다.", "Cut at the PBDB limit of {n}."],
    "formation.kingdom.Animalia": ["동물 (Animalia)", "Animals (Animalia)"],
    "formation.kingdom.Plantae": ["식물 (Plantae)", "Plants (Plantae)"],
    "formation.kingdom.other": ["기타", "Others"],
    "formation.n": ["산출 {n}건", "{n} occ."],
    "formation.unplaced": ["계통 미상 (PBDB 분류에 없는 이름)", "Unplaced (names not in the PBDB classification)"],
    "formation.colls": ["산지 {n}곳", "{n} localities"],
    "formation.indet": ["미동정 {n}건", "{n} indeterminate"],
    "formation.spIndet": ["종 미정 {n}건", "{n} not identified to species"],
    "suggest.recent": ["최근 찾은 것", "Recent searches"],
    "suggest.recentClear": ["기록 지우기", "Clear history"],
    "suggest.homonym": ["같은 이름", "homonym"],
    "cmp.homonym": ["‘{name}’ 은(는) 같은 이름의 분류군이 여럿이다 — 고른다:", "‘{name}’ names more than one taxon — pick one:"],
    "suggest.alias": ["관용 표기 ‘{name}’", "common name ‘{name}’"],
    "taxon.truncated": [" PBDB 한도 {n}건에서 잘렸다 — 나라를 걸거나 하위 분류군으로 좁힌다.", " Cut at the PBDB limit of {n} records — narrow by country or a lower taxon."],
    "pop.truncated": ["처음 {n}건만 — 전체는 위의 PBDB 링크에서.", "Only the first {n} — see the PBDB link above for all."],
    "cmp.fail": ["비교 분류군을 PBDB 에 묻지 못했다.", "Could not query PBDB for the comparison taxon."],
    "cmp.notfound": ["‘{name}’ 을(를) 찾지 못했다.", "Could not find ‘{name}’."],
    "cmp.truncated": ["B 는 PBDB 한도 {n}건에서 잘렸다.", "B was cut at the PBDB limit of {n} records."],
    "lat.read": ["중앙 {med} (사분위 {q1}–{q3}, 산출 {n})", "median {med} (IQR {q1}–{q3}, {n} occs)"],
    "lat.about": ["산출의 PBDB 고좌표(연대 중간값)로 — 시점마다 창과 겹치는 산출, 켠 퇴적기원만. 굵은 선은 중앙값, 띠는 사분위, 가는 세로선은 범위.", "From PBDB paleocoordinates of occurrences (mid-age) overlapping each map's window, enabled environments only. Line: median; band: interquartile range; thin bars: full range."],
    "lat.big": ["산출이 {n}건을 넘는 분류군은 산출로 세지 않는다 — 시점마다 산지를 PBDB 에 물어 그릴 수 있다(1~2분).", "Taxa with more than {n} occurrences are not counted by occurrence — the curve can be built from localities, one map at a time (1–2 min)."],
    "lat.build": ["{key} 고위도 곡선 — 시점마다 산지로 그리기", "Build the {key} latitude curve from localities"],
    "lat.loading": ["시점마다 묻는 중 {done}/{all}", "Querying maps {done}/{all}"],
    "lat.colls": ["(산출이 많은 분류군은 산지 단위의 고좌표)", "(large taxa: by locality)"],
    "now.line": ["산지 {n}곳 · 고위도 {min}–{max} · 중앙 {med}", "{n} localities · palaeolatitude {min}–{max} · median {med}"],
    "now.overlap": ["같은 산지 {shared}곳 · 5° 칸 겹침 {both} (A {a} · B {b}) · Jaccard {j}", "Shared localities {shared} · 5° cells in common {both} (A {a} · B {b}) · Jaccard {j}"],
    "now.overview": ["종합 보기(오늘날 자리)에서는 지금 시점 비교를 하지 않는다 — 시점을 고르면 보인다.", "No per-map comparison in the all-ages view — pick a time."],
    "export.png": ["그림 (PNG)", "Image (PNG)"],
    "export.csv": ["산지 CSV", "Localities CSV"],
    "export.geojson": ["산지 GeoJSON", "Localities GeoJSON"],
    "export.saved": ["{n}곳 저장", "{n} saved"],
    "ovpop.title": ["산지 {n}곳", "{n} localities"],
    "ovpop.where": ["{old}–{young} Ma · 오늘날 자리(0.25° 칸)", "{old}–{young} Ma · present-day position (0.25° cell)"],
    "ovpop.now": ["지금 좌표", "Present coords"],
    "ovpop.more": ["… 그 밖에 {n}곳 — 확대해서 본다", "… {n} more — zoom in to see them"],
    "ovpop.zoom": ["이 자리로 확대", "Zoom here"],
    "legend.overviewMid": ["색 = 칸 안 산지 연대 중간값의 기", "Colour = period of the cell's median mid-age"],
    "recent.cap": ["최근 5 Ma", "Last 5 Ma"],
    "climate.stageNone": ["이 절({stage}) 안의 기온 지도가 없다 — Scotese(2021) 격자는 5 Myr 간격이다.", "No temperature map within this age ({stage}) — the Scotese (2021) grids are 5 Myr apart."],
    "legend.mid": ["색 = 산지 연대의 중간값이 드는 기 (범위가 긴 산지는 다른 기로 칠해진다)", "Colour = period of each locality's mid-age (long-ranging localities take another period's colour)"],
    "fossil.some": ["{n} / {total}곳", "{n} / {total}"],
    "fossil.vague": [" (모호한 연대 {n})", " (vague age {n})"],
    "pop.noname": ["이름 없는 산지", "Unnamed locality"],
    "pop.age": ["연대", "Age"],
    "pop.range": ["범위", "range"],
    "pop.vague": ["▲ 모호한 연대 — 절 단위로 정해지지 않은 기록(세·기·대). 걸친 모든 시점에 보인다",
                  "▲ Vague age — not resolved to a stage (epoch, period or era). Shown at every time it spans"],
    "pop.formation": ["지층", "Formation"],
    "pop.env": ["환경", "Environment"],
    "pop.noenv": ["기록 없음", "not recorded"],
    "pop.paleo": ["고좌표", "Paleo-coordinates"],
    "copy.title": ["눌러서 위도, 경도를 복사한다", "Click to copy latitude, longitude"],
    "copy.done": ["복사했다", "Copied"],
    "copy.fail": ["복사하지 못했다", "Could not copy"],
    "pop.rotated": ["이 지도 나이({age})로 계산 — PALEOMAP v19o", "Computed for this map's age ({age}) — PALEOMAP v19o"],
    "pop.pbdb": ["PBDB 제공 — 산지 연대의 중간값에서 계산한 자리", "From PBDB — computed at the midpoint of the locality's age"],
    "pop.country": ["지금 국가", "Present-day country"],
    "pop.matched": ["찾은 분류군", "Matched taxa"],
    "pop.link": ["PBDB 산지 {no}", "PBDB collection {no}"],
    "pop.loading": ["산출 {n}건 읽는 중…", "Loading {n} occurrences…"],
    "pop.lith": ["암상", "Lithology"],
    "pop.grip": ["끌어서 길이 바꾸기", "Drag to resize"],
    "pop.searchTaxon": ["{name} 로 찾기 — 모든 시대 분포", "Search {name} — distribution through time"],
    "pop.lithLoading": ["PBDB 에서 읽는 중…", "Reading from PBDB…"],
    "pop.noLith": ["기록 없음", "Not recorded"],
    "pop.temp": ["그때 기온", "Temperature then"],
    "pop.tempsrc": ["{age} 지도, Scotese 2021", "{age} map, Scotese 2021"],
    "pop.none": ["산출 기록이 없다.", "No occurrences recorded."],
    "pop.fail": ["PBDB 에 닿지 못했다 — 위 링크로 본다.", "Could not reach PBDB — use the link above."],
    // 분류군 찾기
    "tip.count": ["{taxon} 산출 {n}종 — 누르면 목록", "{n} {taxon} taxa — click for the list"],
    "tip.times": ["{n}건", "×{n}"],
    "rich": ["{unit} 에서 {taxon} 산출이 가장 많은 {age} 지도({n}건).", "{age} map — the most {taxon} occurrences in the {unit} ({n})."],
    "dist.total": ["산출 {n}건", "{n} occurrences"],
    "dist.filtered": [" · 고른 퇴적기원·연대 범위만", " · selected origins and age range only"],
    "dist.chip": ["{unit} · 산출 {n}건 — 이 기에서 산출이 가장 많은 지도로", "{unit} · {n} occurrences — go to the richest map in this period"],
    "dist.noneExact": ["고른 퇴적기원에 드는 산출이 없다. ", "No occurrences in the selected origins. "],
    "dist.noneStage": ["PBDB 에 절 단위로 매겨진 산출이 없다. ", "No stage-level occurrences in PBDB. "],
    "dist.app": ["처음 {e} ({emax}–{emin} Ma) · 마지막 {l} ({lmax}–{lmin} Ma). ",
                 "First {e} ({emax}–{emin} Ma) · last {l} ({lmax}–{lmin} Ma). "],
    "dist.stage": [" · 절 단위 수", " · stage-level counts"],
    "guide.dist": ["분류군의 산출 시대(기 칩·시점 막대 밑 막대)의 수 — 산출이 {limit}건 이하이면 산출 하나하나를 지도와 같은 규칙으로 세어 고른 퇴적기원과 연대 범위를 따른다. 그보다 많으면(\"절 단위 수\") PBDB 가 절 단위로 센 수를 써서, 퇴적기원·연대 범위 선택이 반영되지 않고 절보다 넓게 매겨진 산출은 빠진다.",
                   "Occurrence-time counts for a taxon (period chips and the bars under the time slider) — with {limit} occurrences or fewer, each occurrence is binned by the map's rules and follows the selected origins and age range. Above that (\"stage-level counts\"), PBDB's stage-level counts are used: origin and age-range filters don't apply, and occurrences dated more broadly than a stage are left out."],
    "dist.bar": ["{age} · 산출 {n}건", "{age} · {n} occurrences"],
    "tour.stop": ["■ 멈추기", "■ Stop"],
    "tour.start": ["▶ 산출 시대 차례로 보기", "▶ Step through occurrence times"],
    "tour.done": ["끝 — 가장 최근 산출 시점까지 보였다.", "Done — shown up to the most recent occurrence."],
    "tour.step": ["{k} / {total} · {age} · 산출 {n}건(절 단위)", "{k} / {total} · {age} · {n} occurrences (stage level)"],
    "taxon.asking": ["{name} — {age} 무렵을 PBDB 에 묻는 중…", "{name} — asking PBDB about {age}…"],
    "taxon.fail": ["찾지 못했다: {err}", "Search failed: {err}"],
    "taxon.status": ["{name}{rank} — {age} 무렵 산지 {n}곳 (산출 {occ}건){country}.",
                     "{name}{rank} — {n} localities around {age} ({occ} occurrences){country}."],
    "coeval.range": ["산출 범위", "occurrence range"],
    "coeval.loading": ["산지 자료를 읽는 중…", "Loading localities…"],
    "coeval.none": ["이 시점에는 찾은 분류군의 산출이 없어 견줄 시대가 없다.", "The taxon has no occurrences at this time, so there is no age to compare."],
    "coeval.tip": [" · 같은 시대 다른 산지", " · coeval locality"],
    "coeval.vague": [" · ▲ 모호한 연대", " · ▲ vague age"],
    "coeval.note": ["같은 시대({label}, {old}–{young} Ma){rel} 다른 산지 {n}곳을 작은 포인트로 함께 보인다{c}.",
                    "Also showing {n} other localities {rel} the same age ({label}, {old}–{young} Ma) as small dots{c}."],
    "coeval.inside": [" 안에 드는", "within"],
    "coeval.overlap": ["와 겹치는", "overlapping"],
    "coeval.anyCountry": [" — 국가와 상관없이", " — regardless of country"],
    "suggest.occ": [" · 산출 {n}", " · {n} occ."],
    "suggest.none": ["후보가 없다", "No matches"],
    "suggest.wait": ["찾는 중…", "Searching…"],
    "suggest.countries": ["국가", "Countries"],
    "suggest.taxa": ["분류군 (PBDB)", "Taxa (PBDB)"],
    // 국가
    "country.colls": [" · 산지 {n}", " · {n} localities"],
    "country.note": ["{name}{ocean} — 지금 이 나라(땅)에서 나온 산지만 보인다. 전체 {n}곳.",
                     "{name}{ocean} — showing only localities from this country's present-day land. {n} in total."],
    "country.ocean": [" (대양, PBDB 해양 시추 등)", " (ocean — PBDB marine drilling etc.)"],
    "borders.young": ["{name} 땅은 {age} 판 모델에 아직 없다(그보다 젊은 지각).",
                      "{name}'s land is not yet in the {age} plate model (it is younger crust)."],
    // 기온
    "climate.none": ["이 시점에는 기온 지도가 없다.", "No temperature map for this time."],
    "climate.nearest": ["가장 가까운 {age} 지도. ", "Nearest map, {age}. "],
    "climate.gmst": ["전 지구 평균 {t} ℃. HadCM3L 모의를 대리 자료에 맞춘 값이다.", "Global mean {t} °C. HadCM3L simulations nudged to proxy data."],
    "readout": ["기온 {t} ℃ · ", "{t} °C · "],
    // 대기 화면
    "load.fail": ["자료 목록(index.json)을 읽지 못했다. 서버나 연결을 확인하고 다시 불러온다.",
                  "Could not load the data list (index.json). Check the server or your connection and reload."],
    "load.retry": ["다시 불러오기", "Reload"],
    // 지도 도구
    "thermo.label": ["전 지구 평균", "global mean"],
    "thermo.title": ["전 지구 평균 지표 기온 {t} ℃ — Scotese 2021, {age} 지도.", "Global mean surface temperature {t} °C — Scotese 2021, {age} map."],
    "thermo.now": [" 가로 금은 지금(0 Ma) {t} ℃.", " The bar marks today (0 Ma), {t} °C."],
    "scale.title": ["화면 가운데 위도({lat}°)의 위선을 따라 잰 가로 거리 — 축척은 위도마다 다르다",
                    "East–west distance along the parallel at the map centre ({lat}°) — scale varies with latitude"],
    "export": ["다운로드", "Download"],
    "tool.cap": ["도구", "Tools"],
    "tool.zoomin": ["확대", "Zoom in"],
    "tool.zoomin.title": ["확대 (+ 키, 휠)", "Zoom in (+ key, wheel)"],
    "tool.zoomout": ["축소", "Zoom out"],
    "tool.zoomout.title": ["축소 (− 키, 휠)", "Zoom out (− key, wheel)"],
    "tool.world": ["전체", "World"],
    "tool.world.title": ["지구 전체를 보인다", "Show the whole globe"],
    "tool.measure": ["거리", "Distance"],
    "tool.measure.title": ["거리 재기 — 눌러 가며 잇고, 두 번 누르거나 Esc 로 끝낸다. 그 시점의 자리에서 잰 대권 거리다",
                           "Measure distance — click to add points, double-click or Esc to finish. Great-circle distance at the map's age"],
    "tool.link": ["링크", "Link"],
    "tool.link.title": ["지금 보는 시점·투영·언어의 주소를 복사한다", "Copy a link to this age, projection and language"],
    "tool.link.done": ["주소를 복사했다", "Link copied"],
    "tool.clear": ["지우기", "Clear"],
    "tool.clear.title": ["잰 선을 지운다", "Clear the measured line"],
    "measure.start": ["지도를 눌러 재기 시작 — 두 번 누르거나 Esc 로 끝", "Click the map to start — double-click or Esc to finish"],
    "measure.segs": ["구간 {n}", "{n} segment(s)"],
    "measure.about": ["{age} 의 자리에서 잰 대권 거리. 시점을 옮기면 지운다", "Great-circle distance at {age}; cleared when the age changes"],
    "export.title": ["다운로드 — 지금 보는 지도를 PNG 그림 한 장으로. 시점·층서·거르기·출처를 아래에 적는다",
                     "Download as image — the current map as one PNG, with time, stratigraphy, filters and sources below"],
    "export.fail": ["그림을 만들지 못했다", "Could not make the image"],
    "export.gmst": ["전 지구 평균 {t} ℃", "global mean {t} °C"],
    "export.eq": ["정거원통 투영", "Equirectangular"],
    "export.moll": ["몰바이데 투영", "Mollweide"],
    "export.globe": ["지구본", "Globe"],
    "globe.loading": ["지구본을 싣는 중…", "Loading the globe…"],
    "terrain.note": ["해발 {min} ~ {max} m (PaleoDEM, 1/4° 격자). Ctrl 을 누르고 끌면 기울인다.",
                     "Elevation {min} to {max} m (PaleoDEM, 1/4° grid). Ctrl-drag to tilt."],
    "globe.fail": ["지구본을 열지 못했다 — 이 브라우저가 WebGL 을 못 쓰거나 파일을 받지 못했다. 정거원통으로 돌아간다.",
                   "Could not open the globe — this browser may lack WebGL, or the files did not load. Back to equirectangular."],
    "export.taxon": ["분류군 {name}", "taxon {name}"],
    "export.country": ["국가 {name}", "country {name}"],
    "export.colorAge": ["포인트 색: 시대(기)", "point colour: period"],
    // 패널·출처
    "panel.close": ["패널 접기 ▾", "Hide panel ▾"],
    "panel.open": ["패널 펼치기 ▴", "Show panel ▴"],
    // 휴대폰의 시점 막대 접기와 찾기 카드의 분류군 줄(koprifossillab 038)
    "tb.open": ["시점 ▾", "Time ▾"],
    "tb.close": ["시점 ▴", "Time ▴"],
    "tb.title": ["시점 막대 펴기·접기", "Show or hide the timeline"],
    "fd.all": ["◎ 전체 산지", "◎ All localities"],
    "fd.back": ["◀ 시점별 산지", "◀ By time"],
    "fd.allTitle": ["찾은 분류군의 모든 시대 산지를 오늘날 자리로 본다", "Every locality of the taxon, all ages, at present-day positions"],
    "fd.backTitle": ["그때 자리의 산지로 — 보던 시점, 없으면 산출이 가장 많은 시점", "Back to localities at their past positions — the time you were viewing, or the richest one"],
    "fd.strip": ["시점마다 산출 수 — 누르면 그 시점으로", "Occurrences per time slice — tap to go there"],
    "attribution": ["PaleoDEM · PaleoCoastlines (Scotese 외) · PBDB — CC BY 4.0", "PaleoDEM · PaleoCoastlines (Scotese et al.) · PBDB — CC BY 4.0"],
  };

  // 템플릿(map.html)의 영어. 한국어는 템플릿 자신이다.
  var DOM_EN = {
    "title": "Wegener's Dream — paleogeographic fossil map",
    "brand.sub": "Paleogeographic fossil map",
    "map": "Paleogeographic map",
    "proj": "Projection",
    "proj.eq": "Equirectangular",
    "proj.moll": "Mollweide",
    "proj.globe": "Globe",
    "terrain": "Terrain height (globe)",
    "terrain.exag": "Vertical exaggeration",
    "time": "Time",
    "older": "Older (←)",
    "younger": "Younger (→)",
    "slider": "Time",
    "now": "Now",
    "play": "Play history",
    "chrono.pick": "Pick from the timescale",
    "rank.era": "Era",
    "rank.period": "Period",
    "rank.epoch": "Epoch",
    "rank.age": "Age",
    "guide.ko": "Genus and species names are transcribed from the Classical Latin pronunciation in Covington (2010), following the National Institute of Korean Language's Loanword Orthography: all of its principles for Latin; articles 1, 5, 6, 8, 9(b), 10, 11, 14 and 15 of its principles for other languages; and article 3.2 and article 7 of its rules for English. For a few letter combinations that do not occur in Latin, established usage is followed.<br><small class=\"ref\">Covington, M. A. 2010. <i>Latin Pronunciation Demystified</i>. Program in Linguistics, University of Georgia. <a href=\"http://www.ai.uga.edu/mc/latinpro.pdf\" target=\"_blank\" rel=\"noopener\">ai.uga.edu/mc/latinpro.pdf</a></small>",
    "guide.hover": "Once a taxon is searched, hovering over a locality lists the records under that taxon found there. With five or more taxa only the count is shown — click to read the locality's full occurrence list from PBDB.",
    "chrono.about": "Names and boundary ages follow the ICS chart v2024/12. Maps are 5 Myr apart, so picking a unit shows the map nearest its middle.",
    "fossils": "Fossil localities",
    "colorby": "Point colour",
    "colorby.env": "Depositional origin",
    "colorby.age": "Age (period)",
    "opacity": "Point opacity",
    "shape.solid": "Dated to a stage",
    "shape.tri": "Also show vague ages",
    "span": "Age range",
    "span.max": "Maximum age range",
    "span.about": "Shows only records whose age range (max − min) is at most the chosen value. This is separate from the name level (▲): the level is how the age was assigned, the range is how uncertain it is.",
    "vague.about": "▲ Vague age — records not resolved to a stage, like \"Middle Cambrian\" or \"Late Triassic\" (a PBDB interval name at epoch, period or era level). Drawn as triangles at every time they span, placed for each map's age. A range named by stages (\"Norian–Rhaetian\") is a ● dated record.",
    "env.count": "The number beside each environment is its localities on the current map — while a taxon is searched, that taxon's occurrences.",
    "fossils.about": "Each point is one PBDB collection. It appears when its age range overlaps the map time ±2.5 Myr, so long-ranging localities appear at every time they span. Click to read its occurrences from PBDB.",
    "taxon": "Taxon search",
    "taxon.go": "Search",
    "cmp.ph": "Comparison taxon (B)",
    "cmp.go": "Compare",
    "cmp.clear": "Clear comparison",
    "anal.div": "Diversity",
    "div.rt": "Genera (range-through)",
    "div.g": "Genera (sampled in stage)",
    "div.n": "Occurrences",
    "div.per": "Genera per 100 occurrences",
    "anal.big": "Enlarge",
    "anal.title": "Distribution analysis",
    "anal.lat": "Palaeolatitude — median and quartiles",
    "anal.now": "This map — localities per 10° band",
    "overview.btn": "◎ Show all ages (present-day positions)",
    "find.ph": "Taxon, country, formation — e.g. Trilobita, Korea, Hell Creek, Mesosauridae Brazil",
    "formation": "Formation",
    "formation.sec": "Formation",
    "formation.about": "With a formation selected, the panel gathers every record of that formation into a classification tree (regardless of the map's time and filters). The top level is animals, plants and others; phyla and below start folded. Counts are occurrences. Indeterminate records stop above genus and sit at the deepest clade their lineage reaches. Genera are alphabetical, species sit under their genus, and the localities are folded at the end of each genus or species. Click a name to search it.",
    "guide.t.points": "Points — PBDB localities",
    "guide.t.vague": "▲ Vague ages and age range",
    "guide.t.env": "Numbers beside environments",
    "guide.t.taxon": "Taxon search — hover and age counts",
    "guide.t.formation": "Fossil record of a formation",
    "guide.t.chrono": "Timescale",
    "guide.t.ko": "Korean renderings of scientific names (Casual)",
    "formation.fauna": "Fossil record",
    "formation.clear": "Clear formation",
    "find.label": "Find a taxon or country",
    "find.move": "Drag to move",
    "find.hint": "Type two or more letters for taxon suggestions from PBDB (start or middle of the name). Countries by name or code. Type both on one line ('Mesosauridae Brazil') to combine them. Moving in time asks PBDB again for the taxon.",
    "taxon.short": "Taxon",
    "coeval": "Also show other localities of the same age",
    "coeval.small": "(genus and below)",
    "coeval.rule": "Same age by",
    "coeval.overlap": "overlapping age",
    "coeval.inside": "within that age",
    "dist": "Occurrence times",
    "tour": "▶ Step through occurrence times",
    "tour.speed": "Dwell time",
    "tour.slow": "Slow",
    "tour.normal": "Normal",
    "tour.fast": "Fast",
    "taxon.clear": "Clear taxon",
    "country": "Country",
    "country.focus": "Zoom back to this country",
    "country.clear": "Clear country",
    "overlay": "Overlays",
    "climate": "Surface temperature (Scotese 2021)",
    "climate.opacity": "Temperature layer opacity",
    "borders": "Borders (present-day borders fitted to their past position)",
    "coast": "Coastlines corrected with fossils",
    "grid": "Graticule 30°",
    "guide": "How to read",
    "sources": "Sources",
    "sources.about": "Background, coastlines, borders and fossil positions all use the PALEOMAP plate model. Each locality's present-day position is rotated <b>to the map's age</b> with the same plate model as the coastlines (v19o), so long-ranging localities sit where they were at every time. Only the rare locality with no plate at that age (under 0.1%) uses PBDB's paleo-coordinates (age midpoint) — the popup says so.",
    "data": "data",
    "lang": "Language",
    "mode": "Display mode",
    "mode.about": "Scientific: Pretendard type, chronostratigraphic, environment and rank names in English (hover for Korean). Casual: vintage book type.",
    "theme": "Brightness",
    "theme.auto": "Auto",
    "theme.light": "Light · parchment",
    "theme.dark": "Dark · ebony",
    "settings": "Settings · sources",
    "close": "Close",
    "empty.title": "No data yet",
    "empty.run": "Run the pipeline first:",
  };

  var PARAM = /\{(\w+)\}/g;
  function t(key, vals) {
    var pair = T[key];
    var s = pair ? pair[lang === "en" ? 1 : 0] : key;
    return vals ? s.replace(PARAM, function (m, k) { return vals[k] !== undefined ? vals[k] : m; }) : s;
  }

  // 템플릿에 영어를 입힌다. 한국어이면 할 일이 없다.
  function apply(root) {
    if (lang !== "en") return;
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      var s = DOM_EN[el.dataset.i18n];
      if (s !== undefined) el.textContent = s;
    });
    root.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var s = DOM_EN[el.dataset.i18nHtml];
      if (s !== undefined) el.innerHTML = s;
    });
    root.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.dataset.i18nAttr.split(";").forEach(function (pair) {
        var bits = pair.split(":"), s = DOM_EN[bits[1]];
        if (s !== undefined) el.setAttribute(bits[0], s);
      });
    });
    document.title = DOM_EN.title;
  }

  // 언어를 바꾼다 — 기억하고, 주소의 lang 을 고쳐 다시 불러온다.
  function setLang(next) {
    if (next === lang) return;
    try { localStorage.setItem(KEY, next); } catch (e) { /* 막힌 저장소 */ }
    var hash = location.hash.replace(/&?lang=(ko|en)/, "").replace(/^#&/, "#");
    if (next === "en") hash = (hash && hash !== "#" ? hash + "&" : "#") + "lang=en";
    location.hash = hash;
    location.reload();
  }

  // 화면 모드(tupandactyl 011) — scientific(기본: Pretendard, 층서·환경·계급을 영문으로) · casual(빈티지 글씨, 한글 용어).
  // 주소의 mode= → 브라우저에 기억한 것 → scientific. 바꾸면 다시 불러온다(이름을 자료 목록을 읽을 때 바꿔 끼우므로)
  var MODE_KEY = "wegener.mode";
  var modeFromHash = (location.hash.match(/mode=(sci|casual)/) || [])[1], storedMode = null;
  try { storedMode = localStorage.getItem(MODE_KEY); } catch (e) { /* 막힌 저장소 */ }
  var mode = modeFromHash || (storedMode === "casual" ? "casual" : "sci");
  function setMode(next) {
    if (next === mode) return;
    try { localStorage.setItem(MODE_KEY, next); } catch (e) { /* 막힌 저장소 */ }
    var hash = location.hash.replace(/&?mode=(sci|casual)/, "").replace(/^#&/, "#");
    if (next === "casual") hash = (hash && hash !== "#" ? hash + "&" : "#") + "mode=casual";
    location.hash = hash;
    location.reload();
  }

  window.WegenerI18n = { lang: lang, t: t, apply: apply, setLang: setLang, mode: mode, setMode: setMode };
})();
