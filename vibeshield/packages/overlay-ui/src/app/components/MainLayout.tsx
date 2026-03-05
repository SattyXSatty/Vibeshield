import { Outlet, Link, useLocation } from 'react-router';
import { Shield, Settings, FileCheck, Activity } from 'lucide-react';
import { cn } from './ui/utils';

export function MainLayout() {
  const location = useLocation();

  return (
    <div className="h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-zinc-400" />
            <h1 className="text-xs font-medium">VibeShield</h1>
          </div>

          <Link
            to="/settings"
            className={cn(
              "p-1 rounded hover:bg-zinc-800/50 transition-colors",
              location.pathname === '/settings' && "bg-zinc-800/50"
            )}
          >
            <Settings className="size-3.5 text-zinc-400" />
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="border-b border-zinc-800/50 bg-zinc-900/20">
        <div className="flex px-3 gap-1">
          <NavTab to="/" active={location.pathname === '/'} icon={Activity}>
            Dashboard
          </NavTab>
          <NavTab to="/test-cases" active={location.pathname === '/test-cases'} icon={FileCheck}>
            Test Cases
          </NavTab>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavTab({
  to,
  active,
  icon: Icon,
  children
}: {
  to: string;
  active: boolean;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 border-b transition-colors text-xs",
        active
          ? "border-zinc-400 text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </Link>
  );
}