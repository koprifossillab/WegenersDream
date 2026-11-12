# BioGeoBEARS 결과(.rds) → 베게너의 꿈 결과 파일(sources/phylogeo/<id>.result.json). 연구 폴더에서 돌린다.
#   Rscript bgb_export.R <나갈 json> <보일 모델 이름> <그 모델 rds> [견줄 모델=rds …]
# 노드마다 확률 1% 이상인 범위만 싣는다(top: 노드, bottom: 부모에서 갈라진 직후 이 가지). 노드 번호는 ape 의 것(끝 1..N, 뿌리 N+1)
.libPaths(c("/rlib", .libPaths()))
suppressMessages({ library(BioGeoBEARS); library(ape); library(jsonlite); library(cladoRcpp) })
args <- commandArgs(TRUE)
out <- args[1]; model <- args[2]; res <- readRDS(args[3]); others <- args[-(1:3)]
tr <- read.tree("tree.newick")
areas <- getareas_from_tipranges_object(getranges_from_LagrangePHYLIP("geog.data"))
states <- rcpp_areas_list_to_states_list(areas = areas, maxareas = length(areas), include_null_range = TRUE)
lab <- sapply(states, function(s) if (length(s) == 1 && is.na(s)) "_" else paste(areas[s + 1], collapse = ""))
top <- res$ML_marginal_prob_each_state_at_branch_top_AT_node
bot <- res$ML_marginal_prob_each_state_at_branch_bottom_below_node
ages <- max(node.depth.edgelength(tr)) - node.depth.edgelength(tr)
n <- Ntip(tr) + tr$Nnode
parent <- rep(NA_integer_, n); parent[tr$edge[, 2]] <- tr$edge[, 1]
pick <- function(p) { o <- order(-p); o <- o[p[o] >= 0.01]; setNames(as.list(round(p[o], 4)), lab[o]) }
nodes <- lapply(seq_len(n), function(i) list(
  id = i, parent = if (is.na(parent[i])) NULL else parent[i], age = round(ages[i], 4),
  tip = if (i <= Ntip(tr)) tr$tip.label[i] else NULL,
  top = pick(top[i, ]), bottom = if (is.na(parent[i])) NULL else pick(bot[i, ])))
summ <- function(name, r) {
  pt <- r$outputs@params_table; k <- sum(pt[c("d", "e", "j"), "type"] == "free")
  list(model = name, LnL = get_LnL_from_BioGeoBEARS_results_object(r), d = pt["d", "est"], e = pt["e", "est"], j = pt["j", "est"])
}
models <- c(list(summ(model, res)), lapply(others, function(x) { kv <- strsplit(x, "=")[[1]]; summ(kv[1], readRDS(kv[2])) }))
pt <- res$outputs@params_table
writeLines(toJSON(list(model = model, LnL = get_LnL_from_BioGeoBEARS_results_object(res),
  params = list(d = pt["d", "est"], e = pt["e", "est"], j = pt["j", "est"]), models = models, areas = areas, nodes = nodes),
  auto_unbox = TRUE, null = "null", digits = 6), out)
cat("wrote", out, n, "nodes\n")
