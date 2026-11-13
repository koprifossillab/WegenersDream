import sys

from . import build, fetch, terrain

USAGE = """사용법: python -m pipeline <명령>

  fetch            원본 받기·검증 (PaleoDEM, PaleoCoastlines, PBDB)
  fetch --refresh-pbdb   PBDB 를 새로 받는다 (Zenodo 두 개는 고정이라 다시 받지 않는다)
  fetch --refresh-pbdb --allow-shrink   PBDB 가 지난 사본보다 5% 넘게 줄어도 받는다(PBDB 가 실제로 정리한 날)
  build            배경·해안선·화석·국경·목록 만들기
  build --no-relief  배경 그림·지형(합해 10 분 남짓)은 지난 것을 두고 나머지만
  all              fetch 뒤 build
  basemap          배경 그림(2048·4096·몰바이데·8192 타일)과 세밀한 지형만 다시 굽고 지금 index.json 에 붙인다 (일꾼 여섯으로 10 분 남짓)
  basemap --attach-only   이미 구운 basemap/entries.json·terrain 표를 지금 index.json 에 입히기만 한다(다른 자료 폴더로 옮긴 뒤)
  terrain          지구본 지형만 굽고 지금 index.json 에 붙인다 (배경·화석은 그대로, 5 분 남짓)
  ediacaran        에디아카라기 시점(550 Ma, 판 복원만)의 배경·국경·화석만 굽고 지금 index.json 에 붙인다 (1 분 남짓)
  events           대멸종·전 지구 사건(events.py)만 지금 index.json 에 다시 붙인다 (1 초)
  taxa_ko          한글 → 학명 찾기 표(PBDB 속·종 이름을 미리 음차, node 필요)만 굽고 지금 index.json 에 붙인다 (1 분 남짓)
  lithology        암상 용어의 한글(lithology.py)만 지금 index.json 에 다시 붙인다 (1 초)
  phylogeo         계통 생물지리 묶음(sources/phylogeo — 연대 나무와 조상 범위)만 굽고 지금 index.json 에 붙인다 (몇 초)
  gbdb             GBDB 단면(Zenodo 2020 사본)의 채집만 굽고 지금 index.json 에 붙인다 (PBDB 와 겹침 포함, 2 분 남짓)
  landmap          시점마다 "이 땅은 지금 어느 나라" 칸 지도만 굽고 지금 index.json 에 붙인다 (몇 분)
  paleoclim        최근의 절에 붙이는 PaleoClim 기온 지도만 받고 굽는다 (climate/pc_*.png·recent.json, 1 분 안쪽)
"""


def main(argv):
    command = argv[0] if argv else ""
    if command == "fetch":
        fetch.main(argv[1:])
    elif command == "build":
        build.build(skip_relief="--no-relief" in argv)
    elif command == "basemap":
        from . import basemap
        basemap.main(attach_only="--attach-only" in argv)
    elif command == "terrain":
        terrain.attach()
    elif command == "ediacaran":
        from . import ediacaran
        ediacaran.attach()
    elif command == "events":
        from . import events
        events.attach()
    elif command == "taxa_ko":
        from . import taxa_ko
        taxa_ko.attach()
    elif command == "lithology":
        from . import lithology
        lithology.attach()
    elif command == "phylogeo":
        from . import phylogeo
        phylogeo.attach()
    elif command == "gbdb":
        from . import gbdb
        gbdb.attach()
    elif command == "landmap":
        from . import landmap
        landmap.attach()
    elif command == "paleoclim":
        from . import paleoclim
        paleoclim.main()
    elif command == "all":
        fetch.main(argv[1:])
        build.build()
    else:
        print(USAGE)
        return 2
    return 0


sys.exit(main(sys.argv[1:]))
