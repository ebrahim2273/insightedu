// Centralized zod validation schemas for user-submitted forms.
// Used to enforce length limits, formats, and trim whitespace before
// data hits the database or external APIs.
import { z } from "zod";

export const authSignupSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Name must be under 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be under 128 characters"),
});

export const authLoginSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export const classSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  schedule: z.string().trim().max(200).optional().or(z.literal("")),
  teacher: z.string().trim().max(100).optional().or(z.literal("")),
  room: z.string().trim().max(50).optional().or(z.literal("")),
});

export const studentSchema = z.object({
  name: z.string().trim().min(1, "Student name is required").max(100),
  studentId: z.string().trim().max(50).optional().or(z.literal("")),
  classId: z.string().uuid("Invalid class").optional().or(z.literal("")),
});

export const csvStudentRowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  student_id: z.string().trim().max(50).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

export type ClassFormValues = z.infer<typeof classSchema>;
export type StudentFormValues = z.infer<typeof studentSchema>;
