# BioGeoBEARS 를 돌리는 R 상자(tupandactyl 035) — 뷰어·파이프라인 이미지와 따로다. 쓰는 법은 README.md
FROM rocker/r-ver:4.4.2
# 사내망의 TLS 검사 인증서가 이 폴더에 있으면 믿게 한다(paleoserver: /usr/local/share/ca-certificates/kopri_ssl_root.crt 를 복사해 둔다)
COPY . /tmp/ctx/
RUN (cp /tmp/ctx/*.crt /usr/local/share/ca-certificates/ 2>/dev/null || true) && update-ca-certificates \
 && apt-get update && apt-get install -y --no-install-recommends libuv1 libglpk40 libxml2 libgmp10 libpng16-16 libfontconfig1 \
    libfreetype6 libharfbuzz0b libfribidi0 libtiff6 libjpeg-turbo8 libcurl4 && rm -rf /var/lib/apt/lists/* /tmp/ctx
