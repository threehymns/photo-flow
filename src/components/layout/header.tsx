'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Home, Settings } from 'lucide-react';

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
};

const navItems: NavItem[] = [
  { name: 'Home', href: '/', icon: Home, label: 'Home' },
  { name: 'Settings', href: '/settings', icon: Settings, label: 'Settings' },
];

export function Header() {
  const pathname = usePathname();
  const isPrintPage = pathname === '/';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center space-x-2 md:space-x-6">
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    isActive 
                      ? 'bg-accent text-accent-foreground' 
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {isPrintPage && (
            <div className="hidden md:flex items-center text-sm text-muted-foreground">
              <span className="mr-2">Press</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded-md border">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+P
              </kbd>
              <span className="ml-2">to print</span>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

