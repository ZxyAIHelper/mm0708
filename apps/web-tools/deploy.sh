#!/bin/bash

# 工具门户部署脚本

echo "======================================="
echo "工具门户部署脚本"
echo "======================================="
echo ""

# 检查Node.js版本
echo "检查Node.js版本..."
node_version=$(node -v 2>&1)
if [[ $node_version =~ ^v([0-9]+)\. ]]; then
  major_version=${BASH_REMATCH[1]}
  if (( major_version < 18 )); then
    echo "❌ 错误: Node.js版本过低，需要18.0.0或更高版本"
    echo "当前版本: $node_version"
    exit 1
  else
    echo "✅ Node.js版本检查通过: $node_version"
  fi
else
  echo "❌ 错误: 无法获取Node.js版本"
  exit 1
fi

echo ""

# 检查Wrangler CLI
echo "检查Wrangler CLI..."
wrangler_version=$(npx wrangler@3 --version 2>&1 | head -n 1)
if [[ $wrangler_version =~ ^wrangler([0-9]+)\. ]]; then
  echo "✅ Wrangler CLI检查通过: $wrangler_version"
else
  echo "❌ 错误: 无法获取Wrangler CLI版本"
  exit 1
fi

echo ""

# 提示用户确认部署
echo "是否确定要部署工具门户？"
echo "按Enter键继续，或按Ctrl+C取消..."
read -r

echo ""
echo "开始部署..."

# 执行部署命令
npx wrangler@3 pages deploy . --project-name=pages --commit-dirty=true

deploy_result=$?

echo ""
if [ $deploy_result -eq 0 ]; then
  echo "✅ 部署成功！"
  echo "======================================="
  echo "部署已完成。您可以访问以下链接查看部署结果："
  echo "https://pages.pages.dev"
  echo "（实际URL可能会有所不同，请查看部署输出中的实际链接）"
  echo "======================================="
else
  echo "❌ 部署失败！"
  echo "======================================="
  echo "部署过程中出现错误，请检查上面的错误信息。"
  echo "======================================="
  exit $deploy_result
fi
