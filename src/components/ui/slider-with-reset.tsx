"use client";

import React from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface SliderWithResetProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onReset: () => void;
  format: (value: number) => string;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
  showValue?: boolean;
  className?: string;
}

export function SliderWithReset({
  id,
  label,
  value,
  min,
  max,
  step,
  onReset,
  format,
  onChange,
  onCommit,
  showValue = true,
  className = "",
}: SliderWithResetProps) {
  // Local state to track the value during interaction
  const [localValue, setLocalValue] = React.useState(value);
  const [isDragging, setIsDragging] = React.useState(false);

  // Update local value when the prop changes and we're not dragging
  React.useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReset();
  };

  return (
    <div className={cn("group/slider", className)}>
      {!showValue ? (
        <Label className="text-muted-foreground block text-sm font-medium" htmlFor={id}>
          {label}
        </Label>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-sm font-medium" htmlFor={id}>
              {label}
            </Label>
            <motion.button
              type="button"
              onClick={handleReset}
              className="text-transparent group-hover/slider:text-muted-foreground hover:text-foreground transition-colors"
              title="Reset to default"
              whileTap={{ rotate: -60 }}
            >
              <RotateCcw className="h-3 w-3" />
            </motion.button>
          </div>
          <span className="text-muted-foreground text-xs">
            {format(localValue)}
          </span>
        </div>
      )}
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[localValue]}
        onValueChange={(values) => {
          const newValue = values[0];
          if (newValue !== undefined) {
            setLocalValue(newValue);
            // Call onChange if provided, but don't update the parent state
            if (onChange) {
              onChange(newValue);
            }
          }
        }}
        onPointerDown={() => setIsDragging(true)}
        onPointerUp={() => {
          setIsDragging(false);
          // When dragging ends, ensure local value is in sync with parent
          setLocalValue(value);
        }}
        onValueCommit={(values) => {
          const newValue = values[0];
          if (newValue !== undefined) {
            // Update local value to match committed value
            setLocalValue(newValue);
            setIsDragging(false);
            // Call onCommit if provided
            if (onCommit) {
              onCommit(newValue);
            } else if (onChange) {
              // Fall back to onChange if onCommit isn't provided
              onChange(newValue);
            }
          }
        }}
        className="mt-2"
      />
    </div>
  );
}
