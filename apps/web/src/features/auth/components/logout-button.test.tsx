// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import englishMessages from "../../../../messages/en.json";
import { LogoutButton } from "./logout-button";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderLogout() {
  return render(
    <NextIntlClientProvider locale="en" messages={englishMessages}>
      <LogoutButton />
    </NextIntlClientProvider>,
  );
}

describe("LogoutButton", () => {
  it("waits for confirmed revocation before navigating away", async () => {
    let resolve: ((value: { error: null }) => void) | undefined;
    mocks.signOut.mockReturnValue(new Promise((done) => { resolve = done; }));
    renderLogout();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("button", { name: "Signing out…" })).toHaveProperty("disabled", true);
    expect(mocks.replace).not.toHaveBeenCalled();
    resolve?.({ error: null });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows a retryable error instead of redirecting when revocation fails", async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { status: 500 } });
    mocks.signOut.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    renderLogout();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent", englishMessages.Auth.errors.signOut,
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("handles network failure without exposing the underlying error", async () => {
    mocks.signOut.mockRejectedValue(new Error("sensitive transport details"));
    renderLogout();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent", englishMessages.Auth.errors.signOut,
    );
    expect(screen.queryByText("sensitive transport details")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveProperty("disabled", false);
  });
});
