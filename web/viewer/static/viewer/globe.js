/* 세 번째 투영: 3D 지구본(wetherilli P01).
 *
 * 지구본은 자료를 따로 거르지 않는다 — map.js 가 그린 Leaflet 층(산지·분류군 점, 해안선·국경·경위선)을 읽어
 * 둥근 지구 위에 같은 것을 긋는다. 거르기·색 규칙이 두 곳에 생기지 않게 하려는 것이다. map.js 는 층을 다시 그릴
 * 때마다 mark(무엇) 을 부르고, 지구본은 다음 그리기 틀에서 그것만 다시 읽는다.
 *
 * Cesium(5.8 MB)은 지구본을 처음 고를 때만 싣는다. Cesium ion 은 쓰지 않는다(바깥 요청 없음).
 */
(function () {
  "use strict";

  var MIN_ALT = 2.5e5, MAX_ALT = 4e7;
  var LINE_HEIGHT = 3000;               // 선을 땅에서 조금 띄운다 — 2° 마디의 현이 지구 속으로 꺼지지 않게(1 km 남짓)
  var LINE_TERRAIN_PAD = 400;           // m × 과장 — 멀리서 Cesium 이 지형을 성기게 그려 마디 사이 높이가 격자와 어긋나는 만큼
  var EYE_OFFSET = -60000;              // 점을 카메라 쪽으로 당겨 지구 겉면에 파묻히지 않게. 뒤편 반구의 점은 여전히 가린다

  function loadCesium(base) {
    if (window.Cesium) return Promise.resolve(window.Cesium);
    window.CESIUM_BASE_URL = base;
    return new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = base + "Widgets/widgets.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = base + "Cesium.js";
      s.onload = function () { resolve(window.Cesium); };
      s.onerror = function () { reject(new Error("Cesium")); };
      document.head.appendChild(s);
    });
  }

  function cssVar(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }

  // 점 모양 한 장 — Leaflet 표지의 옵션(원·세모, 채움·테두리 색과 투명도, 반지름)을 그대로 캔버스에 그린다.
  // 세모는 map.js 의 L.Canvas._updateTriangle 과 같은 꼴(반지름 × 1.45). 같은 모양은 그림 한 장을 나눠 쓴다.
  var markCache = {};
  function markImage(o, triangle) {
    var key = [triangle ? 1 : 0, o.radius, o.weight, o.color, o.opacity, o.fillColor, o.fillOpacity].join("|");
    if (markCache[key]) return markCache[key];
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var r = triangle ? o.radius * 1.45 : o.radius, half = Math.ceil(r + o.weight + 1), size = half * 2;
    var c = document.createElement("canvas");
    c.width = c.height = size * dpr;
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    if (triangle) {
      ctx.moveTo(half, half - r);
      ctx.lineTo(half + r * 0.866, half + r * 0.5);
      ctx.lineTo(half - r * 0.866, half + r * 0.5);
      ctx.closePath();
    } else {
      ctx.arc(half, half, r, 0, Math.PI * 2);
    }
    ctx.globalAlpha = o.fillOpacity;
    ctx.fillStyle = o.fillColor;
    ctx.fill();
    ctx.globalAlpha = o.opacity;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = o.weight;
    ctx.stroke();
    return (markCache[key] = { url: c.toDataURL(), size: size });
  }

  // Leaflet 의 선(폴리라인·다각형, 여러 조각 포함)을 [[위도, 경도] …] 조각들로 편다. 다각형은 고리를 닫는다.
  function lineParts(layer, L) {
    var out = [], closed = layer instanceof L.Polygon;
    (function walk(ll) {
      if (!ll.length) return;
      if (ll[0] instanceof L.LatLng) {
        var part = ll.slice();
        if (closed && part.length > 2) part.push(part[0]);
        out.push(part);
      } else {
        ll.forEach(walk);
      }
    })(layer.getLatLngs());
    return out;
  }

  /**
   * opts: { box: 지도 칸(#map), map: Leaflet 지도, base: Cesium 이 놓인 주소, L,
   *         layers: { fossils, taxa, lines: [층…] },
   *         reliefUrl(f), reliefTiles(f) → { url, zoom, size } | null, climate(f) → Promise<캔버스|null>, climateOpacity() → 0~1, frame(),
   *         onView(자리) — 카메라가 멈출 때(주소를 고친다), onLoading(bool), avoid() → 팝업이 덮지 않을 요소들,
   *         terrain(f) → { url, step, offset, unit } | null — 지형을 세울 때(끄거나 없으면 null), exaggeration() → 배 }
   */
  window.WegenerGlobe = function (opts) {
    var L = opts.L, box = opts.box;
    var host = document.createElement("div");
    host.className = "globe-host";
    host.hidden = true;
    box.appendChild(host);
    L.DomEvent.disableClickPropagation(host);
    L.DomEvent.disableScrollPropagation(host);

    var C = null, widget = null, scene = null;
    var reliefLayer = null, reliefFor = null, tilesLayer = null, climateLayer = null, climateFor = null, shadeLayer = null, shadeFor = null;
    var points = null, lines = null;
    var dirty = {}, frameReq = 0, ready = null, active = false;
    var pop = null, tip = null, hoverReq = 0, hoverPos = null, pending = null;
    var relief3d = null, terrainFor = null, exag = 1;          // 지금 세운 지형 격자(없으면 null)와 과장 배수

    function open() {
      active = true;
      host.hidden = false;
      if (!ready) {
        if (opts.onLoading) opts.onLoading(true);
        ready = loadCesium(opts.base).then(build).then(function () {
          if (opts.onLoading) opts.onLoading(false);
        }, function (err) {
          ready = null;
          if (opts.onLoading) opts.onLoading(false, err);
          throw err;
        });
      }
      return ready.then(function () {
        widget.resize();
        mark("all");
      });
    }

    function close() {
      active = false;
      host.hidden = true;
      closePopup();
      hideTip();
    }

    function build(Cesium) {
      C = Cesium;
      var credits = document.createElement("div");
      credits.hidden = true;
      widget = new C.CesiumWidget(host, {
        baseLayer: false,                                  // 기본 영상(ion)을 부르지 않는다 — 배경은 시점마다 우리 그림
        terrainProvider: new C.EllipsoidTerrainProvider(),
        skyBox: false,
        skyAtmosphere: new C.SkyAtmosphere(),
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
        creditContainer: credits,
        useBrowserRecommendedResolution: false,
      });
      scene = widget.scene;
      window.__scene = scene;             // 헤드리스 확인용
      scene.canvas._leaflet_disable_events = true;         // 지구본 위의 움직임을 Leaflet(숨은 지도)이 받지 않게
      scene.globe.enableLighting = false;                  // 배경 그림에 음영이 이미 구워져 있다
      scene.globe.showGroundAtmosphere = false;
      scene.globe.baseColor = C.Color.fromCssColorString("#0b2447");
      scene.fog.enabled = false;
      if (scene.sun) scene.sun.show = false;
      if (scene.moon) scene.moon.show = false;
      scene.backgroundColor = C.Color.fromCssColorString(cssVar(box, "--globe-space", "#05070d"));
      var ctl = scene.screenSpaceCameraController;
      ctl.minimumZoomDistance = MIN_ALT;
      ctl.maximumZoomDistance = MAX_ALT;
      setView(pending || { lon: 0, lat: 15, alt: 0 }, false);
      pending = null;
      scene.camera.moveEnd.addEventListener(function () { if (opts.onView) opts.onView(view()); });
      scene.camera.percentageChanged = 0.01;
      scene.camera.changed.addEventListener(function () { placePopup(); hideTip(); });
      scene.postRender.addEventListener(placePopup);

      points = scene.primitives.add(new C.BillboardCollection({ scene: scene }));
      lines = scene.primitives.add(new C.PolylineCollection());

      var handler = new C.ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction(function (e) {
        var hit = pickMarker(e.position);
        if (!hit) {
          // 빈 자리 — 팝업이 열려 있었으면 닫기만, 아니면 그 땅을 알린다(빈 땅의 지금 나라, tupandactyl 038)
          if (pop) { closePopup(); return; }
          var ll = opts.onEmptyClick && groundAt(e.position);
          if (ll) opts.onEmptyClick(ll);
          return;
        }
        hideTip();
        hit.fire("click", { latlng: hit.getLatLng(), originalEvent: null });
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction(function (e) {
        hoverPos = e.endPosition;
        if (!hoverReq) hoverReq = requestAnimationFrame(hover);
      }, C.ScreenSpaceEventType.MOUSE_MOVE);
      scene.canvas.addEventListener("mouseleave", hideTip);
    }

    // 화면의 한 점이 가리키는 땅의 경위도 — 지형을 세웠으면 지형 면에서, 아니면 타원체에서. 지구 밖이면 null
    function groundAt(pos) {
      var ray = scene.camera.getPickRay(pos), at = ray && scene.globe.pick(ray, scene);
      if (!at) at = scene.camera.pickEllipsoid(pos, scene.globe.ellipsoid);
      if (!at) return null;
      var c = C.Cartographic.fromCartesian(at);
      return { lat: C.Math.toDegrees(c.latitude), lng: C.Math.toDegrees(c.longitude) };
    }

    function pickMarker(pos) {
      var picked = pos && scene.pick(pos);
      var id = picked && picked.id;
      return id && id.fire && id.getLatLng ? id : null;
    }

    // ── 층을 비추기 ────────────────────────────────────────────────────
    function mark(what) {
      if (what === "all") { dirty.relief = dirty.climate = dirty.shade = dirty.points = dirty.lines = dirty.terrain = true; }
      else dirty[what] = true;
      if (!active || !scene || frameReq) return;
      frameReq = requestAnimationFrame(flush);
    }

    function flush() {
      frameReq = 0;
      if (!active || !scene) return;
      var f = opts.frame();
      if (dirty.relief && f) syncRelief(f);
      if (dirty.climate && f) syncClimate(f);
      if (dirty.shade && f && opts.shade) syncShade(f);
      // 지형은 격자를 받은 뒤에 점·선을 그 높이로 다시 앉힌다 — 받는 동안은 옛 높이로 둔다
      if ((dirty.terrain || dirty.relief) && f) syncTerrain(f);
      if (dirty.points) syncPoints();
      if (dirty.lines) syncLines();
      dirty = {};
      scene.requestRender();
    }

    // ── 지형(wetherilli 017) ─────────────────────────────────────────────
    // 격자(terrain.py 가 구운 1/4° 마디, R·G 두 칸에 (해발 + offset) / unit)를 캔버스로 읽어 Float32 해발(m)로 편다.
    // 받은 격자는 몇 장 들고 있는다 — 밀대를 오가면 다시 받지 않게.
    var gridCache = {}, gridOrder = [];
    function loadHeights(info) {
      if (!gridCache[info.url]) {
        gridCache[info.url] = new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () {
            var c = document.createElement("canvas");
            c.width = img.width; c.height = img.height;
            var ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            var px = ctx.getImageData(0, 0, c.width, c.height).data, v = new Float32Array(c.width * c.height);
            for (var k = 0; k < v.length; k++) v[k] = (px[k * 4] * 256 + px[k * 4 + 1]) * info.unit - info.offset;
            resolve({ w: c.width, h: c.height, step: info.step, v: v });
          };
          img.onerror = reject;
          img.src = info.url;
        });
        gridOrder.push(info.url);
        if (gridOrder.length > 4) delete gridCache[gridOrder.shift()];
      }
      return gridCache[info.url];
    }

    // 격자의 해발(m) — 마디 사이는 둘레 넷으로 선형 보간. 경도는 −180~180 을 한 바퀴로 잇는다
    function heightAt(g, lat, lng) {
      var y = (90 - lat) / g.step, x = (((lng + 180) % 360) + 360) % 360 / g.step;
      y = Math.max(0, Math.min(g.h - 1.001, y));
      x = Math.max(0, Math.min(g.w - 1.001, x));
      var r = Math.floor(y), c = Math.floor(x), fy = y - r, fx = x - c, w = g.w, v = g.v;
      var a = v[r * w + c], b = v[r * w + c + 1], d = v[(r + 1) * w + c], e = v[(r + 1) * w + c + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
    // 점·선을 앉힐 높이(m) — Cesium 이 지형에 건 과장과 같은 배수를 곱한다
    function liftAt(lat, lng) { return relief3d ? heightAt(relief3d, lat, lng) * exag : 0; }

    var TILE = 33;                                      // 타일 한 변의 마디 수(끝을 이웃과 나눈다)
    function terrainProvider(g) {
      var scheme = new C.GeographicTilingScheme();
      return new C.CustomHeightmapTerrainProvider({
        width: TILE, height: TILE, tilingScheme: scheme,
        callback: function (x, y, level) {
          var r = scheme.tileXYToRectangle(x, y, level), out = new Float32Array(TILE * TILE);
          var west = C.Math.toDegrees(r.west), east = C.Math.toDegrees(r.east);
          var north = C.Math.toDegrees(r.north), south = C.Math.toDegrees(r.south);
          for (var j = 0; j < TILE; j++) {
            var lat = north - (north - south) * j / (TILE - 1);
            for (var i = 0; i < TILE; i++) out[j * TILE + i] = heightAt(g, lat, west + (east - west) * i / (TILE - 1));
          }
          return out;
        },
        credit: "PaleoDEM (Scotese & Wright 2018)",
      });
    }

    function syncTerrain(f) {
      var info = opts.terrain ? opts.terrain(f) : null, want = info ? info.url : null;
      var e = info ? Math.max(1, opts.exaggeration()) : 1;
      if (want === terrainFor && e === exag) return;
      if (!info) {
        terrainFor = null; relief3d = null; exag = 1;
        scene.terrainProvider = new C.EllipsoidTerrainProvider();
        scene.verticalExaggeration = 1;
        dirty.points = dirty.lines = true;
        return;
      }
      if (want === terrainFor) {                         // 과장만 바뀌었다 — 격자는 그대로
        exag = e;
        scene.verticalExaggeration = e;
        dirty.points = dirty.lines = true;
        return;
      }
      terrainFor = want;
      loadHeights(info).then(function (g) {
        if (terrainFor !== want) return;
        relief3d = g;
        exag = Math.max(1, opts.exaggeration());
        scene.terrainProvider = terrainProvider(g);
        scene.verticalExaggeration = exag;
        mark("points");
        mark("lines");
      }).catch(function () { if (terrainFor === want) terrainFor = null; });
    }

    // 배경은 새 그림이 다 온 뒤에 옛 것을 지운다 — 먼저 지우면 받는 동안 파란 바탕이 비친다(021 과 같은 뜻)
    function syncRelief(f) {
      var url = opts.reliefUrl(f);
      if (!url || url === reliefFor) return;
      reliefFor = url;
      C.SingleTileImageryProvider.fromUrl(url).then(function (provider) {
        if (reliefFor !== url) return;
        var layer = scene.imageryLayers.addImageryProvider(provider, 0);
        var old = reliefLayer;
        reliefLayer = layer;
        if (old) setTimeout(function () { scene.imageryLayers.remove(old, true); scene.requestRender(); }, 400);
        syncTiles(f);
        scene.requestRender();
      }).catch(function () { if (reliefFor === url) reliefFor = null; });
    }

    // 가까이 보면 8192 폭 배경의 타일(tupandactyl 040) — 평면 지도와 같은 타일을 같은 주소로 받는다. 지형 칸이 그 확대 단계에 이른
    // 뒤에만 보인다(minimumTerrainLevel) — 멀리서는 타일을 하나도 받지 않는다. 한 장짜리 배경 바로 위, 음영 밑
    function syncTiles(f) {
      var t = opts.reliefTiles ? opts.reliefTiles(f) : null;
      if (tilesLayer) { scene.imageryLayers.remove(tilesLayer, true); tilesLayer = null; }
      if (!t) return;
      var provider = new C.UrlTemplateImageryProvider({
        url: t.url, tilingScheme: new C.GeographicTilingScheme(), tileWidth: t.size, tileHeight: t.size,
        minimumLevel: t.zoom, maximumLevel: t.zoom,
      });
      tilesLayer = new C.ImageryLayer(provider, { minimumTerrainLevel: t.zoom });
      scene.imageryLayers.add(tilesLayer, scene.imageryLayers.indexOf(reliefLayer) + 1);
    }

    function syncClimate(f) {
      var key = f.age;
      climateFor = key;
      opts.climate(f).then(function (canvas) {
        if (climateFor !== key) return;
        if (climateLayer) { scene.imageryLayers.remove(climateLayer, true); climateLayer = null; }
        if (!canvas) { scene.requestRender(); return; }
        return C.SingleTileImageryProvider.fromUrl(canvas.toDataURL()).then(function (provider) {
          if (climateFor !== key) return;
          if (climateLayer) scene.imageryLayers.remove(climateLayer, true);
          climateLayer = scene.imageryLayers.addImageryProvider(provider);
          climateLayer.alpha = opts.climateOpacity();
          scene.requestRender();
        });
      });
    }

    // 높이 도드라지게(tupandactyl 037) — map.js 가 만든 정거원통 캔버스를 배경 바로 위에(기온 밑에) 입힌다.
    // 같은 캔버스면 다시 올리지 않는다(시점·방식·과장이 그대로)
    function syncShade(f) {
      var token = {};
      shadeFor = token;
      opts.shade(f).then(function (canvas) {
        if (shadeFor !== token) return;
        if (shadeLayer && shadeLayer._src === canvas) return;
        if (shadeLayer) { scene.imageryLayers.remove(shadeLayer, true); shadeLayer = null; }
        if (!canvas) { scene.requestRender(); return; }
        return C.SingleTileImageryProvider.fromUrl(canvas.toDataURL()).then(function (provider) {
          if (shadeFor !== token) return;
          if (shadeLayer) scene.imageryLayers.remove(shadeLayer, true);
          var under = tilesLayer || reliefLayer, at = under ? scene.imageryLayers.indexOf(under) + 1 : 1;
          shadeLayer = scene.imageryLayers.addImageryProvider(provider, at);
          shadeLayer._src = canvas;
          scene.requestRender();
        });
      });
    }

    // 산지 층을 먼저, 분류군 층을 그 위에 — Leaflet 에서 겹친 차례와 같다
    function syncPoints() {
      points.removeAll();
      var eye = new C.Cartesian3(0, 0, EYE_OFFSET);
      [opts.layers.fossils, opts.layers.taxa].forEach(function (group) {
        group.eachLayer(function (m) {
          if (!m.getLatLng || !m.options || m.options.fillColor == null) return;
          var ll = m.getLatLng(), img = markImage(m.options, m instanceof L.TriangleMarker);
          points.add({
            position: C.Cartesian3.fromDegrees(ll.lng, ll.lat, liftAt(ll.lat, ll.lng)),
            image: img.url, width: img.size, height: img.size,
            eyeOffset: eye, id: m,
          });
        });
      });
    }

    function syncLines() {
      lines.removeAll();
      opts.layers.lines.forEach(function (group) {
        if (!opts.map.hasLayer(group)) return;
        group.eachLayer(function visit(layer) {
          if (layer.eachLayer && !layer.getLatLngs) { layer.eachLayer(visit); return; }
          if (!layer.getLatLngs) return;
          var o = layer.options, color = C.Color.fromCssColorString(o.color || "#fff").withAlpha(o.opacity == null ? 1 : o.opacity);
          var material = C.Material.fromType("Color", { color: color });
          lineParts(layer, L).forEach(function (part) {
            if (part.length < 2) return;
            var flat = [], lift = LINE_HEIGHT + (relief3d ? LINE_TERRAIN_PAD * exag : 0);
            part.forEach(function (p, k) {
              // 지형을 세웠으면 긴 마디(경위선의 2° 등)를 0.5° 로 쪼개 마디마다 그 높이에 앉힌다 — 산을 뚫고 지나가지 않게
              if (relief3d && k) {
                var q = part[k - 1], n = Math.ceil(Math.max(Math.abs(p.lat - q.lat), Math.abs(p.lng - q.lng)) / 0.5);
                for (var t = 1; t < n; t++) {
                  var la = q.lat + (p.lat - q.lat) * t / n, lo = q.lng + (p.lng - q.lng) * t / n;
                  flat.push(lo, la, liftAt(la, lo) + lift);
                }
              }
              flat.push(p.lng, p.lat, liftAt(p.lat, p.lng) + lift);
            });
            lines.add({
              positions: C.Cartesian3.fromDegreesArrayHeights(flat),
              width: Math.max(1, o.weight || 1), material: material,
            });
          });
        });
      });
    }

    // ── 팝업·말풍선 ───────────────────────────────────────────────────
    // 모양은 Leaflet 팝업의 칸(class)을 그대로 빌려 map.css 의 꾸밈을 받는다. 누른 자리를 따라 움직이고,
    // 그 자리가 지구 뒤로 넘어가면 숨긴다.
    function popup(latlng, el) {
      closePopup();
      var wrap = document.createElement("div");
      wrap.className = "leaflet-popup globe-pop";
      wrap.innerHTML = '<div class="leaflet-popup-content-wrapper"><div class="leaflet-popup-content" style="width:auto;max-width:340px"></div></div>' +
        '<div class="leaflet-popup-tip-container"><div class="leaflet-popup-tip"></div></div>' +
        '<a class="leaflet-popup-close-button" role="button" aria-label="Close" href="#close"><span aria-hidden="true">×</span></a>';
      wrap.querySelector(".leaflet-popup-content").appendChild(el);
      wrap.querySelector(".leaflet-popup-close-button").addEventListener("click", function (e) { e.preventDefault(); closePopup(); });
      host.appendChild(wrap);
      pop = { el: wrap, at: C.Cartesian3.fromDegrees(latlng.lng, latlng.lat, liftAt(latlng.lat, latlng.lng)) };
      placePopup();
      return { update: placePopup, close: closePopup };
    }

    function closePopup() {
      if (pop) { pop.el.remove(); pop = null; }
    }

    function screenOf(at) {
      var occluder = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, scene.camera.positionWC);
      if (!occluder.isPointVisible(at)) return null;
      return C.SceneTransforms.worldToWindowCoordinates(scene, at);
    }

    function placePopup() {
      if (!pop) return;
      var p = screenOf(pop.at);
      pop.el.style.visibility = p ? "" : "hidden";
      if (!p) return;
      // 위쪽(온도계 밑 72px 부터)과 아래쪽 가운데 들어가는 쪽, 둘 다 모자라면 넓은 쪽에 펴고 그 높이로 줄여
      // 목록을 칸 안에서 굴린다(산출 목록이 수백 줄일 때). 가로는 지도 칸 안에 가둔다
      var body = pop.el.querySelector(".leaflet-popup-content-wrapper");
      body.style.maxHeight = "";
      var w = pop.el.offsetWidth, h = pop.el.offsetHeight;
      var floor = host.clientHeight, hr = host.getBoundingClientRect();
      (opts.avoid ? opts.avoid() : []).forEach(function (el) {    // 지도 위에 떠 있는 것(찾기 카드) 밑으로는 펴지 않는다
        var r = el && el.getBoundingClientRect();
        if (r && r.width && r.top - hr.top > p.y && r.left - hr.left < p.x + w / 2 && r.right - hr.left > p.x - w / 2) floor = Math.min(floor, r.top - hr.top);
      });
      var above = p.y - 8 - 72, under = floor - p.y - 14;
      var below = h > above && under > above;
      body.style.maxHeight = Math.max(80, (below ? under : above) - 24) + "px";
      h = pop.el.offsetHeight;
      pop.el.classList.toggle("below", below);
      pop.el.style.left = Math.round(Math.max(4, Math.min(host.clientWidth - w - 4, p.x - w / 2))) + "px";
      pop.el.style.top = Math.round(below ? p.y + 10 : p.y - h - 8) + "px";
    }

    // 분류군 점에 커서를 대면 Leaflet 말풍선(taxonTip·같은 시대 산지)과 같은 내용을 띄운다
    function hover() {
      hoverReq = 0;
      if (!active || !hoverPos) return;
      var m = pickMarker(hoverPos), t = m && m.getTooltip && m.getTooltip();
      scene.canvas.style.cursor = m ? "pointer" : "";
      if (!t) { hideTip(); return; }
      var content = t._content;
      if (typeof content === "function") content = content(m);
      if (!tip) {
        tip = document.createElement("div");
        tip.className = "leaflet-tooltip occ-tip globe-tip";
        host.appendChild(tip);
      }
      if (tip._for !== m) {
        tip._for = m;
        if (typeof content === "string") tip.innerHTML = content;
        else { tip.innerHTML = ""; if (content) tip.appendChild(content); }
      }
      tip.hidden = false;
      var x = hoverPos.x + 14, y = hoverPos.y + 14, w = host.clientWidth, h = host.clientHeight;
      if (x + tip.offsetWidth > w) x = hoverPos.x - tip.offsetWidth - 14;
      if (y + tip.offsetHeight > h) y = Math.max(0, h - tip.offsetHeight - 4);
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    }

    function hideTip() {
      if (tip) { tip.hidden = true; tip._for = null; }
      if (scene) scene.canvas.style.cursor = "";
    }

    // ── 카메라 ────────────────────────────────────────────────────────
    function view() {
      var c = scene.camera.positionCartographic;
      return { lon: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude), alt: c.height };
    }

    // 지구(반지름 R)가 세로 시야의 90% 를 채우는 높이 — sin(반각) = R / (R + 높이)
    function homeAlt() {
      var R = C.Ellipsoid.WGS84.maximumRadius, fr = scene.camera.frustum;
      var fovy = fr.fovy || fr.fov || Math.PI / 3;
      return R / Math.sin(fovy / 2 * 0.9) - R;
    }

    function setView(v, fly) {
      var dest = C.Cartesian3.fromDegrees(v.lon, v.lat, Math.max(MIN_ALT, Math.min(MAX_ALT, v.alt || homeAlt())));
      if (fly) scene.camera.flyTo({ destination: dest, duration: 0.8 });
      else scene.camera.setView({ destination: dest });
      scene.requestRender();
    }

    function home(lon) {
      setView({ lon: lon == null ? view().lon : lon, lat: 15, alt: 0 }, true);
    }

    // 그린 바로 그 틀에서 캔버스를 옮겨 담는다 — WebGL 은 그린 뒤 버퍼를 비운다(GSM 048 과 같은 길).
    // 배경 타일이 다 올 때까지(길어야 10 초) 기다린다.
    function snapshot() {
      return new Promise(function (resolve) {
        var t0 = Date.now();
        var remove = scene.postRender.addEventListener(function () {
          if (!scene.globe.tilesLoaded && Date.now() - t0 < 10000) { scene.requestRender(); return; }
          remove();
          var gl = scene.canvas, c = document.createElement("canvas");
          c.width = gl.width; c.height = gl.height;
          c.getContext("2d").drawImage(gl, 0, 0);
          resolve(c);
        });
        scene.requestRender();
      });
    }

    return {
      host: host, open: open, close: close, mark: mark,
      popup: popup, closePopup: closePopup,
      view: function () { return scene ? view() : null; },
      // 싣기 전이면 다 실은 뒤 그 자리로 연다
      setView: function (v, fly) { if (scene) setView(v, fly); else pending = v; },
      home: function (lon) { if (scene) home(lon); },
      // 지금 자리에서 높이만 factor 배로(확대·축소 단추, tupandactyl 004)
      zoom: function (factor) { if (scene) { var v = view(); setView({ lon: v.lon, lat: v.lat, alt: v.alt * factor }, true); } },
      snapshot: snapshot,
      climateOpacity: function (a) { if (climateLayer) { climateLayer.alpha = a; scene.requestRender(); } },
      get active() { return active; },
    };
  };
})();
