# 待启用的工作流

`deploy-pages.yml` 是让「推送 main 即自动部署」生效的工作流，但它**不能**从这里直接提交到
`.github/workflows/`：通过 OAuth 授权的 `gh` token 需要额外的 `workflow` 权限，才被允许创建或
修改该目录下的文件。所以先存放在这里。

启用步骤：

```bash
# 1. 给 gh 补一个 workflow 权限（会打开浏览器确认一次）
gh auth refresh -h github.com -s workflow

# 2. 把文件放到 GitHub 认的位置并推送
mkdir -p .github/workflows
cp build/github-workflows/deploy-pages.yml .github/workflows/
git add .github/workflows/deploy-pages.yml
git commit -m "Enable Pages deployment from main"
git push origin main
```

3. 仓库 Settings → Pages，把 Source 从「Deploy from a branch」改成「GitHub Actions」。
4. 仓库 Settings → General，把默认分支从 `gh-pages` 改成 `main`。

在这之前，发布走 `npm run deploy`（见 README 第 14 节）。
