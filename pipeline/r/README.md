# pipeline/r — 계통 생물지리 분석을 밖에서 돌리는 R 상자

뷰어와 파이프라인은 R 을 쓰지 않는다. 조상 범위 추정(BioGeoBEARS)은 이 폴더의 Docker 상자에서 돌리고, 결과를 연구실이 검토해
`sources/phylogeo/<id>.result.json` 으로 저장소에 둔다. 그다음 `python -m pipeline phylogeo` 가 지도용 묶음을 굽는다(tupandactyl 035,
검토는 `docs/계통생물지리_검토.md`).

## 상자 만들기와 꾸러미 깔기(한 번)

```bash
cd pipeline/r
cp /usr/local/share/ca-certificates/kopri_ssl_root.crt .   # 사내망이면 — 커밋하지 않는다(.gitignore)
docker build -t local/bgb-r:4.4.2 .
mkdir -p ~/.cache/wegener-rlib
docker run --rm -v $PWD:/w -v ~/.cache/wegener-rlib:/rlib -w /w local/bgb-r:4.4.2 Rscript setup.R
```

## 꼽등이과(Kim et al. 2024) 다시 돌리기

연구 폴더 `rhaphidophoridae_kim2024/`:

| 파일 | 어디서 |
|---|---|
| `tree_full.newick` | Zenodo 8026258 `Trees/Dating_tree.tre`(MrBayes 연대 나무)의 주석을 걷은 것. 바깥 무리 *Comicus campestris* 는 bgb_run.R 이 뺀다 |
| `geog.data` | 끝마다 지역 9 곳(A–I). **원 자료에 없어** 결과 PDF(`BioGeobears/*.pdf`)의 끝 글자에서 옮겼다 |
| `dispmult.txt` | 보충 자료 Table S3 의 시기별 분산 계수. 60–90 Ma 표는 PDF 에 열이 하나 더 찍혀 앞 9 칸을 썼다(다섯 표 모두 대칭·대각 1) |
| `times.txt` | 30·60·90·120·150 Ma |

```bash
cd pipeline/r/rhaphidophoridae_kim2024
R="docker run --rm -v $PWD:/w -v $PWD/..:/r -v ~/.cache/wegener-rlib:/rlib -w /w local/bgb-r:4.4.2 Rscript"
$R /r/bgb_run.R fixed                    # 논문의 모수로 고정 — 우도·조상 범위(모델마다 몇 분)
$R /r/bgb_export.R ../../../sources/phylogeo/rhaphidophoridae_kim2024.result.json DIVALIKE+J res_fixed_DIVALIKEJ.rds \
   DEC=res_fixed_DEC.rds DEC+J=res_fixed_DECJ.rds DIVALIKE=res_fixed_DIVALIKE.rds BAYAREALIKE=res_fixed_BAYAREALIKE.rds BAYAREALIKE+J=res_fixed_BAYAREALIKEJ.rds
$R /r/bgb_run.R optim DIVALIKE+J         # 최적화로 다시(몇 시간) — 논문 값과 견줄 때
```

`res_*.rds`·`tree.newick` 은 커밋하지 않는다.
