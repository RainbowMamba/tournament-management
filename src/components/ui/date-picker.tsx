"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  value?: string // YYYY-MM-DD format
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Parse the string value to Date
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    const parsed = parse(value, "yyyy-MM-dd", new Date())
    return isValid(parsed) ? parsed : undefined
  }, [value])

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, "yyyy-MM-dd"))
    } else {
      onChange("")
    }
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal group relative",
            "h-10 px-3 py-2",
            "border-input bg-background",
            "hover:bg-accent/50 hover:border-primary/50",
            "transition-all duration-200",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
          <span className="flex-1 truncate">
            {selectedDate ? (
              <span className="font-medium">
                {format(selectedDate, "EEEE, MMMM d, yyyy")}
              </span>
            ) : (
              placeholder
            )}
          </span>
          {selectedDate && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => e.key === "Enter" && handleClear(e as unknown as React.MouseEvent)}
              className="ml-2 h-5 w-5 shrink-0 rounded-full bg-muted/80 hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <p className="text-sm font-medium text-foreground">Select Date</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose a start date for your tournament
          </p>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          initialFocus
          disabled={(date) => {
            // Disable dates before today
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            return date < today
          }}
        />
        <div className="p-3 border-t bg-muted/30 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handleSelect(new Date())
            }}
            className="text-xs"
          >
            Today
          </Button>
          {selectedDate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSelect(undefined)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

