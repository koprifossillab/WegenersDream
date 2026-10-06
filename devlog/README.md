# devlog 색인

그때의 판단과 근거를 적는다 — 규약은 [CLAUDE.md](../CLAUDE.md) "devlog". **새 파일은 이 표에 한 줄씩 더한다.**

## 파일 이름

2026-09-30 부터 글쓴이마다 번호를 따로 센다(EarthThruTime3D 와 같은 꼴):

- 한 작업: `devlog/YYYYMMDD_{author}_{nnn}_{title}.md`
- 계획: `devlog/YYYYMMDD_{author}_P{nn}_{title}.md`
- `author` 는 GitHub 계정 이름(소문자). 이 서버의 Linux 계정마다 GitHub 계정이 하나다:

  | Linux 계정 | GitHub 계정(`author`) |
  |---|---|
  | paleoadmin | `koprifossillab` |
  | jikhanjung | `jikhanjung` |
  | sclee | `wetherilli` |
  | jschoi | `tupandactyl` |

- `title` 은 영어 snake_case
- 번호는 **그 글쓴이의 다음 번호**다(저장소의 다음 번호가 아니다). koprifossillab 은 001~028 에 이어 **029** 부터,
  다른 사람은 001 부터
- **001~020 은 옛 이름(`YYYYMMDD_NNN_주제.md`) 그대로** 둔다 — koprifossillab 의 것이다. 가리킬 때는 번호만("devlog 017")
- 새 꼴의 devlog 는 링크나 "koprifossillab 029" 로 가리킨다. 커밋 메시지 끝도 `(koprifossillab 029)`

## 목록

