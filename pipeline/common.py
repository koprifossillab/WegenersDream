"""파이프라인 여러 단계가 함께 쓰는 것 — 경로, 지질시대, 화석 나누기 규칙.

이 파일은 numpy 도 import 하지 않는다. 규칙만 들고 있어서 시험이 가볍다.
"""
import json
import math
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
    # 공간을 셀 때의 단위(koprifossillab 053, P02 §2.2) — 등면적 격자 칸. divvy(Antell et al. 2024)의 기본과 같은 Equal Earth 투영의
    # 200 km 칸(≈2°). 같은 자리의 여러 산지·좌표의 작은 차이를 칸 하나로 흡수한다. 구면(평균 반지름)으로 근사한다
    "grid_km": 200,
    # 표본 범위(coverage) 표준화 속 수(koprifossillab 054, P02 §2.3) — Chao et al. 2014 의 incidence 셈, 산지가 표본. 문턱 기본 0.5(관행 0.4~0.7),
    # 관찰 표본 수의 2 배까지 외삽(iNEXT 의 기본 끝점). 시점에는 연대 범위의 **가운데**가 그 창에 든 산지 하나씩(palaeoverse bin_time 의 "mid"),
    # 절 단위로 정해지지 않은 모호한 연대(016)는 뺀다. "반 넘게(majority)" 는 5 Myr 창에서 절 하나로 매긴 산지(알바절 12.4 Myr)를 모두 버려 쓰지 않는다(054)
    "coverage_quorum": 0.5,
    "coverage_quorums": [0.4, 0.5, 0.6, 0.7],
    "coverage_max_extrapolation": 2,
    "bin_rule": "mid",
    # 범위 밖 기록 — 시공간 외톨이 시험(koprifossillab 055, P02 §2.4). CoordinateCleaner cf_outl(Zizka et al. 2019)의 기본값: 사분위 범위의
    # 5 배 밖, 범위 안의 무작위 나이로 5 번 되풀이해 반 넘게 걸리면, 기록 10 건 미만인 무리는 시험하지 않는다. 속마다 시험하고, 큰 속은 기준
    # 2,000 건을 뽑아 견준다(브라우저에서 돌리려고)
    # 지도 위의 분석 층(koprifossillab P03·056) — 표본 노력 음영의 단계(칸마다 몫으로 센 산지 수의 문턱), 무게중심의 부트스트랩
    "occupancy": {"effort_steps": [1, 3, 10, 30], "bootstrap": 200, "ellipse_p": 0.95},
    "outlier": {"mltpl": 5, "replicates": 5, "flag_thresh": 0.5, "size_thresh": 10, "max_reference": 2000},
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


# Equal Earth(Šavrič, Patterson & Jenny 2018) — 구면 근사. EPSG:8857 은 WGS84 타원체의 authalic 구를 쓰지만 200 km 칸에서는 차이가 작다
_EE = (1.340264, -0.081106, 0.000893, 0.003796)
EARTH_KM = 6371.0088


def equal_earth(lat, lng):
    """(x, y) km — Equal Earth 투영."""
    a1, a2, a3, a4 = _EE
    m = math.sqrt(3) / 2
    theta = math.asin(m * math.sin(math.radians(lat)))
    t2, t6 = theta * theta, theta ** 6
    x = EARTH_KM * math.radians(lng) * math.cos(theta) / (m * (a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)))
    y = EARTH_KM * theta * (a1 + a2 * t2 + t6 * (a3 + a4 * t2))
    return x, y


def grid_cell(lat, lng, km=ANALYSIS["grid_km"]):
    """등면적 격자 칸의 이름 "열:행" — 뷰어의 analysis.js gridCell 과 같다(보기 tests/grid_cases.json)."""
    x, y = equal_earth(lat, lng)
    return f"{math.floor(x / km)}:{math.floor(y / km)}"


def _miss_ratio(T, y, t):
    """C(T − y, t) / C(T, t) — 표본 t 개를 뽑았을 때 그 분류군(산지 y 곳에 있다)이 하나도 안 뽑힐 확률."""
    if t > T - y:
        return 0.0
    r = 1.0
    for j in range(y):
        r *= (T - t - j) / (T - j)
    return r


def coverage_rarefy(incidence, T, quorum, max_extrapolation=ANALYSIS["coverage_max_extrapolation"]):
    """표본 범위 표준화 풍부도(Chao et al. 2014, incidence, q = 0) — 뷰어의 analysis.js coverageRarefy 와 같다(보기 tests/coverage_cases.json).

    incidence: 분류군마다 그것이 나온 표본(산지) 수, T: 표본 수. 돌려주는 것 {"s": 표준화한 수 또는 None, "coverage": 관찰 표본 범위, "t": 그 표본 수}.
    관찰 범위가 문턱 이상이면 희박화(내삽), 모자라면 T 의 max_extrapolation 배까지 외삽, 그래도 모자라면 s = None.
    """
    ys = [y for y in incidence if y > 0]
    s_obs = len(ys)
    if T < 1 or s_obs == 0:
        return {"s": None, "coverage": None, "t": None}
    U = sum(ys)
    q1 = sum(1 for y in ys if y == 1)
    q2 = sum(1 for y in ys if y == 2)
    if q1 == 0:
        a = 0.0
    elif q2 > 0:
        a = (T - 1) * q1 / ((T - 1) * q1 + 2 * q2)
    else:
        a = (T - 1) * (q1 - 1) / ((T - 1) * (q1 - 1) + 2) if q1 > 1 or T > 1 else 0.0
    cov_obs = 1 - q1 / U * a
    if cov_obs >= quorum:
        if cov_obs == quorum:
            return {"s": float(s_obs), "coverage": cov_obs, "t": float(T)}
        # 내삽 — C(t) 는 t 에 따라 는다. 문턱을 넘는 첫 t 를 이분 탐색으로 찾아(표본이 수만이라 하나씩 보면 느리다) 그 앞 t 와 선으로 잇는다
        def at(t):
            if t <= 0:
                return 0.0, 0.0
            if t >= T:
                return cov_obs, float(s_obs)
            return (1 - sum(y / U * _miss_ratio(T - 1, y, t) for y in ys), sum(1 - _miss_ratio(T, y, t) for y in ys))
        lo, hi = 1, T
        while lo < hi:
            mid = (lo + hi) // 2
            if at(mid)[0] >= quorum:
                hi = mid
            else:
                lo = mid + 1
        (c, s_t), (prev_c, prev_s) = at(lo), at(lo - 1)
        k = (quorum - prev_c) / (c - prev_c) if c > prev_c else 1.0
        return {"s": prev_s + (s_t - prev_s) * k, "coverage": cov_obs, "t": lo - 1 + k}
    # 외삽
    if q1 == 0 or a <= 0 or a >= 1:
        return {"s": None, "coverage": cov_obs, "t": None}
    import math
    t_star = math.log((1 - quorum) * U / q1) / math.log(a) - 1
    if t_star > (max_extrapolation - 1) * T:
        return {"s": None, "coverage": cov_obs, "t": None}
    q0 = (T - 1) / T * (q1 * q1 / (2 * q2) if q2 > 0 else q1 * (q1 - 1) / 2)
    s_ext = s_obs + (q0 * (1 - (1 - q1 / (T * q0 + q1)) ** t_star) if q0 > 0 else 0.0)
    return {"s": s_ext, "coverage": cov_obs, "t": T + t_star}

