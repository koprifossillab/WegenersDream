/* Wegener's Dream 뷰어 — 시점마다 PaleoDEM 배경, PaleoCoastlines 해안선, PBDB 산지를 겹친다.
 *
 * 자료는 파이프라인이 만든 파일(data/…)만 읽는다. 층서표와 퇴적 환경 나무도 index.json 에서
 * 받는다(pipeline/timescale.py·environments.py 가 한 곳). PBDB 에 바로 묻는 것은 셋이다 —
 * 산지 산출 목록, 분류군 찾기, 분류군 이름 후보. PBDB 는 CORS 를 열어 두었다(`*`).
 */
(function () {
  "use strict";

  var app = document.getElementById("app");
  // 화면 문구(027) — i18n.js. `t` 는 이 파일에서 지역 이름으로 흔히 써서 `tr` 로 받는다.
  var I18N = window.WegenerI18n, tr = I18N.t, EN = I18N.lang === "en";
  // Scientific 모드(tupandactyl 011) — 층서·퇴적 환경·분류 계급을 영문으로. 한국어판에서만 뜻이 있다(영어판은 이미 영문)
  var SCI = I18N.mode === "sci" && !EN;
  // Casual 모드의 한글 — 속·종 학명의 음차(translit.js), 연대 이름(층서표의 한글), 암상(index.json 의 lithology). tupandactyl 020
  var KO = !EN && !SCI;
  I18N.apply();
  var DATA = app.dataset.dataBase.replace(/x$/, "");
  var LABELS_URL = app.dataset.labelsUrl;
  // 시점 파일은 하루 캐시된다(views.FRAME_MAX_AGE). 다시 가공해도 이름이 같아, 주소에 가공 시각을 붙여
  // 가공할 때마다 새 주소가 되게 한다 — 안 붙이면 013 에서 고친 노릭절 산지가 하루 동안 안 보였다.
  var BUILT = "";
  function dataUrl(path) { return DATA + path + (BUILT ? "?b=" + encodeURIComponent(BUILT) : ""); }
  var PBDB = "https://paleobiodb.org/data1.2/";
  // 산지 상세 쪽. basicCollectionSearch 는 2026-10 에 PBDB 가 403 을 내기 시작했다(연구자) — displayCollectionDetails 는 열린다(tupandactyl 014)
  var PBDB_COLL_PAGE = "https://paleobiodb.org/classic/displayCollectionDetails?collection_no=";
  // 산지를 시점에 올리는 규칙 — index.json 의 rules 로 덮어쓴다(pipeline/common.py 한 곳이 정한다).
  var WINDOW_MA = 2.5;
  var VAGUE = {};                 // 모호한 등급(세·기·대 …)의 PBDB 시대 이름 — index.json 의 rules.vague_intervals(016)

  // 속이 찬 세모 — 모호한 연대의 산지(016). Leaflet 에는 세모 표지가 없어 캔버스에 직접 그린다.
  // 원 표지(CircleMarker)를 물려받아 반지름·색·눌림 판정은 그대로 쓰고, 그리는 모양만 바꾼다.
  L.Canvas.include({
    _updateTriangle: function (layer) {
      if (!this._drawing || layer._empty()) return;
      var p = layer._point, ctx = this._ctx, r = Math.max(layer._radius, 1) * 1.45;
      if (this._drawnLayers) this._drawnLayers[layer._leaflet_id] = layer;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r * 0.866, p.y + r * 0.5);
      ctx.lineTo(p.x - r * 0.866, p.y + r * 0.5);
      ctx.closePath();
      this._fillStroke(ctx, layer);
    },
  });
  L.TriangleMarker = L.CircleMarker.extend({
    _updatePath: function () { this._renderer._updateTriangle(this); },
  });
  var OLDEST = 540;        // 시점 막대의 왼쪽 끝 — 자료의 가장 오래된 시점으로 다시 맞춘다(에디아카라기 550 Ma, tupandactyl 019)
  var WORLD = [[-90, -180], [90, 180]];
  var UNKNOWN_COLOR = "#f5f5f5";
  var UNLISTED = "__unlisted__";

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    events: [], evSel: null,   // 지구사 사건(index.json 의 events, tupandactyl 016) · 책갈피로 펼친 사건과 그 범위(018)
    frames: [], i: 0, taxon: "", playing: null,
    proj: "eq",                             // 투영: eq(정거원통) · moll(몰바이데, 024) · globe(지구본, wetherilli P01)
    units: {}, kids: {}, focus: null,       // 층서표: 고른 단위(없으면 지금 지도의 절)
    periods: [],                            // 기 단위 — 시대 색에 쓴다
    tree: [], termTop: {}, termGroup: {},   // 퇴적 환경 나무
    groupColor: {}, topColor: {},
    enabled: {},                            // 켠 원 용어(UNLISTED 포함)
    payload: null,
    colorBy: "env",                         // 점 색: env(퇴적기원) · age(기 단위 시대)
    opacity: 0.6,                           // 점 불투명도 — 겹친 점과 밑그림이 함께 보이게
    showWide: true,                         // 모호한 연대(절 단위로 정해지지 않은) 산지를 보일지(016)
    maxSpan: Infinity,                      // 연대 범위(max_ma − min_ma)가 이 이하인 산지만(018)
    taxonRank: "",                          // 찾은 분류군의 계급 — 상태 줄과 같은 시대 다른 산지(012)
    grids: {},                              // 기온 격자(파일 → {w, h, data, offset})
    countries: [], countryBy: {}, country: null,   // 국가로 거르기
    dist: null,                             // 찾은 분류군의 산출 시대 분포(센 결과)
    distBase: null,                         // 그 바탕 — PBDB 절 단위 수, 산출이 적으면 산출 기록 자체(014)
    labels: { env: {} },
  };
  var cache = {};

  function getJSON(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + url);
        return r.json();
      }).catch(function (err) { delete cache[url]; throw err; });
    }
    return cache[url];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtAge(age) { return String(Math.round(age * 100) / 100) + " Ma"; }   // 최근의 절은 0.07·0.45 Ma(tupandactyl 009)
  function fmtNum(n) { return Number(n).toLocaleString(EN ? "en-US" : "ko-KR"); }

  // ── 점 색 ───────────────────────────────────────────────────────────
  // 퇴적기원: 환경군의 색(해양기원 하늘색→남색, 육상기원 주황→빨강, 미상 흰색).
  // 시대: 산지 연대 중간값이 든 기(Period)의 층서표 색.
  function envColor(environment) {
    return state.groupColor[state.termGroup[termKey(environment)]] || UNKNOWN_COLOR;
  }
  function periodOf(maxMa, minMa) {
    var mid = (Number(maxMa) + Number(minMa)) / 2;
    for (var k = 0; k < state.periods.length; k++) {
      var p = state.periods[k];
      if (mid > p.top && mid <= p.base) return p;
    }
    return mid === 0 ? state.periods[0] : null;
  }
  function pointColor(environment, maxMa, minMa) {
    if (state.colorBy === "age") {
      var p = periodOf(maxMa, minMa);
      return p ? p.color : UNKNOWN_COLOR;
    }
    return envColor(environment);
  }
  // 산지를 보일지 — 켠 환경, 고른 나라, 그리고 연대 거르기(ageOk).
  function passes(environment, cc, precise, maxMa, minMa, formation) {
    if (!state.enabled[termKey(environment)]) return false;
    if (!ageOk(precise, maxMa, minMa)) return false;
    if (state.formation && formKey(formation) !== formKey(state.formation)) return false;   // 지층(tupandactyl 028)
    return !state.country || cc === state.country;
  }
  // 지층 이름 견주기 — 대소문자와 끝의 "Formation"·"Fm" 은 가리지 않는다(PBDB 의 지층 칸은 대개 이름만)
  function formKey(v) { return String(v || "").toLowerCase().replace(/\s+(formation|fm\.?)$/, "").trim(); }
  function stratParam() { return state.formation ? "&formation=" + encodeURIComponent(state.formation) : ""; }

  // 연대로 거르기 — 두 가지를 따로 본다. 모호한 연대(시대 이름의 등급, 016)를 보이기로 했는지, 그리고
  // 연대 범위의 길이가 고른 값 이하인지(018). 등급은 "어떻게 매겼나", 길이는 "시간이 얼마나 불확실한가" 다.
  var SPAN_STEPS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, Infinity];
  function ageOk(precise, maxMa, minMa) {
    if (!precise && !state.showWide) return false;
    return !(Number(maxMa) - Number(minMa) > state.maxSpan + 1e-6);
  }
  // 범위 길이 때문에만 가려진 것 — 모호한 연대를 끈 것과 따로 센다
  function tooWide(precise, maxMa, minMa) {
    return (precise || state.showWide) && !ageOk(precise, maxMa, minMa);
  }
  function fmtSpan(v) { return v === Infinity ? tr("span.none") : tr("span.le", { v: v }); }
  // 범위가 길어 가린 수를 적는다. what: "산지" · "산출 산지"
  function spanNote(hidden, what) {
    $("span-value").textContent = fmtSpan(state.maxSpan);
    $("span-note").textContent = state.maxSpan === Infinity ? "" :
      tr("span.hidden", { max: state.maxSpan, what: what, n: fmtNum(hidden) });
  }

  // 연대가 절 단위로 정해졌는가(pipeline/intervals.is_vague 의 반대). PBDB 시대 이름 둘 가운데 하나라도
  // 모호한 등급(세·기·대 …)이면 모호한 연대다. 절 이름 여럿으로 정해진 범위("Norian–Rhaetian")는 정해진 기록이다(016).
  function isPrecise(early, late) {
    return !(early && VAGUE[early]) && !(late && VAGUE[late]);
  }

  // 배경색 위 글자색 — 층서표 색은 밝은 것과 짙은 것이 섞여 있다.
  function ink(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1b1b1b" : "#ffffff";
  }

  // ── 몰바이데 투영(024) ──────────────────────────────────────────────
  // 반지름 1: x ∈ [−2√2, 2√2], y ∈ [−√2, √2]. pipeline/relief.py 의 mollweide_lookup 과 같은 식이어야
  // 배경 그림과 점·선이 맞는다. 변환 계수는 EPSG:4326 과 같은 배율이 되게 골랐다 — 확대 z 에서 세계가
  // 512·2^z × 256·2^z 픽셀이라 배경 해상도(reliefWidth)와 전 지구 맞추기가 두 투영에서 같다.
  // 가운데 경선(lon0)을 둔다 — 몰바이데에서 가로로 끌면 지구가 돈다(025). 배경 그림은 lon0 = 0 으로 구워
  // 두고 캔버스에서 행마다 돌려 그린다(ReliefOverlay).
  var SQRT2 = Math.SQRT2, DEG = Math.PI / 180;
  function wrap180(v) { return ((v + 180) % 360 + 360) % 360 - 180; }   // [−180, 180)
  // 위도 → 보조각 θ(2θ + sin 2θ = π sin φ, 뉴턴법). 돌려도 위도는 그대로라 위도마다 한 번만 푼다 —
  // 끄는 동안 산지 점 1 만 개를 프레임마다 다시 투영한다(025).
  var thetaMemo = {}, thetaCount = 0;
  function mollTheta(lat) {
    var hit = thetaMemo[lat];
    if (hit !== undefined) return hit;
    var phi = Math.max(-90, Math.min(90, lat)) * DEG, theta = phi;
    if (Math.abs(phi) < Math.PI / 2 - 1e-9) {
      for (var k = 0; k < 30; k++) {
        var d = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(phi)) / (2 + 2 * Math.cos(2 * theta));
        theta -= d;
        if (Math.abs(d) < 1e-10) break;
      }
    }
    if (++thetaCount > 200000) { thetaMemo = {}; thetaCount = 0; }
    return (thetaMemo[lat] = theta);
  }
  var Mollweide = {
    bounds: L.bounds([-2 * SQRT2, -SQRT2], [2 * SQRT2, SQRT2]),
    lon0: 0,
    project: function (latlng) {
      var lam = wrap180(latlng.lng - this.lon0) * DEG, theta = mollTheta(latlng.lat);
      return L.point(2 * SQRT2 / Math.PI * lam * Math.cos(theta), SQRT2 * Math.sin(theta));
    },
    unproject: function (point) {
      var theta = Math.asin(Math.max(-1, Math.min(1, point.y / SQRT2))), c = Math.cos(theta);
      var lat = Math.asin(Math.max(-1, Math.min(1, (2 * theta + Math.sin(2 * theta)) / Math.PI))) / DEG;
      var lng = c > 1e-12 ? Math.PI * point.x / (2 * SQRT2 * c) / DEG : 0;
      return L.latLng(lat, Math.abs(lng) <= 180 ? wrap180(lng + this.lon0) : lng + this.lon0);   // 타원 밖은 감지 않는다
    },
  };
  var MOLL = L.extend({}, L.CRS.Earth, {
    code: "Mollweide", projection: Mollweide, infinite: false,
    transformation: new L.Transformation(1 / (2 * SQRT2), 1, -1 / (2 * SQRT2), 0.5),
  });
  // 지도 밖으로 옮길 수 있는 폭 — 위아래 20°, 좌우 40°(연구자: 0.27 의 두 배). 가장자리 산지의 팝업이 창 밖으로 잘리지 않게도
  var EQ_MAX_BOUNDS = [[-110, -220], [110, 220]];
  // 좁은 창(휴대폰)은 지구가 창보다 훨씬 작거나(세로) 커서(가로) 위의 폭으로는 지도가 거의 안 움직였다 — 위아래·좌우로 지구 하나만큼 더
  // 옮기게 하고, 지구 전체가 창 폭에 드는 데까지 축소하게 한다(확대 −1, ¼ 단계, 연구자 — koprifossillab 038)
  var NARROW = window.matchMedia ? window.matchMedia("(max-width: 760px)").matches : false;
  // 세로로 긴 창에서는 가장 축소했을 때 창 높이가 위도 수백 도에 이른다 — 그보다 넓어야 위아래로 움직인다
  var NARROW_MAX_BOUNDS = [[-450, -540], [450, 540]];
  function eqBounds() { return NARROW ? NARROW_MAX_BOUNDS : EQ_MAX_BOUNDS; }
  // 커서가 몰바이데 타원 안인가 — 밖이면 위경도가 없다. 위경도로 되돌리면 극·경도가 잘려 판단할 수 없어
  // 화면 자리를 투영 평면의 자리로 바꿔 타원 식으로 본다.
  function onGlobe(containerPoint) {
    if (state.proj !== "moll") return true;
    var crs = map.options.crs, zoom = map.getZoom();
    var p = crs.transformation.untransform(map.containerPointToLayerPoint(containerPoint).add(map.getPixelOrigin()), crs.scale(zoom));
    return p.x * p.x / 8 + p.y * p.y / 2 <= 1;
  }

  // 투영 평면의 사각형 전체에 붙는 그림. 위경도 사각형으로 두면 몰바이데에서는 네 모서리가 타원 밖이라
  // 자리를 잡을 수 없다. 정거원통에서는 평면 = 위경도 사각형이라 전과 같다.
  var PlaneOverlay = L.ImageOverlay.extend({
    _planeBounds: function (zoom, origin) {
      var crs = this._map.options.crs, b = crs.projection.bounds, scale = crs.scale(zoom);
      var nw = crs.transformation.transform(L.point(b.min.x, b.max.y), scale);
      var se = crs.transformation.transform(L.point(b.max.x, b.min.y), scale);
      return L.bounds(nw.subtract(origin), se.subtract(origin));
    },
    _reset: function () {
      var box = this._planeBounds(this._map.getZoom(), this._map.getPixelOrigin()), size = box.getSize();
      L.DomUtil.setPosition(this._image, box.min);
      this._image.style.width = size.x + "px";
      this._image.style.height = size.y + "px";
    },
    _animateZoom: function (e) {
      var scale = this._map.getZoomScale(e.zoom);
      var box = this._planeBounds(e.zoom, this._map._getNewPixelOrigin(e.center, e.zoom));
      L.DomUtil.setTransform(this._image, box.min, scale);
    },
  });

  // 선을 가운데 경선의 반대편(이음매)에서 끊는다. 끊는 자리는 이음매 위의 점을 보간해 양쪽 가장자리에 붙인다.
  // 자료가 정거원통 지도의 테두리(경도 ±180°, 위도 ±90°)를 따라 긋는 선분은 버린다 — 판 다각형을 지도 사각형에서
  // 자른 자국이라, 몰바이데에서는 가장자리에서 극으로 가는 사선이나 돌린 뒤 바다 한가운데의 경선으로 보인다(028).
  // 좌표는 GeoJSON 순서([경도, 위도]). 이음매 위의 점은 lon0 ± (180 − ε) 로 두어 어느 쪽 가장자리인지 정한다.
  var SEAM_EPS = 1e-7, EDGE_BAND = 0.1;
  // 테두리 선분 — 두 끝이 모두 같은 쪽 경도 ±180° 또는 위도 ±90° 의 0.1°(약 11 km) 안(또는 아래 strip). 끝점이 정확히 180° 가 아닌
  // 자름 자국(179.941° → 180°, 18°N → 89.8°S)이 있어 띠로 잡는다. 날짜변경선 0.1° 안의 짧은 진짜 선도 버려지지만
  // 보이지 않는 폭이다.
  function edgeSegment(a, p) {
    var lon = Math.abs(a[0]) >= 180 - EDGE_BAND && Math.abs(p[0]) >= 180 - EDGE_BAND && (a[0] > 0) === (p[0] > 0);
    var lat = Math.abs(a[1]) >= 90 - EDGE_BAND && Math.abs(p[1]) >= 90 - EDGE_BAND && (a[1] > 0) === (p[1] > 0);
    // 날짜변경선 1° 안에서 위도로 5° 넘게 곧게 오르내리는 선분도 자름 자국이다(510 Ma: −180°, 90°S → −179.657°, 30.8°N)
    var strip = Math.abs(a[0]) >= 179 && Math.abs(p[0]) >= 179 && (a[0] > 0) === (p[0] > 0) && Math.abs(p[1] - a[1]) >= 5;
    return lon || lat || strip;
  }
  function splitLine(coords, lon0) {
    var out = [], cur = [];
    function flush(next) { if (cur.length > 1) out.push(cur); cur = next || []; }
    for (var i = 0; i < coords.length; i++) {
      var p = coords[i];
      if (i > 0) {
        var a = coords[i - 1], d = p[0] - a[0];
        if (edgeSegment(a, p) || Math.abs(d) > 180) {
          flush();   // 테두리 자국이거나, 자료가 날짜변경선에서 건너뛴 곳(180 → −180)
        } else {
          // 이음매를 넘는가 — 두 점을 돌린 경도가 180° 넘게 벌어지면. ra + d 로 재면 179.987 + 0.013 이
          // 180 에 못 미쳐(부동소수점) 넘는 것을 놓친다.
          var ra = wrap180(a[0] - lon0), rp = wrap180(p[0] - lon0);
          if (Math.abs(rp - ra) > 180) {
            var edge = d > 0 ? 180 : -180, t = Math.max(0, Math.min(1, (edge - ra) / d)), lat = a[1] + t * (p[1] - a[1]);
            cur.push([lon0 + edge - Math.sign(edge) * SEAM_EPS, lat]);
            flush([[lon0 - edge + Math.sign(edge) * SEAM_EPS, lat]]);
          }
        }
      }
      cur.push(p);
    }
    flush();
    return out;
  }
  // 정거원통은 그대로. 몰바이데는 가운데 경선이 0 이어도 끊는다 — 경도가 꼭 +180° 인 점은 −180°(왼쪽 끝)로
  // 넘어가 179° 의 이웃 점과 지도 폭을 가로지르는 선이 되고, 테두리 선분도 버려야 한다(028).
  function seamGeo(geo) {
    if (state.proj !== "moll") return geo;
    var lon0 = Mollweide.lon0;
    function cut(ft) {
      var g = ft.geometry, lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates
        : g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? [].concat.apply([], g.coordinates) : null;
      if (!lines) return ft;
      var parts = [];
      lines.forEach(function (line) { parts.push.apply(parts, splitLine(line, lon0)); });
      return { type: "Feature", properties: ft.properties, geometry: { type: "MultiLineString", coordinates: parts } };
    }
    return geo.type === "FeatureCollection" ? { type: "FeatureCollection", features: geo.features.map(cut) } : cut(geo);
  }

  // 배경 그림(과 몰바이데 기온 층) — 캔버스에 그린다. 몰바이데 그림은 한 행이 한 위도라, 가운데 경선을 돌리는 것은 행마다 타원 안
  // 구간(폭 = 전체 폭 × cos θ)을 그 폭의 (−lon0/360) 만큼 돌려 옮기는 것과 같다. 다시 굽지 않는다.
  // 새 그림은 다 받은 뒤에 바꿔 그린다 — 받는 동안 옛 그림을 둔다(021 과 같은 뜻).
  var ReliefOverlay = PlaneOverlay.extend({
    _initImage: function () {
      var c = this._image = L.DomUtil.create("canvas", "leaflet-image-layer" +
        (this._zoomAnimated ? " leaflet-zoom-animated" : "") + (this.options.className ? " " + this.options.className : ""));
      c.onselectstart = L.Util.falseFn;
      c.onmousemove = L.Util.falseFn;
      if (this._url) this._load(this._url);
      // 지도에 붙기 전에 setSource 로 받은 그림(몰바이데 기온 층) — 그때는 캔버스가 없어 그리지 못했다
      else if (this._src) this.paint();
    },
    setUrl: function (url) {
      this._url = url;
      if (this._image) this._load(url);
      return this;
    },
    // 이미 그려 둔 그림(캔버스)을 바로 쓴다 — 기온 층
    setSource: function (src) {
      this._url = null;
      this._src = src;
      this.paint();
      return this;
    },
    _load: function (url) {
      var self = this, img = new Image();
      img.onload = function () { if (self._url === url) { self._src = img; self.paint(); self.fire("load"); } };
      img.onerror = function () { if (self._url === url) self.fire("error"); };
      img.src = url;
    },
    paint: function () {
      var img = this._src, c = this._image;
      if (!img || !c) return;
      var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      var ctx = c.getContext("2d"), lon0 = state.proj === "moll" ? Mollweide.lon0 : 0;
      ctx.clearRect(0, 0, W, H);
      if (!lon0) { ctx.drawImage(img, 0, 0); return; }
      for (var r = 0; r < H; r++) {
        var y = SQRT2 - (r + 0.5) / H * 2 * SQRT2, half = W / 2 * Math.sqrt(Math.max(0, 1 - y * y / 2));
        if (half < 0.5) continue;
        var span = 2 * half, x0 = W / 2 - half, sh = ((-lon0 / 360 * span) % span + span) % span;
        // 원본 구간의 양 끝(타원 가장자리)은 반쯤 투명하다 — 이음매에서 맞닿으면 틈이 보여 1 px 안쪽을 읽는다
        var sx0 = x0 + 1, sspan = Math.max(1, span - 2), k = sspan / span;
        if (span - sh > 0.01) ctx.drawImage(img, sx0, r, (span - sh) * k, 1, x0 + sh, r, span - sh, 1);
        if (sh > 0.01) ctx.drawImage(img, sx0 + (span - sh) * k, r, sh * k, 1, x0, r, sh, 1);
      }
    },
  });

  // ── 지도 ────────────────────────────────────────────────────────────
  var map = L.map("map", {
    crs: L.CRS.EPSG4326,
    center: [0, 0], zoom: 1, minZoom: NARROW ? -1 : 1, maxZoom: 7, zoomSnap: NARROW ? 0.25 : 1,
    maxBounds: eqBounds(), maxBoundsViscosity: NARROW ? 0.6 : 0.8,
    worldCopyJump: false, attributionControl: true,
    zoomControl: false,   // 확대·축소는 휠·두 손가락·더블클릭·+/− 키로 한다 — 단추는 자리만 차지했다(wetherilli 001)
  });
  map.attributionControl.setPrefix(false);
  // 지구 전체가 들어오는 가장 큰 확대 — 두 투영 모두 확대 0 에서 512 × 256 픽셀이다.
  // fitBounds(WORLD) 는 몰바이데에서 쓸 수 없다(위경도 사각형의 모서리가 극점 하나로 모인다).
  function worldZoom() {
    var size = map.getSize();
    if (!size.x || !size.y) return map.getMinZoom();
    var z = Math.log(Math.min(size.x / 512, size.y / 256)) / Math.LN2, snap = map.options.zoomSnap || 1;
    return Math.max(map.getMinZoom(), Math.floor(z / snap) * snap);
  }
  // 지구 전체의 가운데 — 몰바이데에서는 가운데 경선(lon0) 위다. [0, 0] 으로 두면 돌린 만큼 옆으로 밀린다.
  function worldCenter() { return L.latLng(0, state.proj === "moll" ? Mollweide.lon0 : 0); }
  function fitWorld() { map.setView(worldCenter(), worldZoom()); }
  fitWorld();
  if (window.ResizeObserver) {
    var wasEmpty = true;
    new ResizeObserver(function (entries) {
      var box = entries[0].contentRect;
      map.invalidateSize();
      if (wasEmpty && box.width > 0 && box.height > 0) fitWorld();
      wasEmpty = !(box.width > 0 && box.height > 0);
    }).observe($("map"));
  }

  // 겹 순서: 배경(380) < 기온(390) < 해안선·국경(400) < 화석(450)
  map.createPane("base").style.zIndex = 380;
  map.createPane("climate").style.zIndex = 390;
  var relief = new ReliefOverlay("", WORLD, { interactive: false, className: "relief", pane: "base" }).addTo(map);
  // 기온 격자는 1° 칸의 가운데가 정수 경위도다(361×181). 그림 가장자리를 반 칸 밖에 둬야 칸이 제자리에 앉는다.
  var climateLayer = L.imageOverlay("", [[-90.5, -180.5], [90.5, 180.5]],
    { interactive: false, className: "climate", pane: "climate", opacity: 0.55 });
  // 몰바이데의 기온 층 — 격자가 작아(361×181) 브라우저에서 타원으로 옮겨 그린다(drawClimate). 가운데 경선을
  // 돌릴 때는 배경처럼 행을 옮겨 그린다(025).
  var climateMoll = new ReliefOverlay("", WORLD,
    { interactive: false, className: "climate", pane: "climate", opacity: 0.55 });
  // 해안선은 SVG 로, 화석은 그 위 전용 창의 캔버스로 그린다. 둘 다 캔버스로 두면 나중에
  // 생긴 해안선 캔버스가 화석 캔버스를 덮어 점을 눌러도 아무 일이 없다.
  var coastLayer = L.geoJSON(null, {
    style: { color: "#ff3da8", weight: 1.2, opacity: 0.9, fill: false },
    interactive: false, renderer: L.svg(),
  }).addTo(map);
  // 국경선: 현재 국경을 그때 자리로 돌린 것. 반투명하게, 고른 나라만 또렷하게.
  var borderLayer = L.geoJSON(null, {
    style: function (feature) {
      var picked = state.country && countryIso(state.country) === feature.properties.cc;
      return picked ? { color: "#ffd400", weight: 2.2, opacity: 0.95, fill: false }
                    : { color: "#ffffff", weight: 0.7, opacity: 0.4, fill: false };
    },
    interactive: false, renderer: L.svg(),
  }).addTo(map);
  map.createPane("fossils").style.zIndex = 450;
  var renderer = L.canvas({ padding: 0.3, pane: "fossils" });
  var fossilLayer = L.layerGroup().addTo(map);
  var taxonLayer = L.layerGroup().addTo(map);
  var cmpLayer = L.layerGroup().addTo(map);        // 비교 분류군 B(tupandactyl 024) — 보라 고리
  var gridLayer = L.layerGroup();
  // 2° 마다 점을 찍는다 — 몰바이데에서 경선이 곡선이다.
  function steps(a, b) { var out = []; for (var v = a; v <= b; v += 2) out.push(v); return out; }
  // 위선은 가운데 경선의 반대편(이음매)에서 시작해 이음매에서 끝난다(025).
  function drawGrid() {
    var lon0 = state.proj === "moll" ? Mollweide.lon0 : 0, style = { color: "#fff", weight: 0.5, opacity: 0.35, interactive: false };
    gridLayer.clearLayers();
    for (var lon = -180; lon < 180; lon += 30) gridLayer.addLayer(L.polyline(steps(-90, 90).map(function (la) { return [la, lon]; }), style));
    gridLayer.addLayer(L.polyline(steps(-90, 90).map(function (la) { return [la, lon0 + 180 - SEAM_EPS]; }), style));   // 오른쪽 가장자리
    for (var lat = -60; lat <= 60; lat += 30) {
      var pts = steps(-180, 180).map(function (lo) { return [lat, lon0 + Math.max(-180 + SEAM_EPS, Math.min(180 - SEAM_EPS, lo))]; });
      gridLayer.addLayer(L.polyline(pts, L.extend({}, style, { weight: lat === 0 ? 1 : 0.5 })));
    }
  }
  drawGrid();

  // 3D 지구본(wetherilli P01) — Leaflet 층을 비춘다. 층이 바뀔 때마다 알리도록 층의 더하기·빼기를 감싼다
  // (점 만 개를 더해도 알림은 다음 그리기 틀에 한 번 모인다). 지구본을 고르기 전에는 아무것도 하지 않는다.
  var globe = window.WegenerGlobe ? window.WegenerGlobe({
    L: L, map: map, box: $("map"), base: $("app").dataset.cesiumBase,
    layers: { fossils: fossilLayer, taxa: taxonLayer, lines: [gridLayer, coastLayer, borderLayer] },
    frame: frame,
    reliefUrl: function (f) { var files = f.relief_files || {}; return dataUrl(files["4096"] || files["2048"] || f.relief); },
    climate: globeClimate, climateOpacity: function () { return climateLayer.options.opacity; },
    onView: function () { if (state.proj === "globe" && frame()) writeHash(frame()); },
    avoid: function () { return [$("findfloat")]; },
    // 지형(wetherilli 017) — 가공물의 terrain 칸을 그대로 넘긴다. 옛 가공물(칸 없음)이면 매끈한 구
    terrain: function (f) {
      var t = f.terrain;
      return t && $("terrain").checked ? { url: dataUrl(t.file), step: t.step, offset: t.offset, unit: t.unit } : null;
    },
    exaggeration: function () { return +$("terrain-exag").value; },
    onLoading: function (on, err) {
      $("map").classList.toggle("globe-loading", on);
      $("map").dataset.loading = tr("globe.loading");
      if (err) { console.error(err); setProjection("eq"); alert(tr("globe.fail")); }
    },
  }) : null;
  function watchLayer(group, what) {
    ["addLayer", "removeLayer", "clearLayers"].forEach(function (name) {
      var orig = group[name];
      group[name] = function () { var out = orig.apply(this, arguments); if (globe) globe.mark(what); return out; };
    });
  }
  watchLayer(fossilLayer, "points");
  watchLayer(taxonLayer, "points");
  [gridLayer, coastLayer, borderLayer].forEach(function (g) { watchLayer(g, "lines"); });
  map.on("layeradd layerremove", function (e) { if (globe && e.layer === gridLayer) globe.mark("lines"); });
  (function () {
    var setUrl = relief.setUrl;
    relief.setUrl = function () { var out = setUrl.apply(this, arguments); if (globe) globe.mark("relief"); return out; };
  })();
  // 지구본에서 지도를 옮기는 것은 모두 코드다(나라로 가기·가장 많은 시점 등) — 그 자리로 카메라를 날린다.
  // 창 크기만 바뀐 것(가운데·확대가 그대로)은 넘긴다.
  var lastMove = "";
  map.on("moveend", function () {
    var c = map.getCenter(), z = map.getZoom(), key = c.lat.toFixed(3) + "," + c.lng.toFixed(3) + "," + z;
    if (key === lastMove) return;
    lastMove = key;
    if (state.proj !== "globe" || !globe) return;
    var b = map.getBounds();
    globe.setView({ lon: c.lng, lat: c.lat, alt: spanAlt(Math.max(b.getEast() - b.getWest(), (b.getNorth() - b.getSouth()) * 2)) }, true);
  });
  // 평면 지도에서 보이는 가로 폭(도)을 지구본의 카메라 높이(m)로 — 시야 60° 로 내려다보면 화면 폭 ≈ 높이 × 1.15.
  // 반구보다 넓게 보던 것이면 0(지구 전체가 들어오는 높이, globe.js)
  function spanAlt(spanDeg) { return spanDeg >= 150 ? 0 : spanDeg * 111195 / 1.15; }

  window.Wegener = { map: map, fossils: fossilLayer, taxa: taxonLayer, borders: borderLayer, state: state, relief: relief, globe: globe };   // 콘솔에서 들여다보기용

  // 배경 해상도: EPSG:4326 에서 세계 폭은 512·2^zoom 픽셀이다. zoom 2 까지는 2048,
  // 그보다 확대하면 4096 을 부른다(6 분 격자가 3601 칸이라 그 이상은 얻을 것이 없다).
  function reliefWidth() { return map.getZoom() >= 3 ? "4096" : "2048"; }
  function reliefUrl(f) {
    var files = f.relief_files || {};
    if (state.proj === "moll") return dataUrl(files["moll-" + reliefWidth()]);
    return dataUrl(files[reliefWidth()] || f.relief);
  }
  // 가공물에 몰바이데 배경이 있는가 — 옛 가공물이면 투영 고르기를 숨긴다.
  function hasMollweide() { return state.frames.length > 0 && !!(state.frames[0].relief_files || {})["moll-2048"]; }

  // 투영을 바꾼다. 지도를 새로 만들지 않고 좌표계만 바꿔 다시 그린다 — 층들은 viewreset 에서 새 좌표계로 다시 투영된다.
  // 지구본(P01)에서도 밑의 Leaflet 지도는 정거원통으로 살아 있다 — 층을 비추는 데 쓰고, 창만 숨긴다.
  var LEAFLET_HANDLERS = ["dragging", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "keyboard", "touchZoom"];
  function setProjection(proj) {
    if (proj !== "moll" && proj !== "globe") proj = "eq";
    if (proj === "globe" && !globe) proj = "eq";
    if (proj === state.proj) return;
    var wasMoll = state.proj === "moll", wasGlobe = state.proj === "globe";
    state.proj = proj;
    document.querySelectorAll("#proj-seg [data-proj]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.proj === proj)); });
    if (proj === "globe") {
      if (measure.on) setMeasuring(false);
      clearMeasure();
      map.closePopup();
      LEAFLET_HANDLERS.forEach(function (h) { if (map[h]) map[h].disable(); });
      map.getContainer().classList.add("globe-on");
      $("tool-measure").disabled = true;
      // 주소가 준 카메라 자리가 없으면 지금 보던 평면 지도의 가운데·넓이로 연다
      var c = map.getCenter(), b = map.getBounds();
      globe.setView(state.globeView || { lon: c.lng, lat: c.lat, alt: spanAlt(Math.max(b.getEast() - b.getWest(), (b.getNorth() - b.getSouth()) * 2)) });
      state.globeView = null;
      globe.open().catch(function () { /* onLoading 이 정거원통으로 되돌린다 */ });
    } else if (wasGlobe) {
      globe.close();
      map.getContainer().classList.remove("globe-on");
      LEAFLET_HANDLERS.forEach(function (h) { if (map[h]) map[h].enable(); });
      $("tool-measure").disabled = false;
    }
    if (wasMoll !== (proj === "moll")) {
      map.options.crs = proj === "moll" ? MOLL : L.CRS.EPSG4326;
      map.setMaxBounds(proj === "moll" ? null : eqBounds());   // 몰바이데는 위경도 사각형으로 가둘 수 없다
      // 몰바이데에서는 Leaflet 의 끌기를 끄고 spin 이 받는다 — 가로는 돌리기, 세로는 옮기기(025)
      if (proj === "moll") map.dragging.disable(); else if (proj === "eq") map.dragging.enable();
      map.getContainer().classList.toggle("moll", proj === "moll");
      map._resetView(worldCenter(), worldZoom(), true);
    }
    if ($("tool-zoomin")) syncZoomButtons();   // 지구본에서는 늘 켠다
    var f = frame();
    noteTerrain(f);
    if (!f) return;
    relief.setUrl(reliefUrl(f));
    redrawLines(f);
    drawClimate(f);
    writeHash(f);
  }
  function writeHash(f) {
    var lon0 = Math.round(Mollweide.lon0 * 10) / 10, proj = "";
    if (state.proj === "moll") proj = "&proj=moll" + (lon0 ? "&lon=" + lon0 : "");
    if (state.proj === "globe") {
      // 지구본은 카메라 자리(경도·위도·높이 km)까지 담는다 — 링크를 받은 사람이 같은 쪽을 본다
      var v = globe.view() || state.globeView;
      proj = "&proj=globe" + (v ? "&lon=" + v.lon.toFixed(1) + "&lat=" + v.lat.toFixed(1) + "&alt=" + Math.round(v.alt / 1000) : "");
    }
    try {
      history.replaceState(null, "", "#age=" + f.age + proj + (EN ? "&lang=en" : "") + (I18N.mode === "casual" ? "&mode=casual" : ""));
    } catch (e) { /* 미리보기 등 */ }
  }
  // 이음매에 따라 끊는 선들을 다시 긋는다 — 해안선·국경·경위선
  function redrawLines(f) {
    drawGrid();
    if (!f) return;
    if (measure && measure.pts.length) { if (measure.age !== f.age) clearMeasure(); else drawMeasure(); }   // 잰 선(wetherilli 014)
    drawCoast(f);
    drawBorders(f, false);
  }

  // 가운데 경선을 돌린다(025). 층들은 viewreset 에서 새 lon0 로 다시 투영되고, 이음매에서 끊는 선·배경·기온은
  // 여기서 다시 그린다. 화면의 가운데(투영 평면의 자리)는 그대로다.
  // map.fire("viewreset") 는 쓰지 않는다 — 곧 새로 그을 국경 SVG 까지 다시 투영해 두 배로 든다(끌기가 끊겼다).
  // 산지·분류군 점의 캔버스만 다시 투영하고, 선은 새로 그을 때 투영된다.
  function rotateTo(lon0) {
    Mollweide.lon0 = wrap180(lon0);
    renderer._reset();
    relief.paint();
    if (map.hasLayer(climateMoll)) climateMoll.paint();
    redrawLines(frame());
  }

  // 몰바이데에서 끌기: 지구(타원) 안을 눌러 끌면 가로로 움직인 만큼 가운데 경선을 돌린다(적도에서 손가락 밑의
  // 땅이 따라오게). 세로 움직임은 버린다 — 돌리는 도중 손이 떨려 지구가 오르내리지 않게(koprifossillab 030).
  // 타원 밖을 눌러 끌면 가로·세로 모두 지도를 옮긴다(koprifossillab 029).
  // 어느 쪽인지는 누른 자리로 정한다 — 끄는 도중 경계를 넘어도 바뀌지 않는다. 움직임은 한 프레임에 한 번만 반영한다. 끈 뒤에 오는 click 은 삼킨다 — 점을 누른 것으로
  // 보고 팝업을 열지 않게.
  var spin = null, spinPending = { dx: 0, dy: 0, frame: 0, rotate: true }, pointers = {};
  function applySpin() {
    spinPending.frame = 0;
    var dx = spinPending.dx, dy = spinPending.dy;
    spinPending.dx = spinPending.dy = 0;
    if (state.proj !== "moll") return;
    if (spinPending.rotate) {
      if (dx) rotateTo(Mollweide.lon0 - dx * 360 / (512 * Math.pow(2, map.getZoom())));
      // 손가락이면 세로도 옮긴다 — 휴대폰에서는 지구가 창 폭을 거의 채워 타원 밖을 잡을 데가 없었다(koprifossillab 038)
      if (dy && spinPending.touch) map.panBy([0, -dy], { animate: false });
    } else if (dx || dy) {
      map.panBy([-dx, -dy], { animate: false });
    }
  }
  (function bindSpin() {
    var box = map.getContainer();
    box.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = true;
      if (Object.keys(pointers).length > 1) { spin = null; return; }   // 두 손가락은 Leaflet 의 확대에 맡긴다
      if (state.proj !== "moll" || e.button !== 0 || e.target.closest(".leaflet-control")) return;
      spin = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, rotate: onGlobe(map.mouseEventToContainerPoint(e)), touch: e.pointerType === "touch" };
    });
    window.addEventListener("pointermove", function (e) {
      if (!spin || e.pointerId !== spin.id) return;
      var dx = e.clientX - spin.x, dy = e.clientY - spin.y;
      if (!spin.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        spin.moved = true;
        box.classList.add("spinning");
      }
      spin.x = e.clientX; spin.y = e.clientY;
      spinPending.dx += dx; spinPending.dy += dy; spinPending.rotate = spin.rotate; spinPending.touch = spin.touch;
      if (!spinPending.frame) spinPending.frame = requestAnimationFrame(applySpin);
    });
    function end(e) {
      delete pointers[e.pointerId];
      if (!spin || e.pointerId !== spin.id) return;
      if (spin.moved) {
        box.classList.remove("spinning");
        box.addEventListener("click", function (ev) { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
        setTimeout(function () { var f = frame(); if (f) writeHash(f); }, 0);
      }
      spin = null;
    }
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  })();
  map.on("zoomend", function () {
    // 몰바이데는 이동 범위를 위경도 사각형으로 가둘 수 없다(024). 휠은 커서를 가운데로 확대·축소해, 지구 전체가
    // 들어오는 크기까지 줄여도 지구가 옆에 남았다 — 그 크기에서는 가운데로 돌려놓는다(koprifossillab 030).
    if (state.proj === "moll" && map.getZoom() <= worldZoom()) map.setView(worldCenter(), map.getZoom(), { animate: false });
    var f = frame();
    if (!f) return;
    var url = reliefUrl(f);
    if (relief._url !== url) relief.setUrl(url);
    noteRelief(f);
  });
  // 지형 칸은 지구본이고 가공물에 지형이 있을 때만 보인다(wetherilli 017)
  function noteTerrain(f) {
    var t = f && f.terrain;
    $("terrain-row").hidden = state.proj !== "globe" || !t;
    if (t) $("terrain-note").textContent = tr("terrain.note", { min: fmtNum(t.min), max: fmtNum(t.max) });
  }
  function noteRelief(f) {
    $("relief-note").textContent = tr("relief.note", { grid: tr(f.grid === "6min" ? "grid.6min" : "grid.1deg"), w: reliefWidth() });
  }

  // ── 층서표 ──────────────────────────────────────────────────────────
  var RANK_ORDER = ["era", "period", "subperiod", "epoch", "age"];
  function unit(id) { return state.units[id]; }
  function chain(u) { var out = []; while (u) { out.unshift(u); u = unit(u.parent); } return out; }
  function descendants(u, rank) {
    var out = [];
    (state.kids[u.id] || []).forEach(function (k) {
      if (k.rank === rank) out.push(k); else out = out.concat(descendants(k, rank));
    });
    return out;
  }
  function byOldFirst(a, b) { return b.base - a.base; }
  // 칩에 적는 이름: 전기·중기·후기 세는 위 단위를 알고 있으니 짧게, 석탄기는 아기를 붙인다.
  function chipName(u) {
    if (u.rank === "epoch" && unit(u.parent).rank === "subperiod") return u.full.replace("아기 ", " ");
    return u.ko;
  }
  function frameUnits(f) { return (f.units || []).map(unit).filter(Boolean); }

  function initTimescale(ts) {
    ts.units.forEach(function (u) {
      state.units[u.id] = u;
      (state.kids[u.parent] = state.kids[u.parent] || []).push(u);
    });
    Object.keys(state.kids).forEach(function (k) { state.kids[k].sort(byOldFirst); });
    state.periods = ts.units.filter(function (u) { return u.rank === "period"; })
      .sort(function (a, b) { return a.top - b.top; });
    // 시점 막대 위의 기·세 띠 — 막대와 같게 왼쪽이 540 Ma 다. 이름은 화면 언어와 상관없이 영어로(tupandactyl 002).
    var rows = { period: $("strip-period"), epoch: $("strip-epoch") };
    ts.units.forEach(function (u) {
      if (!rows[u.rank] || u.top >= OLDEST) return;
      var left = (OLDEST - Math.min(u.base, OLDEST)) / OLDEST * 100;
      var width = (Math.min(u.base, OLDEST) - u.top) / OLDEST * 100;
      var band = document.createElement("span");
      band.style.cssText = "left:" + left + "%;width:" + width + "%;background:" + u.color + ";color:" + ink(u.color);
      band.title = (u.en || u.full) + (u.en && u.en !== u.full ? " · " + u.full : "") + " (" + u.base + "–" + u.top + " Ma)";
      band.names = stripNames(u.en || u.full);
      band.addEventListener("click", function () { focusUnit(u); });
      rows[u.rank].appendChild(band);
    });
    // 에디아카라기와 현생누대 사이의 붉은 선(019) — 앞쪽은 판 복원만 있는 시점이다
    var ediacaran = ts.units.filter(function (u) { return u.en === "Ediacaran"; })[0];
    if (ediacaran && OLDEST > ediacaran.top) {
      var eon = document.createElement("div");
      eon.className = "eon-line";
      eon.style.left = "calc(7px + (100% - 14px) * " + ((OLDEST - ediacaran.top) / OLDEST) + ")";
      eon.title = "Ediacaran | Phanerozoic · " + ediacaran.top + " Ma";
      document.querySelector(".timebar .track").appendChild(eon);
    }
    fitStripNames();
    if (window.ResizeObserver) new ResizeObserver(fitStripNames).observe($("strip"));
    else window.addEventListener("resize", fitStripNames);
  }

  // 띠 이름의 후보 — 긴 것부터. 띠 폭에 드는 가장 긴 것을 적고, 아무것도 안 들면 비운다(이름은 title 에 남는다).
  // 층서 이름을 map.js 에 적지 않으려고 약자는 규칙으로 만든다: Early/Middle/Late → E./M./L., 긴 낱말은 앞 서너 글자.
  // "Late Cretaceous" → "L. Cretaceous" → "L. Cret." → "LCr"
  var QUALIFIER = { Early: "E", Middle: "M", Late: "L" };
  function stripNames(en) {
    var words = en.split(" "), q = QUALIFIER[words[0]] && words.length > 1 ? QUALIFIER[words[0]] : "";
    var rest = q ? words.slice(1) : words;
    var short = rest.map(function (w) { return w.length <= 5 ? w : w.slice(0, w.length > 8 ? 4 : 3) + "."; }).join(" ");
    var names = [en, (q ? q + ". " : "") + rest.join(" "), (q ? q + ". " : "") + short,
                 q + rest.map(function (w) { return /^\d/.test(w) ? w : w.slice(0, 2); }).join("")];
    return names.filter(function (n, i) { return names.indexOf(n) === i; });
  }
  var stripMeasure = document.createElement("canvas").getContext("2d");
  function fitStripNames() {
    ["strip-period", "strip-epoch"].forEach(function (id) {
      var row = $(id), bands = row.children;
      if (!bands.length) return;
      stripMeasure.font = getComputedStyle(row).font;
      for (var k = 0; k < bands.length; k++) {
        var band = bands[k], room = band.getBoundingClientRect().width - 4;
        var fit = band.names.filter(function (n) { return stripMeasure.measureText(n).width <= room; })[0] || "";
        if (band.textContent !== fit) band.textContent = fit;
      }
    });
  }

  function renderChrono() {
    var f = frame();
    var here = {};
    frameUnits(f).forEach(function (u) { here[u.id] = true; });
    // 지금 지도의 단위로 채우고, 고른 단위가 있으면 그것과 그 위를 덮어쓴다. 고른 단위 안에
    // 지도가 있으면 아래 줄(세·절)은 지도의 것이 그대로 남는다.
    var picked = {};
    frameUnits(f).forEach(function (u) { picked[u.rank] = u; });
    if (state.focus) {
      var inside = f.age > state.focus.top && f.age <= state.focus.base;
      var below = RANK_ORDER.slice(RANK_ORDER.indexOf(state.focus.rank) + 1);
      if (!inside) below.forEach(function (r) { delete picked[r]; });
      chain(state.focus).forEach(function (u) { picked[u.rank] = u; });
    }
    var lists = {
      era: Object.keys(state.units).map(unit).filter(function (u) { return u.rank === "era"; }).sort(byOldFirst),
      period: picked.era ? descendants(picked.era, "period") : [],
      epoch: picked.period ? descendants(picked.period, "epoch") : [],
      age: picked.epoch ? descendants(picked.epoch, "age") : [],
    };
    document.querySelectorAll("#chrono .chips").forEach(function (box) {
      var rank = box.dataset.rank;
      box.innerHTML = "";
      lists[rank].forEach(function (u) {
        var b = document.createElement("button");
        b.type = "button";
        var n = state.dist && state.taxon ? state.dist.units[u.id] || 0 : null;
        b.className = "chip" + (picked[rank] && picked[rank].id === u.id ? " on" : "") + (here[u.id] ? " here" : "") +
          (n === 0 ? " none-found" : "");
        b.style.backgroundColor = u.color;   // 색만 — 책등의 그늘·금박 띠(CSS 배경 그림)를 지우지 않게
        b.style.color = ink(u.color);
        b.classList.toggle("light-ink", ink(u.color) === "#ffffff");   // 흰 글자 — 짙은 그림자를 준다(CSS)
        b.textContent = chipName(u);
        if (n) b.insertAdjacentHTML("beforeend", '<span class="cnt">' + fmtNum(n) + "</span>");
        b.title = u.full + (EN ? "" : " · " + (SCI ? u.kn : u.en)) + " · " + u.base + "–" + u.top + " Ma" + (here[u.id] ? tr("chip.now") : "") +
          (n !== null ? tr("chip.taxon", { taxon: state.taxon, n: fmtNum(n) }) : "");
        ribbonChip(b, u);                      // 사건이 끝나는 단위에 책갈피 리본(tupandactyl 017)
        b.addEventListener("click", function () { focusUnit(u); });
        box.appendChild(b);
      });
      if (!lists[rank].length) box.innerHTML = '<span class="none">' + (rank === "age" && picked.epoch ? tr("chrono.noage") : "—") + "</span>";
    });
  }

  // 단위를 고르면 그 안의 지도 가운데 단위 한가운데에 가장 가까운 것으로 간다.
  // 안에 지도가 없으면(짧은 절) 가장 가까운 지도로 가고 그렇다고 적는다.
  function focusUnit(u) {
    var mid = (u.top + u.base) / 2;
    var best = -1, bestInside = -1;
    state.frames.forEach(function (f, j) {
      var d = Math.abs(f.age - mid);
      if (best < 0 || d < Math.abs(state.frames[best].age - mid)) best = j;
      var inside = f.age > u.top && f.age <= u.base;
      if (inside && (bestInside < 0 || d < Math.abs(state.frames[bestInside].age - mid))) bestInside = j;
    });
    var j = bestInside >= 0 ? bestInside : best;
    // 기 이하의 칩 — 그 단위 안의 사건을 책갈피로(018). 단위 안에 지도가 없으면 가장 가까운 지도까지 범위에 넣는다
    evSelect(u.rank === "era" ? [] : evInUnitAll(u), [Math.min(u.top, state.frames[j].age), Math.max(u.base, state.frames[j].age)]);
    show(j, { focus: u });
    $("chrono-note").textContent = bestInside >= 0
      ? tr("focus.inside", { unit: u.full, base: u.base, top: u.top, age: fmtAge(state.frames[j].age) })
      : tr("focus.nearest", { unit: u.full, base: u.base, top: u.top, age: fmtAge(state.frames[j].age) });
  }

  function renderHeader(f) {
    $("now-age").textContent = fmtAge(f.age);
    $("now-units").innerHTML = frameUnits(f).filter(function (u) { return u.rank !== "subperiod"; }).map(function (u) {
      return '<span class="unit" style="background:' + u.color + ";color:" + ink(u.color) + '" title="' + esc(u.en) + '">' +
        esc(u.rank === "epoch" ? chipName(u) : u.ko) + "</span>";
    }).join('<span class="sep">›</span>');
    $("now-label").textContent = f.label;   // 전 지구 평균 기온은 지도 왼쪽 위 온도계로 옮겼다(wetherilli 002)
    renderThermo(f);
  }

  // ── 전 지구 평균 기온 온도계(wetherilli 002) ─────────────────────────
  // 확대·축소 단추가 있던 왼쪽 위. 눈금은 모든 시점의 평균 기온 범위를 5 ℃ 단위로 넓힌 것이고, 지금(0 Ma)의
  // 값에 금을 긋는다 — 그때가 지금보다 얼마나 더웠는지가 한눈에 보이게.
  var thermo = L.control({ position: "topleft" });
  thermo.onAdd = function () {
    var div = L.DomUtil.create("div", "thermo");
    div.id = "thermo";
    div.hidden = true;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  thermo.addTo(map);
  var THERMO = { lo: 10, hi: 40, now: null };
  function initThermo() {
    var vals = state.frames.filter(function (f) { return f.climate && f.climate.gmst != null; }).map(function (f) { return f.climate.gmst; });
    if (!vals.length) return;
    THERMO.lo = Math.floor(Math.min.apply(null, vals) / 5) * 5;
    THERMO.hi = Math.ceil(Math.max.apply(null, vals) / 5) * 5;
    var now = state.frames.filter(function (f) { return f.age === 0 && f.climate; })[0];
    THERMO.now = now ? now.climate.gmst : null;
  }
  function renderThermo(f) {
    var box = $("thermo");
    if (!box) return;
    box.hidden = !f.climate || f.climate.gmst == null;   // 육지만의 기온(PaleoClim)은 전 지구 평균이 아니다
    if (box.hidden) return;
    var t = f.climate.gmst, lo = THERMO.lo, hi = THERMO.hi;
    // 관: 위 y=8 ~ 아래 y=78, 구: 가운데 y=90
    var y = function (v) { return 78 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * 70; };
    var rgb = "rgb(" + tempColor(t).join(",") + ")", ticks = "";
    for (var v = lo; v <= hi; v += 5) {
      ticks += '<line x1="21" x2="' + (v % 10 ? 24 : 26) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        (v % 10 ? "" : '<text x="28" y="' + (y(v) + 3) + '">' + v + "</text>");
    }
    var nowMark = THERMO.now == null ? "" :
      '<line class="now" x1="7" x2="19" y1="' + y(THERMO.now) + '" y2="' + y(THERMO.now) + '"/>';
    box.innerHTML = '<svg viewBox="0 0 44 100" width="44" height="100" aria-hidden="true">' +
      '<rect class="tube" x="8" y="4" width="10" height="80" rx="5"/>' +
      '<circle class="tube" cx="13" cy="90" r="8"/>' +
      // 수은 — 기온 색에 짙은 테. 14 ℃ 무렵의 옅은 노랑도 밝은 판에서 보이게(tupandactyl 007)
      '<rect class="mercury" x="10.5" y="' + y(t) + '" width="5" height="' + (90 - y(t)) + '" fill="' + rgb + '"/>' +
      '<circle class="mercury" cx="13" cy="90" r="5.5" fill="' + rgb + '"/>' +
      '<g class="ticks">' + ticks + "</g>" + nowMark + "</svg>" +
      '<div class="thermo-read"><b>' + t.toFixed(1) + '</b><span>' + (EN ? "°C" : "℃") + "</span>" +
      "<small>" + tr("thermo.label") + "</small></div>";
    box.title = tr("thermo.title", { t: t.toFixed(1), age: fmtAge(f.climate.source_age) }) +
      (THERMO.now == null ? "" : tr("thermo.now", { t: THERMO.now.toFixed(1) }));
  }

  // ── 시점 ────────────────────────────────────────────────────────────
  function frame() { return state.frames[state.i]; }

  // 시점이 산지를 모으는 창. 5 Myr 간격 시점은 ±WINDOW_MA 와 겹치면(경계 포함), 최근의 절(tupandactyl 009)은 그 절과
  // **안쪽으로** 겹쳐야 — 절끼리 경계를 맞대고 있어 "Pleistocene"(위 끝 0.0117 Ma)이 홀로세에 오르지 않게. 길이 0 인
  // 산지는 경계 위여도 넣는다
  function win(f) { return f.window || [Math.max(0, f.age - WINDOW_MA), f.age + WINDOW_MA]; }
  function inWin(f, old, young) {
    old = +old; young = +young;
    if (old < young) { var t = old; old = young; young = t; }
    if (!f.window) return old >= f.age - WINDOW_MA && young <= f.age + WINDOW_MA;
    var w = f.window;
    return (old > w[0] && young < w[1]) || (old === young && w[0] <= old && old <= w[1]);
  }

  // ── 최근의 절을 시점으로(tupandactyl 009) ───────────────────────────
  // 5 Myr 간격의 지도로는 0 Ma 한 장에 홀로세부터 플라이오세 후반까지 다 들어갔다. 연구자가 플라이오세까지 절 단위로
  // 나누기로 했고, 5 Myr 안에서는 대륙이 거의 움직이지 않으니 **가공물을 새로 만들지 않고** 이미 있는 0 Ma·5 Ma 지도의
  // 산지를 절의 경계로 다시 걸러 쓴다(연구자). 배경·해안선·국경·기온은 가까운 쪽(2.5 Ma 보다 젊으면 0 Ma, 아니면 5 Ma)
  // 것이고, 산지 좌표도 그 지도의 것이다. 홀로세의 세 절(합해 1.2 만 년)은 하나로 둔다. 0 Ma 시점은 홀로세가 맡는다.
  function buildRecentSlices() {
    var all = Object.keys(state.units).map(unit);
    var plio = all.filter(function (u) { return u.en === "Pliocene"; })[0];
    var holo = all.filter(function (u) { return u.en === "Holocene"; })[0];
    var f0 = state.frames.filter(function (f) { return f.age === 0; })[0];
    var f5 = state.frames.filter(function (f) { return f.age === 5; })[0];
    if (!plio || !holo || !f0 || !f5 || !f0.fossils || !f5.fossils || !f0.fossils.file || !f5.fossils.file) return;
    var picks = [holo].concat(all.filter(function (u) { return u.rank === "age" && u.base > holo.base && u.base <= plio.base + 1e-9; }));
    var slices = picks.map(function (u) {
      var age = u === holo ? 0 : Math.round((u.top + u.base) / 2 * 100) / 100;
      var src = age < 2.5 ? f0 : f5;
      var f = Object.assign({}, src, {
        age: age, label: u.en, window: [u.top, u.base], src: src,
        slice: { unit: u.id, sources: [f0, f5] },
        units: all.filter(function (v) { return v.top <= age && (age < v.base || (age === 0 && v.top === 0)); }).map(function (v) { return v.id; }),
      });
      f.fossils = Object.assign({}, src.fossils, { file: null });   // 산지는 loadFossils 가 두 지도에서 걸러 만든다
      // 기온 지도도 절 경계로 — 그 절 안의 나이의 격자만 쓴다(연구자: 플라이스토세와 홀로세의 기후는 전혀 다르다).
      // Scotese(2021) 격자는 5 Myr 간격이라 홀로세(0 Ma)·장클레절(5 Ma)만 제 것이 있고, 나머지 절은 없다고 말한다
      var c = src.climate;
      f.climate = c && c.source_age >= u.top - 1e-9 && c.source_age <= u.base + 1e-9 ? c : null;
      // Scotese 격자가 없는 절에는 PaleoClim 스냅숏(그 절 안의 나이)을 붙인다 — 육지만(tupandactyl 010)
      if (!f.climate) {
        var snap = (state.recentClimate || []).filter(function (p) { return p.age >= u.top && p.age <= u.base; })[0];
        if (snap) f.climate = Object.assign({ source_age: snap.age }, snap);
      }
      return f;
    });
    state.frames = state.frames.filter(function (f) { return f !== f0; }).concat(slices)
      .sort(function (a, b) { return b.age - a.age; });
    state.recent = slices.slice().sort(function (a, b) { return b.age - a.age; });
    renderRecent();
  }
  // 시점 막대 밑 "최근 5 Ma" 칩 — 절이 막대 끝 1 % 안에 몰려 밀대로는 고르기 어렵다
  function renderRecent() {
    var box = $("recent");
    if (!box || !state.recent) return;
    box.innerHTML = '<span class="recent-cap">' + tr("recent.cap") + "</span>";
    state.recent.forEach(function (f) {
      var u = unit(f.slice.unit), b = document.createElement("button");
      b.type = "button"; b.className = "rchip"; b.dataset.age = f.age;
      b.style.backgroundColor = u.color; b.style.color = ink(u.color);
      b.textContent = /^(전기|중기|후기)$/.test(u.ko) ? u.full : chipName(u);   // "후기" 만으로는 무엇의 후기인지 모른다
      b.title = u.full + (EN ? "" : " · " + (SCI ? u.kn : u.en)) + " · " + u.base + "–" + u.top + " Ma";
      b.addEventListener("click", function () { stopTour(); show(state.frames.indexOf(f)); });
      box.appendChild(b);
    });
  }
  function markRecent(f) {
    document.querySelectorAll("#recent .rchip").forEach(function (b) { b.classList.toggle("on", !!f.slice && +b.dataset.age === f.age); });
  }
  // 밀대는 나이로 움직인다 — 시점 간격이 고르지 않아서(최근의 절). 놓은 자리에서 가장 가까운 시점으로 간다
  var SLIDER_MAX = 1000;
  function sliderOf(age) { return Math.round((OLDEST - Math.min(OLDEST, age)) / OLDEST * SLIDER_MAX); }
  function frameAtSlider(v) {
    var age = OLDEST - v / SLIDER_MAX * OLDEST, best = 0;
    state.frames.forEach(function (f, j) { if (Math.abs(f.age - age) < Math.abs(state.frames[best].age - age)) best = j; });
    return best;
  }

  function show(i, opts) {
    opts = opts || {};
    state.i = Math.max(0, Math.min(state.frames.length - 1, i));
    state.focus = opts.focus || null;
    if (!opts.focus) $("chrono-note").textContent = "";
    var f = frame();
    $("slider").value = sliderOf(f.age);
    markRecent(f);
    renderHeader(f);
    renderChrono();
    renderEvents(f);
    writeHash(f);

    // 판 복원만 있는 시점(에디아카라기, 019)에는 해안선·기온이 없다 — 겹쳐 보기의 그 칸을 끈다(글로 적지 않는다)
    var plateOnly = f.grid === "plates";
    ["climate", "coast"].forEach(function (id) {
      $(id).disabled = plateOnly;
      $(id).closest("label").classList.toggle("off", plateOnly);
    });
    relief.setUrl(reliefUrl(f));
    noteRelief(f);
    noteTerrain(f);
    drawCoast(f);
    drawBorders(f, false);
    drawClimate(f);
    loadFossils(f);
    if (!opts.overview && state.overview) endOverview();      // 다른 시점으로 옮기면 그 시대의 산지로(tupandactyl 012)
    renderFindDist();
    state.taxonReady = state.taxon && !state.overview ? searchTaxon(state.taxon) : null;
    if (state.cmp) loadCmpFrame();                            // 비교 분류군도 이 시점으로(024)
    renderAnalysis();
    // 옆 시점의 배경과 산지 자료를 미리 받아 둔다 — 밀대를 한 칸 옮길 때 기다리지 않게(021)
    [state.i - 1, state.i + 1].forEach(function (j) {
      var g = state.frames[j];
      if (!g) return;
      var img = new Image(); img.src = reliefUrl(g);
      if (g.fossils && g.fossils.file) getJSON(dataUrl(g.fossils.file)).catch(function () { /* 그 시점에 가면 다시 묻는다 */ });
    });
  }

  // 옛 해안선은 새 것이 올 때까지 둔다 — 먼저 지우면 받는 동안 비어 깜박인다(021)
  function drawCoast(f) {
    var note = $("coast-note");
    if (!f.coastline) { coastLayer.clearLayers(); note.textContent = f.grid === "plates" ? "" : tr("coast.none"); return; }
    note.textContent = f.coastline.age === f.age
      ? "PaleoCoastlines " + fmtAge(f.coastline.age) + "."
      : tr("coast.nearest", { age: fmtAge(f.coastline.age) });
    var want = f.age;
    getJSON(dataUrl(f.coastline.file)).then(function (geo) {
      if (frame().age !== want) return;
      coastLayer.clearLayers();
      if ($("coast").checked) coastLayer.addData(seamGeo(geo));
    }).catch(function () { if (frame().age === want) coastLayer.clearLayers(); });
  }

  // ── 퇴적 환경 나무 ──────────────────────────────────────────────────
  function termKey(term) { return state.termTop.hasOwnProperty(term) ? term : UNLISTED; }

  function initEnvironments(tree) {
    state.tree = tree;
    var box = $("envtree");
    box.innerHTML = "";
    tree.forEach(function (top) {
      state.topColor[top.id] = top.color || UNKNOWN_COLOR;
      var topEl = node("top", top.id, top.id, top.ko, top.en, swatch(top.color), top.kn);
      // 처음에는 해양·육상·미상기원만 보이게 모두 접어 둔다(tupandactyl 002) — 전에는 환경군까지 펼쳐 두어
      // 패널이 길었다. ▸ 로 펼친다. 원 용어(셋째 단계)도 접어 둔다.
      var groupsEl = document.createElement("div");
      groupsEl.className = "kids";
      groupsEl.hidden = true;
      top.groups.forEach(function (g) {
        var terms = g.id === "o-unlisted" ? [UNLISTED] : g.terms.map(function (t) { return t.term; });
        terms.forEach(function (t) { state.termTop[t] = top.id; state.termGroup[t] = g.id; state.enabled[t] = true; });
        state.groupColor[g.id] = g.color || UNKNOWN_COLOR;
        var gEl = node("group", g.id, g.id, g.ko, g.en, swatch(g.color), g.kn);
        var termsEl = document.createElement("div");
        termsEl.className = "kids";
        termsEl.hidden = true;
        g.terms.forEach(function (t) {
          termsEl.appendChild(node("term", t.term, "term:" + t.term, t.ko, t.term, "", t.kn));
        });
        if (termsEl.children.length > 1) wireToggle(gEl, termsEl);
        gEl.appendChild(termsEl);
        groupsEl.appendChild(gEl);
      });
      wireToggle(topEl, groupsEl);
      topEl.appendChild(groupsEl);
      box.appendChild(topEl);
    });
    delete state.termTop[UNLISTED];
    box.addEventListener("change", function (e) {
      var input = e.target;
      if (!input.dataset.level) return;
      var on = input.checked;
      termsUnder(input.dataset.level, input.dataset.id).forEach(function (t) { state.enabled[t] = on; });
      syncChecks();
      if (state.taxon) computeDist();   // 산출 시대의 수도 고른 퇴적기원을 따른다(014)
      redraw();
    });
    syncChecks();
    applyLabels();
  }

  // 환경 칸의 색 견본 — 퇴적기원 색일 때만 보인다(시대 색일 때는 범례가 따로 뜬다).
  function swatch(color) {
    return '<i class="dot env-dot" style="background:' + esc(color || UNKNOWN_COLOR) + '"></i>';
  }

  // 한 칸: [펼침] [체크 · 한글 이름 · 원 용어(반투명)] [수]. 이름은 덮어쓰기 표를 거쳐 적는다.
  // tip: Scientific 모드에서 영문 이름에 마우스를 올리면 보이는 한글 이름
  function node(level, id, labelId, ko, original, prefix, tip) {
    var el = document.createElement("div");
    el.className = "env " + level;
    el.dataset.id = id;
    el.innerHTML = '<div class="row"><button type="button" class="tog" aria-label="' + tr("tog.open") + '" hidden>▸</button>' +
      '<label><input type="checkbox" data-level="' + level + '" data-id="' + esc(id) + '"> ' + prefix +
      ' <span class="name" data-label="' + esc(labelId) + '" data-default="' + esc(ko) + '"' + (SCI && tip && tip !== ko ? ' title="' + esc(tip) + '"' : "") + ">" + esc(ko) + "</span>" +
      (original && original !== ko ? ' <span class="orig">' + esc(original) + "</span>" : "") + "</label>" +
      '<small class="n" data-count="' + level + ":" + esc(id) + '"></small></div>';
    return el;
  }

  // ── 명칭 덮어쓰기 ───────────────────────────────────────────────────
  // 기본 이름은 index.json(파이프라인), 고친 이름은 서버의 덮어쓰기 표(/labels)에 있다. 화면에서 고치는 기능은
  // 명칭을 다 고쳐 껐다(tupandactyl 002) — 표가 남아 있으면 읽어서 입히기만 한다.
  function labelFor(id, fallback) {
    var name = state.labels.env[id];
    return name || fallback;
  }

  function applyLabels() {
    document.querySelectorAll("#envtree .name[data-label]").forEach(function (span) {
      var custom = state.labels.env[span.dataset.label];
      span.textContent = custom || span.dataset.default;
      span.classList.toggle("custom", !!custom);
      if (custom) span.title = "고친 이름 · 기본: " + span.dataset.default;   // 아니면 두어 Scientific 의 한글 이름(tip)을 지우지 않는다
    });
  }

  function loadLabels() {
    return fetch(LABELS_URL, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
      state.labels = { env: data.env || {} };
      applyLabels();
    }).catch(function () { /* 덮어쓰기가 없으면 기본 이름으로 그린다 */ });
  }

  function wireToggle(el, kids) {
    var tog = el.querySelector(".tog");
    var paint = function () {
      tog.textContent = kids.hidden ? "▸" : "▾";
      tog.setAttribute("aria-label", tr(kids.hidden ? "tog.open" : "tog.close"));
      tog.setAttribute("aria-expanded", String(!kids.hidden));
    };
    tog.hidden = false;
    paint();
    tog.addEventListener("click", function () { kids.hidden = !kids.hidden; paint(); });
  }

  function termsUnder(level, id) {
    var all = Object.keys(state.enabled);
    if (level === "term") return [id === "" ? "" : id];
    if (level === "group") return all.filter(function (t) { return state.termGroup[t] === id; });
    return all.filter(function (t) { return (t === UNLISTED ? "o" : state.termTop[t]) === id; });
  }

  // 위 칸의 체크는 아래 용어들로 정한다 — 모두 켜짐/모두 꺼짐/섞임(indeterminate).
  function syncChecks() {
    document.querySelectorAll("#envtree input[data-level]").forEach(function (input) {
      var terms = termsUnder(input.dataset.level, input.dataset.id);
      var on = terms.filter(function (t) { return state.enabled[t]; }).length;
      input.checked = on > 0 && on === terms.length;
      input.indeterminate = on > 0 && on < terms.length;
    });
  }

  // 환경 칸마다의 수. 평소에는 산지 수, 분류군을 찾는 동안에는 그 분류군의 산출 건수(weight = n_occs)다.
  // 꺼 둔 환경의 칸에도 수를 적는다 — 켜면 몇 건이 더해지는지 보이게.
  function syncCounts(rows, col, weight) {
    var counts = {};
    rows.forEach(function (row) {
      var t = termKey(row[col.environment]), n = weight ? weight(row) : 1;
      counts["term:" + t] = (counts["term:" + t] || 0) + n;
      var g = state.termGroup[t], top = t === UNLISTED ? "o" : state.termTop[t];
      counts["group:" + g] = (counts["group:" + g] || 0) + n;
      counts["top:" + top] = (counts["top:" + top] || 0) + n;
    });
    $("envtree").title = weight ? tr("env.count.occ", { taxon: state.taxon }) : tr("env.count.coll");
    document.querySelectorAll("#envtree [data-count]").forEach(function (el) {
      var n = counts[el.dataset.count] || 0;
      el.textContent = fmtNum(n);
      var row = el.closest(".env");
      row.classList.toggle("zero", n === 0);
      if (el.dataset.count === "group:o-unlisted") row.hidden = n === 0;
    });
  }

  // ── 화석 산지 ─────────────────────────────────────────────────────
  // 자료(state.payload)는 곧바로 비우지만 화면의 점은 새 자료가 올 때까지 둔다 — 먼저 지우면
  // 처음 가 보는 시점마다 받는 동안(사내망에서 0.1~0.3 초) 점이 사라져 깜박인다(021).
  // state.payload 를 남기지 않는 것은 분류군 찾기가 그것을 이 시점의 좌표로 믿고 쓰기 때문이다(017).
  // 최근의 절 시점은 0 Ma·5 Ma 지도의 산지를 합쳐 절의 창으로 거른다. 좌표는 그 절이 쓰는 지도(src)의 것을 먼저,
  // 그 지도에 없는 산지만 다른 지도의 것을 쓴다(5 Myr 안에서는 거의 같은 자리다)
  function slicePayload(f) {
    var srcs = [f.src].concat(f.slice.sources.filter(function (g) { return g !== f.src; }));
    return Promise.all(srcs.map(function (g) { return getJSON(dataUrl(g.fossils.file)); })).then(function (loaded) {
      var col = columns(loaded[0]), seen = {}, rows = [];
      loaded.forEach(function (p) {
        p.rows.forEach(function (row) {
          var no = row[col.collection_no];
          if (seen[no] || !inWin(f, row[col.max_ma], row[col.min_ma])) return;
          seen[no] = true;
          rows.push(row);
        });
      });
      return { age: f.age, fields: loaded[0].fields, rows: rows };
    });
  }
  function loadFossils(f) {
    $("fossil-count").textContent = "";
    state.payload = null;
    if (!f.slice && (!f.fossils || !f.fossils.file)) { fossilLayer.clearLayers(); return; }
    var want = f.age;
    (f.slice ? slicePayload(f) : getJSON(dataUrl(f.fossils.file))).then(function (payload) {
      if (frame().age !== want) return;
      state.payload = payload;
      var col = columns(payload);
      payload.byNo = {};
      payload.rows.forEach(function (row) { payload.byNo[row[col.collection_no]] = row; });
      drawFossils();
      // 찾은 분류군도 산지 자료의 좌표(이 시점 나이로 계산한 것, 017)로 옮기고, 같은 시대 다른 산지를 그린다
      if (state.taxon) drawTaxa();
    }).catch(function () { if (frame().age === want) fossilLayer.clearLayers(); });
  }

  // 점 하나. 테두리를 흰색으로 두어 푸른 바다 위 푸른 점, 짙은 땅 위 붉은 점도 보이게 한다.
  // 반투명하게 두어(기본 60%) 겹친 점과 그 밑의 해안선·지형이 함께 보이게 한다.
  // **모호한 연대**(절 단위로 정해지지 않은)는 **속이 찬 세모**로 — 색·채움·테두리는 점과 같고 모양만 다르다.
  // 015 의 고리는 채움이 없어 잘 안 보였다(연구자). 세모는 같은 크기의 원보다 조금 크게 그려 눈에 띄게 한다(016).
  function marker(latlng, color, big, vague) {
    var a = state.opacity;
    var options = {
      renderer: renderer, radius: big ? 4.6 : 3.4, weight: big ? 1.2 : 0.7,
      color: "#ffffff", opacity: Math.min(1, a + 0.15), fillColor: color, fillOpacity: a,
    };
    return vague ? new L.TriangleMarker(latlng, options) : L.circleMarker(latlng, options);
  }

  // 산지 행의 연대가 절 단위로 정해졌는가 — 가공물의 precise 칸, 없으면(옛 가공물) 시대 이름으로 가른다.
  function rowPrecise(row, col) {
    return col.precise != null ? !!row[col.precise] : isPrecise(row[col.early_interval], row[col.late_interval]);
  }

  function columns(payload) {
    var col = {};
    payload.fields.forEach(function (name, k) { col[name] = k; });
    return col;
  }

  // 분류군을 찾는 동안에는 그 결과만 그린다(drawTaxa). 산지 점은 찾기를 지우면 돌아온다.
  function drawFossils() {
    $("overview-btn").hidden = !(state.taxon || state.country || state.formation) || !!state.overview;
    if (state.overview) { drawOverview(); return; }
    var payload = state.payload;
    fossilLayer.clearLayers();
    if (!payload) return;
    var col = columns(payload);
    if (state.taxon) { $("fossil-count").textContent = tr("fossil.taxonOnly"); return; }   // 수는 drawTaxa 가 적는다
    // 환경 칸의 수 — 나라와 연대 거르기는 따르고 환경은 따르지 않는다(018 부터 연대 거르기도 따른다)
    var inCountry = payload.rows.filter(function (row) {
      return (!state.country || row[col.cc] === state.country) && ageOk(rowPrecise(row, col), row[col.max_ma], row[col.min_ma]);
    });
    syncCounts(inCountry, col);
    spanNote(payload.rows.filter(function (row) {
      return (!state.country || row[col.cc] === state.country) && tooWide(rowPrecise(row, col), row[col.max_ma], row[col.min_ma]);
    }).length, tr("what.coll"));
    var shown = 0, wide = 0;
    payload.rows.forEach(function (row) {
      var precise = rowPrecise(row, col);
      if (!passes(row[col.environment], row[col.cc], precise, row[col.max_ma], row[col.min_ma], row[col.formation])) return;
      shown += 1;
      if (!precise) wide += 1;
      marker([row[col.paleolat], row[col.paleolng]], pointColor(row[col.environment], row[col.max_ma], row[col.min_ma]),
             false, !precise)
        .on("click", function (e) { openCollection(e.latlng, row, col); })
        .addTo(fossilLayer);
    });
    $("fossil-count").textContent = (shown === payload.rows.length ? tr("fossil.all", { n: fmtNum(shown) })
      : tr("fossil.some", { n: fmtNum(shown), total: fmtNum(payload.rows.length) })) + (wide ? tr("fossil.vague", { n: fmtNum(wide) }) : "");
    renderLegend();
  }

  // ── 찾기의 종합 보기(tupandactyl 012) ─────────────────────────────────
  // 분류군이나 나라를 찾기 칸에서 고르면 먼저 홀로세(0 Ma) 지도에 그 분류군·나라의 **모든 시대 산지를 오늘날 자리**로 보인다 —
  // 어디서 나오는지 한눈에. 분류군이면 그 산지들이 든 범위로 지도를 옮긴다(나라는 나라 범위로, 전과 같다). 다른 시점으로 옮기면
  // 그 시대의 산지로 돌아가고, 화석 산지 절의 "모든 시대 보기" 로 다시 온다.
  // PBDB 에 바로 묻는다(colls/list — 그 분류군이 나온 산지, 나라의 산지). 0.25° 칸으로 묶어 그린다 — 나라 하나에 산지가 수만 곳이다.
  var OVERVIEW_STEP = 0.25, OVERVIEW_LIMIT = 100000, overviewSeq = 0;
  function startOverview() {
    stopTour();
    state.overview = { cells: null, total: 0, loading: true };
    app.classList.add("overview");
    var zero = state.frames.findIndex(function (f) { return f.age === 0; });
    show(zero < 0 ? state.i : zero, { overview: true });
    loadOverview(true);
  }
  function endOverview() {
    overviewSeq += 1;
    state.overview = null;
    app.classList.remove("overview");
  }
  function overviewUrl() {
    return PBDB + "colls/list.json?" + (state.taxon ? baseParam(state.taxon) + "&" : "") +
      (state.country ? "cc=" + encodeURIComponent(state.country) + "&" : "") +
      (state.formation ? "formation=" + encodeURIComponent(state.formation) + "&" : "") +
      "show=loc,geo,strat,lith&vocab=pbdb&limit=" + OVERVIEW_LIMIT;
  }
  function loadOverview(fit) {
    if (!state.overview) return;
    var seq = ++overviewSeq, ov = state.overview;
    ov.loading = true; ov.cells = null;
    drawFossils();
    getJSON(overviewUrl()).then(function (data) {
      if (seq !== overviewSeq || !state.overview) return;
      if (data.errors) throw new Error(data.errors.join(" "));
      var grid = {}, total = 0;
      (data.records || []).forEach(function (r) {
        var lng = +r.lng, lat = +r.lat, old = +r.max_ma, young = +r.min_ma;
        if (!isFinite(lng) || !isFinite(lat) || !isFinite(old) || !isFinite(young)) return;
        total += 1;
        var key = Math.floor((lng + 180) / OVERVIEW_STEP) + ":" + Math.floor((lat + 90) / OVERVIEW_STEP);
        var c = grid[key] || (grid[key] = { x: 0, y: 0, n: 0, env: {}, old: old, young: young, mids: [], recs: [] });
        c.recs.push(r);                                                     // 점을 누르면 이 칸의 산지 목록(openOverviewCell)
        var top = termKey(r.environment || "") === UNLISTED ? "o" : state.termTop[termKey(r.environment || "")];
        c.x += lng; c.y += lat; c.n += 1;
        c.env[top] = (c.env[top] || 0) + 1;
        c.old = Math.max(c.old, old); c.young = Math.min(c.young, young);
        c.mids.push((old + young) / 2);
      });
      ov.cells = Object.keys(grid).map(function (k) {
        var c = grid[k], m = c.mids.sort(function (a, b) { return a - b; });
        var env = Object.keys(c.env).sort(function (a, b) { return c.env[b] - c.env[a] || (a < b ? -1 : 1); })[0];
        return { lat: c.y / c.n, lng: c.x / c.n, n: c.n, env: env, old: c.old, young: c.young, mid: m[Math.floor(m.length / 2)],
          recs: c.recs.sort(function (a, b) { return +b.max_ma - +a.max_ma; }) };
      }).sort(function (a, b) { return b.n - a.n; });
      ov.total = total;
      ov.truncated = total >= OVERVIEW_LIMIT;
      ov.loading = false;
      drawFossils();
      // 패널에 절이 생기며 지도 크기가 바뀌면(invalidateSize) 날아가던 지도가 멈춘다 — 자리가 잡힌 뒤에 옮긴다
      if (fit && (state.taxon || state.formation) && !state.country) setTimeout(fitOverview, 350);
    }).catch(function (err) {
      if (seq !== overviewSeq || !state.overview) return;
      ov.loading = false; ov.error = String(err.message || err);
      drawFossils();
    });
  }
  // 분류군이 나온 범위로 — 산지의 95 %(수로 무게를 단 위도·경도의 2.5–97.5 % 사이)가 드는 상자에 맞춘다. 외딴 산지 한두 곳
  // 때문에 지구 전체로 물러나지 않게. 그래도 경도 폭이 300° 를 넘으면 지구 전체를 보인다
  function quantile(cells, key, q) {
    var list = cells.slice().sort(function (a, b) { return a[key] - b[key]; }), total = 0, acc = 0;
    list.forEach(function (c) { total += c.n; });
    for (var i = 0; i < list.length; i++) { acc += list[i].n; if (acc >= q * total) return list[i][key]; }
    return list[list.length - 1][key];
  }
  function fitOverview() {
    var cells = state.overview && state.overview.cells;
    if (!cells || !cells.length) return;
    var b = L.latLngBounds([quantile(cells, "lat", .025), quantile(cells, "lng", .025)], [quantile(cells, "lat", .975), quantile(cells, "lng", .975)]);
    if (state.proj === "globe") {
      var span = Math.max(b.getEast() - b.getWest(), (b.getNorth() - b.getSouth()) * 2);
      globe.setView({ lon: b.getCenter().lng, lat: b.getCenter().lat, alt: spanAlt(Math.max(span * 1.3, 8)) }, true);
      return;
    }
    if (b.getEast() - b.getWest() > 300) { map.flyTo(worldCenter(), worldZoom(), { duration: 0.6 }); return; }
    map.flyToBounds(b.pad(0.25), { maxZoom: 6, duration: 0.8 });
  }
  function drawOverview() {
    fossilLayer.clearLayers();
    taxonLayer.clearLayers();
    var ov = state.overview, what = [koTaxon(state.taxon, state.taxonRank), state.formation ? state.formation + " Fm." : "",
      state.country ? countryName(state.country) : ""].filter(Boolean).join(" · ");
    if (ov.loading) { $("fossil-count").textContent = tr("overview.loading"); setOverviewStatus(tr("overview.asking", { what: what })); return; }
    if (ov.error) { $("fossil-count").textContent = ""; setOverviewStatus(tr("taxon.fail", { err: ov.error })); return; }
    var on = {}, shown = 0, byTop = { m: 0, t: 0, o: 0 };
    ["m", "t", "o"].forEach(function (k) { on[k] = termsUnder("top", k).some(function (t) { return state.enabled[t]; }); });
    ov.cells.forEach(function (c) {
      byTop[c.env] = (byTop[c.env] || 0) + c.n;
      if (!on[c.env]) return;
      shown += c.n;
      var color = state.colorBy === "age" ? ((periodOf(c.mid, c.mid) || {}).color || UNKNOWN_COLOR) : state.topColor[c.env];
      var dot = L.circleMarker([c.lat, c.lng], {
        // 찾기 결과의 점(4.6)보다 작지 않게 — 세계 지도에서 한 곳짜리 칸도 보이도록(연구자: 처음엔 2.2 라 안 보였다). 테두리는 짙게
        renderer: renderer, radius: 4.6 + 2.6 * Math.log(c.n) / Math.LN10, weight: 1.4, color: "#2b1d10", opacity: .9,
        fillColor: color, fillOpacity: Math.max(.8, state.opacity),
      });
      dot.bindTooltip(function () { return overviewTip(c, dot); }, { className: "occ-tip", sticky: true, direction: "auto", opacity: 0.96 })
        .on("click", function (e) { L.DomEvent.stopPropagation(e); openOverviewCell(c); })
        .addTo(fossilLayer);
    });
    document.querySelectorAll("#envtree [data-count]").forEach(function (el) {
      var key = el.dataset.count, top = key.indexOf("top:") === 0 ? key.slice(4) : null;
      el.textContent = top ? fmtNum(byTop[top] || 0) : "";
      el.closest(".env").classList.toggle("zero", top ? !byTop[top] : false);
    });
    spanNote(0, tr("what.coll"));
    $("fossil-count").textContent = tr("overview.count", { n: fmtNum(shown) });
    setOverviewStatus(tr("overview.status", { what: what, n: fmtNum(ov.total) }) + (ov.truncated ? tr("overview.truncated", { n: fmtNum(OVERVIEW_LIMIT) }) : ""));
    renderLegend();
  }
  // 종합 보기의 점을 누르면 — 그 칸의 산지들(오래된 것부터). 한 곳이면 곧장 펼친다. 산지를 펼치면 PBDB 에 산출 목록을 묻고,
  // 분류군을 찾는 중이면 그 분류군에 드는 이름을 굵게 앞에 둔다(같은 산지를 base_name 으로 한 번 더 묻는다)
  var OVERVIEW_POP_MAX = 80;
  // 환경 원 용어가 든 나무의 자리 — 산지 팝업(openCollection)과 같은 "기원 › 환경군"
  function envPath(env) {
    var group = state.termGroup[termKey(env || "")], out = "";
    if (!group) return "";
    state.tree.forEach(function (top) {
      top.groups.forEach(function (g) { if (g.id === group) out = labelFor(top.id, top.ko) + " › " + labelFor(g.id, g.ko); });
    });
    return out;
  }
  function openOverviewCell(cell) {
    if (measure.on) return;
    var latlng = L.latLng(cell.lat, cell.lng), recs = cell.recs || [];
    var el = document.createElement("div");
    el.className = "pop ovpop";
    var head = recs.length === 1 ? esc(recs[0].collection_name || tr("pop.noname")) : tr("ovpop.title", { n: fmtNum(cell.n) });
    var html = "<h3>" + head + "</h3><small>" + tr("ovpop.where", { old: cell.old, young: cell.young }) + "</small>";
    html += '<div class="ovlist">' + recs.slice(0, OVERVIEW_POP_MAX).map(function (r, k) {
      var interval = intervalText(r.early_interval, r.late_interval);
      return '<details data-k="' + k + '"' + (recs.length === 1 ? " open" : "") + "><summary>" +
        (recs.length === 1 ? "" : "<b>" + esc(r.collection_name || tr("pop.noname")) + "</b> ") +
        "<small>" + esc(interval) + " · " + r.max_ma + "–" + r.min_ma + " Ma</small></summary><dl>" +
        (r.formation ? "<dt>" + tr("pop.formation") + "</dt><dd>" + esc(r.formation) + "</dd>" : "") +
        "<dt>" + tr("pop.env") + "</dt><dd>" + esc(r.environment || tr("pop.noenv")) +
          (envPath(r.environment) ? "<br><small>" + esc(envPath(r.environment)) + "</small>" : "") + "</dd>" +
        "<dt>" + tr("pop.lith") + "</dt><dd>" + lithHtml(r) + "</dd>" +
        (r.cc ? "<dt>" + tr("pop.country") + "</dt><dd>" + esc(countryName(r.cc)) + "</dd>" : "") +
        "<dt>" + tr("ovpop.now") + "</dt><dd>" + (+r.lat).toFixed(2) + "°, " + (+r.lng).toFixed(2) + "°</dd>" +
        '</dl><a href="' + PBDB_COLL_PAGE + r.collection_no + '" target="_blank" rel="noopener">' + tr("pop.link", { no: r.collection_no }) + "</a>" +
        '<div class="muted taxa-box">' + tr("pop.loading", { n: r.n_occs || "" }) + "</div></details>";
    }).join("") + "</div>" +
      (recs.length > OVERVIEW_POP_MAX ? '<p class="muted">' + tr("ovpop.more", { n: fmtNum(recs.length - OVERVIEW_POP_MAX) }) + "</p>" : "") +
      '<button type="button" class="tool ovzoom">' + tr("ovpop.zoom") + "</button>";
    el.innerHTML = html;
    bindTaxonLinks(el);
    var popup = state.proj === "globe" ? globe.popup(latlng, el)
      : L.popup(popupOptions(360))
        .setLatLng(latlng).setContent(el).openOn(map);
    var refresh = function () { if (popup.update) popup.update(); if (state.proj !== "globe") flipPopup(popup); };
    addGrips(el, refresh);
    if (state.proj !== "globe") refresh();
    function loadTaxa(d) {
      if (d.dataset.loaded) return;
      d.dataset.loaded = "1";
      var r = recs[+d.dataset.k], box = d.querySelector(".taxa-box"), no = r.collection_no;
      var all = getJSON(PBDB + "occs/list.json?coll_id=" + no + "&show=class&vocab=pbdb&limit=500");
      var hit = state.taxon ? getJSON(PBDB + "occs/list.json?coll_id=" + no + "&" + baseParam(state.taxon) + "&vocab=pbdb&limit=500")
        .catch(function () { return {}; }) : Promise.resolve({});
      Promise.all([all, hit]).then(function (res) {
        var mark = {};
        (res[1].records || []).forEach(function (x) { mark[x.occurrence_no] = true; });
        var items = (res[0].records || []).map(function (x) {
          var grp = [x.phylum, x["class"]].filter(function (v) { return v && v !== "NO_CLASS_SPECIFIED"; }).join(" · ");
          var name = taxonLink(x.accepted_name || x.identified_name, taxonHtml(x.accepted_name || x.identified_name, rankOf(x)));
          return { hit: !!mark[x.occurrence_no], html: "<li>" + (mark[x.occurrence_no] ? "<b>" + name + "</b>" : name) + (grp ? " <small>" + esc(grp) + "</small>" : "") + "</li>" };
        }).sort(function (a, b) { return b.hit - a.hit; });
        box.className = items.length ? "" : "muted";
        box.innerHTML = items.length ? '<ul class="taxa">' + items.map(function (x) { return x.html; }).join("") + "</ul>" +
          (items.length >= 500 ? '<p class="wide-note">' + tr("pop.truncated", { n: 500 }) + "</p>" : "") : tr("pop.none");
        refresh();
      }).catch(function () { box.textContent = tr("pop.fail"); refresh(); });
    }
    el.querySelectorAll("details").forEach(function (d) {
      d.addEventListener("toggle", function () { if (d.open) loadTaxa(d); refresh(); });
      if (d.open) loadTaxa(d);
    });
    el.querySelector(".ovzoom").addEventListener("click", function () {
      if (state.proj === "globe") { globe.setView({ lon: cell.lng, lat: cell.lat, alt: spanAlt(6) }, true); return; }
      map.closePopup();
      map.setView(latlng, Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 2, 5)));
    });
  }

  // 종합 보기의 점에 커서를 대면 — 시점을 옮겼을 때(taxonTip)와 같은 꼴에 시대 한 줄을 더한다. 칸은 거의 다 산지 한 곳이다.
  // 찾은 분류군의 산출은 colls/list 에 없어서, 커서를 댄 산지만 PBDB 에 묻고(occs/list?coll_id&base_name) 기억해 둔다
  var ovTipCache = {};
  function ovAge(r) {
    var interval = intervalText(r.early_interval, r.late_interval);
    return '<small class="tip-age">' + esc(interval) + " · " + r.max_ma + "–" + r.min_ma + " Ma</small>";
  }
  function overviewTip(cell, dot) {
    var recs = cell.recs || [];
    if (recs.length !== 1) {
      var shown = recs.slice(0, TIP_TAXA_MAX);
      return "<b>" + tr("ovpop.title", { n: fmtNum(cell.n) }) + "</b><ul>" + shown.map(function (r) {
        return "<li>" + esc(r.collection_name || tr("pop.noname")) + " " + ovAge(r) + "</li>";
      }).join("") + "</ul><small>" + tr("ovtip.more") + "</small>";
    }
    var r = recs[0], no = r.collection_no, age = ovAge(r);
    if (!state.taxon) {
      return "<b>" + esc(r.collection_name || tr("pop.noname")) + "</b>" + age + "<small>" + tr("ovtip.occs", { n: fmtNum(+r.n_occs || 0) }) + "</small>";
    }
    var key = state.taxon + "|" + no, got = ovTipCache[key];
    if (got && got.occs) {
      var row = { occs: got.occs };
      row[COLUMNS.collection_name] = r.collection_name;
      return taxonTip(row, age);
    }
    if (!got) {
      ovTipCache[key] = {};
      getJSON(PBDB + "occs/list.json?coll_id=" + no + "&" + baseParam(state.taxon) + "&vocab=pbdb&limit=500").then(function (data) {
        ovTipCache[key].occs = (data.records || []).map(function (o) {
          return { accepted: o.accepted_name || o.identified_name, identified: o.identified_name, rank: rankOf(o) };
        });
        if (dot.isTooltipOpen()) dot.setTooltipContent(overviewTip(cell, dot));
      }).catch(function () { delete ovTipCache[key]; });
    }
    return "<b>" + esc(r.collection_name || tr("pop.noname")) + "</b>" + age + '<small class="muted">' + tr("ovtip.loading") + "</small>";
  }

  function setOverviewStatus(text) {
    if (state.taxon) $("taxon-status").textContent = text;
    $("overview-note").textContent = text;
  }

  // ── 산지 팝업 ─────────────────────────────────────────────────────
  function openCollection(latlng, row, col) {
    if (measure.on) return;          // 거리를 재는 동안 누른 것은 점 찍기다(wetherilli 014)
    var no = row[col.collection_no];
    var interval = intervalText(row[col.early_interval], row[col.late_interval]);
    var env = row[col.environment];
    var group = state.termGroup[termKey(env)];
    var groupName = "";
    state.tree.forEach(function (top) {
      top.groups.forEach(function (g) {
        if (g.id === group) groupName = labelFor(top.id, top.ko) + " › " + labelFor(g.id, g.ko);
      });
    });
    var html = "<h3>" + esc(row[col.collection_name] || tr("pop.noname")) + "</h3><dl>" +
      "<dt>" + tr("pop.age") + "</dt><dd>" + esc(interval) + " (" + row[col.max_ma] + "–" + row[col.min_ma] + " Ma, " + tr("pop.range") + " " +
        +(row[col.max_ma] - row[col.min_ma]).toFixed(1) + " Myr)" +
        (rowPrecise(row, col) ? "" : '<br><small class="wide-note">' + tr("pop.vague") + "</small>") + "</dd>" +
      (row[col.formation] ? "<dt>" + tr("pop.formation") + "</dt><dd>" + esc(row[col.formation]) + "</dd>" : "") +
      "<dt>" + tr("pop.env") + "</dt><dd>" + esc(env || tr("pop.noenv")) + (groupName ? "<br><small>" + esc(groupName) + "</small>" : "") + "</dd>" +
      "<dt>" + tr("pop.lith") + '</dt><dd class="lith muted">' + tr("pop.lithLoading") + "</dd>" +
      "<dt>" + tr("pop.paleo") + '</dt><dd><button type="button" class="copy" data-copy="' + row[col.paleolat] + ", " + row[col.paleolng] +
        '" title="' + tr("copy.title") + '">' + row[col.paleolat] + "°, " + row[col.paleolng] + "°</button><br><small>" +
        (col.rotated != null && row[col.rotated]
          ? tr("pop.rotated", { age: fmtAge(frame().age) })
          : tr("pop.pbdb")) + "</small></dd>" +
      (row[col.cc] ? "<dt>" + tr("pop.country") + "</dt><dd>" + esc(countryName(row[col.cc])) + "</dd>" : "") +
      (row.matched ? "<dt>" + tr("pop.matched") + "</dt><dd><i>" + row.matched.map(esc).join("</i>, <i>") + "</i></dd>" : "") +
      '</dl><a href="' + PBDB_COLL_PAGE + no + '" target="_blank" rel="noopener">' + tr("pop.link", { no: no }) + "</a>" +
      '<div class="muted taxa-box">' + tr("pop.loading", { n: row[col.n_occs] }) + "</div>";
    // 내용을 문자열이 아니라 요소로 준다. 문자열이면 popup.update() 가 처음 문자열로 다시
    // 그려, 받아 온 산출 목록이 "읽는 중…" 으로 되돌아간다.
    var el = document.createElement("div");
    el.className = "pop";
    el.innerHTML = html;
    var box = el.querySelector(".taxa-box");
    el.querySelector(".copy").addEventListener("click", function () { copyCoords(this); });
    bindTaxonLinks(el);
    // 팝업이 화면 가장자리·온도계·찾기 카드·도구 묶음에 가리지 않게 지도를 옮겨 띄운다(autoPan 의 여백)
    var popup = state.proj === "globe" ? globe.popup(latlng, el)
      : L.popup(popupOptions(340))
        .setLatLng(latlng).setContent(el).openOn(map);
    if (popup.update && state.proj !== "globe") {
      // 지도 위쪽의 산지는 지도를 더 내릴 수 없어(옮기는 폭의 끝) 팝업이 창 위로 잘렸다 — 그때는 점 **아래로** 편다
      var baseUpdate = popup.update.bind(popup);
      popup.update = function () { baseUpdate(); flipPopup(popup); };
      flipPopup(popup);
    }
    addGrips(el, function () { if (popup.update) popup.update(); });
    // 그때 그 자리의 지표 기온 — 기온 층을 켜지 않아도 적는다.
    var f = frame();
    if (f.climate) {
      loadGrid(f.climate).then(function (grid) {
        var dl = el.querySelector("dl"), tv = tempAt(grid, Number(row[col.paleolat]), Number(row[col.paleolng]));
        if (tv !== tv) return;                                  // 자료 없는 칸(PaleoClim 의 바다)
        dl.insertAdjacentHTML("beforeend", "<dt>" + tr("pop.temp") + "</dt><dd>" +
          tv.toFixed(0) +
          (EN ? " °C" : " ℃") + " <small>(" + tr("pop.tempsrc", { age: fmtAge(f.climate.source_age) }) + ")</small></dd>");
        popup.update();
      });
    }
    // 암상(lithology) — PBDB 산지의 주 암상 둘(lithology1·2)과 그 형용·부 암상. PBDB 의 원 용어 그대로(tupandactyl 012)
    getJSON(PBDB + "colls/single.json?id=" + no + "&show=lith&vocab=pbdb").then(function (data) {
      var r = (data.records || [])[0] || {}, cell = el.querySelector(".lith");
      cell.className = "lith";
      cell.innerHTML = lithHtml(r);
      popup.update();
    }).catch(function () { var cell = el.querySelector(".lith"); cell.textContent = tr("pop.noLith"); });
    getJSON(PBDB + "occs/list.json?coll_id=" + no + "&show=class&vocab=pbdb&limit=500").then(function (data) {
      var items = (data.records || []).map(function (r) {
        var grp = [r.phylum, r["class"]].filter(function (x) { return x && x !== "NO_CLASS_SPECIFIED"; }).join(" · ");
        var nm = r.accepted_name || r.identified_name;
        return "<li>" + taxonLink(nm, taxonHtml(nm, rankOf(r))) + (grp ? " <small>" + esc(grp) + "</small>" : "") + "</li>";
      });
      box.className = items.length ? "" : "muted";
      box.innerHTML = items.length ? '<ul class="taxa">' + items.join("") + "</ul>" +
        (items.length >= 500 ? '<p class="wide-note">' + tr("pop.truncated", { n: 500 }) + "</p>" : "") : tr("pop.none");
      popup.update();
    }).catch(function () { box.textContent = tr("pop.fail"); });
  }

  // 산지 팝업의 세로 길이를 마우스로 — 위·아래 가장자리를 잡고 끈다(연구자, tupandactyl 022). 위는 위로, 아래는 아래로 끌면 길어진다.
  // 늘리는 것은 목록(산출 목록·칸의 산지 목록)의 높이다(--pop-grow). 고른 길이는 이 브라우저가 기억해 다음 팝업에도 쓴다
  var POP_GROW_KEY = "wegener.popGrow", POP_GROW_MIN = -120, POP_GROW_MAX = 900;
  var popGrow = 0;
  try { popGrow = Math.max(POP_GROW_MIN, Math.min(POP_GROW_MAX, +localStorage.getItem(POP_GROW_KEY) || 0)); } catch (e) {}
  function addGrips(el, relayout) {
    el.style.setProperty("--pop-grow", popGrow + "px");
    ["top", "bottom"].forEach(function (side) {
      var grip = document.createElement("div");
      grip.className = "pop-grip " + side;
      grip.title = tr("pop.grip");
      grip.setAttribute("aria-hidden", "true");
      if (side === "top") el.insertBefore(grip, el.firstChild); else el.appendChild(grip);
      grip.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var y0 = e.clientY, g0 = popGrow, sign = side === "top" ? -1 : 1, frame = 0;
        el.classList.add("resizing");
        el.dataset.lock = "1";                                     // 끄는 동안·끈 뒤에는 점의 위·아래를 뒤집지 않는다
        // 창에 건다 — Leaflet 의 popup.update() 가 내용을 다시 붙이며 손잡이의 포인터 잡기(capture)를 놓는다
        var move = function (ev) {
          var want = Math.max(POP_GROW_MIN, Math.min(POP_GROW_MAX, g0 + sign * (ev.clientY - y0)));
          if (want > popGrow && overflows()) return;                // 지도 밖으로 나가 잘리면 더 늘리지 않는다
          popGrow = want;
          el.style.setProperty("--pop-grow", popGrow + "px");
          if (!frame) frame = requestAnimationFrame(function () { frame = 0; relayout(); markCovered(); });
        };
        var overflows = function () {
          var node = el.closest(".leaflet-popup, .globe-pop") || el, r = node.getBoundingClientRect(), m = $("map").getBoundingClientRect();
          return r.top < m.top + 4 || r.bottom > m.bottom - 4;
        };
        var up = function () {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          el.classList.remove("resizing");
          relayout();
          try { localStorage.setItem(POP_GROW_KEY, String(Math.round(popGrow))); } catch (err) {}
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    });
  }

  // ── 휴대폰의 팝업(koprifossillab 036) ─────────────────────────────
  // 좁은 창(760 px 아래)에서는 팝업이 창 폭·높이 안에 들고(map.css), 크기는 두 손가락으로 벌리고 좁혀 고른다(--pop-scale,
  // 이 브라우저가 기억한다). 넓은 창은 그대로 — 마우스로 위·아래 가장자리를 끈다(addGrips)
  var narrowPop = window.matchMedia ? window.matchMedia("(max-width: 760px)") : { matches: false };
  var POP_SCALE_KEY = "wegener.popScale", POP_SCALE_MIN = .75, POP_SCALE_MAX = 1.7;
  var popScale = 1;
  try { popScale = Math.max(POP_SCALE_MIN, Math.min(POP_SCALE_MAX, +localStorage.getItem(POP_SCALE_KEY) || 1)); } catch (e) {}
  $("map").style.setProperty("--pop-scale", popScale);
  function popupWidth(base) {
    return narrowPop.matches ? Math.round(Math.min(window.innerWidth - 36, 270 * popScale)) : base;
  }
  // 팝업이 화면 가장자리·온도계·찾기 카드·도구 묶음에 가리지 않게 지도를 옮겨 띄운다(autoPan 의 여백). 좁은 창은 위에 찾기 카드,
  // 밑에 패널 막대만 비키면 된다
  function popupOptions(maxWidth) {
    return narrowPop.matches
      ? { maxWidth: popupWidth(maxWidth), autoPan: true, autoPanPaddingTopLeft: L.point(10, 70), autoPanPaddingBottomRight: L.point(10, 56) }
      : { maxWidth: maxWidth, autoPan: true, autoPanPaddingTopLeft: L.point(24, 150), autoPanPaddingBottomRight: L.point(96, 48) };
  }

  // 팝업 안의 손가락(좁은 창이든 아니든 터치일 때만) — Leaflet 은 팝업 안의 누르기를 지도로 넘기지 않고, 지도 칸은 브라우저의 터치
  // 동작을 모두 끈다(touch-action: none). 그래서 팝업을 문질러도 목록이 안 밀리고 지도도 안 움직였다(연구자). 여기서 직접 처리한다 —
  // 한 손가락은 손가락 밑의 스크롤 칸을 먼저 밀고, 끝에 닿아 남은 만큼과 가로로 민 만큼은 지도를 옮긴다(지구본에서는 스크롤만).
  // 두 손가락은 팝업 크기. 6 px 안쪽에서 뗀 것은 그대로 누르기(이름·링크·펼치기)다
  (function popupTouch() {
    var pts = {}, gesture = null;
    function wrapperOf(t) { return t && t.closest && t.closest(".leaflet-popup-content-wrapper"); }
    function scrollerFor(el, stop, dy) {
      for (; el && el !== stop.parentNode; el = el.parentNode) {
        if (el.nodeType !== 1) continue;
        var oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          if (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return el;   // 위로 밀면 아래 내용
          if (dy > 0 && el.scrollTop > 0) return el;
        }
      }
      return null;
    }
    function distance() {
      var k = Object.keys(pts);
      return k.length < 2 ? 0 : Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y);
    }
    var frame = 0;
    function relayout() {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        var p = map._popup;
        if (p && p.isOpen && p.isOpen()) { p.options.maxWidth = popupWidth(p.options.maxWidth); p.update(); }
        markCovered();
      });
    }
    var box = $("map");
    box.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") return;
      var w = wrapperOf(e.target);
      if (!w) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, target: e.target, wrap: w };
      var n = Object.keys(pts).length;
      if (n === 2) gesture = { kind: "pinch", d0: distance(), s0: popScale };
      else if (n === 1) gesture = { kind: "tap" };
    }, true);
    box.addEventListener("pointermove", function (e) {
      var p = pts[e.pointerId];
      if (!p || !gesture) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (gesture.kind === "pinch") {
        var d = distance();
        if (gesture.d0 > 0 && d > 0) {
          popScale = Math.max(POP_SCALE_MIN, Math.min(POP_SCALE_MAX, gesture.s0 * d / gesture.d0));
          box.style.setProperty("--pop-scale", popScale.toFixed(3));
          relayout();
        }
        e.preventDefault();
        return;
      }
      if (gesture.kind === "tap") {
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) return;
        gesture.kind = "drag";
      }
      e.preventDefault();
      var sc = dy ? scrollerFor(p.target, p.wrap, dy) : null, rest = dy;
      if (sc) {
        var before = sc.scrollTop;
        sc.scrollTop = before - dy;
        rest = dy + (sc.scrollTop - before);                      // 끝에 닿아 못 민 만큼
      }
      if (state.proj !== "globe" && (dx || rest)) map.panBy([-dx, -rest], { animate: false });
    }, { capture: true, passive: false });
    function up(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      if (gesture && gesture.kind === "pinch" && !Object.keys(pts).length) {
        try { localStorage.setItem(POP_SCALE_KEY, popScale.toFixed(3)); } catch (err) {}
      }
      if (gesture && gesture.kind !== "tap") {
        // 문지르거나 벌린 뒤의 click 은 누르기가 아니다 — 한 번만 삼킨다
        var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(function () { window.removeEventListener("click", swallow, true); }, 400);
      }
      if (!Object.keys(pts).length) gesture = null;
      else if (gesture && gesture.kind === "pinch") gesture = { kind: "drag" };   // 한 손가락만 남으면 이어서 문지르기
    }
    box.addEventListener("pointerup", up, true);
    box.addEventListener("pointercancel", up, true);
  })();

  // 팝업과 겹친 지도 위 카드를 흐리게(tupandactyl 022) — 팝업은 지도 층 안이라 카드 위로 올릴 수 없다. 겹친 카드는 마우스도 통과시킨다
  function markCovered() {
    var pop = document.querySelector("#map .leaflet-popup"), box = pop && pop.getBoundingClientRect();
    [$("findfloat"), $("thermo"), document.querySelector(".maptools"), document.querySelector(".scalebar")].forEach(function (card) {
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.classList.toggle("behind-popup", !!box && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top);
    });
  }
  map.on("popupopen popupclose moveend zoomend", function () { setTimeout(markCovered, 0); });

  function flipPopup(popup) {
    var node = popup.getElement && popup.getElement();
    if (!node) return;
    if (node.querySelector(".pop[data-lock]")) { setTimeout(markCovered, 0); return; }   // 길이를 바꾼 팝업은 위·아래를 바꾸지 않는다
    var top = map.getContainer().getBoundingClientRect().top;
    if (node.classList.contains("below")) { node.classList.remove("below"); popup.options.offset = L.point(0, 7); popup._updatePosition(); }
    setTimeout(markCovered, 0);
    if (node.getBoundingClientRect().top >= top + 8) return;
    popup.options.offset = L.point(0, node.offsetHeight + 22);
    node.classList.add("below");
    popup._updatePosition();
  }

  // 암상 — PBDB 산지의 주 암상 둘(lithology1·2)과 그 형용·굳기·부 암상. 원 용어 그대로(tupandactyl 012)
  function lithHtml(r) {
    var parts = [], clean = function (v) { return String(v || "").replace(/"/g, "").trim(); };
    var lith = KO && state.lith, term = function (t) { return lith && lith.terms[t] || t; };
    var adjKo = function (list) {                                 // 형용은 쉼표로 여럿 — 하나씩 옮긴다
      return list.map(function (v) { return v.split(",").map(function (a) { a = a.trim(); return lith && lith.adjectives[a] || a; }).join(", "); });
    };
    [1, 2].forEach(function (k) {
      var main = clean(r["lithology" + k]);
      if (!main) return;
      var adj = adjKo([r["lithadj" + k], r["lithification" + k], r["minor_lithology" + k]].map(clean).filter(Boolean));
      parts.push((lith ? '<span title="' + esc(main) + '">' + esc(term(main)) + "</span>" : esc(main)) +
        (adj.length ? " <small>(" + esc(adj.join(", ")) + ")</small>" : ""));
    });
    return parts.length ? parts.join("<br>") : '<span class="muted">' + tr("pop.noLith") + "</span>";
  }

  // 학명 — Casual 이면 속·종(아속·아종)을 한글로 음차하고 학명은 커서를 대면. 그 위 계급(과·목 …)은 학명 그대로(연구자, 020)
  var LOW_RANK = { species: 1, subspecies: 1, genus: 1, subgenus: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
  // 산출 기록의 계급 — PBDB 분류 기준표에 없는 이름은 채택 계급이 없고 동정 계급만 있다(Cenomanian·미국 표본 3,000 건 중 52 건). 그것도
  // 없으면 이름 꼴로("속 종" 두 낱말이면 종). 그래서 Casual 에서 한글로 바뀌지 않는 학명이 있었다(연구자, tupandactyl 027)
  function rankOf(r) { return r.accepted_rank || r.identified_rank || guessRank(r.accepted_name || r.identified_name); }
  function guessRank(n) { return /^[A-Z][a-z]+( \([A-Z][a-z]+\))?( \?)? [a-z][a-z-]+/.test(plainName(n)) ? "species" : ""; }
  function koTaxon(name, rank) {
    name = plainName(name);
    if (!rank) rank = guessRank(name);
    return KO && name && LOW_RANK[rank] && window.WegenerKo ? window.WegenerKo.name(name) : name;
  }
  // 같은 이름의 다른 분류군(동명, 예: Tardigrada — 완보동물문과 나무늘보 무리, tupandactyl 026). 고른 것은 "이름#PBDB 번호" 로 들고
  // 다니며, PBDB 에는 이름 대신 번호로 묻는다(base_id·id). 화면에는 이름만(plainName)
  // 동명을 골랐으면 딱지에 상위 분류 한 마디(완보동물이면 Panarthropoda, 나무늘보면 Xenarthra)
  function markHomonym(name) {
    var chip = $("taxon-chip-name"), old = chip.parentNode.querySelector(".homonym-of");
    if (old) old.remove();
    var id = taxonIdOf(name);
    if (!id) return;
    homonyms(name).then(function (list) {
      var h = list.filter(function (x) { return String(x.id) === id; })[0];
      if (!h || state.taxon !== name || chip.parentNode.querySelector(".homonym-of")) return;
      var tag = document.createElement("small");
      tag.className = "homonym-of";
      tag.textContent = (h.group || h.rank).split(" · ").pop();
      tag.title = h.group;
      chip.insertAdjacentElement("afterend", tag);
    });
  }
  function idLabel(n) { return plainName(n) + (taxonIdOf(n) ? " [txn:" + taxonIdOf(n) + "]" : ""); }
  function plainName(n) { return String(n || "").replace(/#\d+$/, ""); }
  function taxonIdOf(n) { var m = /#(\d+)$/.exec(n || ""); return m ? m[1] : null; }
  function baseParam(n) { var id = taxonIdOf(n); return id ? "base_id=txn:" + id : "base_name=" + encodeURIComponent(n); }
  function singleParam(n) { var id = taxonIdOf(n); return id ? "id=txn:" + id : "name=" + encodeURIComponent(n); }
  // 이름 하나에 PBDB 분류군이 여럿인가 — 여럿이면 [{name, id, rank, occs, group}] (산출이 많은 것부터). 묻지 못하면 빈 목록
  var homonymCache = {};
  function homonyms(name) {
    name = plainName(name);
    if (homonymCache[name]) return homonymCache[name];
    // name= 은 하나만 준다 — match_name 이 같은 이름의 분류군을 모두 준다(orig_no 로 묶는다)
    homonymCache[name] = getJSON(PBDB + "taxa/list.json?match_name=" + encodeURIComponent(name) + "&show=class,parent&vocab=pbdb").then(function (d) {
      var groups = {};
      (d.records || []).forEach(function (r) {
        if (r.taxon_name !== name) return;
        var key = r.orig_no || r.taxon_no, g = groups[key];
        var lineage = [r.phylum, r["class"], r.order].filter(function (x) { return x && x !== name && !/^NO_/.test(x); });
        if (!g) {                                                  // PBDB 가 먼저 주는 이름표(지금의 계급)를 대표로
          groups[key] = { name: name, id: key, rk: r.taxon_rank, rank: RANK_KO[r.taxon_rank] || r.taxon_rank || "", occs: +r.n_occs || 0,
                          group: lineage.join(" · ") || r.parent_name || "" };
        }
      });
      return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.occs - a.occs; });
    }).catch(function () { return []; });
    return homonymCache[name];
  }
  function taxonHtml(name, rank) {
    var k = koTaxon(name, rank);
    return k === name ? "<i>" + esc(name) + "</i>" : '<span class="ko-taxon" title="' + esc(name) + '">' + esc(k) + "</span>";
  }
  // 연대 이름 — Casual 이면 층서표의 한글 이름으로(절·세·기). "Early Cenomanian" 같은 아절은 "전기 세노마눔절"(연구자). 지역 시대 이름은 그대로
  var QUAL_KO = { Early: "전기", Middle: "중기", Late: "후기" };
  function koInterval(name) {
    if (!KO || !name) return name || "";
    if (!state.unitByEn) {
      state.unitByEn = {};
      Object.keys(state.units).forEach(function (id) { var u = state.units[id]; if (u.en) state.unitByEn[u.en] = u; });
    }
    var u = state.unitByEn[name];
    if (u) return u.full;
    var m = /^(Early|Middle|Late) (.+)$/.exec(name);
    if (m && state.unitByEn[m[2]]) return QUAL_KO[m[1]] + " " + state.unitByEn[m[2]].full;
    return name;
  }
  function intervalText(early, late) { return koInterval(early) + (late ? " – " + koInterval(late) : ""); }

  // 팝업의 산출 이름을 누르면 그 분류군으로 찾는다(종합 보기부터) — 같은 산지의 다른 화석이 어디서 나오는지 바로 본다(tupandactyl 015)
  function taxonLink(name, inner) {
    return '<button type="button" class="taxon-link" data-taxon="' + esc(name) + '" title="' + esc(tr("pop.searchTaxon", { name: name })) + '">' + inner + "</button>";
  }
  function bindTaxonLinks(el) {
    el.addEventListener("click", function (e) {
      var b = e.target.closest(".taxon-link");
      if (!b) return;
      e.preventDefault();
      if (state.proj === "globe") globe.closePopup && globe.closePopup(); else map.closePopup();
      stopTour();
      searchTaxon(b.dataset.taxon, true);
    });
  }

  // 좌표를 눌러 복사한다(wetherilli 006). 운영은 http 라 navigator.clipboard 가 없다(보안 맥락에서만 열린다) —
  // 그때는 숨긴 textarea 와 execCommand("copy") 로 한다(GSM 과 같은 길).
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* 막힌 브라우저 */ }
      ta.remove();
      if (ok) resolve(); else reject(new Error("copy"));
    });
  }
  function copyCoords(button) {
    copyText(button.dataset.copy).then(function () { return tr("copy.done"); }, function () { return tr("copy.fail"); }).then(function (said) {
      button.dataset.flash = said;
      button.classList.add("flash");
      clearTimeout(button._flash);
      button._flash = setTimeout(function () { button.classList.remove("flash"); }, 900);
    });
  }

  // ── 분류군 찾기 ─────────────────────────────────────────────────────
  // 산지 점과 같은 규칙으로 거른다(pipeline/common.py 의 belongs): 연대 범위가 시점
  // ±2.5 Myr 창과 겹치면. PBDB 의 overlap 도 같은 뜻이다. 모호한 연대는 세모로 그린다(016).
  var COLUMNS = { collection_no: 0, paleolng: 1, paleolat: 2, env: 3, n_occs: 4, collection_name: 5,
                  early_interval: 6, late_interval: 7, max_ma: 8, min_ma: 9, formation: 10, environment: 11, cc: 12,
                  precise: 13, rotated: 14 };
  var taxonSeq = 0;
  // 커서를 댔을 때 — 계급과 상관없이, 이 산지에서 찾은 분류군 아래의 분류군(채택명)이 TIP_TAXA_MAX 종보다
  // 적으면 목록을, 그 이상이면 "산출 n종 — 누르면 목록" 한 줄만 띄운다(tupandactyl 001). 전에는 계급(과 이하)으로
  // 갈랐지만(006), 목 이상이어도 한 산지에 한두 종뿐인 일이 많고 속이어도 수십 종인 산지가 있다.
  var TIP_TAXA_MAX = 5;

  function lookupRank(name) {
    return getJSON(PBDB + "taxa/single.json?" + singleParam(name) + "&vocab=pbdb")
      .then(function (d) { var r = (d.records || [])[0]; return r ? r.taxon_rank || "" : ""; })
      .catch(function () { return ""; });
  }

  function taxonTip(row, extra) {
    var head = "<b>" + esc(row[COLUMNS.collection_name] || tr("pop.noname")) + "</b>" + (extra || "");
    var taxa = {};
    row.occs.forEach(function (o) { taxa[o.accepted] = 1; });
    var n = Object.keys(taxa).length;
    if (n >= TIP_TAXA_MAX) {
      return head + "<small>" + tr("tip.count", { taxon: esc(plainName(state.taxon)), n: n }) + "</small>";
    }
    // 같은 이름(채택명·원 동정명)의 산출은 한 줄로 묶고 건수를 붙인다 — 한 종이 수십 건인 산지가 있다.
    var lines = [], byKey = {};
    row.occs.forEach(function (o) {
      var key = o.accepted + "\u0000" + (o.identified || "");
      if (byKey[key]) { byKey[key].n += 1; return; }
      lines.push(byKey[key] = { o: o, n: 1 });
    });
    return head + "<ul>" + lines.map(function (l) {
      var o = l.o, shown = taxonHtml(o.accepted, o.rank);
      if (o.identified && o.identified !== o.accepted) shown += " <small>(" + esc(koTaxon(o.identified, o.rank)) + ")</small>";
      return "<li>" + shown + (o.rank && o.rank !== "species" ? " <small>" + esc(RANK_KO[o.rank] || o.rank) + "</small>" : "") +
        (l.n > 1 ? " <small>" + tr("tip.times", { n: l.n }) + "</small>" : "") + "</li>";
    }).join("") + "</ul>";
  }

  // ── 산출 시대 분포 ──────────────────────────────────────────────────
  // PBDB occs/diversity 가 절(stage)마다 산출 수(noc)를 한 번에 준다 — 삼엽충처럼 산출이 5만 건인
  // 분류군도 응답이 수 KB 다. 이것으로 (1) 산출이 있는 기를 아이콘으로 (2) 층서표 칩에 수를
  // (3) 시점 막대 밑에 시점별 산출 막대를 그리고 (4) 차례로 보기(011)의 시점 목록을 만든다.
  // PBDB 의 절 경계는 ICS 2024 와 조금 달라서, 절을 가운데 나이로 우리 단위에 넣는다.
  //
  // 퇴적기원으로 거르면 수도 따라가야 한다(014). diversity 는 우리 환경군으로 거를 수 없으므로, 산출이
  // OCC_LIMIT 건 이하인 분류군은 **산출 기록 자체(나이·환경)** 를 한 번 받아 두고 브라우저에서 센다 —
  // 그러면 지도와 같은 규칙(창과 겹침, 모호한 연대는 걸친 모든 시점)으로 셀 수 있다. 그보다 많은 분류군(삼엽충 4.5 만)은
  // 절 단위 수를 그대로 쓰고 퇴적기원이 수에 반영되지 않는다고 적는다.
  var OCC_LIMIT = 5000;

  // 분류군 하나의 시간 계열(tupandactyl 024) — 절마다 산출 수와 속 수(PBDB occs/diversity: 범위 통과 = X_Ft+X_bL+X_FL+X_bt,
  // 절 안 산출 = sampled_in_bin), 그리고 산출이 OCC_LIMIT 건 이하이면 산출 하나하나(나이·환경·PBDB 고위도). 찾은 분류군(A)의
  // 분포와 비교 분류군(B)이 같은 함수로 받는다
  function fetchSeries(name, withApp) {
    var key = name + "|" + (state.country || "") + "|" + (state.formation || "");
    var cc = (state.country ? "&cc=" + encodeURIComponent(state.country) : "") + stratParam();
    return Promise.all([
      getJSON(PBDB + "occs/diversity.json?" + baseParam(name) + cc + "&count=genera&time_reso=stage&vocab=pbdb"),
      withApp ? getJSON(PBDB + "taxa/single.json?" + singleParam(name) + "&show=app&vocab=pbdb").catch(function () { return {}; }) : Promise.resolve({}),
    ]).then(function (both) {
      var stages = (both[0].records || []).filter(function (r) { return +r.n_occs > 0; }).map(function (r) {
        return { name: r.interval_name, base: +r.max_ma, top: +r.min_ma, n: +r.n_occs,
                 rt: (+r.X_Ft || 0) + (+r.X_bL || 0) + (+r.X_FL || 0) + (+r.X_bt || 0), g: +r.sampled_in_bin || 0 };
      });
      var base = { key: key, name: name, stages: stages, app: (both[1].records || [])[0] || null, occs: null,
                   stageTotal: stages.reduce(function (a, s) { return a + s.n; }, 0) };
      if (base.stageTotal > OCC_LIMIT) return base;
      return getJSON(PBDB + "occs/list.json?" + baseParam(name) + cc +
                     "&show=env,paleoloc&pgm=scotese&vocab=pbdb&limit=" + (OCC_LIMIT + 1)).then(function (d) {
        var recs = d.records || [];
        if (recs.length <= OCC_LIMIT) {
          base.occs = recs.map(function (r) {
            return { old: +r.max_ma, young: +r.min_ma, env: r.environment || "", early: r.early_interval, late: r.late_interval,
                     plat: r.paleolat == null || r.paleolat === "" ? null : +r.paleolat };
          });
        }
        return base;
      }).catch(function () { return base; });
    });
  }

  function loadDistribution(name) {
    var key = name + "|" + (state.country || "") + "|" + (state.formation || "");
    if (state.dist && state.dist.key === key) return Promise.resolve(state.dist);
    return fetchSeries(name, true).then(function (base) {
      if (state.taxon !== name) return null;
      return base;
    }).then(function (base) {
      if (!base || state.taxon !== name) return null;
      state.distBase = base;
      computeDist();
      if ($("coeval").checked) drawTaxa();     // "같은 시대" 구간은 절 분포로 잡는다
      return state.dist;
    }).catch(function () { state.dist = null; state.distBase = null; renderDist(); return null; });
  }

  // 받아 둔 것으로 분포를 센다. 퇴적기원 선택을 바꿀 때마다 다시 부른다(PBDB 에 다시 묻지 않는다).
  function computeDist() {
    var base = state.distBase;
    if (!base) { state.dist = null; renderDist(); renderChrono(); return; }
    var units = {}, frames = {}, total = 0;
    var addUnits = function (mid, n) {
      Object.keys(state.units).forEach(function (id) {
        var u = state.units[id];
        if (mid > u.top && mid <= u.base) units[id] = (units[id] || 0) + n;
      });
    };
    if (base.occs) {
      // 산출 하나하나 — 켠 환경만, 지도와 같은 규칙으로. 모호한 연대는(보이기로 했으면) 걸친 모든 단위·시점에
      // 더한다(015) — 지도에 그 모든 시점에서 보이는 것과 맞춘다.
      base.occs.forEach(function (o) {
        if (!state.enabled[termKey(o.env)]) return;
        var precise = isPrecise(o.early, o.late);
        if (!ageOk(precise, o.old, o.young)) return;
        total += 1;
        if (precise) addUnits((o.old + o.young) / 2, 1);
        else Object.keys(state.units).forEach(function (id) {
          var u = state.units[id];
          if (o.old > u.top && o.young < u.base) units[id] = (units[id] || 0) + 1;
        });
        state.frames.forEach(function (f, j) {
          if (inWin(f, o.old, o.young)) frames[j] = (frames[j] || 0) + 1;
        });
      });
    } else {
      // 절 단위 수 — 퇴적기원을 거를 수 없다
      base.stages.forEach(function (s) {
        total += s.n;
        addUnits((s.base + s.top) / 2, s.n);
        state.frames.forEach(function (f, j) {
          if (inWin(f, s.base, s.top)) frames[j] = (frames[j] || 0) + s.n;
        });
      });
    }
    state.dist = { key: base.key, stages: base.stages, app: base.app, units: units, frames: frames, total: total,
                   exact: !!base.occs, filtered: !!base.occs && (!allEnvEnabled() || state.maxSpan !== Infinity) };
    renderDist();
    renderChrono();
    renderAnalysis();
  }

  function allEnvEnabled() {
    return Object.keys(state.enabled).every(function (t) { return state.enabled[t]; });
  }

  // 산출 시대 칩을 누르면 그 기 안에서 찾은 분류군의 산출이 가장 많은 지도로 간다. 기의 가운데로
  // 가면(층서표 칩의 동작) 그 분류군이 없는 시점에 떨어지곤 했다 — Coelophysis 는 트라이아스기 가운데
  // 225 Ma 에 산출이 없다.
  function goToRichest(p) {
    var d = state.dist, best = -1;
    Object.keys(d.frames).forEach(function (j) {
      var age = state.frames[j].age;
      if (age > p.top && age <= p.base && (best < 0 || d.frames[j] > d.frames[best])) best = +j;
    });
    if (best < 0) { focusUnit(p); return; }
    stopTour();
    show(best, { focus: p });
    $("chrono-note").textContent = tr("rich", { unit: p.full, taxon: state.taxon, age: fmtAge(state.frames[best].age), n: fmtNum(d.frames[best]) });
  }

  // 찾기 카드의 분류군 줄(좁은 창, koprifossillab 038) — 시점 막대를 접어도 찾은 분류군이 어느 시점에 나오는지 보이고, 눌러서 간다.
  // 막대는 시점 막대 밑 줄(renderDist)과 같은 수(state.dist.frames)를 같은 로그 높이로. 손가락으로 3 px 막대를 맞히기 어려워
  // 줄의 어디를 누르든 가장 가까운, 산출이 있는 시점으로 간다. 옆 단추는 전체 산지(종합 보기)와 보던 시점으로 돌아가기
  var fdReturn = null;
  function renderFindDist() {
    var d = state.dist, box = $("find-dist"), strip = $("fd-strip"), btn = $("fd-all");
    box.hidden = !d || !state.taxon;
    var on = !!state.overview;
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = tr(on ? "fd.back" : "fd.all");
    btn.title = tr(on ? "fd.backTitle" : "fd.allTitle");
    if (box.hidden) return;
    strip.innerHTML = "";
    strip.title = tr("fd.strip");
    var max = 0;
    Object.keys(d.frames).forEach(function (j) { max = Math.max(max, d.frames[j]); });
    Object.keys(d.frames).forEach(function (j) {
      var bar = document.createElement("span");
      bar.style.left = ((OLDEST - Math.min(state.frames[j].age, OLDEST)) / OLDEST * 100) + "%";
      bar.style.height = Math.max(2, Math.round(Math.log(1 + d.frames[j]) / Math.log(1 + max) * 16)) + "px";
      strip.appendChild(bar);
    });
    if (!on) {
      var now = document.createElement("i");
      now.className = "fd-now";
      now.style.left = ((OLDEST - Math.min(frame().age, OLDEST)) / OLDEST * 100) + "%";
      strip.appendChild(now);
    }
  }
  $("fd-strip").addEventListener("click", function (e) {
    var d = state.dist;
    if (!d) return;
    var r = this.getBoundingClientRect(), age = OLDEST * (1 - (e.clientX - r.left) / r.width), best = -1, gap = Infinity;
    Object.keys(d.frames).forEach(function (j) {
      var g = Math.abs(state.frames[j].age - age);
      if (d.frames[j] && g < gap) { gap = g; best = +j; }
    });
    if (best >= 0) show(best);
  });
  $("fd-all").addEventListener("click", function () {
    if (state.overview) {
      // 단추로 연 종합 보기면 보던 시점으로, 찾자마자 열린 것(tupandactyl 012)이면 산출이 가장 많은 시점으로
      var back = fdReturn, d = state.dist;
      if (back == null && d) Object.keys(d.frames).forEach(function (j) { if (back == null || d.frames[j] > d.frames[back]) back = +j; });
      fdReturn = null;
      show(back != null ? back : state.i);
      return;
    }
    fdReturn = state.i;
    startOverview();
  });

  function renderDist() {
    renderFindDist();
    var d = state.dist, box = $("taxon-dist"), strip = $("strip-taxon");
    box.hidden = !d || !state.taxon;
    strip.hidden = box.hidden;
    strip.innerHTML = "";
    if (box.hidden) return;
    $("dist-total").textContent = tr("dist.total", { n: fmtNum(d.total) }) + (state.country ? " · " + countryName(state.country) : "") +
      (d.filtered ? tr("dist.filtered") : "") + (d.exact ? "" : tr("dist.stage"));
    // 산출이 있는 기 — 층서표 색 아이콘에 수를 붙인다. 누르면 그 기의 가운데 지도로 간다.
    var periods = state.periods.slice().sort(byOldFirst).filter(function (p) { return d.units[p.id]; });
    $("dist-periods").innerHTML = "";
    periods.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.style.backgroundColor = p.color;
      b.style.color = ink(p.color);
      b.classList.toggle("light-ink", ink(p.color) === "#ffffff");
      b.innerHTML = esc(p.ko) + '<span class="cnt">' + fmtNum(d.units[p.id]) + "</span>";
      b.title = tr("dist.chip", { unit: p.full, n: fmtNum(d.units[p.id]) });
      b.addEventListener("click", function () { goToRichest(p); });
      $("dist-periods").appendChild(b);
    });
    var a = d.app;
    $("dist-note").textContent = (!periods.length ? tr(d.exact ? "dist.noneExact" : "dist.noneStage") : "") +
      (a && a.early_interval ? tr("dist.app", { e: a.early_interval, emax: a.firstapp_max_ma, emin: a.firstapp_min_ma,
        l: a.late_interval, lmax: a.lastapp_max_ma, lmin: a.lastapp_min_ma }) : "");   // 수를 어떻게 세는지는 "읽는 법"(guide.dist)
    // 시점 막대 밑 — 시점마다 로그 높이의 막대
    var max = 0;
    Object.keys(d.frames).forEach(function (j) { max = Math.max(max, d.frames[j]); });
    Object.keys(d.frames).forEach(function (j) {
      var f = state.frames[j], n = d.frames[j];
      var bar = document.createElement("span");
      bar.style.left = ((OLDEST - Math.min(f.age, OLDEST)) / OLDEST * 100) + "%";
      bar.style.height = Math.max(2, Math.round(Math.log(1 + n) / Math.log(1 + max) * 14)) + "px";
      bar.title = tr("dist.bar", { age: fmtAge(f.age), n: fmtNum(n) });
      bar.addEventListener("click", function () { show(+j); });
      strip.appendChild(bar);
    });
    // 대멸종 다섯의 세로선 — 찾은 분류군이 대멸종을 넘었는지 한눈에(tupandactyl 016)
    state.events.forEach(function (e) {
      [e].concat(e.pulses || []).forEach(function (p) {
        if (p.tier !== 1 || p.kind !== "pulse" || p.outside) return;
        var line = document.createElement("i");
        line.className = "ev-line";
        line.style.left = ((OLDEST - p.age) / OLDEST * 100) + "%";
        line.title = p.en;
        strip.appendChild(line);
      });
    });
  }

  function taxonUrl(name, f) {
    var w = win(f);
    return PBDB + "occs/list.json?" + baseParam(name) +
      "&max_ma=" + w[1] + "&min_ma=" + w[0] +
      (state.country ? "&cc=" + encodeURIComponent(state.country) : "") + stratParam() +
      "&timerule=overlap&pgm=scotese&show=paleoloc,coll,class,env,loc&vocab=pbdb&limit=" + TAXON_LIMIT;
  }

  // ── 산출 시대 차례로 보기 ───────────────────────────────────────────
  // 가장 오래된 산출이 있는 시점부터 최근으로, 산출이 있는 시점만 넘긴다(분포 010 의 frames).
  // 시점마다 PBDB 답을 기다려 그린 뒤 머문다 — 고정 간격으로 넘기면 느린 답이 다음 시점에 섞인다.
  // 다음 시점의 질의는 미리 보내 둔다(getJSON 이 캐시에 담는다).
  var tour = { on: false, list: [], k: 0, timer: null };

  function startTour() {
    if (!state.dist || !state.taxon) return;
    tour.list = Object.keys(state.dist.frames).map(Number).sort(function (a, b) { return a - b; });
    if (!tour.list.length) return;
    if ($("play").checked) { $("play").checked = false; $("play").dispatchEvent(new Event("change")); }
    tour.on = true;
    tour.k = 0;
    $("tour").textContent = tr("tour.stop");
    $("tour").setAttribute("aria-pressed", "true");
    tourStep();
  }

  function stopTour(finished) {
    if (!tour.on) return;
    tour.on = false;
    clearTimeout(tour.timer);
    $("tour").textContent = tr("tour.start");
    $("tour").setAttribute("aria-pressed", "false");
    $("tour-status").textContent = finished ? tr("tour.done") : "";
  }

  function tourStep() {
    if (!tour.on) return;
    if (tour.k >= tour.list.length) { stopTour(true); return; }
    var j = tour.list[tour.k];
    show(j);
    var next = tour.list[tour.k + 1];
    if (next !== undefined) getJSON(taxonUrl(state.taxon, state.frames[next].age)).catch(function () {});
    $("tour-status").textContent = tr("tour.step", { k: tour.k + 1, total: tour.list.length, age: fmtAge(state.frames[j].age), n: fmtNum(state.dist.frames[j]) });
    Promise.resolve(state.taxonReady).catch(function () {}).then(function () {
      if (!tour.on) return;
      tour.timer = setTimeout(function () { tour.k += 1; tourStep(); }, +$("tour-speed").value);
    });
  }

  function searchTaxon(name, fromFind) {
    if (fromFind) remember({ t: name, cc: state.country || null, f: state.formation || null });   // 최근 찾은 것(027)
    var changed = state.taxon !== name;
    if (fromFind) { state.taxon = name; startOverview(); }        // 찾기 칸에서 골랐으면 먼저 모든 시대를 오늘날 자리에
    var f = frame();
    var seq = ++taxonSeq;
    if (changed) { state.dist = null; state.distBase = null; }
    state.taxon = name;
    state.taxa = null;
    loadDistribution(name);
    lookupRank(name).then(function (rank) {
      if (seq !== taxonSeq) return;
      state.taxonRank = rank;
      var shownName = koTaxon(name, rank);                        // Casual 의 한글 이름은 계급을 안 뒤에(속·종만)
      if (shownName !== plainName(name)) { $("taxon-chip-name").textContent = shownName; $("taxon-chip-name").title = idLabel(name); }
      markHomonym(name);
      if (state.overview && shownName !== name) { drawFossils(); return; }   // 종합 보기의 안내도 한글 이름으로
      drawTaxa();
    });
    $("taxon-chip").hidden = false;
    $("taxon-chip-name").textContent = plainName(name);
    $("taxon-chip-name").title = taxonIdOf(name) ? idLabel(name) : "";
    markHomonym(name);
    $("taxon-sec").hidden = false;
    if (state.overview) { drawFossils(); return Promise.resolve(); }   // 종합 보기는 overview 가 그린다
    $("taxon-status").textContent = tr("taxon.asking", { name: plainName(name), age: fmtAge(f.age) });
    drawFossils();
    // 결과를 그리고 나서 풀리는 약속을 돌려준다 — 차례로 보기(011)가 이것을 기다린다.
    return getJSON(taxonUrl(name, f)).then(function (data) {
      if (seq !== taxonSeq) return;
      if (data.errors) throw new Error(data.errors.join(" "));
      var rows = buildTaxonRows(data.records || [], f);
      state.taxaTruncated = (data.records || []).length >= TAXON_LIMIT;      // PBDB 한도에서 잘렸다(024)
      state.taxa = rows;
      drawTaxa();
    }).catch(function (err) {
      if (seq !== taxonSeq) return;
      $("taxon-status").textContent = tr("taxon.fail", { err: err.message || err });
    });
  }

  // 산출을 산지로 묶는다 — 한 산지의 여러 산출이 같은 자리에 겹쳐 그려지지 않게. 찾은 분류군(A)과 비교 분류군(B)이 같이 쓴다
  var TAXON_LIMIT = 20000;
  function buildTaxonRows(records, f) {
    var byColl = {}, rows = [];
    records.forEach(function (r) {
      // 연대 범위의 상한은 없다 — 모호한 연대는 precise = 0 으로 세모로 그린다(016)
      if (r.paleolat == null || r.paleolng == null) return;
      if (f.window && !inWin(f, r.max_ma, r.min_ma)) return;      // PBDB 의 overlap 은 경계에 닿은 것도 준다 — 절 시점은 안쪽만
      var row = byColl[r.collection_no];
      if (!row) {
        row = byColl[r.collection_no] = [r.collection_no, r.paleolng, r.paleolat, "", 0, r.collection_name,
          r.early_interval, r.late_interval || "", r.max_ma, r.min_ma, r.formation || "",
          r.environment || "", r.cc || "", isPrecise(r.early_interval, r.late_interval) ? 1 : 0, 0];
        row.pbdb = [r.paleolng, r.paleolat];
        row.matched = [];
        row.occs = [];
        rows.push(row);
      }
      row[COLUMNS.n_occs] += 1;
      var taxon = r.accepted_name || r.identified_name;
      if (row.matched.indexOf(taxon) < 0) row.matched.push(taxon);
      row.occs.push({ accepted: taxon, identified: r.identified_name, rank: rankOf(r) });
    });
    return rows;
  }

  // ── 같은 시대 다른 산지 (속 이하) ───────────────────────────────────
  // 지금 지도에서 찾은 분류군 산출들의 연대 범위를 한 구간(가장 젊은 min ~ 가장 오래된 max)으로
  // 잡고, 그 구간과 연대가 겹치는 다른 산지(그 분류군이 안 나온 곳)를 작고 흐리게 함께 그린다.
  // 환경 거르기는 따르고 국가 거르기는 따르지 않는다 — 나라를 골라 그 나라의 분류군을 보면서
  // 같은 시대의 다른 나라 기록과 견주려는 것이다.
  var GENUS_RANKS = { genus: 1, subgenus: 1, species: 1, subspecies: 1 };

  // "같은 시대" 의 구간. 산출 하나하나의 범위를 합치면 넓게 매겨진 산출 하나(예: 83.6–66 Ma)가 구간을
  // 지도 전체로 넓혀, 거의 모든 산지가 "같은 시대" 가 된다(Tyrannosaurus 70 Ma 에서 14,288 곳 중
  // 14,204 곳). 그래서 **절 단위 분포(010)에서 그 분류군이 실제로 나온 절**, 그중 지도 시점의 창에 걸치는
  // 절들로 구간을 잡는다. 절 단위 산출이 없는 시점만 산출 범위의 합으로 돌아간다.
  function coevalSpan(rows) {
    if (!rows.length) return null;
    var f = frame(), lo = win(f)[0], hi = win(f)[1], stages = [];
    // 지도 나이가 든 절을 먼저 쓴다. 창에 살짝 걸친 이웃 절까지 넣으면(70 Ma 창이 캄파이나절 끝 0.3 Myr
    // 에 걸친다) 구간이 다시 넓어진다. 나이가 든 절에 산출이 없으면 창과 가장 많이 겹치는 절 하나.
    var cands = ((state.dist && state.dist.stages) || []).filter(function (s) { return s.base >= lo && s.top <= hi; });
    stages = cands.filter(function (s) { return f.age > s.top && f.age <= s.base; });
    if (!stages.length && cands.length) {
      var overlapOf = function (s) { return Math.min(s.base, hi) - Math.max(s.top, lo); };
      stages = [cands.sort(function (a, b) { return overlapOf(b) - overlapOf(a); })[0]];
    }
    if (stages.length) {
      var names = stages.map(function (s) { return stageName(s); });
      return { old: Math.max.apply(null, stages.map(function (s) { return s.base; })),
               young: Math.min.apply(null, stages.map(function (s) { return s.top; })),
               label: names.join("·") };
    }
    var old = -Infinity, young = Infinity;
    rows.forEach(function (row) {
      old = Math.max(old, Number(row[COLUMNS.max_ma]));
      young = Math.min(young, Number(row[COLUMNS.min_ma]));
    });
    return { old: old, young: young, label: tr("coeval.range") };
  }

  // PBDB 절 이름 → 한글판 이름(가운데 나이가 든 우리 절). 없으면 PBDB 이름 그대로.
  function stageName(s) {
    var mid = (s.base + s.top) / 2, found = s.name;
    Object.keys(state.units).forEach(function (id) {
      var u = state.units[id];
      if (u.rank === "age" && mid > u.top && mid <= u.base) found = u.ko;
    });
    return found;
  }

  function drawCoeval(rows) {
    var note = $("coeval-note");
    $("coeval-row").hidden = !GENUS_RANKS[state.taxonRank];
    if (!GENUS_RANKS[state.taxonRank] || !$("coeval").checked) { note.textContent = ""; return 0; }
    var span = coevalSpan(rows), payload = state.payload;
    if (!span || !payload) {
      note.textContent = tr(span ? "coeval.loading" : "coeval.none");
      return 0;
    }
    var col = columns(payload), own = {}, n = 0, inside = $("coeval-rule").value === "inside";
    rows.forEach(function (row) { own[row[COLUMNS.collection_no]] = true; });
    payload.rows.forEach(function (row) {
      var precise = rowPrecise(row, col);
      if (own[row[col.collection_no]] || !state.enabled[termKey(row[col.environment])]) return;
      if (!ageOk(precise, row[col.max_ma], row[col.min_ma])) return;
      var old = row[col.max_ma], young = row[col.min_ma];
      // 겹침: 연대 범위가 구간에 걸치면 / 안: 연대 범위 전체가 구간 안에 들면
      if (inside ? (old > span.old + 1e-6 || young < span.young - 1e-6) : (old < span.young || young > span.old)) return;
      n += 1;
      var a = state.opacity * 0.6, color = pointColor(row[col.environment], row[col.max_ma], row[col.min_ma]);
      var small = { renderer: renderer, radius: 2.6, weight: 0.6, color: "#ffffff", opacity: Math.min(1, a + 0.15),
                    fillColor: color, fillOpacity: a };
      (precise ? L.circleMarker([row[col.paleolat], row[col.paleolng]], small)
               : new L.TriangleMarker([row[col.paleolat], row[col.paleolng]], small))
        .bindTooltip("<b>" + esc(row[col.collection_name] || tr("pop.noname")) + "</b><small>" +
                     esc(row[col.early_interval]) + (row[col.late_interval] ? "–" + esc(row[col.late_interval]) : "") +
                     " · " + esc(countryName(row[col.cc])) + tr("coeval.tip") + (precise ? "" : tr("coeval.vague")) + "</small>",
                     { className: "occ-tip", sticky: true, direction: "auto", opacity: 0.96 })
        .on("click", function (e) { openCollection(e.latlng, row, col); })
        .addTo(taxonLayer);
    });
    note.textContent = tr("coeval.note", { label: span.label, old: span.old, young: span.young,
      rel: tr(inside ? "coeval.inside" : "coeval.overlap"), n: fmtNum(n), c: state.country ? tr("coeval.anyCountry") : "" });
    return n;
  }

  // PBDB 에 바로 물은 산출의 고좌표는 산지 연대의 중간값에서 계산한 하나뿐이다. 산지 자료에 같은 산지가 있으면
  // 그 좌표(이 시점 나이로 계산한 것)로 옮겨 산지 점·해안선과 맞춘다(017). 없으면 PBDB 좌표 그대로.
  function placeTaxa(rows) {
    var payload = state.payload, col = payload && columns(payload);
    rows.forEach(function (row) {
      var own = payload && payload.byNo[row[COLUMNS.collection_no]];
      var rotated = own && col.rotated != null && own[col.rotated];
      row[COLUMNS.paleolng] = rotated ? own[col.paleolng] : row.pbdb[0];
      row[COLUMNS.paleolat] = rotated ? own[col.paleolat] : row.pbdb[1];
      row[COLUMNS.rotated] = rotated ? 1 : 0;
    });
  }

  function drawTaxa() {
    taxonLayer.clearLayers();
    if (state.overview) return;
    var rows = state.taxa;
    if (!state.taxon || !rows) return;
    placeTaxa(rows);
    var shown = 0, occs = 0, visible = [];
    var ok = function (row) {
      return passes(row[COLUMNS.environment], row[COLUMNS.cc], row[COLUMNS.precise], row[COLUMNS.max_ma], row[COLUMNS.min_ma], row[COLUMNS.formation]);
    };
    var inCountry = function (row) { return !state.country || row[COLUMNS.cc] === state.country; };
    rows.forEach(function (row) { if (ok(row)) visible.push(row); });
    // 환경 칸의 수 = 이 지도에서 찾은 분류군의 산출 건수(나라·연대 거르기는 따르되 환경은 거르지 않고 센다)
    syncCounts(rows.filter(function (row) {
      return inCountry(row) && ageOk(row[COLUMNS.precise], row[COLUMNS.max_ma], row[COLUMNS.min_ma]);
    }), COLUMNS, function (row) { return row[COLUMNS.n_occs]; });
    spanNote(rows.filter(function (row) {
      return inCountry(row) && tooWide(row[COLUMNS.precise], row[COLUMNS.max_ma], row[COLUMNS.min_ma]);
    }).length, tr("what.taxcoll"));
    drawCoeval(visible);            // 먼저 그려 찾은 분류군의 점 밑에 깐다
    rows.forEach(function (row) {
      if (!ok(row)) return;
      shown += 1;
      occs += row[COLUMNS.n_occs];
      marker([row[COLUMNS.paleolat], row[COLUMNS.paleolng]],
             pointColor(row[COLUMNS.environment], row[COLUMNS.max_ma], row[COLUMNS.min_ma]), true, !row[COLUMNS.precise])
        .bindTooltip(function () { return taxonTip(row); },
                     { className: "occ-tip", sticky: true, direction: "auto", opacity: 0.96 })
        .on("click", function (e) { openCollection(e.latlng, row, COLUMNS); })
        .addTo(taxonLayer);
    });
    $("taxon-status").textContent = tr("taxon.status", {
      name: koTaxon(state.taxon, state.taxonRank), rank: state.taxonRank ? " (" + (RANK_KO[state.taxonRank] || state.taxonRank) + ")" : "",
      age: fmtAge(frame().age), n: fmtNum(shown), occ: fmtNum(occs),
      country: state.country ? ", " + countryName(state.country) : "" }) +
      (state.taxaTruncated ? tr("taxon.truncated", { n: fmtNum(TAXON_LIMIT) }) : "");
    state.taxaVisible = visible;
    renderLegend();
    drawCmp();
  }

  // 점을 다시 그린다 — 색·환경·나라를 바꿨을 때. PBDB 에 다시 묻지 않는다.
  function redraw() { drawFossils(); drawTaxa(); if (!state.taxa) drawCmp(); }

  function clearTaxon() {
    stopTour();
    taxonSeq += 1;
    clearCmp();
    state.taxon = "";
    state.taxa = null;
    state.taxonRank = "";
    state.dist = null;
    state.distBase = null;
    renderDist();
    renderChrono();
    $("coeval-row").hidden = true;
    $("coeval-note").textContent = "";
    taxonLayer.clearLayers();
    $("taxon-chip").hidden = true;
    $("taxon-status").textContent = "";
    $("taxon-sec").hidden = true;       // 찾기 전에는 패널에 절을 두지 않는다 — 찾기 칸은 찾기 막대에 있다(wetherilli 011)
    if (state.overview) { if (state.country || state.formation) loadOverview(); else endOverview(); }
    drawFossils();
  }

  // ── 분류군 이름 후보(자동완성) ──────────────────────────────────────
  // 두 곳에 함께 묻는다: taxa/auto 는 앞부분 일치로 빠르고, taxa/list 의 match_name=%…% 는
  // 이름 가운데가 맞는 것까지 준다(조금 느리다). 같은 이름은 하나로 합치고 산출 수로 줄 세운다.
  var RANK_KO = {
    2: "아종", 3: "종", 4: "아속", 5: "속", 6: "아족", 7: "족", 8: "아과", 9: "과", 10: "상과",
    11: "하목", 12: "아목", 13: "목", 14: "상목", 15: "하강", 16: "아강", 17: "강", 18: "상강",
    19: "아문", 20: "문", 21: "상문", 22: "아계", 23: "계", 25: "분기군", 26: "비공식",
    subspecies: "아종", species: "종", subgenus: "아속", genus: "속", subtribe: "아족", tribe: "족",
    subfamily: "아과", family: "과", superfamily: "상과", infraorder: "하목", suborder: "아목",
    order: "목", superorder: "상목", infraclass: "하강", subclass: "아강", "class": "강",
    superclass: "상강", subphylum: "아문", phylum: "문", superphylum: "상문", kingdom: "계",
    "unranked clade": "분기군", informal: "비공식",
  };
  // 영어판은 PBDB 계급 이름 그대로 — 숫자 계급(taxa/auto)만 이름으로 바꾼다
  if (EN || SCI) {
    var RANK_NO = { 2: "subspecies", 3: "species", 4: "subgenus", 5: "genus", 6: "subtribe", 7: "tribe", 8: "subfamily",
      9: "family", 10: "superfamily", 11: "infraorder", 12: "suborder", 13: "order", 14: "superorder", 15: "infraclass",
      16: "subclass", 17: "class", 18: "superclass", 19: "subphylum", 20: "phylum", 21: "superphylum", 22: "subkingdom",
      23: "kingdom", 25: "unranked clade", 26: "informal" };
    Object.keys(RANK_KO).forEach(function (k) { RANK_KO[k] = RANK_NO[k] || k; });
  }
  var suggest = { seq: 0, items: [], active: -1, timer: null };

  // 한글로 친 것 — 연구자가 준 관용 표기(translit.js 의 ALIASES)만 학명으로 받는다. 국가 이름은 국가 후보가 따로 받는다
  var HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;
  function aliasMatches(text) {
    var ko = window.WegenerKo, q = text.replace(/\s+/g, "");
    if (!ko) return [];
    var seen = {};
    return Object.keys(ko.aliases).filter(function (k) { return k.replace(/\s+/g, "").indexOf(q) >= 0; }).map(function (k) {
      var latin = ko.aliases[k];
      if (seen[latin]) return null;
      seen[latin] = true;
      return { name: latin, rank: tr("suggest.alias", { name: k }), rk: latin.indexOf(" ") > 0 ? "species" : "genus", occs: 0, group: "" };
    }).filter(Boolean).slice(0, 12);
  }
  // 한글 찾기 표(tupandactyl 021) — PBDB 속·종 이름을 파이프라인이 미리 음차해 첫 글자마다 나눈 것(taxa_ko.py). 친 글자의 첫 글자
  // 파일만 받는다. 한 줄은 [띄어쓰기를 뺀 한글, 학명, 계급(g·s), 산출 수], 산출이 많은 것부터
  function koShard(text) {
    var q = text.replace(/\s+/g, "");
    if (!state.taxaKo || !q || !/[\uac00-\ud7a3]/.test(q[0])) return Promise.resolve({ q: q, rows: [] });
    return getJSON(dataUrl(state.taxaKo.dir + "/" + q.charCodeAt(0).toString(16) + ".json"))
      .then(function (d) { return { q: q, rows: d.rows || [] }; }).catch(function () { return { q: q, rows: [] }; });
  }
  function koSuggest(text) {
    var seq = suggest.seq;
    koShard(text).then(function (got) {
      if (seq !== suggest.seq) return;
      var found = got.rows.filter(function (r) { return r[0].indexOf(got.q) === 0; }).slice(0, 12).map(function (r) {
        return { name: r[1], rank: RANK_KO[r[2] === "s" ? "species" : "genus"] || "", rk: r[2] === "s" ? "species" : "genus", occs: r[3], group: "" };
      });
      renderSuggest(merge(aliasMatches(text), found), true);
    });
  }
  // Enter 로 친 한글 — 관용 표기, 아니면 한글 찾기 표에서 똑같은 이름(여럿이면 산출이 많은 것)
  function latinOf(text) {
    if (!HANGUL.test(text) || !window.WegenerKo) return Promise.resolve(text);
    var alias = window.WegenerKo.fromKorean(text);
    if (alias) return Promise.resolve(alias);
    return koShard(text).then(function (got) {
      var hit = got.rows.filter(function (r) { return r[0] === got.q; })[0];
      return hit ? hit[1] : null;
    });
  }

  function suggestFetch(text) {
    var seq = ++suggest.seq;
    var q = encodeURIComponent(text);
    // 지층 후보(028) — 분류군 후보와 따로 오면 그 밑에 붙인다
    suggest.formations = [];
    getJSON(PBDB + "strata/auto.json?name=" + q + "&limit=5").then(function (d) {
      if (seq !== suggest.seq) return;
      suggest.formations = (d.records || []).filter(function (r) { return r.typ === "str" && r.rnk === "Fm"; }).map(function (r) {
        return { name: r.nam, cc: r.cc2 || "", colls: +r.nco || 0, occs: +r.noc || 0 };
      });
      if (suggest.formations.length) renderSuggest(suggest.lastTaxa || [], suggest.lastDone);
    }).catch(function () {});
    var prefix = getJSON(PBDB + "taxa/auto.json?name=" + q + "&limit=12").then(function (d) {
      return (d.records || []).filter(function (r) { return r.typ === "txn" && /^[A-Z]/.test(r.nam); }).map(function (r) {
        return { name: r.nam, rank: RANK_KO[r.rnk] || "", rk: r.rnk, occs: +r.noc || 0, group: "" };
      });
    }).catch(function () { return []; });
    var middle = text.length < 3 ? Promise.resolve([]) :
      getJSON(PBDB + "taxa/list.json?match_name=%25" + q + "%25&taxon_status=valid&order=n_occs.desc&limit=15&show=class&vocab=pbdb")
        .then(function (d) {
          return (d.records || []).map(function (r) {
            var grp = [r.phylum, r["class"]].filter(function (x) { return x && x !== "NO_CLASS_SPECIFIED" && x !== r.taxon_name; }).join(" · ");
            return { name: r.taxon_name, rank: RANK_KO[r.taxon_rank] || r.taxon_rank, rk: r.taxon_rank, occs: +r.n_occs || 0, group: grp };
          });
        }).catch(function () { return []; });
    // 앞부분 후보가 먼저 오면 먼저 보이고, 가운데 후보가 오면 합쳐서 다시 그린다.
    prefix.then(function (a) { if (seq === suggest.seq) renderSuggest(merge(a, [])); });
    Promise.all([prefix, middle]).then(function (both) {
      if (seq !== suggest.seq) return;
      var list = merge(both[0], both[1]);
      renderSuggest(list, true);
      // 같은 이름이 산출 수가 다르게 둘 이상 왔으면 동명이다(026) — PBDB 에 물어 분류군마다 따로 띄운다
      var occsBy = {};
      both[0].concat(both[1]).forEach(function (it) { (occsBy[it.name] = occsBy[it.name] || {})[it.occs] = 1; });
      var dup = list.filter(function (it) { return Object.keys(occsBy[it.name] || {}).length > 1; });
      if (!dup.length) return;
      Promise.all(dup.map(function (it) { return homonyms(it.name); })).then(function (groups) {
        if (seq !== suggest.seq) return;
        var out = [];
        list.forEach(function (it) {
          var k = dup.indexOf(it), g = k >= 0 ? groups[k] : null;
          if (g && g.length > 1) g.forEach(function (h) { out.push(Object.assign({ homonym: true }, h)); }); else out.push(it);
        });
        renderSuggest(out.slice(0, 14), true);
      });
    });
  }

  function merge(a, b) {
    var seen = {}, out = [];
    a.concat(b).forEach(function (it) {
      var key = it.name.toLowerCase();
      if (seen[key]) { if (!seen[key].group && it.group) seen[key].group = it.group; return; }
      seen[key] = it;
      out.push(it);
    });
    return out.sort(function (x, y) { return y.occs - x.occs; }).slice(0, 12);
  }

  // 한 칸에서 분류군과 국가를 함께 찾는다(wetherilli 013). 국가는 목록(index.json)에서 바로, 분류군은 PBDB 에서
  // 늦게 온다 — 국가 후보를 위에 먼저 두고 분류군 후보가 오면 그 밑에 붙인다. 고른 것은 찾기 막대의 딱지로 남는다.
  function countryMatches(text) {
    var q = normName(text);
    if (!q) return [];
    return state.countries.filter(function (c) {
      return normName(c.ko).indexOf(q) >= 0 || normName(c.en).indexOf(q) >= 0 || normName(c.cc) === q || normName(c.iso) === q ||
        (c.aka || []).some(function (x) { return normName(x).indexOf(q) >= 0; });
    }).slice(0, 5);
  }
  function normName(v) { return String(v || "").toLowerCase().replace(/\s+/g, ""); }

  function renderSuggest(taxa, done) {
    var list = $("find-list"), text = $("find").value.trim();
    suggest.lastTaxa = taxa; suggest.lastDone = done;
    var countries = countryMatches(text).map(function (c) { return { kind: "country", c: c }; });
    var waitTaxa = text.length >= 2;
    var forms = HANGUL.test(text) ? [] : (suggest.formations || []).map(function (f) { return { kind: "formation", f: f }; });
    // 국가 → 지층 → 분류군(연구자, 031) — 분류군 후보가 많으면 뒤의 국가·지층이 목록 밖으로 밀려 안 보였다
    suggest.items = countries.concat(forms).concat((taxa || []).map(function (it) { return { kind: "taxon", t: it }; }));
    suggest.active = -1;
    var re = text ? new RegExp("(" + text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i") : null;
    var mark = function (v) { var e = esc(v); return re ? e.replace(re, "<b>$1</b>") : e; };
    var html = "";
    suggest.items.forEach(function (it, k) {
      if (k === 0 && it.kind === "country") html += '<li class="sg-head" role="presentation">' + tr("suggest.countries") + "</li>";
      if (it.kind === "taxon" && (k === 0 || suggest.items[k - 1].kind !== "taxon"))
        html += '<li class="sg-head" role="presentation">' + tr("suggest.taxa") + "</li>";
      if (it.kind === "formation" && (k === 0 || suggest.items[k - 1].kind !== "formation"))
        html += '<li class="sg-head" role="presentation">' + tr("suggest.formations") + "</li>";
      var li = '<li role="option" id="sg-' + k + '" data-k="' + k + '">';
      if (it.kind === "formation") {
        var fm = it.f;
        html += li + '<span class="nm-plain">' + mark(fm.name) + " <small>Fm.</small></span>" +
          '<span class="meta">' + esc(fm.cc) + tr("formation.meta", { colls: fmtNum(fm.colls), occs: fmtNum(fm.occs) }) + "</span></li>";
      } else if (it.kind === "country") {
        var c = it.c;
        html += li + '<span class="nm-plain">' + mark(c.ko) + (c.en !== c.ko ? " <small>" + mark(c.en) + "</small>" : "") +
          '</span><span class="meta">' + esc(c.cc) + tr("country.colls", { n: fmtNum(c.collections) }) + "</span></li>";
      } else {
        var t = it.t, kn = koTaxon(t.name, t.rk);
        html += li + '<span class="nm">' + (kn !== t.name ? '<span class="ko-taxon">' + esc(kn) + "</span> " + mark(t.name) : mark(t.name)) + "</span>" +
          '<span class="meta">' + (t.homonym ? '<span class="homonym">' + esc(tr("suggest.homonym")) + "</span> " : "") +
          esc(t.rank) + (t.group ? " · " + esc(t.group) : "") + tr("suggest.occ", { n: fmtNum(t.occs) }) + "</span></li>";
      }
    });
    if (waitTaxa && !(taxa && taxa.length) && (!done || !countries.length)) {
      html += '<li class="sg-head" role="presentation">' + tr("suggest.taxa") + "</li>" +
        '<li class="empty-sg">' + tr(done ? "suggest.none" : "suggest.wait") + "</li>";
    }
    list.innerHTML = html;
    list.hidden = !html;
    $("find").setAttribute("aria-expanded", String(!!html));
  }

  function closeSuggest() {
    suggest.seq += 1;
    clearTimeout(suggest.timer);
    $("find-list").hidden = true;
    $("find").setAttribute("aria-expanded", "false");
    $("find").removeAttribute("aria-activedescendant");
  }

  // ── 최근 찾은 것(tupandactyl 027) ───────────────────────────────────
  // 그리는 함수는 renderRecentFinds — 최근 절 단추의 renderRecent(0.25.0)와 이름이 같아 뒤의 것이 앞의 것을 덮었고, 지도를 불러올 때
  // 최근 절 단추 대신 이 목록이 떠 있었다(최근 절 단추는 그려지지 않았다, koprifossillab 038)
  // 찾기 칸에서 찾은 분류군·나라(함께 건 것도)를 5 개까지 이 브라우저에 기억한다. 찾기 칸이 비어 있을 때 누르면 띄운다
  var RECENT_KEY = "wegener.recent", RECENT_MAX = 5;
  function recentList() {
    try { return (JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") || []).filter(function (e) { return e && (e.t || e.cc || e.f); }); } catch (e) { return []; }
  }
  function remember(entry) {
    var key = (entry.t || "") + "|" + (entry.cc || "") + "|" + (entry.f || "");
    var list = recentList().filter(function (e) { return (e.t || "") + "|" + (e.cc || "") + "|" + (e.f || "") !== key; });
    list.unshift(entry);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch (e) {}
  }
  function renderRecentFinds() {
    var list = recentList(), box = $("find-list");
    suggest.items = list.map(function (e) { return { kind: "recent", e: e }; });
    suggest.active = -1;
    if (!list.length) { closeSuggest(); return; }
    box.innerHTML = '<li class="sg-head" role="presentation">' + tr("suggest.recent") + "</li>" + list.map(function (e, k) {
      var parts = [];
      if (e.t) parts.push('<span class="nm">' + esc(koTaxon(e.t, "")) + (koTaxon(e.t, "") !== plainName(e.t) ? " <small>" + esc(plainName(e.t)) + "</small>" : "") + "</span>");
      if (e.f) parts.push('<span class="nm-plain">' + esc(e.f) + " <small>Fm.</small></span>");
      if (e.cc) parts.push('<span class="nm-plain">' + esc(countryName(e.cc)) + "</span>");
      return '<li role="option" id="sg-' + k + '" data-k="' + k + '">' + parts.join(" · ") + "</li>";
    }).join("") + '<li class="sg-clear" role="presentation"><button type="button" id="recent-clear">' + tr("suggest.recentClear") + "</button></li>";
    box.hidden = false;
    $("find").setAttribute("aria-expanded", "true");
    $("recent-clear").addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      try { localStorage.removeItem(RECENT_KEY); } catch (e) {}
      closeSuggest();
    });
  }
  function useRecent(e) {
    stopTour();
    if ((e.f || null) !== (state.formation || null)) {          // 그때 걸었던 지층 그대로
      state.formation = e.f || null;
      $("formation-chip").hidden = !e.f;
      $("formation-chip-name").textContent = e.f || "";
      loadFormationFauna();
    }
    if (e.f && !e.t) {
      if ((e.cc || null) !== (state.country || null)) { state.country = e.cc || null; $("country-chip").hidden = !e.cc; $("country-chip-name").textContent = e.cc ? countryName(e.cc) : ""; noteCountry(); }
      setFormation(e.f, true); return;
    }
    if (e.cc && !e.t) { setCountry(e.cc, true); return; }
    if ((e.cc || null) !== (state.country || null)) {           // 그때 걸었던 나라 그대로 — 없었으면 푼다
      state.country = e.cc || null;
      $("country-chip").hidden = !e.cc;
      $("country-chip-name").textContent = e.cc ? countryName(e.cc) : "";
      noteCountry();
      drawBorders(frame(), !!e.cc);
    }
    searchTaxon(e.t, true);
  }

  function pickSuggest(k) {
    var it = suggest.items[k];
    if (!it) return;
    if (it.kind === "recent") { $("find").value = ""; closeSuggest(); useRecent(it.e); return; }
    if (it.kind === "formation") { $("find").value = ""; closeSuggest(); stopTour(); setFormation(it.f.name, true); return; }
    $("find").value = "";
    closeSuggest();
    if (it.kind === "country") { setCountry(it.c.cc, true); return; }
    stopTour();
    searchTaxon(it.t.id ? it.t.name + "#" + it.t.id : it.t.name, true);
  }

  function moveActive(step) {
    var n = suggest.items.length;
    if (!n) return;
    suggest.active = (suggest.active + step + n) % n;
    document.querySelectorAll("#find-list li[data-k]").forEach(function (li) { li.classList.toggle("active", +li.dataset.k === suggest.active); });
    $("find").setAttribute("aria-activedescendant", "sg-" + suggest.active);
  }

  // 후보를 고르지 않고 찾기(Enter·단추): 국가 이름·코드와 똑같으면 국가, 아니면 분류군 이름으로 PBDB 에 묻는다
  function submitFind() {
    var text = $("find").value.trim();
    closeSuggest();
    if (!text) return;
    var q = normName(text), exact = state.countries.filter(function (c) {
      return normName(c.ko) === q || normName(c.en) === q || normName(c.cc) === q || normName(c.iso) === q ||
        (c.aka || []).some(function (x) { return normName(x) === q; });
    })[0];
    $("find").value = "";
    if (exact) { setCountry(exact.cc, true); return; }
    stopTour();
    // "Mesosauridae 브라질", "한국, Trilobita" — 앞이나 뒤의 낱말이 나라 이름이면 둘을 함께 건다(tupandactyl 015)
    var both = splitCountry(text);
    if (both && HANGUL.test(both.taxon)) {                       // 한글 분류군 + 나라 — 학명을 찾은 뒤에 건다
      latinOf(both.taxon).then(function (latin) {
        if (!latin) { $("find").value = text; renderSuggest([], true); return; }
        both.taxon = latin;
        applyBoth(both);
      });
      return;
    }
    if (both) { applyBoth(both); return; }
    latinOf(text).then(function (latin) {
      if (!latin) { $("find").value = text; renderSuggest([], true); return; }   // 표에 없는 한글 — 후보 없음을 보인다
      return homonyms(latin).then(function (list) {
        if (list.length > 1) {                                   // 같은 이름의 분류군이 여럿 — 후보로 띄워 고르게(026)
          $("find").value = latin;
          renderSuggest(list.map(function (h) { return Object.assign({ homonym: true }, h); }), true);
          $("find").focus();
          return;
        }
        searchTaxon(latin, true);
      });
    });
  }
  function applyBoth(both) {
    state.country = both.cc;
    $("country-chip").hidden = false;
    $("country-chip-name").textContent = countryName(both.cc);
    noteCountry();
    drawBorders(frame(), true);
    searchTaxon(both.taxon, true);
  }
  function countryOf(text) {
    var q = normName(text);
    return q && state.countries.filter(function (c) {
      return normName(c.ko) === q || normName(c.en) === q || normName(c.cc) === q || normName(c.iso) === q ||
        (c.aka || []).some(function (x) { return normName(x) === q; });
    })[0];
  }
  function splitCountry(text) {
    var words = text.split(/[\s,]+/).filter(Boolean);
    for (var i = 1; i < words.length; i++) {
      var head = words.slice(0, i).join(" "), tail = words.slice(i).join(" "), c;
      if ((c = countryOf(tail)) && !countryOf(head)) return { taxon: head, cc: c.cc };
      if ((c = countryOf(head)) && !countryOf(tail)) return { taxon: tail, cc: c.cc };
    }
    return null;
  }

  function bindSuggest() {
    var input = $("find");
    input.addEventListener("input", function () {
      clearTimeout(suggest.timer);
      suggest.seq += 1;
      var text = input.value.trim();
      if (!text) { renderRecentFinds(); return; }                     // 비우면 최근 찾은 것(027)
      if (HANGUL.test(text)) {                                  // 한글 — 관용 표기와 한글 찾기 표(020·021)
        renderSuggest(aliasMatches(text), !state.taxaKo);
        if (state.taxaKo) suggest.timer = setTimeout(function () { koSuggest(text); }, 150);
        return;
      }
      renderSuggest([], text.length < 2);
      if (text.length >= 2) suggest.timer = setTimeout(function () { suggestFetch(text); }, 250);
    });
    var showRecent = function () { if (!input.value.trim()) renderRecentFinds(); };
    input.addEventListener("focus", showRecent);
    input.addEventListener("click", showRecent);
    input.addEventListener("keydown", function (e) {
      if ($("find-list").hidden) return;
      if (e.key === "ArrowDown") { moveActive(1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { moveActive(-1); e.preventDefault(); }
      else if (e.key === "Enter" && suggest.active >= 0) { pickSuggest(suggest.active); e.preventDefault(); }
      else if (e.key === "Escape") { closeSuggest(); }
    });
    $("find-list").addEventListener("mousedown", function (e) {
      var li = e.target.closest("li[data-k]");
      e.preventDefault();
      if (li) { pickSuggest(+li.dataset.k); if (NARROW) input.blur(); }
    });
    input.addEventListener("blur", function () { setTimeout(closeSuggest, 150); });
    // 찾기 카드 밖을 누르면 후보·최근 찾은 것을 닫는다 — 휴대폰에서는 지도를 눌러도 칸이 포커스를 잃지 않아 최근 찾은 것이 계속
    // 떠 있었다(연구자, koprifossillab 038). 좁은 창에서는 칸에서 손을 떼게 해(blur) 자판도 내린다
    document.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("#findfloat")) return;
      if (!$("find-list").hidden) closeSuggest();
      if (NARROW && document.activeElement === input) input.blur();
    }, true);
  }

  // ── 지구사 사건(tupandactyl 016·017) ──────────────────────────────────
  // 목록은 index.json 의 events(pipeline/events.py 한 곳). 대멸종 다섯(1 등급)과 Sinsk·토아르시움 규모의 전 지구 사건(2 등급).
  // 이름은 영어로만, 풀이는 적지 않는다(연구자 — 017). 시점 막대 위에 박동은 표식, 기간(데본기 후기 위기)은 띠.
  // 층서표(책)에는 **책갈피**로 — 사건이 끝나는 단위의 칩에 작은 리본, 층서표 머리에 늘어뜨린 책갈피. 책갈피는 **고를 때만** 편다
  // (018): 기 이하의 칩(기·세·절)을 누르면 그 단위 안의 사건, 시점 막대의 표식을 누르면 그 사건. 밀대로 지나갈 때는 펴지 않는다.
  // 책갈피의 단추로 직전·사건·직후 시점을 오간다. 직전은 창이 사건보다 완전히 오래된 마지막 시점, 직후는 완전히 젊은 첫 시점이다
  // (걸친 시점에는 전후의 화석이 섞인다). 편 사건들의 직전~직후 안에 있는 동안 책갈피가 남고, 밖으로 나가면 걷힌다(state.evSel).
  // 표식은 멸종이면 폭발, 기후·해양 사건(type climate)이면 마름모 — 멸종이 아닌 사건에 폭발은 맞지 않는다(018).
  // 지도 앞의 사건(Kotlin crisis, ~550 Ma)은 막대 왼쪽 끝 밖에 표식, 가장 오래된 지도에 책갈피.
  function evAge(e) {
    if (e.old === e.young) return e.age + " Ma";
    if (e.unc) return "~" + e.age + " Ma (±" + e.unc + ")";
    return e.old + "–" + e.young + " Ma";
  }
  function evFrames(e) {
    var before = null, after = null;
    state.frames.forEach(function (f, j) {
      var w = win(f);
      if (w[0] > e.old && (before === null || f.age < state.frames[before].age)) before = j;
      if (w[1] < e.young && (after === null || f.age > state.frames[after].age)) after = j;
    });
    return { before: before, after: after };
  }
  function evNearest(e) {
    var best = 0;
    state.frames.forEach(function (f, j) { if (Math.abs(f.age - e.age) < Math.abs(state.frames[best].age - e.age)) best = j; });
    return best;
  }
  function evAll() {
    var out = [];
    state.events.forEach(function (e) { out.push(e); (e.pulses || []).forEach(function (p) { p.parent = e; out.push(p); }); });
    return out;
  }
  // span — 고른 단위의 범위[young, old]. 단위 안을 돌아다니는 동안에도 책갈피를 남긴다
  function evSelect(list, span) {
    if (!list.length) { state.evSel = null; return; }
    var lo = span ? span[0] : Infinity, hi = span ? span[1] : -Infinity;
    list.forEach(function (e) {
      var fr = evFrames(e);
      hi = Math.max(hi, fr.before === null ? e.old : state.frames[fr.before].age);
      lo = Math.min(lo, fr.after === null ? e.young : state.frames[fr.after].age);
    });
    state.evSel = { list: list, lo: lo, hi: hi };
  }
  function evGo(e, j) {
    stopTour();
    if (!state.evSel || state.evSel.list.indexOf(e) < 0) evSelect([e]);
    show(j);
  }
  // 단위 안의 사건 — 박동은 그 단위 안에서 끝나는 것(경계의 대멸종은 경계 아래 단위), 기간은 단위와 겹치는 것
  function evInUnitAll(u) {
    return evAll().filter(function (e) {
      return e.kind === "interval" ? e.old > u.top && e.young < u.base : e.old >= u.top && e.young < u.base;
    });
  }
  function initEvents(list) {
    state.events = list;
    var row = $("strip-events");
    row.hidden = !list.length;
    evAll().forEach(function (e) {
      var mark = document.createElement("span");
      mark.title = e.en + " · " + evAge(e) + (e.outside ? " · " + tr("ev.outside") : "");
      if (e.kind === "interval") {
        mark.className = "ev-band t" + e.tier;
        mark.style.left = ((OLDEST - e.old) / OLDEST * 100) + "%";
        mark.style.width = ((e.old - e.young) / OLDEST * 100) + "%";
      } else {
        mark.className = "ev-mark t" + e.tier + " " + e.type + (e.outside ? " outside" : "");
        mark.style.left = e.outside ? "0" : ((OLDEST - e.age) / OLDEST * 100) + "%";
        if (e.outside) mark.textContent = "◂";
      }
      mark.addEventListener("click", function () { evGo(e, e.outside ? evNearest({ age: OLDEST }) : evNearest(e)); });
      row.appendChild(mark);
    });
  }
  // 층서표 칩의 리본 — 그 단위 안에서 끝나는 사건(경계의 대멸종은 경계 아래 단위: 페름기 말 → 페름기·창싱절)
  function evInUnit(u) {
    return evAll().filter(function (e) { return e.kind === "pulse" && e.old >= u.top && e.young < u.base; });
  }
  function ribbonChip(b, u) {
    if (u.rank === "era") return;                 // 대는 거의 다 걸려 리본이 뜻이 없다 — 기·세·절에만
    var evs = evInUnit(u);
    if (!evs.length) return;
    var lead = evs.slice().sort(function (a, c) { return a.tier - c.tier || (a.type === "climate") - (c.type === "climate"); })[0];
    b.classList.add("marked", "mt" + lead.tier, "m-" + lead.type);
    b.title += "\n" + evs.map(function (e) { return "▼ " + e.en + " · " + evAge(e); }).join("\n");
  }
  function renderEvents(f) {
    var box = $("bookmarks");
    if (!box) return;
    var sel = state.evSel;
    if (sel && (f.age < sel.lo || f.age > sel.hi)) sel = state.evSel = null;   // 편 사건들의 직전~직후 밖 — 걷는다
    box.innerHTML = "";
    box.hidden = !sel;
    if (!sel) return;
    sel.list.forEach(function (e) {
      box.appendChild(bookmark(e, f, e.outside ? f.age >= OLDEST : inWin(f, e.old, e.young)));
    });
  }
  function bookmark(e, f, during) {
    var el = document.createElement("div");
    el.className = "bookmark t" + e.tier + " " + e.type + (during ? "" : " away");
    el.title = e.refs.join("; ");
    var html = '<div class="ribbon"><span class="ev-name">' + esc(e.en) + '</span> <span class="ev-age">' + evAge(e) +
      (e.outside ? " · " + tr("ev.outside") : "") + "</span></div>";
    if (!e.outside) {
      var here = state.i, fr = evFrames(e), steps = [];
      if (fr.before !== null) steps.push({ j: fr.before, label: tr(e.kind === "interval" ? "ev.start" : "ev.before", { age: fmtAge(state.frames[fr.before].age) }) });
      if (e.kind === "interval") (e.pulses || []).forEach(function (p) { steps.push({ j: evNearest(p), label: p.en.replace(/ (event|mass extinction)/, "") }); });
      else steps.push({ j: evNearest(e), label: tr("ev.at", { age: fmtAge(state.frames[evNearest(e)].age) }) });
      if (fr.after !== null) steps.push({ j: fr.after, label: tr(e.kind === "interval" ? "ev.end" : "ev.after", { age: fmtAge(state.frames[fr.after].age) }) });
      html += '<div class="ev-nav">' + steps.map(function (st) {
        return '<button type="button" class="tool' + (st.j === here ? " on" : "") + '" data-go="' + st.j + '">' + esc(st.label) + "</button>";
      }).join("") + "</div>";
    }
    el.innerHTML = html;
    el.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { evGo(e, +b.dataset.go); });
    });
    return el;
  }

  // ── 비교 분류군 B 와 분포 분석(tupandactyl 024) ────────────────────────
  // 찾은 분류군(A)에 비교 분류군(B)을 하나 더 걸어 **분포가 어떻게 바뀌는지를 나란히** 본다 — "대신했다" 같은 해석은 하지 않고 수만 보인다
  // (연구자). B 는 지도에 보라 고리로, 그래프에는 보라 선으로. 그래프는 셋이다.
  //  1. 다양성 — 절마다 속 수(범위 통과·절 안 산출), 산출 수, 산출 100 건당 속 수. 대멸종 다섯과 전 지구 사건의 세로선
  //  2. 고위도 — 시점마다 산출 고위도의 중앙값과 사분위(PBDB 고좌표, 연대 중간값). 산출이 OCC_LIMIT 건 이하인 분류군만
  //  3. 지금 시점 — 지도의 산지로 10° 띠마다 A·B 산지 수, 그리고 산지 수·고위도 범위·중앙값·5° 칸 겹침(Jaccard)
  // 그래프는 SVG 를 직접 그린다(라이브러리 없이). 커서를 대면 그 절의 값, 누르면 가장 가까운 시점으로 간다.
  var CMP_COLOR = "#8e44ad";
  function clearCmp() {
    state.cmp = null;
    cmpLayer.clearLayers();
    $("cmp-chip").hidden = true;
    renderAnalysis();
  }
  function setCmp(name) {
    if (!name || !state.taxon) return;
    state.cmp = { name: name, rank: "", series: null, rows: null, seq: 0 };
    $("cmp-chip").hidden = false;
    $("cmp-chip-name").textContent = plainName(name);
    lookupRank(name).then(function (rank) {
      if (!state.cmp || state.cmp.name !== name) return;
      state.cmp.rank = rank;
      var k = koTaxon(name, rank);
      if (k !== name) { $("cmp-chip-name").textContent = k; $("cmp-chip-name").title = name; }
    });
    fetchSeries(name, false).then(function (series) {
      if (!state.cmp || state.cmp.name !== name) return;
      state.cmp.series = series;
      renderAnalysis();
    });
    loadCmpFrame();
  }
  function loadCmpFrame() {
    var cmp = state.cmp, f = frame();
    if (!cmp) return;
    var seq = ++cmp.seq;
    cmp.rows = null;
    cmpLayer.clearLayers();
    if (state.overview) { renderAnalysis(); return; }
    getJSON(taxonUrl(cmp.name, f)).then(function (data) {
      if (state.cmp !== cmp || seq !== cmp.seq) return;
      cmp.rows = buildTaxonRows(data.records || [], f);
      cmp.truncated = (data.records || []).length >= TAXON_LIMIT;
      drawCmp();
    }).catch(function () { if (state.cmp === cmp) $("anal-note").textContent = tr("cmp.fail"); });
  }
  function drawCmp() {
    cmpLayer.clearLayers();
    var cmp = state.cmp;
    if (!cmp || !cmp.rows || state.overview) { renderAnalysis(); return; }
    placeTaxa(cmp.rows);
    cmp.visible = cmp.rows.filter(function (row) {
      return passes(row[COLUMNS.environment], row[COLUMNS.cc], row[COLUMNS.precise], row[COLUMNS.max_ma], row[COLUMNS.min_ma], row[COLUMNS.formation]);
    });
    cmp.visible.forEach(function (row) {
      L.circleMarker([row[COLUMNS.paleolat], row[COLUMNS.paleolng]], {
        renderer: renderer, radius: 6.5, weight: 2.2, color: CMP_COLOR, opacity: .95, fill: false,
      }).bindTooltip(function () { return '<span class="cmp-tag">B</span> ' + taxonTip(row); },
                     { className: "occ-tip", sticky: true, direction: "auto", opacity: 0.96 })
        .on("click", function (e) { openCollection(e.latlng, row, COLUMNS); })
        .addTo(cmpLayer);
    });
    renderAnalysis();
  }

  // ── 그래프 ───────────────────────────────────────────────────────────
  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  var DIV_METRIC = {
    rt: function (s) { return s.rt; }, g: function (s) { return s.g; }, n: function (s) { return s.n; },
    per: function (s) { return s.n ? s.rt / s.n * 100 : null; },
  };
  function seriesList() {
    var out = [];
    if (state.distBase) out.push({ key: "A", name: state.taxon, rank: state.taxonRank, base: state.distBase, cls: "a" });
    if (state.cmp && state.cmp.series) out.push({ key: "B", name: state.cmp.name, rank: state.cmp.rank, base: state.cmp.series, cls: "b" });
    return out;
  }
  function domain(list) {
    var old = -Infinity, young = Infinity;
    list.forEach(function (it) { it.base.stages.forEach(function (st) { old = Math.max(old, st.base); young = Math.min(young, st.top); }); });
    if (!isFinite(old)) return null;
    var pad = Math.max(2, (old - young) * 0.03);
    return [Math.min(OLDEST, old + pad), Math.max(0, young - pad)];
  }
  // 시점마다 산출 고위도의 사분위(지도와 같은 규칙 — 켠 퇴적기원, 연대 범위, 창과 겹침)
  function latSeries(base) {
    if (!base.occs) return base.latFrames || null;
    var out = [];
    state.frames.forEach(function (f) {
      var lats = [];
      base.occs.forEach(function (o) {
        if (o.plat == null || !state.enabled[termKey(o.env)]) return;
        if (!ageOk(isPrecise(o.early, o.late), o.old, o.young) || !inWin(f, o.old, o.young)) return;
        lats.push(o.plat);
      });
      if (lats.length < 1) return;
      lats.sort(function (a, b) { return a - b; });
      var q = function (p) { var k = (lats.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return lats[lo] + (lats[hi] - lats[lo]) * (k - lo); };
      out.push({ age: f.age, j: state.frames.indexOf(f), n: lats.length, med: q(.5), q1: q(.25), q3: q(.75), min: lats[0], max: lats[lats.length - 1] });
    });
    return out;
  }
  function eventLines(g, x, top, bottom, dom) {
    state.events.forEach(function (e) {
      [e].concat(e.pulses || []).forEach(function (p) {
        if (p.kind !== "pulse" || p.age > dom[0] || p.age < dom[1]) return;
        svgEl("line", { x1: x(p.age), x2: x(p.age), y1: top, y2: bottom, "class": "ev-l t" + p.tier + " " + (p.type || "extinction") }, g)
          .appendChild(document.createElementNS(SVGNS, "title")).textContent = p.en + " · " + p.age + " Ma";
      });
    });
  }
  function axisX(g, x, dom, y0, W) {
    var span = dom[0] - dom[1], step = span > 300 ? 100 : span > 120 ? 50 : span > 40 ? 20 : span > 15 ? 5 : 1;
    for (var a = Math.ceil(dom[1] / step) * step; a <= dom[0]; a += step) {
      svgEl("line", { x1: x(a), x2: x(a), y1: y0, y2: y0 + 3, "class": "tick" }, g);
      var t = svgEl("text", { x: x(a), y: y0 + 12, "class": "lab", "text-anchor": "middle" }, g);
      t.textContent = a;
    }
    var unit = svgEl("text", { x: W - 2, y: y0 + 12, "class": "lab", "text-anchor": "end" }, g);
    unit.textContent = "Ma";
  }
  function drawDiversity(svg, W, H) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var list = seriesList(), dom = domain(list);
    if (!dom) return false;
    var L0 = 34, R0 = 6, T0 = 6, B0 = 18, metric = DIV_METRIC[$("div-metric").value] || DIV_METRIC.rt;
    var x = function (a) { return L0 + (dom[0] - a) / (dom[0] - dom[1]) * (W - L0 - R0); };
    var ymax = 0;
    list.forEach(function (it) { it.base.stages.forEach(function (st) { var v = metric(st); if (v != null) ymax = Math.max(ymax, v); }); });
    ymax = niceMax(ymax);
    var y = function (v) { return H - B0 - v / ymax * (H - T0 - B0); };
    var g = svgEl("g", {}, svg);
    [0, .5, 1].forEach(function (k) {
      svgEl("line", { x1: L0, x2: W - R0, y1: y(ymax * k), y2: y(ymax * k), "class": "grid" }, g);
      var t = svgEl("text", { x: L0 - 4, y: y(ymax * k) + 3, "class": "lab", "text-anchor": "end" }, g);
      t.textContent = fmtNum(Math.round(ymax * k * 10) / 10);
    });
    eventLines(g, x, T0, H - B0, dom);
    var f = frame();
    if (f.age <= dom[0] && f.age >= dom[1]) svgEl("line", { x1: x(f.age), x2: x(f.age), y1: T0, y2: H - B0, "class": "now" }, g);
    list.forEach(function (it) {
      // 이어진 절끼리만 선으로 잇는다 — 기록이 없는 구간을 건너 잇지 않는다(그 사이가 이어진 것처럼 보인다)
      var runs = [], run = null, prev = null;
      it.base.stages.slice().sort(function (a, b) { return b.base - a.base; }).forEach(function (st) {
        var v = metric(st);
        if (v == null) { run = null; prev = null; return; }
        if (!run || !prev || Math.abs(prev.top - st.base) > 0.5) { run = []; runs.push(run); }
        run.push([x((st.base + st.top) / 2), y(v)]);
        prev = st;
      });
      runs.forEach(function (pts) {
        if (pts.length > 1) svgEl("path", { d: "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"), "class": "ln " + it.cls }, g);
        pts.forEach(function (p) { svgEl("circle", { cx: p[0], cy: p[1], r: 1.6, "class": "pt " + it.cls }, g); });
      });
    });
    axisX(g, x, dom, H - B0, W);
    hoverChart(svg, x, dom, list, function (st, it) {
      var v = metric(st);
      return v == null ? "—" : fmtNum(Math.round(v * 10) / 10);
    }, L0, W - R0);
    return true;
  }
  function drawLatitude(svg, W, H) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var list = seriesList(), dom = domain(list);
    if (!dom) return false;
    var L0 = 34, R0 = 6, T0 = 6, B0 = 18, any = false;
    var x = function (a) { return L0 + (dom[0] - a) / (dom[0] - dom[1]) * (W - L0 - R0); };
    var y = function (v) { return T0 + (90 - v) / 180 * (H - T0 - B0); };
    var g = svgEl("g", {}, svg);
    [-60, -30, 0, 30, 60].forEach(function (v) {
      svgEl("line", { x1: L0, x2: W - R0, y1: y(v), y2: y(v), "class": v === 0 ? "grid eq" : "grid" }, g);
      var t = svgEl("text", { x: L0 - 4, y: y(v) + 3, "class": "lab", "text-anchor": "end" }, g);
      t.textContent = (v > 0 ? v + "°N" : v < 0 ? -v + "°S" : "0°");
    });
    eventLines(g, x, T0, H - B0, dom);
    var f = frame();
    if (f.age <= dom[0] && f.age >= dom[1]) svgEl("line", { x1: x(f.age), x2: x(f.age), y1: T0, y2: H - B0, "class": "now" }, g);
    list.forEach(function (it) {
      var ls = latSeries(it.base);
      it.lat = ls;
      if (!ls || !ls.length) return;
      any = true;
      // 이웃한 시점끼리만 잇는다 — 산출이 없는 시점을 건너 띠·선을 잇지 않는다
      var runs = [], run = null;
      ls.forEach(function (p, k) {
        if (!run || p.j !== ls[k - 1].j + 1) { run = []; runs.push(run); }
        run.push(p);
      });
      runs.forEach(function (r) {
        if (r.length > 1) {
          var band = r.map(function (p) { return x(p.age).toFixed(1) + "," + y(p.q3).toFixed(1); })
            .concat(r.slice().reverse().map(function (p) { return x(p.age).toFixed(1) + "," + y(p.q1).toFixed(1); }));
          svgEl("polygon", { points: band.join(" "), "class": "band " + it.cls }, g);
          svgEl("path", { d: "M" + r.map(function (p) { return x(p.age).toFixed(1) + "," + y(p.med).toFixed(1); }).join("L"), "class": "ln " + it.cls }, g);
        } else {
          svgEl("circle", { cx: x(r[0].age), cy: y(r[0].med), r: 2, "class": "pt " + it.cls }, g);
        }
      });
      ls.forEach(function (p) {
        svgEl("line", { x1: x(p.age), x2: x(p.age), y1: y(p.min), y2: y(p.max), "class": "rng " + it.cls }, g);
      });
    });
    axisX(g, x, dom, H - B0, W);
    hoverLat(svg, x, list, L0, W - R0);
    return any;
  }
  // 커서를 대면 그 절(다양성)·시점(고위도)의 값, 누르면 가장 가까운 시점으로
  function hoverChart(svg, x, dom, list, value, left, right) {
    var guide = svgEl("line", { y1: 0, y2: 1000, "class": "hover", visibility: "hidden" }, svg);
    var read = svg.parentNode.querySelector(".chart-read");
    var pick = function (ev) {
      var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, px = (ev.clientX - r.left) / r.width * vb.width;
      if (px < left || px > right) return null;
      var age = dom[0] - (px - left) / (right - left) * (dom[0] - dom[1]);
      return { age: age, px: px };
    };
    svg.onmousemove = function (ev) {
      var hit = pick(ev);
      if (!hit) { guide.setAttribute("visibility", "hidden"); return; }
      guide.setAttribute("x1", hit.px); guide.setAttribute("x2", hit.px); guide.setAttribute("visibility", "visible");
      var parts = list.map(function (it) {
        var st = it.base.stages.filter(function (s) { return hit.age <= s.base && hit.age > s.top; })[0];
        return st ? '<b class="' + it.cls + '">' + it.key + "</b> " + value(st, it) : "";
      }).filter(Boolean);
      var u = unitAt(hit.age);
      if (read) read.innerHTML = (u ? esc(u.full) + " · " : "") + fmtAge(Math.round(hit.age * 10) / 10) + (parts.length ? " · " + parts.join(" · ") : "");
    };
    svg.onmouseleave = function () { guide.setAttribute("visibility", "hidden"); if (read) read.textContent = ""; };
    svg.onclick = function (ev) { var hit = pick(ev); if (hit) { stopTour(); show(evNearest({ age: hit.age })); } };
  }
  function hoverLat(svg, x, list, left, right) {
    var guide = svgEl("line", { y1: 0, y2: 1000, "class": "hover", visibility: "hidden" }, svg);
    var read = svg.parentNode.querySelector(".chart-read");
    var nearest = function (ev) {
      var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, px = (ev.clientX - r.left) / r.width * vb.width;
      if (px < left || px > right) return null;
      var best = null;
      state.frames.forEach(function (f, j) { var d = Math.abs(x(f.age) - px); if (!best || d < best.d) best = { d: d, j: j, f: f }; });
      return best;
    };
    svg.onmousemove = function (ev) {
      var hit = nearest(ev);
      if (!hit) { guide.setAttribute("visibility", "hidden"); return; }
      guide.setAttribute("x1", x(hit.f.age)); guide.setAttribute("x2", x(hit.f.age)); guide.setAttribute("visibility", "visible");
      var parts = list.map(function (it) {
        var p = (it.lat || []).filter(function (q) { return q.age === hit.f.age; })[0];
        return p ? '<b class="' + it.cls + '">' + it.key + "</b> " + tr("lat.read", { med: latText(p.med), q1: latText(p.q1), q3: latText(p.q3), n: fmtNum(p.n) }) : "";
      }).filter(Boolean);
      if (read) read.innerHTML = fmtAge(hit.f.age) + (parts.length ? " · " + parts.join(" · ") : "");
    };
    svg.onmouseleave = function () { guide.setAttribute("visibility", "hidden"); if (read) read.textContent = ""; };
    svg.onclick = function (ev) { var hit = nearest(ev); if (hit) { stopTour(); show(hit.j); } };
  }
  // 산출이 많은 분류군(OCC_LIMIT 초과)의 고위도 곡선 — 누르면 시점마다 그 분류군이 나온 **산지**를 PBDB 에 물어(colls/list, 산지의
  // PBDB 고좌표) 그린다. 시점 110 개를 넷씩 나눠 묻는다(1~2 분). 산출 단위가 아니라 산지 단위다 — 큰 분류군은 산출 수가 산지 몇 곳에 몰린다
  function buildLatFrames(base, button) {
    if (base.latFrames || base.latLoading) return;
    base.latLoading = true;
    var cc = (state.country ? "&cc=" + encodeURIComponent(state.country) : "") + stratParam();
    var todo = state.frames.map(function (f, j) { return { f: f, j: j }; }).filter(function (t) {
      return base.stages.some(function (st) { return inWin(t.f, st.base, st.top); });
    });
    var done = 0, out = [];
    var next = function () {
      var t = todo.shift();
      if (!t) return Promise.resolve();
      var w = win(t.f);
      return getJSON(PBDB + "colls/list.json?" + baseParam(base.name) + cc + "&max_ma=" + w[1] + "&min_ma=" + w[0] +
                     "&timerule=overlap&show=paleoloc&pgm=scotese&vocab=pbdb&limit=all").then(function (d) {
        var lats = (d.records || []).map(function (r) { return r.paleolat == null || r.paleolat === "" ? null : +r.paleolat; })
          .filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
        if (lats.length) {
          var q = function (p) { var k = (lats.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return lats[lo] + (lats[hi] - lats[lo]) * (k - lo); };
          out.push({ age: t.f.age, j: t.j, n: lats.length, med: q(.5), q1: q(.25), q3: q(.75), min: lats[0], max: lats[lats.length - 1], colls: true });
        }
      }).catch(function () {}).then(function () {
        done += 1;
        if (button) button.textContent = tr("lat.loading", { done: done, all: done + todo.length });
        return next();
      });
    };
    Promise.all([next(), next(), next(), next()]).then(function () {
      base.latLoading = false;
      base.latFrames = out.sort(function (a, b) { return b.age - a.age; });
      renderAnalysis();
    });
  }

  function latText(v) { v = Math.round(v); return v > 0 ? v + "°N" : v < 0 ? -v + "°S" : "0°"; }
  function unitAt(age) {
    var best = null;
    Object.keys(state.units).forEach(function (id) {
      var u = state.units[id];
      if (u.rank === "age" && age <= u.base && age > u.top) best = u;
    });
    return best;
  }

  // 지금 시점 — 지도의 산지로. 10° 띠마다 A(왼쪽)·B(오른쪽) 산지 수, 그리고 수치
  function drawNow(svg, W, H) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var A = state.overview ? null : state.taxaVisible, B = state.cmp && !state.overview ? state.cmp.visible : null;
    if (!A && !B) return null;
    var bands = function (rows) {
      var c = new Array(18).fill(0);
      (rows || []).forEach(function (row) { c[Math.min(17, Math.max(0, Math.floor((90 - row[COLUMNS.paleolat]) / 10)))] += 1; });
      return c;
    };
    var a = bands(A), b = bands(B), max = Math.max(1, Math.max.apply(null, a.concat(b)));
    var mid = W / 2, half = W / 2 - 34, rowH = (H - 4) / 18, g = svgEl("g", {}, svg);
    for (var k = 0; k < 18; k++) {
      var yy = 2 + k * rowH;
      if (k % 3 === 0) {
        var lat = 90 - k * 10, t = svgEl("text", { x: 2, y: yy + rowH * .8, "class": "lab" }, g);
        t.textContent = latText(lat);
      }
      if (a[k]) svgEl("rect", { x: mid - a[k] / max * half, y: yy + .5, width: a[k] / max * half, height: rowH - 1, "class": "bar a" }, g)
        .appendChild(document.createElementNS(SVGNS, "title")).textContent = "A " + latText(90 - k * 10) + "–" + latText(80 - k * 10) + " · " + a[k];
      if (b[k]) svgEl("rect", { x: mid, y: yy + .5, width: b[k] / max * half, height: rowH - 1, "class": "bar b" }, g)
        .appendChild(document.createElementNS(SVGNS, "title")).textContent = "B " + latText(90 - k * 10) + "–" + latText(80 - k * 10) + " · " + b[k];
    }
    svgEl("line", { x1: mid, x2: mid, y1: 0, y2: H, "class": "grid" }, g);
    svgEl("line", { x1: 30, x2: W, y1: 2 + 9 * rowH, y2: 2 + 9 * rowH, "class": "grid eq" }, g);
    // 수치
    var stats = function (rows) {
      if (!rows || !rows.length) return null;
      var lats = rows.map(function (r) { return +r[COLUMNS.paleolat]; }).sort(function (p, q) { return p - q; });
      return { n: rows.length, min: lats[0], max: lats[lats.length - 1], med: lats[Math.floor(lats.length / 2)] };
    };
    var cells = function (rows) {
      var set = {};
      (rows || []).forEach(function (r) { set[Math.floor(r[COLUMNS.paleolat] / 5) + ":" + Math.floor(r[COLUMNS.paleolng] / 5)] = 1; });
      return set;
    };
    var sa = stats(A), sb = stats(B), ca = cells(A), cb = cells(B), both = 0, union = 0, shared = 0;
    Object.keys(ca).forEach(function (k) { union += 1; if (cb[k]) both += 1; });
    Object.keys(cb).forEach(function (k) { if (!ca[k]) union += 1; });
    var noA = {};
    (A || []).forEach(function (r) { noA[r[COLUMNS.collection_no]] = 1; });
    (B || []).forEach(function (r) { if (noA[r[COLUMNS.collection_no]]) shared += 1; });
    return { a: sa, b: sb, cellsA: Object.keys(ca).length, cellsB: Object.keys(cb).length, both: both, union: union, shared: shared };
  }

  function renderAnalysis() {
    var box = $("anal");
    if (!box) return;
    box.hidden = !state.taxon;
    if (box.hidden) return;
    var W = Math.max(240, Math.round($("chart-div").parentNode.getBoundingClientRect().width) || 300);
    var okDiv = drawDiversity($("chart-div"), W, 130);
    var okLat = drawLatitude($("chart-lat"), W, 130);
    $("chart-div").parentNode.hidden = !okDiv;
    $("chart-lat").parentNode.hidden = !okDiv;
    // 산출이 많아 고위도를 산출로 셀 수 없는 분류군 — 누르면 시점마다 산지로 묻는다
    var big = seriesList().filter(function (it) { return !it.base.occs && !it.base.latFrames; });
    var byColls = seriesList().some(function (it) { return it.base.latFrames; });
    var note = $("lat-note");
    note.innerHTML = esc(big.length ? tr("lat.big", { n: fmtNum(OCC_LIMIT) }) : tr("lat.about")) + (byColls ? " " + esc(tr("lat.colls")) : "");
    big.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tool lat-build";
      b.textContent = it.base.latLoading ? tr("lat.loading", { done: "…", all: "" }) : tr("lat.build", { key: it.key });
      b.disabled = !!it.base.latLoading;
      b.addEventListener("click", function () { b.disabled = true; buildLatFrames(it.base, b); });
      note.appendChild(document.createElement("br"));
      note.appendChild(b);
    });
    var now = drawNow($("chart-now"), W, 150), stat = $("now-stats");
    $("chart-now").parentNode.hidden = !now;
    if (now) {
      var line = function (key, s, cls) {
        return s ? '<b class="' + cls + '">' + key + "</b> " + tr("now.line", { n: fmtNum(s.n), min: latText(s.min), max: latText(s.max), med: latText(s.med) }) : "";
      };
      stat.innerHTML = [line("A", now.a, "a"), line("B", now.b, "b"),
        now.a && now.b ? tr("now.overlap", { shared: fmtNum(now.shared), both: fmtNum(now.both), a: fmtNum(now.cellsA), b: fmtNum(now.cellsB),
          j: now.union ? (now.both / now.union).toFixed(2) : "—" }) : ""].filter(Boolean).join("<br>") +
        (state.cmp && state.cmp.truncated ? "<br>" + tr("cmp.truncated", { n: fmtNum(TAXON_LIMIT) }) : "");
    } else stat.innerHTML = state.overview ? tr("now.overview") : "";
    if ($("anal-dialog").open) renderBig();
  }
  function renderBig() {
    var W = Math.min(1100, Math.round(window.innerWidth * .86));
    drawDiversity($("big-div"), W, 260);
    drawLatitude($("big-lat"), W, 260);
  }

  // ── 지금 보이는 산지 내려받기(tupandactyl 024) ─────────────────────────
  // 지도에 보이는 그대로(켠 퇴적기원·연대 범위·나라) — 찾은 분류군이 있으면 그 산지(A)와 비교 분류군(B), 없으면 시점의 산지 전체.
  // 종합 보기는 오늘날 자리의 산지. CSV 와 GeoJSON. 좌표는 그 시점의 고좌표(종합 보기는 오늘날 좌표)
  function exportRows() {
    var f = frame(), out = [];
    var push = function (row, col, taxon) {
      out.push({
        collection_no: row[col.collection_no], name: row[col.collection_name], early_interval: row[col.early_interval],
        late_interval: row[col.late_interval], max_ma: row[col.max_ma], min_ma: row[col.min_ma],
        lat: row[col.paleolat], lng: row[col.paleolng], coords: "paleo " + f.age + " Ma (" + (row[col.rotated] ? "PALEOMAP v19o" : "PBDB") + ")",
        environment: row[col.environment], formation: row[col.formation], cc: row[col.cc], n_occs: row[col.n_occs],
        precise: row[col.precise] ? 1 : 0, taxon: taxon || "", map_age: f.age, pbdb: PBDB_COLL_PAGE + row[col.collection_no],
      });
    };
    if (state.overview && state.overview.cells) {
      state.overview.cells.forEach(function (c) {
        (c.recs || []).forEach(function (r) {
          out.push({ collection_no: r.collection_no, name: r.collection_name, early_interval: r.early_interval || "", late_interval: r.late_interval || "",
            max_ma: r.max_ma, min_ma: r.min_ma, lat: r.lat, lng: r.lng, coords: "present-day", environment: r.environment || "",
            formation: r.formation || "", cc: r.cc || "", n_occs: r.n_occs || "", precise: "", taxon: state.taxon || "", map_age: "all",
            pbdb: PBDB_COLL_PAGE + r.collection_no });
        });
      });
      return out;
    }
    if (state.taxon && state.taxaVisible) {
      state.taxaVisible.forEach(function (row) { push(row, COLUMNS, idLabel(state.taxon)); });
      if (state.cmp && state.cmp.visible) state.cmp.visible.forEach(function (row) { push(row, COLUMNS, idLabel(state.cmp.name) + " (B)"); });
      return out;
    }
    if (state.payload) {
      var col = columns(state.payload);
      state.payload.rows.forEach(function (row) {
        if (passes(row[col.environment], row[col.cc], row[col.precise], row[col.max_ma], row[col.min_ma], row[col.formation])) push(row, col, "");
      });
    }
    return out;
  }
  function saveText(text, name, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function exportData(kind) {
    var rows = exportRows(), f = frame();
    var stem = "wegener_" + (state.overview ? "all-ages" : String(f.age).replace(".", "_") + "Ma") +
      (state.taxon ? "_" + plainName(state.taxon).replace(/\s+/g, "-") : "") + (state.country ? "_" + state.country : "");
    if (kind === "csv") {
      var keys = Object.keys(rows[0] || { collection_no: "" });
      var cell = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      saveText("﻿" + [keys.join(",")].concat(rows.map(function (r) { return keys.map(function (k) { return cell(r[k]); }).join(","); })).join("\n") + "\n",
        stem + ".csv", "text/csv;charset=utf-8");
    } else {
      saveText(JSON.stringify({ type: "FeatureCollection", features: rows.map(function (r) {
        var props = {};
        Object.keys(r).forEach(function (k) { if (k !== "lat" && k !== "lng") props[k] = r[k]; });
        return { type: "Feature", geometry: { type: "Point", coordinates: [+r.lng, +r.lat] }, properties: props };
      }) }), stem + ".geojson", "application/geo+json");
    }
    return rows.length;
  }

  // ── 국가 ────────────────────────────────────────────────────────────
  // 목록은 index.json 의 countries(PBDB 산지에 나오는 국가 코드 + Natural Earth 한글 이름).
  // PBDB 는 영국을 UK, 대양을 O1~O7 로 적는다 — 국경선 파일은 ISO(GB)다.
  function countryIso(cc) { var c = state.countryBy[cc]; return c ? c.iso : cc; }
  function countryName(cc) { var c = state.countryBy[cc]; return c ? c.ko : cc; }

  function initCountries(list) {
    state.countries = list;
    list.forEach(function (c) { state.countryBy[c.cc] = c; });
    $("country-clear").addEventListener("click", function () { setCountry(null); map.flyTo(worldCenter(), worldZoom(), { duration: 0.6 }); });
    // 시점을 옮기면 나라가 움직인다 — 그 시점의 자리로 다시 당긴다.
    $("country-focus").addEventListener("click", function () { drawBorders(frame(), true); });
  }

  function setCountry(cc, fromFind) {
    if (fromFind && cc) remember({ t: state.taxon || null, cc: cc, f: state.formation || null });
    state.country = cc;
    if (fromFind && cc) { startOverview(); }
    $("country-chip").hidden = !cc;
    $("country-chip-name").textContent = cc ? countryName(cc) : "";
    noteCountry();
    drawBorders(frame(), true);
    if (state.overview) {
      if (!cc && !state.taxon && !state.formation) { endOverview(); redraw(); return; }
      if (!fromFind) loadOverview();                               // 나라를 바꾸거나 지우면 종합 보기도 다시
      if (state.taxon) searchTaxon(state.taxon);                   // 산출 시대 분포도 그 나라로 다시 센다(종합 보기 중에는 준비만)
      return;
    }
    if (state.taxon) searchTaxon(state.taxon); else redraw();
  }

  // ── 지층(tupandactyl 028) ───────────────────────────────────────────
  // PBDB 의 지층(Formation) 이름으로 거른다 — 찾기 후보는 strata/auto, 거르기는 PBDB 질의의 formation= 과 지도의 산지 칸(formKey).
  // 이름은 영문 그대로(Casual 에서도) — 지층 이름은 옮기지 않는다(연구자). 분류군·나라와 겹쳐 건다
  function setFormation(name, fromFind) {
    if (fromFind && name) remember({ t: state.taxon || null, cc: state.country || null, f: name });
    state.formation = name || null;
    $("formation-chip").hidden = !name;
    $("formation-chip-name").textContent = name || "";
    loadFormationFauna();
    if (fromFind && name) { startOverview(); if (state.taxon) searchTaxon(state.taxon); return; }
    if (state.overview) {
      if (!name && !state.taxon && !state.country) { endOverview(); redraw(); return; }
      loadOverview();
      if (state.taxon) searchTaxon(state.taxon);
      return;
    }
    if (state.taxon) searchTaxon(state.taxon); else redraw();
  }

  // ── 지층의 화석 기록(tupandactyl 030) ─────────────────────────────────
  // 지층을 걸면 패널에 그 지층의 정보(시대·암상·나라·산지·산출 수·층군·부층, PBDB strata/list)와 **모든 산지의 산출을 한데 모은 계통 나무**.
  // 나무: 문 › 강 › 목 › 과 › 속 › 종(PBDB 산출의 계통 칸, 비어 있으면 건너뛴다). 마디마다 먼저 "미동정 n"(과 이상에서 멈춘 동정 — 계통이
  // 닿는 가장 깊은 마디에 둔다), 그 밑에 아래 마디를 이름 차례로. 속까지만 정해진 것은 그 속의 "종 미정". 어느 산지에서 나왔는지는 접어 둔다.
  // 지도의 거르기(시점·퇴적기원·연대 범위)와 상관없이 지층 전체다.
  var FM_LIMIT = 20000, fmSeq = 0, fmCache = {};
  var FM_LEVELS = ["phylum", "class", "order", "family"];
  function clean(v) { return v && !/^NO_/.test(v) ? v : ""; }
  var kingdomCache = {};
  function kingdomOf(name) {
    if (!kingdomCache[name]) {
      kingdomCache[name] = getJSON(PBDB + "taxa/list.json?name=" + encodeURIComponent(name) + "&rel=all_parents&vocab=pbdb").then(function (d) {
        var names = (d.records || []).map(function (r) { return r.taxon_name; });
        return names.indexOf("Animalia") >= 0 || names.indexOf("Metazoa") >= 0 ? "Animalia" : names.indexOf("Plantae") >= 0 ? "Plantae" : "other";
      }).catch(function () { return "other"; });
    }
    return kingdomCache[name];
  }
  function loadFormationFauna() {
    var sec = $("formation-sec"), name = state.formation;
    sec.hidden = !name;
    if (!name) return;
    var seq = ++fmSeq;
    $("formation-title").textContent = name + " Fm.";
    $("formation-info").innerHTML = "";
    $("formation-tree").innerHTML = '<p class="note">' + esc(tr("formation.loading")) + "</p>";
    $("formation-count").textContent = "";
    $("formation-note").textContent = "";
    var q = encodeURIComponent(name);
    var got = fmCache[name] || (fmCache[name] = Promise.all([
      getJSON(PBDB + "strata/list.json?name=" + q + "&vocab=pbdb").catch(function () { return {}; }),
      getJSON(PBDB + "occs/list.json?formation=" + q + "&show=class,coll&vocab=pbdb&limit=" + FM_LIMIT),
    ]));
    got.then(function (both) {
      if (seq !== fmSeq) return;
      renderFormationInfo(name, both[0].records || []);
      renderFauna(both[1].records || []);
    }).catch(function () { if (seq === fmSeq) $("formation-tree").innerHTML = '<p class="note">' + esc(tr("formation.fail")) + "</p>"; });
  }
  function renderFormationInfo(name, recs) {
    var key = formKey(name), mine = recs.filter(function (r) { return formKey(r.formation) === key; });
    if (!mine.length) return;
    var main = mine.filter(function (r) { return !r.member; })[0] || mine[0];
    var old = Math.max.apply(null, mine.map(function (r) { return +r.max_ma || 0; }));
    var young = Math.min.apply(null, mine.map(function (r) { return +r.min_ma || Infinity; }));
    var stageName = function (age, older) {
      var best = null;
      Object.keys(state.units).forEach(function (id) {
        var u = state.units[id];
        if (u.rank === "age" && (older ? age <= u.base && age > u.top : age < u.base && age >= u.top)) best = u;
      });
      return best ? best.full : "";
    };
    var lithTerms = {};
    mine.forEach(function (r) {
      String(r.lithology || "").replace(/"/g, "").split(/[,/]/).forEach(function (t) { t = t.trim(); if (t && t !== "not reported") lithTerms[t] = 1; });
    });
    var lith = Object.keys(lithTerms).map(function (t) { return KO && state.lith && state.lith.terms[t] || t; });
    var groups = mine.map(function (r) { return r.group; }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var members = mine.map(function (r) { return r.member; }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var cc = String(main.cc_list || "").split(",").filter(Boolean).map(function (c) { return countryName(c.trim()); });
    var colls = mine.reduce(function (a, r) { return a + (+r.n_colls || 0); }, 0), occs = mine.reduce(function (a, r) { return a + (+r.n_occs || 0); }, 0);
    var row = function (k, v) { return v ? "<dt>" + esc(tr(k)) + "</dt><dd>" + v + "</dd>" : ""; };
    var a = stageName(old, true), b = stageName(young, false);
    $("formation-info").innerHTML =
      row("formation.age", esc(old + "–" + young + " Ma") + (a ? " <small>(" + esc(a) + (b && b !== a ? " – " + esc(b) : "") + ")</small>" : "")) +
      row("formation.lith", esc(lith.join(", "))) +
      row("formation.group", esc(groups.join(", "))) +
      row("formation.members", members.length ? esc(members.slice(0, 12).join(", ")) + (members.length > 12 ? " …" : "") : "") +
      row("pop.country", esc(cc.join(", "))) +
      row("formation.size", esc(tr("formation.sizeVal", { colls: fmtNum(colls), occs: fmtNum(occs) })));
  }
  function renderFauna(recs) {
    var root = { name: "", children: {}, indet: {}, nIndet: 0, n: 0, colls: {} };
    var node = function (parent, name, level) {
      if (!parent.children[name]) parent.children[name] = { name: name, level: level, children: {}, indet: {}, nIndet: 0, n: 0, colls: {}, sp: 0 };
      return parent.children[name];
    };
    recs.forEach(function (r) {
      var acc = r.accepted_name || r.identified_name || "?", rank = rankOf(r);
      var path = [root];
      FM_LEVELS.forEach(function (lv) {
        var v = clean(r[lv]);
        if (v && v !== acc) path.push(node(path[path.length - 1], v, lv));
      });
      // PBDB 분류 기준표에 없는 이름(계통 칸이 비었다) — 한 마디에 모은다. 맨 위에 흩어 두면 문과 섞인다
      if (path.length === 1 && !clean(r.phylum)) path.push(node(root, tr("formation.unplaced"), "unplaced"));
      var genus = clean(r.genus) || (rank === "genus" || rank === "subgenus" ? acc.split(" ")[0] : rank === "species" ? acc.split(" ")[0] : "");
      var here;
      if (genus && (rank === "species" || rank === "subspecies" || rank === "genus" || rank === "subgenus")) {
        var g = node(path[path.length - 1], genus, "genus");
        path.push(g);
        if (rank === "species" || rank === "subspecies") { here = node(g, acc, "species"); path.push(here); }
        else { g.sp += 1; here = g; }                                   // 종 미정
      } else {
        here = path[path.length - 1];                                 // 과 이상 — 닿는 가장 깊은 마디의 미동정
        here.indet[acc] = (here.indet[acc] || 0) + 1;
        here.nIndet += 1;
      }
      path.forEach(function (p) { p.n += 1; p.colls[r.collection_no] = r.collection_name; });
      if (here !== path[path.length - 1]) { here.n += 1; here.colls[r.collection_no] = r.collection_name; }
    });
    var genera = 0, species = 0;
    var walk = function (n) { Object.keys(n.children).forEach(function (k) { var c = n.children[k]; if (c.level === "genus") genera += 1; if (c.level === "species") species += 1; walk(c); }); };
    walk(root);
    $("formation-count").textContent = tr("formation.count", { occs: fmtNum(recs.length), genera: fmtNum(genera), species: fmtNum(species) });
    $("formation-note").textContent = recs.length >= FM_LIMIT ? tr("formation.truncated", { n: fmtNum(FM_LIMIT) }) : "";   // 풀이는 읽는 법(031)
    var box = $("formation-tree"), seq = fmSeq;
    if (!box.dataset.bound) { box.dataset.bound = "1"; bindTaxonLinks(box); }
    // 맨 위는 동물·식물·기타(031) — PBDB 산출에는 계(kingdom)가 없어 맨 위 마디마다 조상(rel=all_parents)을 물어 가른다
    var tops = Object.keys(root.children).filter(function (k) { return root.children[k].level !== "unplaced"; });
    Promise.all(tops.map(kingdomOf)).then(function (kings) {
      if (seq !== fmSeq) return;
      var groups = { Animalia: [], Plantae: [], other: [] };
      tops.forEach(function (k, i) { groups[kings[i]].push(root.children[k]); });
      box.innerHTML = "";
      ["Animalia", "Plantae", "other"].forEach(function (g) {
        var list = groups[g];
        if (!list.length && !(g === "other" && root.nIndet)) return;
        var d = document.createElement("details");
        d.className = "fm-node fm-kingdom";
        d.open = true;
        var n = list.reduce(function (a, c) { return a + c.n; }, 0) + (g === "other" ? root.nIndet : 0);
        d.innerHTML = '<summary><span class="fm-name">' + esc({ Animalia: tr("formation.kingdom.Animalia"), Plantae: tr("formation.kingdom.Plantae"), other: tr("formation.kingdom.other") }[g]) + '</span> <small>' + esc(tr("formation.n", { n: fmtNum(n) })) + "</small></summary>";
        var body = document.createElement("div");
        body.className = "fm-body";
        if (g === "other" && root.nIndet) body.appendChild(indetEl(root));
        list.sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (c) { body.appendChild(faunaEl(c, false)); });
        d.appendChild(body);
        box.appendChild(d);
      });
      Object.keys(root.children).filter(function (k) { return root.children[k].level === "unplaced"; })
        .forEach(function (k) { box.appendChild(faunaEl(root.children[k], false)); });
    });
  }
  function collsEl(colls) {
    var ids = Object.keys(colls);
    var d = document.createElement("details");
    d.className = "fm-colls";
    d.innerHTML = "<summary>" + esc(tr("formation.colls", { n: fmtNum(ids.length) })) + "</summary><ul>" + ids.slice(0, 200).map(function (id) {
      return '<li><a href="' + PBDB_COLL_PAGE + id + '" target="_blank" rel="noopener">' + esc(colls[id] || id) + "</a></li>";
    }).join("") + (ids.length > 200 ? "<li>…</li>" : "") + "</ul>";
    return d;
  }
  function indetEl(n) {
    var d = document.createElement("details");
    d.className = "fm-indet";
    d.innerHTML = "<summary>" + esc(tr("formation.indet", { n: fmtNum(n.nIndet) })) + "</summary><ul>" +
      Object.keys(n.indet).sort().map(function (k) { return "<li>" + esc(k) + " <small>" + fmtNum(n.indet[k]) + "</small></li>"; }).join("") + "</ul>";
    return d;
  }
  function faunaEl(n, open) {
    var d = document.createElement("details");
    d.className = "fm-node lv-" + n.level;
    if (open) d.open = true;
    var label = n.level === "genus" || n.level === "species" ? taxonLink(n.name, taxonHtml(n.name, n.level)) : '<span class="fm-name">' + esc(n.name) + "</span>";
    // 계급(문·강…)은 적지 않는다 — "문 869" 가 문이 869 개로 읽혔다(연구자, 031). 수는 산출 건수
    d.innerHTML = "<summary>" + label + ' <small class="fm-n">' + esc(tr("formation.n", { n: fmtNum(n.n) })) + "</small></summary>";
    var body = document.createElement("div");
    body.className = "fm-body";
    if (n.nIndet) body.appendChild(indetEl(n));
    if (n.sp) {
      var sp = document.createElement("p");
      sp.className = "fm-sp";
      sp.textContent = tr("formation.spIndet", { n: fmtNum(n.sp) });
      body.appendChild(sp);
    }
    Object.keys(n.children).sort().forEach(function (k) { body.appendChild(faunaEl(n.children[k], false)); });
    if (n.level === "genus" || n.level === "species") body.appendChild(collsEl(n.colls));
    d.appendChild(body);
    return d;
  }

  function noteCountry() {
    // 패널의 국가 절을 치웠다(wetherilli 011) — 고른 나라의 풀이는 찾기 막대의 국가 딱지에 커서를 대면 보인다
    var c = state.countryBy[state.country];
    $("country-chip").title = !c ? "" :
      tr("country.note", { name: c.ko, ocean: c.ocean ? tr("country.ocean") : "", n: fmtNum(c.collections) });
  }

  // 국경선: 켰거나 나라를 골랐을 때만 받는다. 나라를 막 골랐으면 그 나라 쪽으로 지도를 옮긴다.
  function drawBorders(f, focus) {
    borderLayer.clearLayers();
    var want = f.age, show = $("borders").checked;
    if (!f.borders || (!show && !state.country)) return;
    getJSON(dataUrl(f.borders)).then(function (geo) {
      if (frame().age !== want) return;
      borderLayer.clearLayers();
      var iso = state.country && countryIso(state.country);
      var picked = null;
      borderLayer.addData(seamGeo(show ? geo : { type: "FeatureCollection", features: geo.features.filter(function (ft) {
        return ft.properties.cc === iso;
      }) }));
      borderLayer.eachLayer(function (layer) { if (layer.feature.properties.cc === iso) { picked = layer; layer.bringToFront(); } });
      if (focus) focusCountry(picked);
      $("borders-note").textContent = iso && !picked && !state.countryBy[state.country].ocean
        ? tr("borders.young", { name: countryName(state.country), age: fmtAge(want) }) : "";
    });
  }

  // ── 고기후: 지표 기온 (Scotese 2021) ────────────────────────────────
  // 가공물은 회색조 PNG 한 장(361×181, 값 = 기온 + offset). 이것을 캔버스로 읽어 (1) 색을 입혀
  // 겹치고 (2) 커서·산지 자리의 기온을 읽는다. 색표는 여기에만 있다.
  var TEMP_STOPS = [[-40, [44, 62, 158]], [-20, [70, 125, 205]], [0, [127, 196, 232]], [10, [232, 240, 214]],
                    [20, [249, 214, 140]], [30, [240, 140, 70]], [40, [178, 24, 43]]];
  function tempColor(t) {
    if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
    for (var k = 1; k < TEMP_STOPS.length; k++) {
      var hi = TEMP_STOPS[k];
      if (t <= hi[0]) {
        var lo = TEMP_STOPS[k - 1], f = (t - lo[0]) / (hi[0] - lo[0]);
        return [0, 1, 2].map(function (c) { return Math.round(lo[1][c] + (hi[1][c] - lo[1][c]) * f); });
      }
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1];
  }

  function loadGrid(info) {
    if (!state.grids[info.file]) {
      state.grids[info.file] = new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          var ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          var px = ctx.getImageData(0, 0, c.width, c.height).data, values = new Float32Array(c.width * c.height);
          // 0 은 빈칸 — PaleoClim 은 육지만이라 바다가 0 이다(tupandactyl 010). Scotese 자료는 0 이 나오지 않는다
          for (var k = 0; k < values.length; k++) values[k] = px[k * 4] ? px[k * 4] - info.offset : NaN;
          resolve({ w: c.width, h: c.height, values: values });
        };
        img.onerror = reject;
        img.src = dataUrl(info.file);
      });
    }
    return state.grids[info.file];
  }

  // 격자 칸의 가운데가 정수 경위도(북 90 → 남 −90, 서 −180 → 동 180)다.
  function tempAt(grid, lat, lng) {
    var row = Math.round(90 - lat), col = Math.round(((lng + 180) % 360 + 360) % 360);
    row = Math.max(0, Math.min(grid.h - 1, row));
    col = Math.max(0, Math.min(grid.w - 1, col));
    return grid.values[row * grid.w + col];
  }

  function drawClimate(f) {
    if (globe) globe.mark("climate");
    var on = $("climate").checked, info = f.climate;
    $("temp-legend").hidden = !on;
    $("climate-note").textContent = !info ? (f.grid === "plates" ? "" : f.slice ? tr("climate.stageNone", { stage: unit(f.slice.unit).full }) : tr("climate.none")) :
      (info.source_age === f.age || info.gmst == null ? "" : tr("climate.nearest", { age: fmtAge(info.source_age) })) +
      (info.gmst != null ? tr("climate.gmst", { t: info.gmst.toFixed(1) }) : tr("climate.paleoclim", { what: EN ? info.en : info.ko }));
    if (f.grid === "plates") $("temp-legend").hidden = true;
    if (!on || !info) { map.removeLayer(climateLayer); map.removeLayer(climateMoll); return; }
    var want = f.age;
    loadGrid(info).then(function (grid) {
      if (frame().age !== want || !$("climate").checked) return;
      if (state.proj === "moll") {
        map.removeLayer(climateLayer);
        climateMoll.setSource(mollClimate(grid, info.file));
        if (!map.hasLayer(climateMoll)) climateMoll.addTo(map);
        return;
      }
      map.removeLayer(climateMoll);
      var c = document.createElement("canvas");
      c.width = grid.w; c.height = grid.h;
      var ctx = c.getContext("2d"), out = ctx.createImageData(grid.w, grid.h);
      for (var k = 0; k < grid.values.length; k++) {
        if (grid.values[k] !== grid.values[k]) continue;          // 빈칸은 투명(알파 0)
        var rgb = tempColor(grid.values[k]);
        out.data[k * 4] = rgb[0]; out.data[k * 4 + 1] = rgb[1]; out.data[k * 4 + 2] = rgb[2]; out.data[k * 4 + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      climateLayer.setUrl(c.toDataURL());
      if (!map.hasLayer(climateLayer)) climateLayer.addTo(map);
    });
  }

  // 기온 격자를 몰바이데 타원에 옮겨 그린 그림(720×360, 타원 밖은 투명). 칸마다 가장 가까운 격자값.
  // 가운데 경선 0 으로 그린다 — 돌리기는 ReliefOverlay.paint 가 한다. 시점마다 한 번만 만든다.
  var mollClimateCache = {};
  function mollClimate(grid, key) {
    if (mollClimateCache[key]) return mollClimateCache[key];
    var w = 720, h = 360, c = document.createElement("canvas"), flat = { lon0: 0 };
    c.width = w; c.height = h;
    var ctx = c.getContext("2d"), out = ctx.createImageData(w, h);
    for (var r = 0; r < h; r++) {
      var y = SQRT2 - (r + 0.5) / h * 2 * SQRT2;
      for (var q = 0; q < w; q++) {
        var x = (q + 0.5) / w * 4 * SQRT2 - 2 * SQRT2;
        if (x * x / 8 + y * y / 2 > 1) continue;
        var ll = Mollweide.unproject.call(flat, L.point(x, y)), tv = tempAt(grid, ll.lat, ll.lng);
        if (tv !== tv) continue;
        var rgb = tempColor(tv), k = (r * w + q) * 4;
        out.data[k] = rgb[0]; out.data[k + 1] = rgb[1]; out.data[k + 2] = rgb[2]; out.data[k + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return (mollClimateCache[key] = c);
  }

  // 지구본의 기온 층(P01) — 정거원통 720×360 에 칸마다 가장 가까운 격자값. 켜지 않았으면 null.
  var eqClimateCache = {};
  function globeClimate(f) {
    var info = f.climate;
    if (!info || !$("climate").checked) return Promise.resolve(null);
    return loadGrid(info).then(function (grid) {
      if (eqClimateCache[info.file]) return eqClimateCache[info.file];
      var w = 720, h = 360, c = document.createElement("canvas");
      c.width = w; c.height = h;
      var ctx = c.getContext("2d"), out = ctx.createImageData(w, h);
      for (var r = 0; r < h; r++) {
        for (var q = 0; q < w; q++) {
          var tv = tempAt(grid, 90 - (r + 0.5) / 2, (q + 0.5) / 2 - 180);
          if (tv !== tv) continue;
          var rgb = tempColor(tv), k = (r * w + q) * 4;
          out.data[k] = rgb[0]; out.data[k + 1] = rgb[1]; out.data[k + 2] = rgb[2]; out.data[k + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      return (eqClimateCache[info.file] = c);
    }).catch(function () { return null; });
  }

  // 커서 자리의 기온 — 기온 층을 켰을 때만.
  var readout = L.control({ position: "bottomleft" });
  readout.onAdd = function () { var div = L.DomUtil.create("div", "temp-readout"); div.id = "temp-readout"; return div; };
  readout.addTo(map);
  map.on("mousemove", function (e) {
    var f = frame(), box = $("temp-readout");
    if (!f || !f.climate || !$("climate").checked || state.proj === "globe" || !onGlobe(e.containerPoint)) { box.textContent = ""; return; }
    loadGrid(f.climate).then(function (grid) {
      var tv = tempAt(grid, e.latlng.lat, e.latlng.lng);
      if (tv !== tv) { box.textContent = ""; return; }                 // 자료 없는 칸(바다)
      box.textContent = tr("readout", { t: tv.toFixed(0) }) +
        e.latlng.lat.toFixed(1) + "°, " + e.latlng.lng.toFixed(1) + "°";
    });
  });
  map.on("mouseout", function () { $("temp-readout").textContent = ""; });

  // ── 축척 막대(wetherilli 001) ──────────────────────────────────────
  // 두 투영 모두 축척이 자리마다 다르다 — 정거원통은 가로가 cos φ 로 줄고, 몰바이데는 가로·세로가 모두 달라진다.
  // 그래서 **화면 가운데를 지나는 위선 위의 가로 거리**를 잰다. 두 투영에서 위선은 가로 직선이라 막대가 그 위선을 따른다.
  // Leaflet 의 L.control.scale 은 화면 왼쪽 끝에서 재서 몰바이데에서는 지구 밖(위경도 없음)을 잰다. 지구 밖이면 숨긴다.
  // 모양은 GSM 의 막대(OpenLayers ScaleLine bar)를 따른다 — 반투명 판 위에 두 칸이 번갈아 칠해진 두꺼운 막대, 밑에
  // 0·가운데·끝 눈금 숫자. 색은 모두 테마 토큰이다(wetherilli 012). 그래서 L.Control.Scale 을 버리고 직접 그린다.
  var ScaleBar = L.Control.extend({
    options: { position: "bottomright", maxWidth: 150 },
    onAdd: function (m) {
      var box = L.DomUtil.create("div", "scalebar");
      // 옛 지도의 축척 — 잉크와 종이가 번갈아 드는 네 칸, 밑에 눈금 숫자(tupandactyl 007)
      box.innerHTML = '<div class="scalebar-bar"><i></i><i></i><i></i><i></i></div>' +
        '<div class="scalebar-ticks"><span>0</span><span></span><span></span></div>';
      this._box = box;
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      draggable(box, "wegener.scale", m.getContainer());
      m.on("move zoom resize viewreset", this._update, this);
      m.whenReady(this._update, this);
      return box;
    },
    onRemove: function (m) { m.off("move zoom resize viewreset", this._update, this); },
    _update: function () {
      var m = this._map, size = m.getSize(), half = this.options.maxWidth / 2, box = this._box;
      var a = L.point(size.x / 2 - half, size.y / 2), b = L.point(size.x / 2 + half, size.y / 2);
      if (!size.x || !onGlobe(a) || !onGlobe(b)) { box.style.visibility = "hidden"; return; }
      var la = m.containerPointToLatLng(a), lb = m.containerPointToLatLng(b);
      var dLon = ((lb.lng - la.lng) % 360 + 360) % 360;       // 가운데 경선을 돌려도 동쪽으로 잰 경도 차
      var meters = 6371008.8 * dLon * DEG * Math.cos(la.lat * DEG);
      if (!(meters > 0)) { box.style.visibility = "hidden"; return; }
      // maxWidth 안에 드는 가장 큰 1·2·5 × 10ⁿ
      var pow = Math.pow(10, Math.floor(Math.log(meters) / Math.LN10)), d = meters / pow;
      var nice = pow * (d >= 5 ? 5 : d >= 2 ? 2 : 1);
      var km = nice >= 1000, unit = km ? "km" : "m", v = km ? nice / 1000 : nice;
      box.style.visibility = "";
      box.title = tr("scale.title", { lat: la.lat.toFixed(0) });
      box.querySelector(".scalebar-bar").style.width = Math.round(this.options.maxWidth * nice / meters) + "px";
      var t = box.querySelectorAll(".scalebar-ticks span");
      t[1].textContent = fmtNum(v / 2);
      t[2].textContent = fmtNum(v) + " " + unit;
    },
  });
  new ScaleBar().addTo(map);

  // 지도 위 판을 끌어 옮긴다(축척 막대, tupandactyl 007) — 제자리에서 옮긴 만큼을 transform 으로 두고 브라우저에 기억한다.
  // 지도 칸 밖으로는 나가지 않는다. Leaflet 의 컨트롤 자리(모서리)는 그대로라 창 크기가 바뀌어도 모서리를 따라간다
  function draggable(el, key, bounds) {
    var off = { x: 0, y: 0 };
    try { off = JSON.parse(localStorage.getItem(key)) || off; } catch (e) { /* 막힌 저장소 */ }
    function apply() {
      el.style.transform = "translate(" + off.x + "px," + off.y + "px)";
      var r = el.getBoundingClientRect(), b = bounds.getBoundingClientRect(), dx = 0, dy = 0;
      if (r.left < b.left) dx = b.left - r.left; else if (r.right > b.right) dx = b.right - r.right;
      if (r.top < b.top) dy = b.top - r.top; else if (r.bottom > b.bottom) dy = b.bottom - r.bottom;
      if (dx || dy) { off.x += dx; off.y += dy; el.style.transform = "translate(" + off.x + "px," + off.y + "px)"; }
    }
    el.classList.add("movable");
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      var sx = e.clientX - off.x, sy = e.clientY - off.y;
      el.setPointerCapture(e.pointerId); el.classList.add("dragging");
      function move(ev) { off = { x: ev.clientX - sx, y: ev.clientY - sy }; apply(); }
      function end() {
        el.classList.remove("dragging");
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", end); el.removeEventListener("pointercancel", end);
        try { localStorage.setItem(key, JSON.stringify(off)); } catch (e2) { /* 막힌 저장소 */ }
      }
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    });
    window.addEventListener("resize", apply);
    setTimeout(apply, 0);
  }

  // ── 그림으로 내려받기(wetherilli 008) ──────────────────────────────
  // 지금 보이는 지도를 PNG 한 장으로. 지도는 창(pane)마다 캔버스(배경·기온·산지)·그림(정거원통 기온)·SVG(해안선·국경·
  // 경위선)로 그려져 있어, 화면에 놓인 자리(getBoundingClientRect) 그대로 겹 순서대로 한 캔버스에 옮긴다.
  // 밑에 띠를 붙여 시점·층서·평균 기온·투영·거르기·출처·주소·날짜를 적는다 — 그림만 떨어져 돌아다녀도 무엇인지 알게.
  // ── 도구 묶음(wetherilli 014) ──────────────────────────────────────
  // GSM 의 지도 위 손잡이처럼 오른쪽 위에 세로로 붙인다 — 아이콘 밑에 이름. 그림 단추(008)가 혼자 떠 있던 자리다.
  // 확대 · 축소 · 전체 보기 · 거리 재기 · 링크 복사 · 다운로드 | 지우기. 잰 결과는 묶음 왼쪽의 칸(.tool-out)에 적는다.
  // 확대·축소 단추는 wetherilli 001 에서 치웠다가(휠로 된다) 연구자가 다시 바라 묶음 맨 위에 둔다(tupandactyl 004).
  var ICON = {
    zoomin: '<circle class="stroke" cx="10.5" cy="10.5" r="6"/><path class="stroke" d="M15 15l5 5M8 10.5h5M10.5 8v5"/>',
    zoomout: '<circle class="stroke" cx="10.5" cy="10.5" r="6"/><path class="stroke" d="M15 15l5 5M8 10.5h5"/>',
    world: '<circle class="stroke" cx="12" cy="12" r="8"/><path class="stroke" d="M4 12h16M12 4c-3 3-3 13 0 16M12 4c3 3 3 13 0 16"/>',
    measure: '<path class="stroke dash" d="M6 18 18 6"/><circle cx="5" cy="19" r="2.3"/><circle cx="19" cy="5" r="2.3"/>',
    link: '<path class="stroke" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path class="stroke" d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    export: '<rect class="stroke" x="4" y="4" width="16" height="13" rx="1.5"/><path class="stroke" d="m6.5 14 3.5-4 3 3 2-2 2.5 3"/><path class="stroke" d="M12 17v4M9.5 19l2.5 2 2.5-2"/>',
    clear: '<path class="stroke" d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  };
  var measure = { on: false, pts: [], age: null, layer: L.layerGroup().addTo(map), live: null };
  var tools = L.control({ position: "topright" });
  tools.onAdd = function () {
    var box = L.DomUtil.create("div", "maptools");
    box.setAttribute("role", "toolbar");
    box.setAttribute("aria-label", tr("tool.cap"));
    function btn(key, id, cls) {
      return '<button type="button" class="mtool' + (cls ? " " + cls : "") + '" id="' + id + '" title="' + esc(tr(key + ".title")) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[id.replace("tool-", "")] + "</svg><span>" + esc(tr(key)) + "</span></button>";
    }
    box.innerHTML = '<div class="tool-col">' +
      '<div class="tool-cap">' + esc(tr("tool.cap")) + "</div>" +
      btn("tool.zoomin", "tool-zoomin") + btn("tool.zoomout", "tool-zoomout") + '<span class="tool-sep" aria-hidden="true"></span>' +
      btn("tool.world", "tool-world") + btn("tool.measure", "tool-measure") + btn("tool.link", "tool-link") +
      btn("export", "tool-export") + '<span class="tool-sep" aria-hidden="true"></span>' +
      btn("tool.clear", "tool-clear", "danger") + '</div><output class="tool-out" id="tool-out" hidden></output>';
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.disableScrollPropagation(box);
    return box;
  };
  tools.addTo(map);
  $("tool-measure").setAttribute("aria-pressed", "false");
  $("tool-clear").disabled = true;
  // 한 번에 한 단계. 지구본은 카메라 높이를 반으로·두 배로(globe.js 가 가장 낮은·높은 높이로 가둔다)
  function zoomBy(dir) {
    if (state.proj === "globe") { globe.zoom(dir > 0 ? 0.5 : 2); return; }
    if (dir > 0) map.zoomIn(); else map.zoomOut();
  }
  $("tool-zoomin").addEventListener("click", function () { zoomBy(1); });
  $("tool-zoomout").addEventListener("click", function () { zoomBy(-1); });
  // 평면 지도에서는 더 들어갈·물러날 수 없으면 흐리게
  function syncZoomButtons() {
    var flat = state.proj !== "globe", z = map.getZoom();
    $("tool-zoomin").disabled = flat && z >= map.getMaxZoom();
    $("tool-zoomout").disabled = flat && z <= map.getMinZoom();
  }
  map.on("zoomend", syncZoomButtons);
  syncZoomButtons();
  $("tool-world").addEventListener("click", function () {
    if (state.proj === "globe") { globe.home(); return; }
    map.flyTo(worldCenter(), worldZoom(), { duration: 0.6 });
  });
  $("tool-link").addEventListener("click", function () {
    var b = this;
    copyText(location.href).then(function () { return tr("tool.link.done"); }, function () { return tr("copy.fail"); }).then(function (said) {
      b.dataset.flash = said;
      b.classList.add("flash");
      clearTimeout(b._flash);
      b._flash = setTimeout(function () { b.classList.remove("flash"); }, 1200);
    });
  });
  // 다운로드 — 그림(PNG)과 지금 보이는 산지(CSV·GeoJSON, tupandactyl 024). 단추를 누르면 묶음 왼쪽 칸에 셋을 편다
  $("tool-export").addEventListener("click", function () {
    var out = $("tool-out");
    if (out.dataset.menu === "export" && !out.hidden) { out.hidden = true; out.dataset.menu = ""; return; }
    out.dataset.menu = "export";
    out.hidden = false;
    out.innerHTML = '<div class="export-menu"><button type="button" data-kind="png">' + esc(tr("export.png")) + "</button>" +
      '<button type="button" data-kind="csv">' + esc(tr("export.csv")) + "</button>" +
      '<button type="button" data-kind="geojson">' + esc(tr("export.geojson")) + "</button></div>";
    out.querySelectorAll("[data-kind]").forEach(function (b) {
      b.addEventListener("click", function () {
        var kind = b.dataset.kind;
        if (kind === "png") {
          b.disabled = true;
          exportMap().catch(function (err) { console.error(err); b.textContent = tr("export.fail"); })
            .then(function () { b.disabled = false; out.hidden = true; out.dataset.menu = ""; });
          return;
        }
        var n = exportData(kind);
        b.textContent = tr("export.saved", { n: fmtNum(n) });
        setTimeout(function () { out.hidden = true; out.dataset.menu = ""; }, 1200);
      });
    });
  });
  $("tool-measure").addEventListener("click", function () { setMeasuring(!measure.on); });
  $("tool-clear").addEventListener("click", function () { clearMeasure(); });

  // 거리 재기 — 눌러 가며 잇고, 두 번 누르거나 Esc 로 끝낸다. 좌표는 그 시점의 고좌표라 **그때의 대권 거리**다.
  // 시점을 옮기면 점들이 뜻을 잃어(땅이 움직였다) 지운다. 선은 대권을 따라 1° 남짓으로 쪼개 긋고 이음매에서 끊는다.
  function setMeasuring(on) {
    measure.on = on;
    $("tool-measure").classList.toggle("on", on);
    $("tool-measure").setAttribute("aria-pressed", String(on));
    map.getContainer().classList.toggle("measuring", on);
    if (on) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
    if (!on && measure.live) { measure.layer.removeLayer(measure.live); measure.live = null; }
    if (on && !measure.pts.length) measure.age = frame() ? frame().age : null;
    writeMeasure();
  }
  function clearMeasure() {
    measure.pts = [];
    measure.live = null;
    measure.layer.clearLayers();
    measure.age = frame() ? frame().age : null;
    writeMeasure();
  }
  function arcKm(a, b) {
    var p1 = a.lat * DEG, p2 = b.lat * DEG, dp = p2 - p1, dl = (b.lng - a.lng) * DEG;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // 대권 위의 점들([경도, 위도]) — 구면 선형 보간
  function arcCoords(a, b) {
    var d = arcKm(a, b) / 6371.0088, n = Math.max(1, Math.ceil(d / DEG)), out = [];
    function v(p) { var la = p.lat * DEG, lo = p.lng * DEG; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
    var A = v(a), B = v(b);
    for (var k = 0; k <= n; k++) {
      var t = k / n, s1 = d ? Math.sin((1 - t) * d) / Math.sin(d) : 1 - t, s2 = d ? Math.sin(t * d) / Math.sin(d) : t;
      var x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
      out.push([Math.atan2(y, x) / DEG, Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG]);
    }
    return out;
  }
  function arcLine(a, b, cls) {
    var parts = splitLine(arcCoords(a, b), state.proj === "moll" ? Mollweide.lon0 : 0).map(function (line) {
      return line.map(function (c) { return [c[1], c[0]]; });
    });
    return L.polyline(parts, { className: cls, interactive: false });
  }
  function drawMeasure() {
    measure.layer.clearLayers();
    measure.live = null;
    for (var k = 1; k < measure.pts.length; k++) measure.layer.addLayer(arcLine(measure.pts[k - 1], measure.pts[k], "measure-line"));
    measure.pts.forEach(function (p) {
      measure.layer.addLayer(L.circleMarker(p, { radius: 4, className: "measure-pt", interactive: false }));
    });
  }
  function writeMeasure(extra) {
    var out = $("tool-out"), n = measure.pts.length, total = 0;
    for (var k = 1; k < n; k++) total += arcKm(measure.pts[k - 1], measure.pts[k]);
    if (extra) total += extra;
    $("tool-clear").disabled = !n;
    if (!measure.on && !n) { out.hidden = true; return; }
    out.hidden = false;
    out.innerHTML = n < 2 && !extra ? esc(tr("measure.start")) :
      "<b>" + fmtNum(Math.round(total)) + " km</b> · " + esc(tr("measure.segs", { n: n - 1 + (extra ? 1 : 0) })) +
      "<br><small>" + esc(tr("measure.about", { age: fmtAge(measure.age) })) + "</small>";
  }
  map.on("click", function (e) {
    if (!measure.on || !onGlobe(e.containerPoint)) return;
    if (!measure.pts.length) measure.age = frame().age;
    measure.pts.push(L.latLng(e.latlng.lat, wrap180(e.latlng.lng)));
    drawMeasure();
    writeMeasure();
  });
  map.on("dblclick", function () {
    if (!measure.on) return;
    // 두 번 누르면 click 이 둘 먼저 와 같은 자리에 점이 겹친다 — 하나를 버리고 끝낸다
    var n = measure.pts.length;
    if (n > 1 && map.latLngToContainerPoint(measure.pts[n - 1]).distanceTo(map.latLngToContainerPoint(measure.pts[n - 2])) < 6) measure.pts.pop();
    drawMeasure();
    setMeasuring(false);
  });
  map.on("mousemove", function (e) {
    if (!measure.on || !measure.pts.length) return;
    if (measure.live) measure.layer.removeLayer(measure.live);
    var last = measure.pts[measure.pts.length - 1], here = L.latLng(e.latlng.lat, wrap180(e.latlng.lng));
    if (!onGlobe(e.containerPoint)) { measure.live = null; writeMeasure(); return; }
    measure.live = arcLine(last, here, "measure-line live").addTo(measure.layer);
    writeMeasure(arcKm(last, here));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && measure.on) setMeasuring(false);
  });

  function svgImage(svg) {
    var copy = svg.cloneNode(true);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.removeAttribute("style");   // Leaflet 이 자리를 잡는 transform — 그림 안에서 다시 먹어 선이 밀렸다
    // 색을 CSS 로 칠한 선(잰 선, wetherilli 014)은 떼어 낸 SVG 에서 토큰을 못 읽는다 — 화면의 계산된 색을 적어 넣는다
    var live = svg.querySelectorAll("path[class]"), dead = copy.querySelectorAll("path[class]");
    Array.prototype.forEach.call(live, function (el, k) {
      if (!/measure-/.test(el.getAttribute("class"))) return;
      var cs = getComputedStyle(el);
      ["stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "fill", "fill-opacity"].forEach(function (a) {
        dead[k].setAttribute(a, cs.getPropertyValue(a));
      });
    });
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("svg")); };
      img.src = url;
    });
  }

  function exportMap() {
    var f = frame();
    if (!f) return Promise.resolve();
    var box = map.getContainer(), R = box.getBoundingClientRect(), W = Math.round(R.width), H = Math.round(R.height);
    var dpr = Math.min(2, window.devicePixelRatio || 1), STRIP = 66;
    var out = document.createElement("canvas");
    out.width = W * dpr; out.height = (H + STRIP) * dpr;
    var ctx = out.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = getComputedStyle(box).backgroundColor || "#06162f";
    ctx.fillRect(0, 0, W, H);
    // 겹 순서: 배경(380) < 기온(390) < 선(400, overlayPane) < 산지(450)
    if (state.proj === "globe") {
      // 지구본은 Cesium 캔버스 한 장이다 — 그린 바로 그 틀에서 옮겨 담은 것을 깐다(P01)
      return globe.snapshot().then(function (shot) {
        ctx.drawImage(shot, 0, 0, W, H);
        drawExportStrip(ctx, f, W, H, STRIP);
        return saveCanvas(out, f);
      });
    }
    var els = [];
    ["base", "climate", "overlayPane", "fossils"].forEach(function (name) {
      map.getPane(name).querySelectorAll("canvas, img, svg").forEach(function (el) {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return;
        els.push(el);
      });
    });
    return Promise.all(els.map(function (el) {
      return el.tagName.toLowerCase() === "svg" ? svgImage(el).catch(function () { return null; }) : Promise.resolve(el);
    })).then(function (sources) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      els.forEach(function (el, k) {
        var src = sources[k], r = el.getBoundingClientRect();
        if (!src || !r.width || !r.height) return;
        if (src.tagName === "IMG" && !src.complete) return;
        var style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return;
        ctx.globalAlpha = +style.opacity;
        ctx.drawImage(src, r.left - R.left, r.top - R.top, r.width, r.height);
      });
      ctx.restore();
      ctx.globalAlpha = 1;
      drawExportScale(ctx, R, W, H);
      drawExportStrip(ctx, f, W, H, STRIP);
      return saveCanvas(out, f);
    });
  }
  function saveCanvas(out, f) {
    return new Promise(function (resolve, reject) {
      out.toBlob(function (blob) {
        if (!blob) { reject(new Error("toBlob")); return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "wegenersdream_" + String(f.age).replace(".", "_") + "Ma" + (state.proj === "eq" ? "" : "_" + state.proj) + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        resolve();
      }, "image/png");
    });
  }

  // 축척 막대 — 화면의 막대(001·012)를 그 자리에 그 색 그대로 옮겨 그린다(판·두 칸·눈금 숫자)
  function drawExportScale(ctx, R, W, H) {
    var box = map.getContainer().querySelector(".scalebar");
    if (!box || !box.offsetWidth || box.style.visibility === "hidden") return;
    function at(el) { var r = el.getBoundingClientRect(); return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; }
    function fill(el) {
      var r = at(el), cs = getComputedStyle(el), bw = parseFloat(cs.borderTopWidth) || 0;
      if (bw) { ctx.fillStyle = cs.borderTopColor; ctx.fillRect(r.x, r.y, r.w, r.h); }
      ctx.fillStyle = cs.backgroundColor;
      ctx.fillRect(r.x + bw, r.y + bw, r.w - 2 * bw, r.h - 2 * bw);
    }
    fill(box);
    box.querySelectorAll(".scalebar-bar, .scalebar-bar i").forEach(fill);
    box.querySelectorAll(".scalebar-ticks span").forEach(function (el) {
      var r = at(el), cs = getComputedStyle(el);
      ctx.fillStyle = cs.color;
      ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      ctx.textBaseline = "middle";
      ctx.fillText(el.textContent, r.x, r.y + r.h / 2);
    });
  }

  // 밑 띠 — 밝은 바탕에 짙은 글씨로 고정한다(어두운 모드에서 받아도 인쇄·슬라이드에 그대로 쓰게)
  function drawExportStrip(ctx, f, W, H, STRIP) {
    var FONT = getComputedStyle(document.body).fontFamily;   // 화면과 같은 본문 글씨체 — 모드에 따라 다르다(tupandactyl 006·011)
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, H, W, STRIP);
    ctx.fillStyle = "#d8d2c4";
    ctx.fillRect(0, H, W, 1);
    ctx.textBaseline = "alphabetic";
    var units = frameUnits(f).filter(function (u) { return u.rank !== "subperiod"; })
      .map(function (u) { return u.rank === "epoch" ? chipName(u) : u.ko; }).join(" › ");
    var head = fmtAge(f.age) + (units ? "  " + units : "") + (f.label ? " · " + f.label : "") +
      (f.climate && f.climate.gmst != null ? " · " + tr("export.gmst", { t: f.climate.gmst.toFixed(1) }) : "");
    var filters = [tr(state.proj === "moll" ? "export.moll" : state.proj === "globe" ? "export.globe" : "export.eq")];
    if (state.taxon) filters.push(tr("export.taxon", { name: state.taxon }));
    if (state.country) filters.push(tr("export.country", { name: countryName(state.country) }));
    if (state.colorBy === "age") filters.push(tr("export.colorAge"));
    ctx.fillStyle = "#8a4b14";
    ctx.font = "700 14px " + FONT;
    ctx.fillText("Wegener's Dream", 10, H + 20);
    var x = 10 + ctx.measureText("Wegener's Dream").width + 10;
    ctx.fillStyle = "#1f2328";
    ctx.font = "600 13px " + FONT;
    ctx.fillText(head, x, H + 20, W - x - 10);
    ctx.fillStyle = "#5d6470";
    ctx.font = "12px " + FONT;
    ctx.fillText(filters.join(" · "), 10, H + 38, W - 20);
    ctx.font = "11px " + FONT;
    ctx.fillText(tr("attribution") + " · " + location.href + " · " + new Date().toISOString().slice(0, 10), 10, H + 56, W - 20);
  }

  // 고른 나라의 범위로 지도를 당긴다.
  // - 국경 조각들 가운데 가장 큰 조각을 잡고, 그 둘레(20°)의 조각만 함께 넣는다 — 알래스카·하와이,
  //   날짜변경선에서 잘린 러시아 동쪽 끝 같은 조각까지 넣으면 지구 전체로 물러난다
  // - 국경이 없으면(대양 코드, 그 시점에 아직 없는 땅) 그 나라 산지들의 범위로
  function focusCountry(picked) {
    var bounds = null;
    if (picked) {
      var pieces = [];
      (picked.feature.geometry.coordinates || []).forEach(function (line) {
        var b = L.latLngBounds(line.map(function (p) { return [p[1], p[0]]; }));
        pieces.push({ b: b, n: line.length });
      });
      pieces.sort(function (a, b) { return b.n - a.n; });
      if (pieces.length) {
        var big = pieces[0].b;
        bounds = L.latLngBounds(big.getSouthWest(), big.getNorthEast());
        // 둘레는 경위도로 20° 를 더한 상자다. 비율(pad)로 넓히면 러시아처럼 넓은 나라는 지구를 다 덮는다.
        var near = L.latLngBounds([big.getSouth() - 20, big.getWest() - 20], [big.getNorth() + 20, big.getEast() + 20]);
        pieces.slice(1).forEach(function (p) { if (near.intersects(p.b)) bounds.extend(p.b); });
      }
    }
    if (!bounds && state.payload) {
      var col = columns(state.payload), pts = [];
      state.payload.rows.forEach(function (row) {
        if (row[col.cc] === state.country) pts.push([row[col.paleolat], row[col.paleolng]]);
      });
      if (pts.length) bounds = L.latLngBounds(pts);
    }
    if (!bounds) return;
    map.flyToBounds(bounds, { maxZoom: 6, padding: [40, 40], duration: 0.8 });
  }

  // ── 범례(시대 색) ───────────────────────────────────────────────────
  // 퇴적기원 색은 환경 나무의 색 견본이 범례를 겸한다. 시대 색일 때는 지금 보이는 점의 기를 적는다.
  function renderLegend() {
    var box = $("legend");
    app.classList.toggle("color-age", state.colorBy === "age");
    if (state.colorBy !== "age") { box.innerHTML = ""; return; }
    var seen = {};
    var add = function (maxMa, minMa) { var p = periodOf(maxMa, minMa); if (p) seen[p.id] = p; };
    if (state.taxon && state.taxa) {
      state.taxa.forEach(function (row) { if (passes(row[COLUMNS.environment], row[COLUMNS.cc], row[COLUMNS.precise], row[COLUMNS.max_ma], row[COLUMNS.min_ma], row[COLUMNS.formation])) add(row[COLUMNS.max_ma], row[COLUMNS.min_ma]); });
    } else if (state.overview && state.overview.cells) {
      state.overview.cells.forEach(function (c) { add(c.mid, c.mid); });
    } else if (state.payload) {
      var col = columns(state.payload);
      state.payload.rows.forEach(function (row) { if (passes(row[col.environment], row[col.cc], rowPrecise(row, col), row[col.max_ma], row[col.min_ma], row[col.formation])) add(row[col.max_ma], row[col.min_ma]); });
    }
    // 색은 산지 연대 범위의 **중간값이 드는 기**다. 범위가 긴 산지는 지금 시점을 걸쳐도 중간값이 다른 기에 들어,
    // 지금의 기가 아닌 기도 범례에 뜬다(연구자가 물었다) — 그래서 범례 머리에 기준을 적고, 지금 시점의 기를 앞에 굵게 둔다
    var now = state.overview ? null : periodOf(frame().age, frame().age);
    var list = Object.keys(seen).map(function (id) { return seen[id]; }).sort(byOldFirst);
    if (now && seen[now.id]) list = [now].concat(list.filter(function (p) { return p.id !== now.id; }));
    box.innerHTML = '<span class="leg-head">' + tr(state.overview ? "legend.overviewMid" : "legend.mid") + "</span>" + list.map(function (p) {
      return '<span class="leg' + (now && p.id === now.id ? " now" : "") + '"><i class="dot" style="background:' + p.color + '"></i>' + esc(p.ko) + "</span>";
    }).join("");
  }

  // ── 조작 ────────────────────────────────────────────────────────────
  function bind() {
    // 손으로 시점을 옮기면 차례로 보기를 멈춘다.
    $("slider").addEventListener("input", function () { stopTour(); var j = frameAtSlider(+this.value); if (j !== state.i) show(j); });
    $("older").addEventListener("click", function () { stopTour(); show(state.i - 1); });
    $("younger").addEventListener("click", function () { stopTour(); show(state.i + 1); });
    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
      if (e.key === "ArrowLeft") { stopTour(); show(state.i - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { stopTour(); show(state.i + 1); e.preventDefault(); }
    });
    $("tour").addEventListener("click", function () { if (tour.on) stopTour(); else startTour(); });
    $("coeval").addEventListener("change", drawTaxa);
    $("overview-btn").addEventListener("click", function () { if (state.taxon || state.country || state.formation) startOverview(); });
    // 비교 분류군(tupandactyl 024) — 학명, Casual 이면 한글(관용 표기·한글 찾기 표)도
    $("cmp-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var text = $("cmp-find").value.trim();
      if (!text) return;
      latinOf(text).then(function (latin) {
        if (!latin) { $("anal-note").textContent = tr("cmp.notfound", { name: text }); return; }
        return homonyms(latin).then(function (list) {
          var note = $("anal-note");
          $("cmp-find").value = "";
          note.textContent = "";
          if (list.length < 2) { setCmp(latin); return; }
          note.textContent = tr("cmp.homonym", { name: latin });
          list.forEach(function (h) {                            // 같은 이름의 분류군마다 단추(026)
            var b = document.createElement("button");
            b.type = "button"; b.className = "tool homonym-pick";
            b.textContent = h.name + " — " + (h.group || h.rank) + " · " + tr("suggest.occ", { n: fmtNum(h.occs) }).trim();
            b.addEventListener("click", function () { note.textContent = ""; setCmp(h.name + "#" + h.id); });
            note.appendChild(document.createElement("br"));
            note.appendChild(b);
          });
        });
      });
    });
    $("cmp-clear").addEventListener("click", clearCmp);
    $("formation-clear").addEventListener("click", function () { setFormation(null); });
    $("div-metric").addEventListener("change", renderAnalysis);
    $("anal-big").addEventListener("click", function () { $("anal-dialog").showModal(); renderBig(); });
    window.addEventListener("resize", function () { if (state.taxon) renderAnalysis(); });
    $("show-wide").addEventListener("change", function () {
      state.showWide = this.checked;
      if (state.taxon) computeDist();
      redraw();
    });
    // 연대 범위 막대 — 칸 번호를 SPAN_STEPS 의 값으로(018)
    $("max-span").max = SPAN_STEPS.length - 1;
    $("max-span").value = SPAN_STEPS.length - 1;
    $("max-span").addEventListener("input", function () {
      state.maxSpan = SPAN_STEPS[+this.value];
      $("span-value").textContent = fmtSpan(state.maxSpan);
      if (state.taxon) computeDist();
      redraw();
    });
    $("coeval-rule").addEventListener("change", drawTaxa);
    $("play").addEventListener("change", function () {
      clearInterval(state.playing);
      state.playing = null;
      if (this.checked) {
        state.playing = setInterval(function () {
          show(state.i + 1 < state.frames.length ? state.i + 1 : 0);
        }, 1500);
      }
    });
    $("coast").addEventListener("change", function () { drawCoast(frame()); });
    $("borders").addEventListener("change", function () { drawBorders(frame(), false); });
    $("climate").addEventListener("change", function () { drawClimate(frame()); });
    $("climate-opacity").addEventListener("input", function () {
      climateLayer.setOpacity(+this.value / 100);
      climateMoll.setOpacity(+this.value / 100);
      if (globe) globe.climateOpacity(+this.value / 100);
      $("climate-opacity-value").textContent = this.value + "%";
    });
    $("point-opacity").addEventListener("input", function () {
      state.opacity = +this.value / 100;
      $("point-opacity-value").textContent = this.value + "%";
      redraw();
    });
    document.querySelectorAll('input[name="color-by"]').forEach(function (radio) {
      radio.addEventListener("change", function () { if (radio.checked) { state.colorBy = radio.value; redraw(); } });
    });
    document.querySelectorAll("#proj-seg [data-proj]").forEach(function (b) {
      b.addEventListener("click", function () { setProjection(b.dataset.proj); });
    });
    $("terrain").addEventListener("change", function () { if (globe) globe.mark("terrain"); });
    $("terrain-exag").addEventListener("input", function () {
      $("terrain-exag-value").textContent = "×" + this.value;
      if (globe) globe.mark("terrain");
    });
    $("grid").addEventListener("change", function () {
      if (this.checked) gridLayer.addTo(map); else map.removeLayer(gridLayer);
    });
    $("find-form").addEventListener("submit", function (e) { e.preventDefault(); submitFind(); if (NARROW) $("find").blur(); });
    $("taxon-clear").addEventListener("click", clearTaxon);
    bindSuggest();
  }

  function sources(list) {
    $("sources").innerHTML = list.map(function (s) {
      return "<li>" + esc(s.citation) + ' — <a href="' + esc(s.license_url) + '" target="_blank" rel="noopener">' + esc(s.license) + "</a></li>";
    }).join("");
    map.attributionControl.addAttribution(tr("attribution"));
  }

  // 영어판: 자료의 이름 칸(ko)을 영어로 바꿔 끼운다 — 이름을 쓰는 곳(칩·머리말·환경 나무·팝업·범례·국가)을
  // 고치지 않아도 되게. 환경 용어는 PBDB 원 용어가 영어 이름이다. 국가의 한글 이름은 찾기에 남긴다.
  function localizeIndex(index) {
    // 한글 이름은 kn 칸에 남긴다 — Scientific 모드에서 마우스를 올리면 보인다
    ((index.timescale || {}).units || []).forEach(function (u) { u.kn = u.full; });
    (index.environments || []).forEach(function (top) {
      top.kn = top.ko;
      top.groups.forEach(function (g) { g.kn = g.ko; g.terms.forEach(function (term) { term.kn = term.ko; }); });
    });
    if (SCI) {
      // 전문용어만 영문으로 — 층서 단위와 퇴적 환경. 나라 이름과 화면 문구는 한국어 그대로
      ((index.timescale || {}).units || []).forEach(function (u) { if (u.en) { u.ko = u.en; u.full = u.en; } });
      (index.environments || []).forEach(function (top) {
        if (top.en) top.ko = top.en;
        top.groups.forEach(function (g) {
          if (g.en) g.ko = g.en;
          g.terms.forEach(function (term) { if (term.term) term.ko = term.term; });
        });
      });
      return;
    }
    if (!EN) return;
    ((index.timescale || {}).units || []).forEach(function (u) { if (u.en) { u.ko = u.en; u.full = u.en; } });
    (index.environments || []).forEach(function (top) {
      if (top.en) top.ko = top.en;
      top.groups.forEach(function (g) {
        if (g.en) g.ko = g.en;
        g.terms.forEach(function (term) { if (term.term) term.ko = term.term; });
      });
    });
    (index.countries || []).forEach(function (c) {
      if (!c.en) return;
      c.aka = (c.aka || []).concat([c.ko]);
      c.ko = c.en;
    });
  }

  function start() {
    // 최근의 절에 붙이는 PaleoClim 기온 목록(tupandactyl 010) — 없으면 그 절은 기온 지도가 없다고 말한다
    var recentClimate = getJSON(DATA + "climate/recent.json").then(null, function () { return null; });
    Promise.all([getJSON(DATA + "index.json"), recentClimate]).then(function (got) {
      var index = got[0];
      var recent = got[1];
      state.recentClimate = (recent && recent.snapshots) || [];
      localizeIndex(index);
      // 슬라이더 왼쪽이 옛날이다.
      state.frames = index.frames.slice().sort(function (a, b) { return b.age - a.age; });
      if (index.rules) {
        WINDOW_MA = index.rules.window_ma;
        (index.rules.vague_intervals || []).forEach(function (name) { VAGUE[name] = true; });
      }
      BUILT = index.built_at || "";
      $("slider").max = SLIDER_MAX;
      OLDEST = Math.max.apply(null, [OLDEST].concat(index.frames.map(function (f) { return f.age; })));
      document.querySelector(".timebar .ticks span").textContent = fmtAge(OLDEST);
      sources((index.sources || []).concat(recent && recent.citation ? [recent] : []));
      initTimescale(index.timescale || { units: [] });
      buildRecentSlices();
      initThermo();
      $("temp-bar").style.background = "linear-gradient(90deg," + [-40, -30, -20, -10, 0, 10, 20, 30, 40].map(function (t) {
        return "rgb(" + tempColor(t).join(",") + ")";
      }).join(",") + ")";
      initEnvironments(index.environments || []);
      state.taxaKo = KO ? index.taxa_ko || null : null;           // 한글 찾기 표 — Casual 에서만(021)
      state.lith = index.lithology || null;                    // 암상의 한글(Casual, tupandactyl 020)
      initCountries(index.countries || []);
      initEvents(index.events || []);
      if (!EN) loadLabels();   // 명칭 덮어쓰기는 한국어 이름이다 — 영어판에서는 고치기도 숨는다
      bind();
      $("proj-seg").hidden = !hasMollweide() && !globe;
      document.querySelector('#proj-seg [data-proj="moll"]').hidden = !hasMollweide();
      applyHash(true);
      // 같은 페이지에서 # 만 바뀐 주소로 가면(주소창에 붙여 넣기 등) 다시 불러오지 않는다 — 주소대로 다시 맞춘다.
      // history.replaceState(writeHash)는 hashchange 를 부르지 않는다.
      window.addEventListener("hashchange", function () { applyHash(false); });
      // 첫 배경이 그려지면 대기 화면을 걷는다. 배경이 늦거나 실패해도 12 초 뒤에는 걷는다 — 점·찾기는 쓸 수 있다
      relief.once("load error", hideSplash);
      setTimeout(hideSplash, 12000);
    }).catch(function (err) {
      console.error(err);
      splashFail();
    });
  }

  // ── 대기 화면(wetherilli 005) ──────────────────────────────────────
  // 대기 화면의 움직임(splash.js, tupandactyl 005)이 있으면 그것에 맡긴다 — 움직임이 끝난 뒤에 걷는다
  function hideSplash() {
    if (window.WegenerSplash) { window.WegenerSplash.ready(); return; }
    var box = $("splash");
    if (!box || box.classList.contains("done")) return;
    box.classList.add("done");                     // 0.3 초 흐려지며 걷힌다(CSS)
    setTimeout(function () { box.remove(); }, 400);
  }
  // 자료 목록(index.json)을 못 읽으면 지도가 빈 채로 남는다 — 그렇다고 말하고 다시 불러오는 단추를 준다
  function splashFail() {
    var box = $("splash");
    if (!box) return;
    box.classList.add("failed");
    $("splash-msg").textContent = tr("load.fail");
    var retry = $("splash-retry");
    retry.textContent = tr("load.retry");
    retry.hidden = false;
    retry.addEventListener("click", function () { location.reload(); });
    retry.focus();
  }

  // 주소(#age=…&proj=moll&lon=…&lang=en)대로 시점·투영·가운데 경선을 맞추고 지구 전체를 가운데 둔다.
  // 주소는 옮긴(pan)·확대 상태를 담지 않는다 — 가운데 경선(회전)만 담는다(koprifossillab 030).
  function applyHash(initial) {
    var hash = location.hash;
    var langWanted = (hash.match(/lang=(ko|en)/) || [])[1];
    if (!initial && langWanted && langWanted !== I18N.lang) { location.reload(); return; }   // 언어는 다시 불러와야 바뀐다
    var modeWanted = /mode=casual/.test(hash) ? "casual" : "sci";
    if (!initial && /mode=/.test(hash) && modeWanted !== I18N.mode) { location.reload(); return; }   // 모드도
    var wanted = parseFloat((hash.match(/age=([\d.]+)/) || [])[1]);
    var lonWanted = parseFloat((hash.match(/lon=(-?[\d.]+)/) || [])[1]);
    var latWanted = parseFloat((hash.match(/lat=(-?[\d.]+)/) || [])[1]);
    var altWanted = parseFloat((hash.match(/alt=([\d.]+)/) || [])[1]);
    var proj = hasMollweide() && /proj=moll/.test(hash) ? "moll" : globe && /proj=globe/.test(hash) ? "globe" : "eq";
    Mollweide.lon0 = proj === "moll" && isFinite(lonWanted) ? wrap180(lonWanted) : 0;
    if (proj === "globe") {
      state.globeView = { lon: isFinite(lonWanted) ? lonWanted : 0, lat: isFinite(latWanted) ? latWanted : 15,
                          alt: isFinite(altWanted) ? altWanted * 1000 : 0 };
      if (state.proj === "globe") globe.setView(state.globeView, true);
    }
    if (proj !== state.proj) setProjection(proj);
    else if (proj === "moll") rotateTo(Mollweide.lon0);
    if (proj === "globe") state.globeView = null; else fitWorld();
    // 주소에 시점이 없는 첫 화면은 홀로세(0 Ma) 지도(tupandactyl 007)
    var first = state.frames.findIndex(function (f) { return f.age === wanted; });
    if (first < 0) first = initial ? state.frames.findIndex(function (f) { return f.age === 0; }) : state.i;
    show(first < 0 ? 0 : first);
  }

  // ── 언어(027) ────────────────────────────────────────────────────
  document.querySelectorAll(".lang [data-lang]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.lang === I18N.lang));
    b.addEventListener("click", function () { I18N.setLang(b.dataset.lang); });
  });
  document.documentElement.classList.remove("i18n-pending");

  // ── 화면 모드(tupandactyl 011) ───────────────────────────────────────
  document.querySelectorAll(".mode [data-mode-pick]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.modePick === I18N.mode));
    b.addEventListener("click", function () { I18N.setMode(b.dataset.modePick); });
  });
  // 층서표 줄머리(대·기·세·절)도 전문용어 — Scientific 에서는 영문
  if (SCI) {
    var RANK_EN = { era: "Era", period: "Period", epoch: "Epoch", age: "Age" };
    document.querySelectorAll(".chrono-row").forEach(function (row) {
      var r = row.querySelector(".chips").dataset.rank, cell = row.querySelector(".rank");
      if (RANK_EN[r]) { cell.title = cell.textContent; cell.textContent = RANK_EN[r]; }
    });
  }

  // ── 머리말 엠블럼(tupandactyl 007) ─────────────────────────────────
  // 대기 화면의 끝 모습 — 베게너 초상 메달을 메소사우루스가 두르고 그 몸에 뼈대가 드러난 것. 가죽 머리말 위라 몸은 금박,
  // 뼈는 가죽색으로 판다(금박 장정의 음각처럼). 자리 계산은 meso.js 의 엠블럼 값과 같다(emblem.svg 와 같은 틀)
  (function drawBrandMark() {
    var cv = $("brand-mark"), Meso = window.WegenerMeso;
    if (!cv || !cv.getContext || !Meso) return;
    var img = new Image();
    img.onload = function () {
      var css = cv.clientWidth || 52, dpr = Math.min(3, window.devicePixelRatio || 1), size = css * dpr;
      cv.width = cv.height = Math.round(size);
      var c = cv.getContext("2d"), probe = Meso.emblemRing(0, 0, 1), half = probe.R + .075 * probe.L;
      var Rm = size / 2 / half, ring = Meso.emblemRing(size / 2, size / 2, Rm), iw = 2 * Rm * 480 / 472;
      c.drawImage(img, size / 2 - iw / 2, size / 2 - iw / 2, iw, iw);
      Meso.draw(c, ring.P, ring.L, { fill: "#d8b467", eye: "#3b2415", tuck: 1, teeth: size > 90, bones: 1, boneColor: "#3b2415" });
    };
    img.src = cv.dataset.medal;
  })();

  // ── 화면 밝기(tupandactyl 006) ───────────────────────────────────────
  // 자동(컴퓨터 설정) · 밝게(양피지) · 어둡게(흑단). 고른 것은 브라우저에 기억하고 <html data-theme> 로 입힌다 —
  // <head> 의 스크립트가 그리기 전에 같은 값을 먼저 입힌다
  (function initTheme() {
    var root = document.documentElement, btns = document.querySelectorAll(".theme [data-theme-pick]");
    function paint() {
      var cur = root.dataset.theme || "auto";
      btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.themePick === cur)); });
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.themePick;
        if (v === "auto") delete root.dataset.theme; else root.dataset.theme = v;
        try { if (v === "auto") localStorage.removeItem("wegener.theme"); else localStorage.setItem("wegener.theme", v); } catch (e) { /* 막힌 저장소 */ }
        paint();
      });
    });
    paint();
  })();

  // 읽는 법 — 산출 시대의 수를 어떻게 세는지. 기준 건수(OCC_LIMIT)가 여기 있어 문구를 JS 가 채운다(tupandactyl 003)
  $("guide-dist").textContent = tr("guide.dist", { limit: fmtNum(OCC_LIMIT) });

  // ── 설정 · 자료(wetherilli 003) ──────────────────────────────────────
  // <dialog> 의 showModal — Esc 로 닫히고 뒤는 눌리지 않는다. 바깥(흐린 뒤)을 눌러도 닫는다.
  (function initSettings() {
    var sheet = $("settings");
    if (!sheet.showModal) return;   // 아주 옛 브라우저 — 단추를 눌러도 아무 일이 없다
    // 탭 셋(koprifossillab 039) — 설정 · 소개(만든 사람들·읽는 법) · 자료와 판 이력. 열 때마다 설정 탭부터
    var tabs = sheet.querySelectorAll("[data-stab]");
    function pick(name) {
      tabs.forEach(function (t) {
        var on = t.dataset.stab === name;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        $("stab-" + t.dataset.stab).hidden = !on;
      });
    }
    tabs.forEach(function (t, k) {
      t.addEventListener("click", function () { pick(t.dataset.stab); });
      t.addEventListener("keydown", function (e) {                // 좌우 화살표로 옆 탭
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        var next = tabs[(k + d + tabs.length) % tabs.length];
        pick(next.dataset.stab);
        next.focus();
      });
    });
    $("settings-open").addEventListener("click", function () { pick("look"); sheet.showModal(); });
    $("settings-close").addEventListener("click", function () { sheet.close(); });
    sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.close(); });
  })();   // <head> 가 가려 둔 것을 벗긴다

  // ── 찾기 카드 옮기기(tupandactyl 002) ──────────────────────────────
  // 찾기 칸은 지도 위에 떠 있다. 카드의 빈 자리나 ⠿ 를 끌어 옮긴다 — 칸·단추·딱지를 누른 것은 끌기가 아니다.
  // 자리는 지도 칸 안으로 가두고 브라우저에 기억한다(창 크기에 대한 비율). 후보 목록은 카드가 지도의 위쪽 절반에
  // 있으면 아래로, 아래쪽이면 위로 연다.
  (function initFindFloat() {
    // 기본 자리는 지도 왼쪽 위, 온도계 오른쪽(tupandactyl 007) — 전에 끌어 둔 자리(옛 열쇠)는 새 기본을 위해 버린다
    var KEY = "wegener.find.v2", card = $("findfloat"), col = card.parentNode;
    var pos = null;
    try { pos = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* 막힌 저장소 */ }
    // 휴대폰(760 px 아래)에서는 지도 위쪽에 가로로 붙이고(CSS) 끌지 않는다 — 지도의 왼쪽·오른쪽 위 카드는 그 밑으로 내린다(koprifossillab 035)
    var narrowFind = window.matchMedia ? window.matchMedia("(max-width: 760px)") : { matches: false };
    function place() {
      var W = col.clientWidth, H = col.clientHeight;
      if (narrowFind.matches) {
        $("map").style.setProperty("--find-h", (card.offsetHeight + 14) + "px");
        card.classList.add("below");
        return;
      }
      $("map").style.removeProperty("--find-h");
      if (!pos && W && H) {
        var th = col.querySelector(".thermo"), c = col.getBoundingClientRect();
        if (th && th.offsetWidth) {
          var t = th.getBoundingClientRect();
          card.style.left = Math.round(t.right - c.left + 10) + "px";
          card.style.top = Math.round(t.top - c.top) + "px";
          card.style.bottom = "auto";
        } else if ((place.tries = (place.tries || 0) + 1) < 40) {
          setTimeout(place, 250);                 // 온도계는 자료 목록을 받은 뒤에 생긴다 — 생길 때까지 기다린다
        }
      }
      if (pos && W && H) {
        var x = Math.max(0, Math.min(W - card.offsetWidth, pos.x * W));
        var y = Math.max(0, Math.min(H - card.offsetHeight, pos.y * H));
        card.style.left = x + "px";
        card.style.top = y + "px";
        card.style.bottom = "auto";
      }
      card.classList.toggle("below", card.offsetTop + card.offsetHeight / 2 < H / 2);
    }
    card.addEventListener("pointerdown", function (e) {
      if (narrowFind.matches || e.button !== 0 || (e.target !== $("find-grip") && e.target.closest("input, button, a, ul, .fchip"))) return;
      e.preventDefault();
      var ox = e.clientX - card.offsetLeft, oy = e.clientY - card.offsetTop;
      card.classList.add("dragging");
      card.setPointerCapture(e.pointerId);
      function move(ev) {
        var W = col.clientWidth, H = col.clientHeight;
        pos = { x: (ev.clientX - ox) / W, y: (ev.clientY - oy) / H };
        place();
      }
      function end() {
        card.classList.remove("dragging");
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerup", end);
        card.removeEventListener("pointercancel", end);
        try { if (pos) localStorage.setItem(KEY, JSON.stringify(pos)); } catch (e2) { /* 막힌 저장소 */ }
      }
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerup", end);
      card.addEventListener("pointercancel", end);
    });
    if (window.ResizeObserver) { var ro = new ResizeObserver(place); ro.observe(col); ro.observe(card); } else window.addEventListener("resize", place);
    place();
  })();

  // ── 패널 접기(026) ────────────────────────────────────────────────
  // 절 제목을 누르면 그 절을 접는다. 좁은 창(760 px 아래)에서는 패널 전체도 막대 하나로 접는다.
  // 접은 상태는 브라우저에 기억한다(없거나 막혀 있으면 기본값). 기본은 넓은 창이면 모두 펼침,
  // 좁은 창이면 시점만 펼침 — 좁은 창에서 패널이 지도 아래로 가 스크롤이 길었다(TODOs).
  // 좁은 창의 패널은 밑에서 올라오는 판이라 지도를 덮는다 — 처음에는 접어 둔다(koprifossillab 035).
  var PANEL_KEY = "wegener.panel";
  var narrow = window.matchMedia ? window.matchMedia("(max-width: 760px)") : { matches: false };
  function loadPanel() {
    try { return JSON.parse(localStorage.getItem(PANEL_KEY)) || null; } catch (e) { return null; }
  }
  function savePanel() {
    var closed = [];
    document.querySelectorAll(".panel section[data-sec].collapsed").forEach(function (sec) { closed.push(sec.dataset.sec); });
    try { localStorage.setItem(PANEL_KEY, JSON.stringify({ collapsed: closed, panelClosed: app.classList.contains("panel-closed") })); } catch (e) { /* 막힌 저장소 */ }
  }
  function setSection(sec, open) {
    sec.classList.toggle("collapsed", !open);
    sec.querySelector("h2").setAttribute("aria-expanded", String(open));
  }
  function setPanel(open) {
    app.classList.toggle("panel-closed", !open);
    $("panel-bar").setAttribute("aria-expanded", String(open));
    $("panel-bar").textContent = tr(open ? "panel.close" : "panel.open");
  }
  (function initPanel() {
    var saved = loadPanel();
    document.querySelectorAll(".panel section[data-sec]").forEach(function (sec) {
      var h2 = sec.querySelector("h2");
      h2.setAttribute("role", "button");
      h2.tabIndex = 0;
      var open = saved ? saved.collapsed.indexOf(sec.dataset.sec) < 0 : (!narrow.matches || sec.dataset.sec === "time");
      setSection(sec, open);
      function toggle(e) {
        if (e.target.closest("button, input, select, a")) return;   // 제목 안의 단추는 접지 않는다
        setSection(sec, sec.classList.contains("collapsed"));
        savePanel();
      }
      h2.addEventListener("click", toggle);
      h2.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); }
      });
    });
    setPanel(saved ? !saved.panelClosed : !narrow.matches);
    var dragged = false;
    $("panel-bar").addEventListener("click", function () {
      if (dragged) { dragged = false; return; }               // 끌어서 높이를 고른 뒤의 click 은 접고 펴기가 아니다
      setPanel(app.classList.contains("panel-closed"));
      savePanel();
    });
    // 좁은 창 — 막대를 끌어 판의 높이를 고른다(koprifossillab 036). 끝까지 올리면 창 맨 위까지, 맨 밑 가까이 내리면 접힌다.
    // 고른 높이는 창 높이에 대한 비율로 기억한다(SHEET_KEY). 누르기만 하면 전처럼 접고 편다
    var SHEET_KEY = "wegener.sheet", SHEET_MIN = .12;
    function sheetMax() { return window.innerHeight - $("panel-bar").offsetHeight; }
    function setSheet(frac) {
      if (frac == null) app.style.removeProperty("--sheet-h");
      else app.style.setProperty("--sheet-h", (frac * 100).toFixed(2) + "dvh");   // 창 높이가 바뀌어도(주소창·돌리기) 비율대로
    }
    var sheetFrac = null;
    try { sheetFrac = parseFloat(localStorage.getItem(SHEET_KEY)) || null; } catch (e) {}
    if (sheetFrac) setSheet(Math.min(sheetFrac, sheetMax() / window.innerHeight));
    $("panel-bar").addEventListener("pointerdown", function (e) {
      if (!narrow.matches || e.button !== 0) return;
      var bar = this, y0 = e.clientY, panel = $("panel"), moved = false;
      var h0 = app.classList.contains("panel-closed") ? 0 : panel.offsetHeight;
      bar.setPointerCapture(e.pointerId);
      function move(ev) {
        var dy = ev.clientY - y0;
        if (!moved && Math.abs(dy) < 6) return;
        if (!moved) { moved = true; app.classList.add("sheet-dragging"); if (!h0) setPanel(true); }
        var h = Math.max(0, Math.min(sheetMax(), h0 - dy));
        app.style.setProperty("--sheet-h", h + "px");
      }
      function end() {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", end);
        bar.removeEventListener("pointercancel", end);
        if (!moved) return;
        dragged = true;
        setTimeout(function () { dragged = false; }, 400);
        app.classList.remove("sheet-dragging");
        var h = panel.offsetHeight, max = sheetMax();
        if (h < SHEET_MIN * window.innerHeight) { setPanel(false); setSheet(sheetFrac); }   // 거의 내렸으면 접고, 높이는 전의 것
        else {
          if (h > max - 40) h = max;                              // 끝 가까이면 끝까지
          sheetFrac = h / window.innerHeight;
          setSheet(sheetFrac);
          try { localStorage.setItem(SHEET_KEY, sheetFrac.toFixed(3)); } catch (err) {}
        }
        savePanel();
      }
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", end);
      bar.addEventListener("pointercancel", end);
    });
    // 좁은 창에서 찾기 칸을 누르면 판을 내린다 — 후보 목록이 판에 가리지 않게. 기억하지는 않는다
    $("find").addEventListener("focus", function () { if (narrow.matches) setPanel(false); });
    // 좁은 창의 시점 막대 — 처음에는 접어 지도에 자리를 준다. 머리말의 "시점" 단추로 편다. 기억하지 않는다(koprifossillab 038)
    var tb = $("timebar-toggle");
    function setTimebar(open) {
      app.classList.toggle("timebar-closed", !open);
      tb.setAttribute("aria-expanded", String(open));
      tb.textContent = tr(open ? "tb.close" : "tb.open");
      tb.title = tr("tb.title");
    }
    setTimebar(!narrow.matches);
    tb.addEventListener("click", function () { setTimebar(app.classList.contains("timebar-closed")); });
  })();

  start();
})();
