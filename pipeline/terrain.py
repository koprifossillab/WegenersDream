"""PaleoDEM 격자 → 시점마다 지구본의 지형 높이 격자(무손실 WebP) — wetherilli P01 §4·016.

배경 그림(relief.py)과 같은 격자(6 분, 없으면 1°)를 **1/4° 마디 격자(1441 × 721)**로 줄여 담는다. 지구 전체를 한
화면에 볼 때 한 마디가 몇 픽셀이라 이보다 촘촘해도 보이지 않는다.
줄이기 전에 3 × 3 평균을 걸어 0.1° 격자의 잔 봉우리가 마디 사이에서 깜박이지 않게 한다.

값은 (해발 + OFFSET) / UNIT 의 16 비트 정수를 R(위 8 비트)·G(아래 8 비트)에 나눠 적는다(B 는 0). 브라우저는
16 비트 회색조를 캔버스에서 8 비트로 깎아 읽으므로 RGB 두 칸으로 나눈다. **무손실 WebP** 로 담는다 — 1 m 단위 PNG 는
시점마다 0.5~1.5 MB(109 장이면 80 MB)였고, 10 m 단위 무손실 WebP 는 0.2~0.7 MB 다. 지구본은 높이를 몇 배로 과장해
보므로 10 m 는 보이지 않는다. 뷰어(globe.js)는 `index.json` 의 `terrain` 칸(파일·간격·OFFSET·UNIT)만 보고
읽는다 — 숫자를 뷰어에 다시 적지 않는다.

    python -m pipeline terrain        지형만 굽고 지금 index.json 의 시점마다 terrain 칸을 채운다
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

from .common import DERIVED, age_key
from .relief import grids, read_grid

STEP = 0.25          # 마디 간격(도)
OFFSET = 12000       # m — 가장 깊은 바다(−11 km 남짓)도 0 위에 오게
UNIT = 10            # m — 한 눈금


def sample(z, step=STEP):
    """행 북→남·열 −180→180 인 마디 격자 z 를 step 간격의 마디 격자로(양 끝 포함)."""
    rows = int(round(180 / step)) + 1
    cols = int(round(360 / step)) + 1
    lat = np.linspace(90.0, -90.0, rows)
    lon = np.linspace(-180.0, 180.0, cols)
    smooth = ndimage.uniform_filter(z, size=3, mode="nearest")
    rr, cc = np.meshgrid((90.0 - lat) / (180.0 / (z.shape[0] - 1)),
                         (lon + 180.0) / (360.0 / (z.shape[1] - 1)), indexing="ij")
    return ndimage.map_coordinates(smooth, [rr, cc], order=1, mode="nearest")


def encode(heights):
    """해발(m) 배열 → RGB 그림(R·G 에 (해발 + OFFSET) / UNIT 의 16 비트)."""
    v = np.clip(np.rint((heights + OFFSET) / UNIT), 0, 65535).astype(np.uint16)
    rgb = np.zeros(v.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 0xFF
    return Image.fromarray(rgb, "RGB")


def decode(image):
    """encode 의 거꾸로 — 시험용."""
    a = np.asarray(image, dtype=np.int32)
    return (a[..., 0] << 8 | a[..., 1]) * UNIT - OFFSET


def build(only=None):
    """{나이: index.json 의 terrain 칸}."""
    (DERIVED / "terrain").mkdir(parents=True, exist_ok=True)
    out = {}
    for age, label, path, grid in grids():
        if only and age not in only:
            continue
        heights = sample(read_grid(path))
        name = f"terrain/{age_key(age)}.webp"
        encode(heights).save(DERIVED / name, "WEBP", lossless=True, quality=100, method=6)
        out[age] = {"file": name, "step": STEP, "offset": OFFSET, "unit": UNIT,
                    "min": int(heights.min()), "max": int(heights.max())}
        print(f"  지형 {age:6.1f} Ma  {grid}  {int(heights.min()):6d} ~ {int(heights.max()):5d} m")
    for age, fine in build_fine(only).items():            # 세밀한 격자(tupandactyl 040) — 일꾼 여럿으로
        if age in out:
            out[age]["fine"] = fine
    return out


FINE_STEP = 0.1      # 6 분 격자 그대로(3601 × 1801)


def build_fine_one(age, path, grid):
    """6 분 격자를 고르지 않고 그대로 담은 세밀한 지형(tupandactyl 040) — 「높이 도드라지게」의 음영이 쓴다. 1° 격자뿐이면 없다.

    1/4° 격자는 지구본·등고선·팝업의 높이에 그대로 쓴다 — 시점마다 1~4 MB 인 이 파일은 그 층을 켰을 때만 받는다."""
    if grid != "6min":
        return None
    z = read_grid(path)
    if z.shape != (int(round(180 / FINE_STEP)) + 1, int(round(360 / FINE_STEP)) + 1):
        return None
    (DERIVED / "terrain" / "fine").mkdir(parents=True, exist_ok=True)
    name = f"terrain/fine/{age_key(age)}.webp"
    encode(z).save(DERIVED / name, "WEBP", lossless=True, quality=100, method=6)
    return {"file": name, "step": FINE_STEP}


def _fine_job(args):
    age, path, grid = args
    name = DERIVED / f"terrain/fine/{age_key(age)}.webp"
    if name.is_file():                     # 이미 구운 것 — 무손실 method 6 은 한 장에 1 분 가까이 걸린다
        return age, {"file": f"terrain/fine/{age_key(age)}.webp", "step": FINE_STEP}
    return age, build_fine_one(age, path, grid)


def build_fine(only=None, workers=6):
    """{나이: terrain 칸의 fine} — 1/4° 격자는 그대로 두고 세밀한 것만. 일꾼 여럿으로, 있는 파일은 건너뛴다."""
    from multiprocessing import get_context
    todo = [(age, path, grid) for age, label, path, grid in grids() if not only or age in only]
    with get_context("spawn").Pool(workers) as pool:
        done = pool.map(_fine_job, todo, chunksize=1)
    return {age: fine for age, fine in done if fine}


def attach():
    """지형만 굽고 지금 index.json 의 시점마다 terrain 칸을 채운다 — 배경·화석을 다시 만들지 않고 더할 때."""
    path = DERIVED / "index.json"
    if not path.is_file():
        raise SystemExit(f"{path} 가 없다 — 먼저 `python -m pipeline build`")
    index = json.loads(path.read_text(encoding="utf-8"))
    terrains = build()
    missing = 0
    for frame in index["frames"]:
        entry = terrains.get(frame["age"])
        frame["terrain"] = entry
        missing += entry is None
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)
    print(f"목록: 지형 {len(index['frames']) - missing}/{len(index['frames'])} 시점 -> {path}")


if __name__ == "__main__":
    build({float(a) for a in sys.argv[1:]} or None)
