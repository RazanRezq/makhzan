// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import { CompanyForm } from "./company-form";
import { CompanySelector } from "./company-selector";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  select: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../actions", () => ({
  createCompanyAction: mocks.create,
  selectCompanyAction: mocks.select,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("company onboarding UI", () => {
  it("reuses the same operation after an ambiguous error and redirects only on success", async () => {
    mocks.create
      .mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" })
      .mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CompanyForm />
      </NextIntlClientProvider>,
    );
    await user.type(screen.getByLabelText("Company name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Create company" }));
    expect(
      await screen.findByText(messages.Tenancy.errors.UNAVAILABLE),
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create company" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.create.mock.calls[0]![0].operationId).toBe(
      mocks.create.mock.calls[1]![0].operationId,
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the selected-company version and shows stale-context recovery", async () => {
    mocks.select.mockResolvedValue({ ok: false, code: "STALE_CONTEXT" });
    const user = userEvent.setup();
    const company = {
      tenantId: "35483ed3-f1ba-4502-bf62-07d7902ed46a",
      name: "Company B",
      role: "VIEWER" as const,
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CompanySelector
          companies={[company]}
          contextVersion={4}
          activeTenantId={null}
        />
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Company B, Viewer" }));
    expect(mocks.select).toHaveBeenCalledWith({
      tenantId: company.tenantId,
      expectedVersion: 4,
    });
    expect(
      await screen.findByText(messages.Tenancy.errors.STALE_CONTEXT),
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Refresh and try again" }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
