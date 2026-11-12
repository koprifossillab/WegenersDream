# BioGeoBEARS 여섯 모델(DEC·DIVALIKE·BAYAREALIKE, 각각 ±J) — 연구 폴더(tree_full.newick·geog.data·dispmult.txt·times.txt)에서 돌린다.
#   Rscript bgb_run.R fixed  [모델 …]   논문이 보고한 모수로 고정해 우도와 조상 범위만 계산(몇 분)
#   Rscript bgb_run.R optim  [모델 …]   최적화(optimx) — 상태 512 개·5 조각이면 모델마다 몇 시간
# 결과는 res_<방식>_<모델>.rds 와 끝에 RESULT 줄. 모델 설정은 BioGeoBEARS 의 예시 스크립트(Matzke)를 그대로 따른다
.libPaths(c("/rlib", .libPaths()))
suppressMessages({ library(BioGeoBEARS); library(ape) })
args <- commandArgs(TRUE)
how <- if (length(args)) args[1] else "fixed"
which_models <- if (length(args) > 1) args[-1] else c("DEC", "DEC+J", "DIVALIKE", "DIVALIKE+J", "BAYAREALIKE", "BAYAREALIKE+J")
outgroup <- Sys.getenv("BGB_OUTGROUP", "Comicus_campestris")
# 논문(Kim et al. 2024, Table S4)의 최적 모수 — fixed 에서 쓴다
published <- list("DEC" = list(d = 0.0036, e = 0.0004), "DEC+J" = list(d = 0.0017, e = 1e-12, j = 0.054),
                   "DIVALIKE" = list(d = 0.0044, e = 1e-12), "DIVALIKE+J" = list(d = 0.0020, e = 1e-12, j = 0.050),
                   "BAYAREALIKE" = list(d = 0.0044, e = 1e-12), "BAYAREALIKE+J" = list(d = 0.0020, e = 1e-12, j = 0.050))

tr <- read.tree("tree_full.newick")
if (outgroup %in% tr$tip.label) tr <- drop.tip(tr, outgroup)
write.tree(tr, "tree.newick")
cat("끝", Ntip(tr), "뿌리 나이", max(node.depth.edgelength(tr)), "\n")

setup <- function(model, j) {
  r <- define_BioGeoBEARS_run()
  r$trfn <- "tree.newick"; r$geogfn <- "geog.data"
  r$max_range_size <- 9; r$min_branchlength <- 1e-6; r$include_null_range <- TRUE
  r$timesfn <- "times.txt"; r$dispersal_multipliers_fn <- "dispmult.txt"
  r$num_cores_to_use <- 1; r$force_sparse <- FALSE; r$use_optimx <- TRUE
  r$return_condlikes_table <- TRUE; r$calc_TTL_loglike_from_condlikes_table <- TRUE; r$calc_ancprobs <- TRUE
  r <- readfiles_BioGeoBEARS_run(r)
  r <- section_the_tree(inputs = r, make_master_table = TRUE, plot_pieces = FALSE)
  bp <- r$BioGeoBEARS_model_object@params_table
  if (model == "DIVALIKE") {
    bp["s", c("type", "init", "est")] <- list("fixed", 0, 0)
    bp["ysv", "type"] <- "2-j"; bp["ys", "type"] <- "ysv*1/2"; bp["y", "type"] <- "ysv*1/2"; bp["v", "type"] <- "ysv*1/2"
    bp["mx01v", c("type", "init", "est")] <- list("fixed", 0.5, 0.5)
  }
  if (model == "BAYAREALIKE") {
    bp["s", c("type", "init", "est")] <- list("fixed", 0, 0)
    bp["v", c("type", "init", "est")] <- list("fixed", 0, 0)
    bp["ysv", "type"] <- "1-j"; bp["ys", "type"] <- "ysv*1/1"; bp["y", "type"] <- "1-j"
    bp["mx01y", c("type", "init", "est")] <- list("fixed", 0.9999, 0.9999)
  }
  if (j) {
    bp["j", c("type", "init", "est")] <- list("free", 1e-4, 1e-4)
    if (model == "DIVALIKE") bp["j", "max"] <- 1.99999
    if (model == "BAYAREALIKE") bp["j", "max"] <- 0.99999
  }
  if (how == "fixed") for (k in names(published[[paste0(model, if (j) "+J" else "")]])) {
    v <- published[[paste0(model, if (j) "+J" else "")]][[k]]
    bp[k, c("type", "init", "est")] <- list("fixed", v, v)
  }
  r$BioGeoBEARS_model_object@params_table <- bp
  check_BioGeoBEARS_run(r)
  r
}
for (nm in which_models) {
  m <- sub("\\+J$", "", nm); j <- grepl("\\+J$", nm)
  t0 <- Sys.time(); r <- setup(m, j)
  res <- if (how == "fixed") bears_optim_run(r, skip_optim = TRUE, skip_optim_option = "return_all") else bears_optim_run(r)
  saveRDS(res, paste0("res_", how, "_", gsub("\\+", "J", nm), ".rds"))
  pt <- res$outputs@params_table
  cat("RESULT", nm, "LnL", get_LnL_from_BioGeoBEARS_results_object(res), "d", pt["d", "est"], "e", pt["e", "est"], "j", pt["j", "est"],
      "secs", round(as.numeric(Sys.time() - t0, units = "secs")), "\n")
}
