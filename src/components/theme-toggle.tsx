import { Sun, Moon, Laptop, Check } from "lucide-react";
import { useTheme, type Theme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-2.5 gap-1.5 border-border bg-card/80 text-foreground hover:bg-accent/80 hover:text-foreground cursor-pointer transition-colors ${
            className ?? ""
          }`}
          aria-label="Toggle theme mode"
          title={`Theme: ${theme} (${resolvedTheme})`}
        >
          {resolvedTheme === "dark" ? (
            <Moon className="h-4 w-4 text-amber-400 transition-transform duration-200" />
          ) : (
            <Sun className="h-4 w-4 text-amber-600 transition-transform duration-200" />
          )}
          <span className="text-xs font-medium capitalize hidden sm:inline-block">
            {theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
          </span>
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36 z-50">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between cursor-pointer text-xs py-2"
        >
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber-600" />
            <span>Light</span>
          </div>
          {theme === "light" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between cursor-pointer text-xs py-2"
        >
          <div className="flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-amber-400" />
            <span>Dark</span>
          </div>
          {theme === "dark" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between cursor-pointer text-xs py-2"
        >
          <div className="flex items-center gap-2">
            <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
            <span>System</span>
          </div>
          {theme === "system" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
