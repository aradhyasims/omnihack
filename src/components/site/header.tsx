import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/current";
import { DesktopNav, MobileNav } from "./nav";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <DesktopNav />
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/dashboard" variant="secondary" size="sm" className="hidden sm:inline-flex">
              Dashboard
            </ButtonLink>
          ) : (
            <>
              <Link href="/auth/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:text-ink-950 sm:inline-block">
                Sign in
              </Link>
              <ButtonLink href="/host" size="sm" className="hidden sm:inline-flex">
                Host a competition
              </ButtonLink>
            </>
          )}
          <MobileNav signedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