| devlog | 날짜 | 제목 |
|---|---|---|
| 001 | 2026-09-29 | [시작: 무엇을 어떤 틀로 겹치나](20260929_001_%EC%8B%9C%EC%9E%91.md) |
| 002 | 2026-09-29 | [층서표로 고르기, 퇴적 환경 나무, 분류군 자동완성, 0.1° 배경](20260929_002_%EC%B8%B5%EC%84%9C%ED%91%9C_%ED%99%98%EA%B2%BD_%EC%9E%90%EB%8F%99%EC%99%84%EC%84%B1_%ED%95%B4%EC%83%81%EB%8F%84.md) |
| 003 | 2026-09-29 | [퇴적기원 재분류, 점 색 고르기, 검색 결과만 보이기, 국가](20260929_003_%ED%87%B4%EC%A0%81%EA%B8%B0%EC%9B%90_%EC%A0%90%EC%83%89_%EA%B5%AD%EA%B0%80.md) |
| 004 | 2026-09-29 | [고기후(지표 기온)를 겹치고, 점을 반투명하게 한다](20260929_004_%EA%B3%A0%EA%B8%B0%ED%9B%84_%EC%A7%80%ED%91%9C%EA%B8%B0%EC%98%A8_%EB%B0%98%ED%88%AC%EB%AA%85_%EC%A0%90.md) |
| 005 | 2026-09-29 | [국가를 고르면 그 나라 범위로 지도를 당긴다](20260929_005_%EA%B5%AD%EA%B0%80_%EB%B2%94%EC%9C%84%EB%A1%9C_%ED%99%95%EB%8C%80.md) |
| 006 | 2026-09-29 | [과 이하 분류군을 찾으면 채집지에 커서만 대도 그 아래 산출이 뜬다](20260929_006_%EB%B6%84%EB%A5%98%EA%B5%B0_%EC%BB%A4%EC%84%9C_%EC%82%B0%EC%B6%9C%EB%AA%A9%EB%A1%9D.md) |
| 007 | 2026-09-29 | [해양기원 점을 에메랄드·민트(열대 바다) 색으로 바꾼다](20260929_007_%ED%95%B4%EC%96%91%EA%B8%B0%EC%9B%90_%EC%97%B4%EB%8C%80%EB%B0%94%EB%8B%A4_%EC%83%89.md) |
| 008 | 2026-09-29 | [해양기원 색을 에메랄드와 하늘색 사이(아쿠아·청록)로 옮긴다](20260929_008_%ED%95%B4%EC%96%91%EA%B8%B0%EC%9B%90_%EC%95%84%EC%BF%A0%EC%95%84_%EC%B2%AD%EB%A1%9D.md) |
| 009 | 2026-09-29 | [기온 층의 불투명도를 조절한다](20260929_009_%EA%B8%B0%EC%98%A8%EC%B8%B5_%EB%B6%88%ED%88%AC%EB%AA%85%EB%8F%84.md) |
| 010 | 2026-09-29 | [분류군을 찾으면 산출이 있는 시대를 함께 보인다](20260929_010_%EB%B6%84%EB%A5%98%EA%B5%B0_%EC%82%B0%EC%B6%9C%EC%8B%9C%EB%8C%80_%EB%B6%84%ED%8F%AC.md) |
| 011 | 2026-09-29 | [찾은 분류군의 산출 시대를 오래된 것부터 차례로 보인다](20260929_011_%EC%82%B0%EC%B6%9C%EC%8B%9C%EB%8C%80_%EC%B0%A8%EB%A1%80%EB%A1%9C_%EB%B3%B4%EA%B8%B0.md) |
| 012 | 2026-09-29 | [속 이하 분류군을 찾으면 같은 시대의 다른 산지 기록도 함께 본다](20260929_012_%EA%B0%99%EC%9D%80%EC%8B%9C%EB%8C%80_%EB%8B%A4%EB%A5%B8%EC%82%B0%EC%A7%80.md) |
| 013 | 2026-09-29 | [노릭절 채집지가 지도에서 통째로 빠지던 것을 고친다](20260929_013_%EB%85%B8%EB%A6%AD%EC%A0%88_%EC%B1%84%EC%A7%91%EC%A7%80_%EB%88%84%EB%9D%BD.md) |
| 014 | 2026-09-29 | ["채집지" 를 "산지" 로, 분류군을 찾을 때 산출 건수가 퇴적기원 선택을 따른다](20260929_014_%EC%82%B0%EC%A7%80_%EC%9D%B4%EB%A6%84_%ED%87%B4%EC%A0%81%EA%B8%B0%EC%9B%90%EB%B3%84_%EC%82%B0%EC%B6%9C%EC%88%98.md) |
| 015 | 2026-09-29 | [절을 넘는 넓은 연대의 기록도 걸친 모든 시점에 보이고, 고리로 불완전함을 밝힌다](20260929_015_%EB%84%93%EC%9D%80%EC%97%B0%EB%8C%80_%EA%B3%A0%EB%A6%AC%EB%A1%9C_%ED%91%9C%EC%8B%9C.md) |
| 016 | 2026-09-29 | ["넓은 연대" 를 "모호한 연대" 로 바로잡고, 속이 찬 세모로 그린다](20260929_016_%EB%AA%A8%ED%98%B8%ED%95%9C%EC%97%B0%EB%8C%80_%EC%84%B8%EB%AA%A8.md) |
| 017 | 2026-09-29 | [화석 좌표를 시점마다 계산한다(PALEOMAP v19o)](20260929_017_%EC%8B%9C%EC%A0%90%EB%B3%84_%EC%A2%8C%ED%91%9C%EA%B3%84%EC%82%B0.md) |
| 018 | 2026-09-29 | [연대 범위 길이로 거르는 막대](20260929_018_%EC%97%B0%EB%8C%80%EB%B2%94%EC%9C%84_%EA%B1%B0%EB%A5%B4%EA%B8%B0.md) |
| 019 | 2026-09-29 | [점 테두리를 모두 흰색으로](20260929_019_%EC%A0%90_%ED%85%8C%EB%91%90%EB%A6%AC_%ED%9D%B0%EC%83%89.md) |
| 020 | 2026-09-30 | [이름을 "베게너의 꿈 (Wegener's Dream)" 으로](20260930_020_%EC%9D%B4%EB%A6%84_%EB%B2%A0%EA%B2%8C%EB%84%88%EC%9D%98%EA%BF%88.md) |
| koprifossillab 021 | 2026-09-30 | [시점을 옮길 때 산지 점이 깜박이지 않게](20260930_koprifossillab_021_frame_switch_flicker.md) |
| koprifossillab 022 | 2026-09-30 | [CI 의 파이프라인 규칙 시험을 표준 라이브러리만으로 다시 돌게](20260930_koprifossillab_022_ci_rule_tests_deps.md) |
| koprifossillab 023 | 2026-09-30 | [머리말에 판 번호를](20260930_koprifossillab_023_header_version.md) |
| koprifossillab 024 | 2026-09-30 | [몰바이데 투영을 고를 수 있게](20260930_koprifossillab_024_mollweide_projection.md) |
| koprifossillab 025 | 2026-09-30 | [몰바이데에서 끌면 지구가 돈다](20260930_koprifossillab_025_mollweide_rotation.md) |
| koprifossillab 026 | 2026-09-30 | [패널을 접는다](20260930_koprifossillab_026_panel_collapse.md) |
| koprifossillab 027 | 2026-09-30 | [영어판](20260930_koprifossillab_027_english_version.md) |
| koprifossillab 028 | 2026-09-30 | [몰바이데에서 정거원통 테두리 해안선을 지운다](20260930_koprifossillab_028_mollweide_edge_coastlines.md) |
| koprifossillab 029 | 2026-09-30 | [몰바이데에서 지구 밖을 끌면 지도를 옮긴다](20260930_koprifossillab_029_mollweide_drag_outside.md) |
| koprifossillab 030 | 2026-09-30 | [몰바이데에서 지구가 옆으로 밀려 남던 것, 돌리는 동안의 세로 이동](20260930_koprifossillab_030_mollweide_view_reset.md) |
| koprifossillab 031 | 2026-09-30 | [릴리스 태그마다 Docker Hub 에 이미지를 올린다](20260930_koprifossillab_031_dockerhub_push_setup.md) |
| wetherilli 001 | 2026-09-30 | [확대·축소 단추를 치우고 축척 막대를 단다](20260930_wetherilli_001_zoom_buttons_scale_bar.md) |
| wetherilli 002 | 2026-09-30 | [전 지구 평균 기온을 온도계로](20260930_wetherilli_002_gmst_thermometer.md) |
| wetherilli 003 | 2026-09-30 | [투영 단추를 머리말로, 언어·자료는 설정 창으로](20260930_wetherilli_003_header_projection_settings.md) |
| wetherilli 004 | 2026-09-30 | [분류군·국가 찾기를 지도 아래 막대로](20260930_wetherilli_004_find_bar.md) |
| wetherilli 005 | 2026-09-30 | [대기 화면과 읽기 실패 안내](20260930_wetherilli_005_splash_load_failure.md) |
| wetherilli 006 | 2026-09-30 | [팝업 색을 토큰으로, 고좌표는 눌러서 복사](20260930_wetherilli_006_popup_tokens_copy.md) |
| wetherilli 007 | 2026-09-30 | [번역이 빠진 문구를 잡는 시험](20260930_wetherilli_007_i18n_missing_key_test.md) |
| wetherilli 008 | 2026-09-30 | [지도를 그림으로 내려받기](20260930_wetherilli_008_export_image.md) |
| wetherilli 009 | 2026-09-30 | [몰바이데에서 기온 층이 처음 켤 때 안 그려지던 것](20260930_wetherilli_009_mollweide_climate_first_paint.md) |
| wetherilli 010 | 2026-09-30 | [병합 전에 판이 부딪히는지 본다](20260930_wetherilli_010_premerge_version_check.md) |
| tupandactyl 001 | 2026-09-30 | [커서 목록을 계급이 아니라 산지의 분류군 수로 가른다](20260930_tupandactyl_001_hover_taxa_list.md) |
| wetherilli 011 | 2026-09-30 | [패널을 양쪽으로, 찾기 칸이 빠진 절 치우기](20260930_wetherilli_011_two_panels.md) |
| wetherilli 012 | 2026-09-30 | [축척 막대를 GSM 처럼 두껍게, 테마를 따라](20260930_wetherilli_012_thick_scale_bar.md) |
| wetherilli 013 | 2026-09-30 | [분류군·국가를 한 칸에서 찾는다](20260930_wetherilli_013_one_find_box.md) |
| wetherilli 014 | 2026-09-30 | [그림 단추를 도구 묶음으로, 거리 재기·링크·전체 보기](20260930_wetherilli_014_map_tools.md) |
| tupandactyl 002 | 2026-09-30 | [시점 막대를 맨 위로, 찾기 칸을 떠 있는 카드로, 잔정보는 설정 창으로](20260930_tupandactyl_002_layout_tidy.md) |
| wetherilli P01 | 2026-09-30 | [세 번째 투영: 3D 지구본 (계획)](20260930_wetherilli_P01_globe_3d.md) |
| wetherilli 015 | 2026-09-30 | [지구본 1 단계: 지금 가공물을 둥근 지구에](20260930_wetherilli_015_globe_first_stage.md) |
| tupandactyl 003 | 2026-09-30 | [패널을 오른쪽 하나로, "점" 을 "포인트" 로, 분류군 설명도 "읽는 법" 으로](20260930_tupandactyl_003_right_panel.md) |
| tupandactyl 004 | 2026-09-30 | [확대·축소 단추를 도구 묶음에 다시 둔다](20260930_tupandactyl_004_zoom_buttons.md) |
| wetherilli 016 | 2026-09-30 | [지구본 지형 격자를 굽는다 (파이프라인)](20260930_wetherilli_016_terrain_grids.md) |
| wetherilli 017 | 2026-09-30 | [지구본에 지형을 세운다 (뷰어)](20260930_wetherilli_017_globe_terrain.md) |
| tupandactyl 005 | 2026-09-30 | [빈티지 대기 화면: 베게너 초상, 파이프 연기, 메달을 두르는 메소사우루스](20260930_tupandactyl_005_vintage_splash.md) |
| tupandactyl 006 | 2026-09-30 | [사이트 전체를 빈티지풍으로: 가죽 머리말, 양피지, 원목, 본명조 + Spectral](20260930_tupandactyl_006_vintage_theme.md) |
| tupandactyl 007 | 2026-09-30 | [첫 화면에 모든 시대의 산지, 끌어 옮기는 옛 지도 축척, 책등 칩](20260930_tupandactyl_007_all_eras_landing.md) |
| koprifossillab 032 | 2026-09-30 | [매주 월요일 새벽: 운영 자료 백업과 PBDB 갱신](20260930_koprifossillab_032_weekly_refresh.md) |
| tupandactyl 008 | 2026-09-30 | [제4기 안의 시대 이름은 모호한 연대에서 뺀다](20260930_tupandactyl_008_quaternary_precise.md) |
| tupandactyl 009 | 2026-09-30 | [최근 5 Ma 를 절 단위 시점으로, 기온 지도도 절 경계로](20260930_tupandactyl_009_recent_stages.md) |
| tupandactyl 010 | 2026-09-30 | [최근의 절에 PaleoClim 기온 지도](20260930_tupandactyl_010_pleistocene_climate.md) |
| koprifossillab 033 | 2026-09-30 | [PaleoClim 을 받기·가공·주간 점검의 흐름에 넣는다](20260930_koprifossillab_033_paleoclim_in_pipeline.md) |
| koprifossillab 034 | 2026-09-30 | [/healthz 가 주간 갱신·백업과 지형·PaleoClim 을 본다](20260930_koprifossillab_034_healthz_refresh.md) |
| tupandactyl 011 | 2026-10-01 | [화면 모드: Scientific(기본)과 Casual](20261001_tupandactyl_011_scientific_mode.md) |
| tupandactyl 012 | 2026-10-01 | [찾기의 종합 보기, 지도 옮기는 폭, 팝업 자리, 암상](20261001_tupandactyl_012_search_overview.md) |
| tupandactyl 013 | 2026-10-01 | [대기 화면을 빠르게, "느리게 보기"](20261001_tupandactyl_013_splash_speed.md) |
| tupandactyl 014 | 2026-10-01 | [종합 보기의 툴팁을 시점 찾기와 같게](20261001_tupandactyl_014_overview_tooltip.md) |
| tupandactyl 015 | 2026-10-01 | [팝업의 산출 이름으로 찾기, 분류군 × 국가, 종합 보기의 암상](20261001_tupandactyl_015_taxon_links_combo.md) |
| tupandactyl P01 | 2026-10-01 | [지구사 사건(대멸종·전 지구 사건)을 시점에 넣는다 — 계획](20261001_tupandactyl_P01_earth_events.md) |
| tupandactyl 016 | 2026-10-01 | [지구사 사건을 시점 막대·패널·산출 막대에](20261001_tupandactyl_016_earth_events.md) |
| tupandactyl 017 | 2026-10-01 | [지구사 사건을 층서표의 책갈피로](20261001_tupandactyl_017_event_bookmarks.md) |
| tupandactyl 018 | 2026-10-01 | [책갈피는 고를 때만, 멸종은 폭발·기후 사건은 마름모](20261001_tupandactyl_018_event_marks.md) |
| tupandactyl 019 | 2026-10-01 | [에디아카라기 시점(550 Ma, 판 복원만)](20261001_tupandactyl_019_ediacaran_frame.md) |
| tupandactyl 020 | 2026-10-01 | [Casual 모드의 한글: 학명 음차·연대·암상](20261001_tupandactyl_020_korean_names.md) |
| tupandactyl 021 | 2026-10-01 | [한글로 속·종 찾기: 미리 음차한 표](20261001_tupandactyl_021_korean_search.md) |
| tupandactyl 022 | 2026-10-01 | [산지 팝업의 세로 길이를 끌어서, 읽는 법에 학명 표기의 근거](20261001_tupandactyl_022_popup_resize.md) |
| tupandactyl 023 | 2026-10-01 | [다크 모드 Casual 의 한글을 본명조 600 으로](20261001_tupandactyl_023_dark_hangul_weight.md) |
| tupandactyl 024 | 2026-10-01 | [분포 분석: 다양성 곡선·비교 분류군·고위도·내려받기·잘림 알림](20261001_tupandactyl_024_research_tools.md) |
| tupandactyl 025 | 2026-10-01 | [주간 갱신이 main 을 스스로 당기고, 에디아카라기 시점을 받아들인다](20261001_tupandactyl_025_refresh_autopull.md) |
| tupandactyl 026 | 2026-10-01 | [같은 이름의 분류군(동명)을 따로 찾는다](20261001_tupandactyl_026_homonyms.md) |
| tupandactyl 027 | 2026-10-01 | [한글로 안 바뀌던 학명, 최근 찾은 것](20261001_tupandactyl_027_ko_fallback_recent.md) |
| tupandactyl 028 | 2026-10-01 | [지층으로 찾기](20261001_tupandactyl_028_formation_search.md) |
| tupandactyl 029 | 2026-10-01 | [연구소 밖에서 보는 사이트(GitHub Pages), 1.0.0](20261001_tupandactyl_029_outside_access_v1.md) |
| tupandactyl 030 | 2026-10-01 | [지층의 화석 기록을 계통 나무로](20261001_tupandactyl_030_formation_fauna.md) |
| tupandactyl 031 | 2026-10-01 | [지층 화석 나무를 동물·식물·기타로, 읽는 법을 접어서, 찾기 후보 차례](20261001_tupandactyl_031_fauna_guide_tidy.md) |
| koprifossillab 035 | 2026-10-02 | [휴대폰 화면](20261002_koprifossillab_035_mobile_ui.md) |
| koprifossillab 036 | 2026-10-02 | [휴대폰의 팝업 터치·시점 막대·패널 끌기](20261002_koprifossillab_036_mobile_touch.md) |
| koprifossillab 037 | 2026-10-06 | [주간 갱신이 남의 폴더 시각에서 멈췄다](20261006_koprifossillab_037_refresh_dir_times.md) |
| koprifossillab 038 | 2026-10-06 | [휴대폰: 시점 막대 접기, 찾기 카드의 분류군 줄, 지도 옮기기](20261006_koprifossillab_038_mobile_find.md) |
| koprifossillab 039 | 2026-10-06 | [설정 창을 탭 셋으로: 설정 · 소개 · 자료와 판 이력](20261006_koprifossillab_039_about_tabs.md) |
| koprifossillab 040 | 2026-10-06 | [설정 창의 탭을 다시 묶는다: 설정과 읽는 법 · 소개와 자료 · 판 이력](20261006_koprifossillab_040_settings_tabs_regroup.md) |
| koprifossillab 041 | 2026-10-06 | [만든 사람들에서 koprifossillab 을 뺀다](20261006_koprifossillab_041_people_list.md) |
