import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AudioLines,
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileAudio2,
  Menu,
  Settings2,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { API_BASE_URL, isDemoMode } from "@/lib/polyglot-api";

const links = [
  { to: "/", label: "Overview", icon: ChartNoAxesCombined },
  { to: "/transcription", label: "Transcription Studio", icon: AudioLines },
  { to: "/language-analysis", label: "Language Analysis", icon: Waves },
  { to: "/context-adaptation", label: "Context Adaptation", icon: BookOpenText },
  { to: "/model-evaluation", label: "Model Evaluation", icon: Activity },
  { to: "/history", label: "Transcription History", icon: Clock3 },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

function backendHost() {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return API_BASE_URL;
  }
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <AudioLines className="size-[18px]" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-wide">
            POLYGLOT <span className="text-primary">ASR</span>
          </div>
          <div className="eyebrow mt-0.5 text-[9.5px] text-muted-foreground">
            Research console · v1.4
          </div>
        </div>
      )}
    </div>
  );
}

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {links.map(({ to, label, icon: Icon }) => {
        const active =
          to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              "nav-item flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors",
              active
                ? "nav-item-active bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-[17px] shrink-0" />
            {collapsed ? (
              <span className="sr-only">{label}</span>
            ) : (
              <span className="truncate">{label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function StatusCard() {
  return (
    <div className="mx-4 mt-6 rounded-md border border-sidebar-border bg-card px-3 py-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className={cn("size-4", isDemoMode ? "text-warning" : "text-success")} />
        <span className="eyebrow text-[10px] text-foreground">Model status</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", isDemoMode ? "bg-warning" : "bg-success")} />
        <span className="truncate text-xs text-muted-foreground">
          {isDemoMode ? "Backend not connected" : `API · ${backendHost()}`}
        </span>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">XLS-R 300M · MUCS 2021</div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const current =
    links.find((link) => (link.to === "/" ? pathname === "/" : pathname.startsWith(link.to))) ??
    null;
  const PageIcon = current?.icon ?? ChartNoAxesCombined;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="app-frame flex min-h-screen w-full bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "app-sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="px-3 pb-2 pt-6">
          {!collapsed && (
            <p className="eyebrow px-3 pb-3 text-[10px] text-muted-foreground">Workspace</p>
          )}
          <NavList pathname={pathname} collapsed={collapsed} />
        </div>
        {!collapsed && <StatusCard />}
        <div className="mt-auto p-3">
          <div
            className={cn(
              "mb-3 flex items-center gap-2 rounded-md bg-muted/55 px-3 py-2",
              collapsed && "justify-center px-1",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", isDemoMode ? "bg-warning" : "bg-success")}
            />
            {!collapsed && (
              <span className="eyebrow text-[10px] text-muted-foreground">
                {isDemoMode ? "Demo mode" : "API connected"}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            className="h-9 w-full text-xs text-muted-foreground"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <>
                <ChevronLeft className="size-4" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="app-sidebar w-[280px] border-sidebar-border p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Polyglot ASR sections</SheetDescription>
          <Brand />
          <div className="px-3 pt-6">
            <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
          <StatusCard />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur md:px-8 lg:h-[72px]">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="size-9 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
              <span>Research</span>
              <span className="text-border">/</span>
              <PageIcon className="size-3.5" />
              <span className="text-foreground">{current?.label ?? "Not found"}</span>
            </div>
            <div className="truncate text-sm font-semibold md:hidden">
              {current?.label ?? "Polyglot ASR"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground sm:flex">
              <FileAudio2 className="size-3.5" />
              <span>MUCS 2021 Subtask 2</span>
            </div>
            <Link
              to="/settings"
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium",
                isDemoMode ? "border-warning/30 text-warning" : "border-success/30 text-success",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", isDemoMode ? "bg-warning" : "bg-success")}
              />
              {isDemoMode ? "Demo" : "Live"}
            </Link>
          </div>
        </header>
        {isDemoMode && (
          <div className="demo-strip flex items-center justify-center gap-2 border-b border-warning/20 px-3 py-2 text-center text-[11px] text-muted-foreground">
            <Boxes className="size-3.5 shrink-0 text-warning" />
            <span>
              <strong className="font-semibold text-foreground">Demo mode</strong> · The speech
              service isn't connected. No transcripts or results are simulated.
            </span>
          </div>
        )}
        <main
          id="main"
          className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-12 pt-7 sm:px-5 md:px-8 md:pt-9"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
