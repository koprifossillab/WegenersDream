# R 꾸러미를 /rlib(바깥 폴더를 걸어 둔다)에 한 번 깐다 — BioGeoBEARS 는 CRAN 판이 R 4.4 에 없어 GitHub 판, MultinomialCI 는 CRAN 보관본
options(repos = c(CRAN = "https://packagemanager.posit.co/cran/__linux__/noble/latest"), Ncpus = 8)
.libPaths(c("/rlib", .libPaths()))
need <- c("devtools", "stringr", "httr", "testthat", "plotrix", "gdata", "phytools", "minqa", "expm", "fdrtool", "statmod",
          "SparseM", "spam", "ape", "jsonlite", "optimx", "GenSA", "FD", "snow", "rexpokit", "cladoRcpp", "remotes", "phylobase")
inst <- need[!need %in% rownames(installed.packages())]
if (length(inst)) install.packages(inst, lib = "/rlib")
if (!"MultinomialCI" %in% rownames(installed.packages()))
  install.packages("https://cran.r-project.org/src/contrib/Archive/MultinomialCI/MultinomialCI_1.2.tar.gz", repos = NULL, type = "source", lib = "/rlib")
if (!"BioGeoBEARS" %in% rownames(installed.packages()))
  remotes::install_github("nmatzke/BioGeoBEARS", lib = "/rlib", dependencies = TRUE, upgrade = "never")
library(BioGeoBEARS); cat("BioGeoBEARS", as.character(packageVersion("BioGeoBEARS")), "\n")
