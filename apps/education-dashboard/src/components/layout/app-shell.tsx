import Link from "next/link";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/teacher", label: "老师视角" },
  { href: "/principal", label: "校长视角" },
  { href: "/ingestion", label: "数据录入" }
];

type AppShellProps = {
  children: ReactNode;
  currentPath: string;
  title: string;
  subtitle: string;
};

export function AppShell({
  children,
  currentPath,
  title,
  subtitle
}: AppShellProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-white/60 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-6">
        <header className="flex flex-col gap-6 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.32em] text-blue-600">
              教育质量分析看板
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {subtitle}
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPath.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <section className="pt-6">{children}</section>
      </div>
    </main>
  );
}
