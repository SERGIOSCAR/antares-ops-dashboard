import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ShiftLineSchema = z.object({
  hold: z.number().int().positive(),
  grade: z.string().trim().min(1),
  thisShiftMT: z.number().finite(),
  accumulatedMT: z.number().finite().optional(),
  remainingMT: z.number().finite().optional(),
  condition: z.string().trim().optional().default(""),
});

export const DelaySchema = z.object({
  from: z.string().trim().regex(/^\d{2}:\d{2}$/),
  to: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  reason: z.string().optional().default(""),
});

export const ShiftSubmitSchema = z.object({
  vesselId: z.string().uuid(),
  shiftStart: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  shiftEnd: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  shiftType: z.string().trim().optional(),
  notes: z.string().optional().default(""),
  lines: z.array(ShiftLineSchema).optional().default([]),
  cargoData: z.record(z.string(), z.record(z.string(), z.number().finite())).optional().default({}),
  delays: z.array(DelaySchema).optional().default([]),
  recipients: z
    .union([z.array(z.string().email()), z.string()])
    .optional()
    .transform((value) => {
      if (!value) return [] as string[];
      if (Array.isArray(value)) return value;
      return value
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
    }),
  isRevised: z.boolean().optional().default(false),
});

export const VesselCreateSchema = z.object({
  name: z.string().trim().min(1),
  port: z.string().trim().min(1),
  terminal: z.string().trim().min(1),
  operationType: z.enum(["LOAD", "DISCHARGE"]),
  cargoGrades: z.array(z.string().trim().min(1)).default([]),
  holds: z.number().int().positive().max(30),
  shiftType: z.string().trim().min(1).optional().default("00-06/06-12/12-18/18-24"),
  recipients: z.array(z.string().email()).default([]),
  headUsername: z.string().trim().min(1),
  stow: z
    .array(
      z.object({
        hold: z.number().int().positive(),
        grade: z.string().trim().min(1),
        totalMT: z.number().finite().nonnegative(),
        condition: z.string().trim().optional().default(""),
      })
    )
    .default([]),
});