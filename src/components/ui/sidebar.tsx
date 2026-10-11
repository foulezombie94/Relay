"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PanelLeft, X } from "lucide-react";
const COOKIE = "relay_sidebar_open";
type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  toggleSidebar: () => void;
};
const SidebarContext = React.createContext<SidebarContextValue | null>(null);
export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar requires SidebarProvider");
  return context;
}
export function SidebarProvider({
  interactive = true,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  style,
  className = "",
  ...props
}: React.ComponentProps<"div"> & {
  interactive?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setOpenMobile(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const setOpen = React.useCallback(
    (value: boolean | ((previous: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(open) : value;
      if (onOpenChange) onOpenChange(next);
      else setInternalOpen(next);
      document.cookie =
        COOKIE +
        "=" +
        String(next) +
        "; path=/; max-age=2592000; SameSite=Lax" +
        (window.location.protocol === "https:" ? "; Secure" : "");
    },
    [open, onOpenChange],
  );
  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen((v) => !v);
  }, [isMobile, setOpen]);
  React.useEffect(() => {
    if (!interactive) return;
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key.toLowerCase() === "b" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [toggleSidebar, interactive]);
  return (
    <SidebarContext.Provider
      value={{
        state: open ? "expanded" : "collapsed",
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      <Tooltip.Provider delayDuration={120}>
        <div
          data-slot="sidebar-wrapper"
          data-state={open ? "expanded" : "collapsed"}
          className={"sb-layout " + className}
          style={
            {
              "--sidebar-width": "15.5rem",
              "--sidebar-width-mobile": "18rem",
              "--sidebar-width-icon": "4rem",
              ...style,
            } as React.CSSProperties
          }
          {...props}
        >
          {children}
        </div>
      </Tooltip.Provider>
    </SidebarContext.Provider>
  );
}
export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className = "",
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
  const content = (
    <div data-sidebar="sidebar" className={"sb-panel " + className} dir={dir} {...props}>
      {children}
    </div>
  );
  if (isMobile && collapsible !== "none")
    return (
      <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}>
        <Dialog.Portal>
          <Dialog.Overlay className="sb-overlay" />
          <Dialog.Content
            data-slot="sidebar"
            data-mobile="true"
            data-side={side}
            dir={dir}
            className="sb-mobile-sheet"
          >
            <Dialog.Title className="sr-only">Navigation principale</Dialog.Title>
            <Dialog.Description className="sr-only">
              Menu du CRM et changement d’espace de travail.
            </Dialog.Description>
            {content}
            <Dialog.Close className="sb-mobile-close" aria-label="Fermer le menu">
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  return (
    <div
      data-slot="sidebar"
      data-side={side}
      data-state={collapsible === "none" ? "expanded" : state}
      data-variant={variant}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      dir={dir}
      className="sb-desktop"
    >
      <div className="sb-spacer" />
      <div className="sb-container">{content}</div>
    </div>
  );
}
export function SidebarInset({ className = "", ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-inset" className={"sb-inset " + className} {...props} />;
}
export function SidebarTrigger({
  className = "",
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar, isMobile, open, openMobile } = useSidebar();
  return (
    <button
      type="button"
      data-slot="sidebar-trigger"
      aria-label={
        isMobile
          ? openMobile
            ? "Fermer le menu"
            : "Ouvrir le menu"
          : open
            ? "Réduire le menu"
            : "Développer le menu"
      }
      aria-expanded={isMobile ? openMobile : open}
      title="Afficher / réduire le menu (Ctrl+B)"
      className={"sb-trigger " + className}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft size={18} />
    </button>
  );
}
export function SidebarRail({ className = "", ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar, open } = useSidebar();
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={open ? "Réduire le menu" : "Développer le menu"}
      title="Afficher / réduire le menu"
      data-slot="sidebar-rail"
      className={"sb-rail " + className}
      onClick={toggleSidebar}
      {...props}
    />
  );
}
export function SidebarHeader({ className = "", ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={"sb-header " + className} {...props} />;
}
export function SidebarFooter({ className = "", ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={"sb-footer " + className} {...props} />;
}
export function SidebarContent({ className = "", ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={"sb-content " + className} {...props} />;
}
export function SidebarGroup({ className = "", ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={"sb-group " + className} {...props} />;
}
export function SidebarGroupLabel({ className = "", ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-group-label" className={"sb-group-label " + className} {...props} />
  );
}
export function SidebarGroupContent(props: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group-content" {...props} />;
}
export function SidebarGroupAction({ className = "", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="sidebar-group-action"
      className={"sb-group-action " + className}
      {...props}
    />
  );
}
export function SidebarMenu({ className = "", ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={"sb-menu " + className} {...props} />;
}
export function SidebarMenuItem({ className = "", ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={"sb-menu-item " + className} {...props} />;
}
export function SidebarMenuButton({
  render,
  isActive = false,
  tooltip,
  className = "",
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> & {
  render?: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  isActive?: boolean;
  tooltip?: string;
}) {
  const { state, isMobile } = useSidebar();
  const shared = {
    "data-slot": "sidebar-menu-button",
    "data-active": isActive,
    "aria-current": isActive ? ("page" as const) : undefined,
    "aria-label": tooltip,
    className: "sb-menu-button " + className,
  };
  const node = render ? (
    React.cloneElement(render, {
      ...shared,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        render.props.onClick?.(event);
        onClick?.(event as React.MouseEvent<HTMLButtonElement>);
      },
      children,
    })
  ) : (
    <button type="button" {...shared} onClick={onClick} {...props}>
      {children}
    </button>
  );
  if (!tooltip || state !== "collapsed" || isMobile) return node;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className="sb-tooltip">
          {tooltip}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function SidebarMenuAction({ className = "", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="sidebar-menu-action"
      className={"sb-menu-action " + className}
      {...props}
    />
  );
}
export function SidebarMenuBadge({ className = "", ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="sidebar-menu-badge" className={"sb-menu-badge " + className} {...props} />
  );
}
export function SidebarSeparator(props: React.ComponentProps<"hr">) {
  return <hr className="sb-separator" {...props} />;
}
export function SidebarMenuSub({ className = "", ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu-sub" className={"sb-menu-sub " + className} {...props} />;
}
export function SidebarMenuSubItem(props: React.ComponentProps<"li">) {
  return <li {...props} />;
}
export function SidebarMenuSubButton({ className = "", ...props }: React.ComponentProps<"a">) {
  return <a className={"sb-menu-sub-button " + className} {...props} />;
}
export function SidebarMenuSkeleton() {
  return (
    <div className="sb-skeleton" aria-hidden="true">
      <i />
      <span />
    </div>
  );
}
