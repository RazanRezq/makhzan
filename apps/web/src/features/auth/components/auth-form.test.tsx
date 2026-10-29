// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import englishMessages from "../../../../messages/en.json";
import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  entry: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    signIn: { email: mocks.signInEmail },
    signUp: { email: mocks.signUpEmail },
  },
}));
vi.mock("@/features/tenancy/actions", () => ({
  resolveCompanyEntryAction: mocks.entry,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm(mode: "sign-in" | "sign-up") {
  return render(
    <NextIntlClientProvider locale="en" messages={englishMessages}>
      <AuthForm mode={mode} />
    </NextIntlClientProvider>,
  );
}

describe("AuthForm", () => {
  it("validates sign-up fields on the client before calling Better Auth", async () => {
    const user = userEvent.setup();
    renderForm("sign-up");

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("The passwords must match.")).toBeTruthy();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("disables submission while signing in and redirects after success", async () => {
    mocks.entry.mockResolvedValue({ ok: true, destination: "/" });
    let completeSignIn: ((value: { data: object; error: null }) => void) | undefined;
    mocks.signInEmail.mockReturnValue(
      new Promise((resolve) => {
        completeSignIn = resolve;
      }),
    );
    const user = userEvent.setup();
    renderForm("sign-in");

    await user.type(screen.getByLabelText("Email address"), "owner@example.test");
    await user.type(screen.getByLabelText("Password"), "Correct-Horse-42!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Please wait…" })).toHaveProperty(
      "disabled",
      true,
    );
    completeSignIn?.({ data: {}, error: null });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each(["/onboarding", "/select-company"])("navigates directly to %s after login resolution", async (destination) => {
    mocks.signInEmail.mockResolvedValue({ data: {}, error: null });
    mocks.entry.mockResolvedValue({ ok: true, destination });
    const user = userEvent.setup();
    renderForm("sign-in");
    await user.type(screen.getByLabelText("Email address"), "owner@example.test");
    await user.type(screen.getByLabelText("Password"), "Correct-Horse-42!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(destination));
    expect(mocks.replace).toHaveBeenCalledOnce();
  });
});
