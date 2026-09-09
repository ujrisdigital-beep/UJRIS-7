import Link from "next/link";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";

export async function AppHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo href={user ? "/home" : "/"} />
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {user ? (
            <>
              <Link href="/home" className="hover:text-foreground">Home</Link>
              <Link href="/billing" className="hover:text-foreground">Billing</Link>
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            </>
          ) : (
            <>
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
              <Link href="/#how-it-works" className="hover:text-foreground">How it works</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <UserMenu name={user.name} email={user.email} plan={user.plan} />
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/login" />}>
                Log in
              </Button>
              <Button render={<Link href="/signup" />}>Start my case</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
