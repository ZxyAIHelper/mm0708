export default function InternalServerErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16">
      <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-semibold tracking-[0.24em] text-blue-600">系统提示</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">页面暂时不可用</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          教育质量分析服务正在处理中，请稍后刷新重试。
        </p>
      </div>
    </main>
  );
}
