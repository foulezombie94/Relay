"use client";
import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useSidebar } from "../ui/sidebar";

const SidebarMenuContext = createContext<{
  active: string | null;
  change: (id: string, open: boolean) => void;
  current: () => string | null;
} | null>(null);
const SidebarMenuIdContext = createContext<string | null>(null);

export function SidebarMenuProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  function change(id: string, open: boolean) {
    // A late close from the previous popup must not close its replacement.
    const next = open ? id : activeRef.current === id ? null : activeRef.current;
    activeRef.current = next;
    setActive(next);
  }
  return (
    <SidebarMenuContext.Provider value={{ active, change, current: () => activeRef.current }}>
      {children}
    </SidebarMenuContext.Provider>
  );
}

type SidebarMenuProps = Omit<
  ComponentProps<typeof Dropdown.Root>,
  "open" | "defaultOpen" | "modal"
>;
export function SidebarMenu({ onOpenChange, ...props }: SidebarMenuProps) {
  const menus = useContext(SidebarMenuContext);
  const id = useId();
  if (!menus) throw new Error("Sidebar menus require SidebarMenuProvider");
  return (
    <SidebarMenuIdContext.Provider value={id}>
      <Dropdown.Root
        {...props}
        modal={false}
        open={menus.active === id}
        onOpenChange={(open) => {
          menus.change(id, open);
          onOpenChange?.(open);
        }}
      />
    </SidebarMenuIdContext.Provider>
  );
}

export function SidebarMenuContent({
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof Dropdown.Content>) {
  const menus = useContext(SidebarMenuContext);
  const id = useContext(SidebarMenuIdContext);
  const { isMobile } = useSidebar();
  return (
    <Dropdown.Content
      {...props}
      data-mobile={isMobile ? "true" : undefined}
      side={isMobile && props.side !== "top" ? "bottom" : props.side}
      align={isMobile ? "end" : props.align}
      sideOffset={isMobile ? 6 : props.sideOffset}
      collisionPadding={isMobile ? 12 : props.collisionPadding}
      onCloseAutoFocus={(event) => {
        // Restoring focus to the old trigger would dismiss the newly opened menu.
        const active = menus?.current();
        if (active && active !== id) event.preventDefault();
        onCloseAutoFocus?.(event);
      }}
    />
  );
}
