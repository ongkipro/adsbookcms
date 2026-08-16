import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"

import { cn } from "@/lib/utils"
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog"
import { SearchIcon, CheckIcon } from "lucide-react"

function Command({
 className,
 filter = (value, search) => {
  const normalize = (input: string) =>
   input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  const haystack = normalize(value)
  const tokens = normalize(search).split(" ").filter(Boolean)
  return tokens.every((token) => haystack.includes(token)) ? 1 : 0
 },
 ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
 return (
  <CommandPrimitive
   data-slot="command"
   filter={filter}
   className={cn(
    "flex size-full flex-col overflow-hidden rounded-xl! bg-popover text-popover-foreground",
    className
   )}
   {...props}
  />
 )
}

function CommandDialog({
 title = "Pencarian admin",
 description = "Cari dan buka halaman admin.",
 children,
 className,
 showCloseButton = false,
 ...props
}: React.ComponentProps<typeof Dialog> & {
 title?: string
 description?: string
 className?: string
 showCloseButton?: boolean
}) {
 return (
  <Dialog {...props}>
   <DialogHeader className="sr-only">
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{description}</DialogDescription>
   </DialogHeader>
  <DialogContent
   className={cn(
    "fixed bottom-0 left-1/2 top-auto z-50 grid grid-cols-1 w-full max-w-none -translate-x-1/2 translate-y-0 gap-0 overflow-hidden rounded-b-none! rounded-t-2xl! bg-popover p-0 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:bottom-auto sm:top-1/2 sm:max-h-[min(72vh,38rem)] sm:max-w-xl sm:-translate-y-1/2 sm:rounded-xl! data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
    className
   )}
   showCloseButton={showCloseButton}
  >
   <Command className="rounded-none!">{children}</Command>
  </DialogContent>
  </Dialog>
 )
}

function CommandInput({
 className,
 ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
 return (
  <div className="flex items-center px-3" data-slot="command-input-wrapper">
   <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50 text-slate-500" />
   <CommandPrimitive.Input
    data-slot="command-input"
    className={cn(
     "flex h-12 w-full rounded-md bg-transparent py-3 text-base md:text-sm outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0 focus-visible:ring-0 focus:outline-none shadow-none",
     className
    )}
    {...props}
   />
  </div>
 )
}

function CommandList({
 className,
 ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
 return (
  <CommandPrimitive.List
   data-slot="command-list"
   className={cn(
    "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
    className
   )}
   {...props}
  />
 )
}

function CommandEmpty({
 className,
 ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
 return (
  <CommandPrimitive.Empty
   data-slot="command-empty"
   className={cn("py-6 text-center text-base md:text-sm", className)}
   {...props}
  />
 )
}

function CommandGroup({
 className,
 ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
 return (
  <CommandPrimitive.Group
   data-slot="command-group"
   className={cn(
    "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
    className
   )}
   {...props}
  />
 )
}

function CommandSeparator({
 className,
 ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
 return (
  <CommandPrimitive.Separator
   data-slot="command-separator"
   className={cn("-mx-1 h-px bg-border", className)}
   {...props}
  />
 )
}

function CommandItem({
 className,
 children,
 ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
 return (
  <CommandPrimitive.Item
   data-slot="command-item"
   className={cn(
    "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-base md:text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
    className
   )}
   {...props}
  >
   {children}
   <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
  </CommandPrimitive.Item>
 )
}

function CommandShortcut({
 className,
 ...props
}: React.ComponentProps<"span">) {
 return (
  <span
   data-slot="command-shortcut"
   className={cn(
    "ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
    className
   )}
   {...props}
  />
 )
}

export {
 Command,
 CommandDialog,
 CommandInput,
 CommandList,
 CommandEmpty,
 CommandGroup,
 CommandItem,
 CommandShortcut,
 CommandSeparator,
}
