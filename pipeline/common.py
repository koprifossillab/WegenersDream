"""파이프라인 여러 단계가 함께 쓰는 것 — 경로, 지질시대, 화석 나누기 규칙.

이 파일은 numpy 도 import 하지 않는다. 규칙만 들고 있어서 시험이 가볍다.
"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "sources"
# 뷰어가 읽는 자리. 운영에서는 이 폴더를 /srv/WegenersDream/data 로 옮겨 마운트한다.
DERIVED = Path(os.environ.get("WEGENER_DATA_DIR", ROOT / "data" / "derived"))


def manifest(name):
    return json.loads((SOURCES / f"{name}.json").read_text(encoding="utf-8"))


def source_path(relative):
    return ROOT / relative


# ── 지질시대 ──────────────────────────────────────────────────────────
# 층서표는 timescale.py 한 곳에 있다(이름 2023/04 한글판, 경계 2024/12).
def period(age_ma):
    """나이가 속한 기. 경계 나이는 더 젊은 쪽에 넣는다(66.0 Ma 는 고진기)."""
    from .timescale import containing
    for unit in containing(age_ma):
        if unit["rank"] == "period":
            return {"ko": unit["ko"], "en": unit["en"]}
    return {"ko": "선캄브리아", "en": "Precambrian"}


# ── PaleoDEM 파일 이름 ────────────────────────────────────────────────
# 예: "Map88_PALEOMAP_1deg_Cambrian_Precambrian boundary_540Ma.nc"
#     "Map48_PALEOMAP_1deg_Middle_Devonian_385.2Ma.nc"
#     6 분 격자는 `_6min_` 이고 385.2·390.5 를 정수로 반올림해 적는다.
_DEM_NAME = re.compile(r"_(?:1deg|6min)_(?P<label>.+?)_(?P<age>\d+(?:\.\d+)?)\s*Ma\.nc$")


def parse_dem_name(name):
    """파일 이름에서 (나이, 영문 이름표). 모르는 꼴이면 None."""
    found = _DEM_NAME.search(name)
    if not found:
        return None
    label = found.group("label").replace("_", " ").strip()
    return float(found.group("age")), label


def age_key(age_ma):
    """시점을 파일 이름으로. 385.2 Ma 가 385 Ma 와 부딪히지 않게 0.1 Myr 단위로 적는다."""
    return f"{round(age_ma * 10):04d}"


# ── 화석을 시점에 나누는 규칙 ─────────────────────────────────────────
# 채집지의 연대 범위가 시점의 창(±2.5 Myr)과 **겹치면** 그 시점에 올린다. 그래서 한
# 채집지가 여러 시점에 오를 수 있다. 중간값이 창 안에 드는 것만 올리면(EarthThruTime3D
# 의 지도 검사 규칙) 층서 단계로 연대가 매겨진 채집지의 중간값이 몰려, 400 Ma 처럼
# 채집지가 하나도 없는 시점이 생긴다 — devlog 001.
WINDOW_MA = 2.5         # 시점 ±2.5 Myr — PaleoDEM 간격(5 Myr)의 절반

# **에디아카라기 시점**(tupandactyl 019) — PaleoDEM·PaleoCoastlines·기온은 540 Ma 까지라 그 앞은 판 복원만 있다(v19o 는 1100 Ma 까지).
# 한 장만 둔다 — PBDB 에디아카라기 산지의 95 % 가 "Ediacaran"(635–538.8 Ma) 하나로만 매겨져 시점을 나눠도 같은 산지가 뜬다.
# 550 Ma 는 White Sea–Nama 생물군 무렵. 이 시점은 PBDB 고좌표가 없어도(에디아카라기는 PALEOMAP 고좌표가 거의 없다) 우리가 판으로
# 돌릴 수 있는 산지를 올린다 — 540 Ma 까지의 시점에는 016 의 규칙(PBDB 고좌표가 없는 산지는 뺀다)이 그대로다.
EDIACARAN_AGE = 550.0
EDIACARAN_LABEL = "Ediacaran (plate reconstruction only)"
PLATE_ONLY_FROM_MA = 545.0      # 이보다 오래된 시점은 판 복원만(지형·해안선·기온 없음)


# **연대 범위의 상한은 없다**(015). 범위가 긴 산지도 걸친 모든 시점에 올린다. 013 까지는 "가장 긴 절
# (21.6 Myr) 이하" 만 올렸고, 그 전에는 20 Myr 로 노릭절이 통째로 빠졌다. 연대가 절 단위로 정해지지 않은
# **모호한 연대**(`precise = 0`)는 PBDB 시대 이름의 등급으로 가르고(intervals.py, 016) 뷰어가 세모로 그린다.


def belongs(max_ma, min_ma, age_ma):
    """산지(max_ma~min_ma)가 이 시점의 지도에 오르는가 — 연대 범위가 창과 겹치면."""
    if max_ma < min_ma:
        max_ma, min_ma = min_ma, max_ma
    return max_ma >= age_ma - WINDOW_MA and min_ma <= age_ma + WINDOW_MA


# ── 분포 분석의 셈(koprifossillab P01) ─────────────────────────────────
# 지도에 올리는 규칙(belongs, 겹침)은 그대로 두고, **수를 셀 때만** 산지가 시점에 속할 몫으로 센다 — 범위가 긴 산지가 걸친 모든 시점에
# 1 씩 더해지지 않게(P01 §5). 몫 = 연대 범위가 시점 창과 겹친 길이 ÷ 범위 길이(범위 안에서 나이가 균등하다고 본 기대값). 시점 창이
# 빈틈없이 이어지면 한 산지의 몫 합은 1 이다. 뷰어는 같은 정의를 analysis.js 에 두고, 두 시험이 같은 보기(tests/share_cases.json)를 쓴다.
# 몬테카를로 띠의 되풀이 수·씨앗, 몫으로 점을 흐리게 할 때의 아랫값은 index.json 의 rules.analysis 로 뷰어에 간다.
ANALYSIS = {
    "share": "overlap_length / age_range",
    "mc_runs": 200,             # 몬테카를로 되풀이 — 산출 5,000 건이면 브라우저에서 1 초 안팎
    "mc_seed": 20261020,        # 고정 씨앗 — 같은 자료면 늘 같은 띠(재현 묶음에 적는다)
    "share_opacity_floor": 0.15,  # 몫으로 흐리게 할 때 가장 흐린 점 — 더 흐리면 눌러지지 않는 것처럼 보인다
    # 고유 산지-시간(koprifossillab 047, P01 §7) — 좌표(소수 둘째 자리, 약 1 km)·지층 이름·연대 범위가 같은 산지를 하나로 센다.
    # 한 단면의 층준마다, 한 논문의 표본마다 나눈 산지가 따로 세지는 의사 반복을 줄인다. 지도의 점은 그대로
    "locality_decimals": 2,
    # 산출 사본의 조각(koprifossillab 050, P01 §3.2) — 조각 하나의 어림 크기, 그리고 미리 센 요약을 쓰는 큰 분류군의 문턱(연구자, P01 §11.4)
    "chunk_bytes": 1_000_000,
    "summary_min_occs": 50_000,
}


def frame_share(max_ma, min_ma, lo, hi):
    """연대 범위 [min_ma, max_ma] 가 시점 창 [lo, hi] 에 속할 몫(0~1). 범위 길이가 0 이면 그 나이가 창 안이면 1."""
    old, young = (max_ma, min_ma) if max_ma >= min_ma else (min_ma, max_ma)
    span = old - young
    if span <= 1e-9:
        return 1.0 if lo <= old <= hi else 0.0
    overlap = min(old, hi) - max(young, lo)
    return min(1.0, overlap / span) if overlap > 0 else 0.0


def environment_class(environment):
    """퇴적 환경 → 바다(m)·뭍(t)·해안/기타(o). 갈래는 environments.py 의 나무 한 곳에 있다."""
    from .environments import classify
    return classify(environment)[0]


_FORMATION_TAIL = re.compile(r"\s+(formation|fm\.?)$")


def formation_key(name):
    """지층 이름 견주기 — 대소문자와 끝의 "Formation"·"Fm" 은 가리지 않는다(뷰어의 지층 찾기 formKey 와 같다)."""
    return _FORMATION_TAIL.sub("", str(name or "").lower()).strip()


def locality_key(lat, lng, formation, max_ma, min_ma, decimals=ANALYSIS["locality_decimals"]):
    """고유 산지-시간의 열쇠(koprifossillab 047) — 뷰어의 analysis.js localityKey 와 같다(보기 tests/locality_cases.json)."""
    old, young = (max_ma, min_ma) if max_ma >= min_ma else (min_ma, max_ma)
    num = lambda v: str(float(v)).removesuffix(".0")       # JS 의 String(수)와 같은 꼴 — 66.0 → "66", 72.2 → "72.2"
    return "|".join([f"{float(lat):.{decimals}f}", f"{float(lng):.{decimals}f}", formation_key(formation), num(old), num(young)])
