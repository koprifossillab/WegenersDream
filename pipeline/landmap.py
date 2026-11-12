"""시점마다 "이 땅은 지금 어느 나라인가" 지도 — 고지도의 빈 땅을 누르면 지금의 나라를 알려 주려고(tupandactyl 038).

국경 층(countries.py)은 판 경계에서 쪼개진 **선**이라 브라우저가 점이 어느 나라 안인지 가를 수 없다. 그래서 거꾸로 한다 —
오늘날 0.5° 칸의 가운데마다 나라(Natural Earth, 국경 층과 같은 자료)를 정하고, 그 점을 시점 나이로 **PALEOMAP v19o 로 돌려**
그때 자리의 0.5° 칸에 나라 번호를 적는다. 돌리면 칸이 벌어지거나 겹치므로 빈칸은 이웃의 다수결로 두 번 메운다.

결과는 시점마다 8 비트 회색조 PNG 하나(720×360, 값 = 나라 번호, 0 = 없음)와 `index.json` 의 `land_countries`(번호 → ISO·한글·영문).
뷰어가 누른 자리의 칸을 읽는다. 바다가 된 땅·판 복원 밖은 0 이다.

    python -m pipeline landmap      이 지도만 굽고 지금 index.json 에 붙인다 (몇 분)
"""
import json
import math

import numpy as np

from .common import DERIVED, age_key

STEP = 0.5
W, H = int(360 / STEP), int(180 / STEP)


def present_grid():
    """오늘날 칸 가운데의 (경도, 위도, 나라 번호) 와 나라 목록. 나라 밖(바다)은 뺀다."""
    import shapely
    from shapely.geometry import Polygon
    from .countries import natural_earth
    countries = natural_earth()
    polys, owner = [], []
    for k, (iso, ko, en, rings) in enumerate(countries):
        for ring in rings:
            p = Polygon(ring)
            if not p.is_valid:
                p = p.buffer(0)
            if not p.is_empty:
                polys.append(p); owner.append(k + 1)
    lons = -180 + STEP / 2 + STEP * np.arange(W)
    lats = 90 - STEP / 2 - STEP * np.arange(H)
    LON, LAT = np.meshgrid(lons, lats)
    LON, LAT = LON.ravel(), LAT.ravel()
    tree = shapely.STRtree(polys)
    pi, gi = tree.query(shapely.points(LON, LAT), predicate="within")
    code = np.zeros(LON.size, dtype=np.uint8)
    code[pi] = np.asarray(owner, dtype=np.uint8)[gi]
    keep = code > 0
    assert len(countries) < 256, "나라 번호가 8 비트를 넘는다"
    listing = [{"iso": "", "ko": "", "en": ""}] + [{"iso": iso, "ko": ko, "en": en} for iso, ko, en, _ in countries]
    return LON[keep], LAT[keep], code[keep], listing


def rotate_many(rebuilder, lons, lats, age):
    """Reconstructor 의 판 찾기에 판마다 한 번의 회전 행렬 — 점마다 pygplates 를 부르지 않는다."""
    if age <= 1e-9:
        return lons.copy(), lats.copy(), np.ones(lons.size, dtype=bool)
    plates = rebuilder.plates(lons, lats, age)
    out_lon, out_lat = np.full(lons.size, np.nan), np.full(lons.size, np.nan)
    la, lo = np.radians(lats), np.radians(lons)
    xyz = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=1)
    for plate in np.unique(plates):
        if not plate:
            continue
        sel = plates == plate
        plat, plon, ang = rebuilder.rotation.get_rotation(float(age), int(plate)).get_lat_lon_euler_pole_and_angle_degrees()
        a, b, t = math.radians(plat), math.radians(plon), math.radians(ang)
        k = np.array([math.cos(a) * math.cos(b), math.cos(a) * math.sin(b), math.sin(a)])
        v = xyz[sel]
        # 로드리게스 회전
        r = v * math.cos(t) + np.cross(k, v) * math.sin(t) + np.outer(v @ k, k) * (1 - math.cos(t))
        out_lat[sel] = np.degrees(np.arcsin(np.clip(r[:, 2], -1, 1)))
        out_lon[sel] = np.degrees(np.arctan2(r[:, 1], r[:, 0]))
    return out_lon, out_lat, ~np.isnan(out_lon)


def fill(grid, passes=2, need=3):
    """빈칸(0) 가운데 8 이웃에 나라가 need 개 이상이면 그 가운데 가장 많은 나라로. 경도는 둘러 잇는다."""
    for _ in range(passes):
        out = grid.copy()
        empty = np.argwhere(grid == 0)
        for r, c in empty:
            votes = {}
            for i in (-1, 0, 1):
                rr = r + i
                if rr < 0 or rr >= grid.shape[0]:
                    continue
                for j in (-1, 0, 1):
                    v = grid[rr, (c + j) % grid.shape[1]]
                    if v:
                        votes[v] = votes.get(v, 0) + 1
            if sum(votes.values()) >= need:
                out[r, c] = max(sorted(votes), key=lambda v: votes[v])
        grid = out
    return grid


def paleo_grid(lons, lats, codes):
    grid = np.zeros((H, W), dtype=np.uint8)
    c = np.clip(((lons + 180) / STEP).astype(int), 0, W - 1)
    r = np.clip(((90 - lats) / STEP).astype(int), 0, H - 1)
    grid[r, c] = codes            # 겹치면 나중 것 — 같은 판 안이면 대개 같은 나라다
    return fill(grid)


def build(ages):
    from PIL import Image
    from .reconstruct import Reconstructor
    lons, lats, codes, listing = present_grid()
    rebuilder = Reconstructor()
    out = DERIVED / "land"
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    for age in ages:
        x, y, ok = rotate_many(rebuilder, lons, lats, float(age))
        grid = paleo_grid(x[ok], y[ok], codes[ok])
        name = f"land/{age_key(age)}.png"
        Image.fromarray(grid).save(DERIVED / name, optimize=True)
        files[age_key(age)] = name
    print(f"  지금의 나라 지도 {len(files)} 장 (오늘날 육지 칸 {lons.size})")
    return {"step": STEP, "files": files, "countries": listing}


def attach():
    path = DERIVED / "index.json"
    index = json.loads(path.read_text(encoding="utf-8"))
    index["land"] = build([f["age"] for f in index["frames"]])
    path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"지금의 나라 지도 -> {path}")
