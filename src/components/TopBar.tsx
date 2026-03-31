import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

function NavItem({ to, label }: { to: string; label: string }) {
  const loc = useLocation()
  const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to))

  return (
    <Link
      to={to}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-zinc-900 text-white'
          : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900',
      )}
    >
      {label}
    </Link>
  )
}

export default function TopBar() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/import" className="text-sm font-semibold text-zinc-900">
          简历库
        </Link>
        <nav className="flex items-center gap-1">
          <NavItem to="/import" label="导入" />
          <NavItem to="/resumes" label="简历列表" />
        </nav>
      </div>
    </header>
  )
}

