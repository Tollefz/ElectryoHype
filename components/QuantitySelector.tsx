"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function QuantitySelector({ value, onChange, min = 1, max = 99 }: QuantitySelectorProps) {
  const decrease = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const increase = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-full border px-4 py-2">
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 p-0"
        onClick={decrease}
        aria-label="Mindre"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-6 text-center text-lg font-semibold">{value}</span>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 p-0"
        onClick={increase}
        aria-label="Mer"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

