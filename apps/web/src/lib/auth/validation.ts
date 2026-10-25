import { z } from "zod";

export const AUTH_NAME_MIN_LENGTH = 2;
export const AUTH_NAME_MAX_LENGTH = 80;
export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export const signInInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(AUTH_PASSWORD_MAX_LENGTH),
});

export const registrationProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(AUTH_NAME_MIN_LENGTH)
    .max(AUTH_NAME_MAX_LENGTH),
  email: z.string().trim().email().max(254),
});

export const signUpInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(AUTH_NAME_MIN_LENGTH)
      .max(AUTH_NAME_MAX_LENGTH),
    email: z.string().trim().email().max(254),
    password: z
      .string()
      .min(AUTH_PASSWORD_MIN_LENGTH)
      .max(AUTH_PASSWORD_MAX_LENGTH),
    confirmPassword: z.string().min(1),
  })
  .refine(({ confirmPassword, password }) => confirmPassword === password, {
    path: ["confirmPassword"],
  });

export type SignInInput = z.infer<typeof signInInputSchema>;
export type SignUpInput = z.infer<typeof signUpInputSchema>;
