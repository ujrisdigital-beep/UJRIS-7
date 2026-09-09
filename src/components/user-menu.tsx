"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/actions/auth";
import { LogOut, CreditCard, Home } from "lucide-react";
import Link from "next/link";
import { PLANS } from "@/lib/plans";

export function UserMenu({ name, email, plan }: { name: string; email: string; plan: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const planName = PLANS[plan as keyof typeof PLANS]?.name ?? "UJRIS Start";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button className="flex items-center gap-2 rounded-full border border-border p-1 pr-3 transition hover:bg-secondary" />}
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">{name.split(" ")[0]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{name}</p>
            <p className="text-xs leading-none text-muted-foreground">{email}</p>
            <p className="text-xs leading-none text-muted-foreground pt-1">{planName}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/home" />}>
          <Home className="mr-2 h-4 w-4" /> Home
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/billing" />}>
          <CreditCard className="mr-2 h-4 w-4" /> Billing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
