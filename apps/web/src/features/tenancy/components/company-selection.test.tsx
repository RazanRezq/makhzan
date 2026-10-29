// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { DirectionProvider } from "@/components/ui/direction";
import messages from "../../../../messages/en.json";
import arabicMessages from "../../../../messages/ar.json";
import { AutoCompanySelection } from "./auto-company-selection";
import { CompanySwitcher } from "./company-switcher";

const mocks = vi.hoisted(() => ({
  enter: vi.fn(), select: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("../actions", () => ({
  resolveCompanyEntryAction: mocks.enter,
  selectCompanyAction: mocks.select,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => mocks.router }));

const companies = [
  { tenantId: "35483ed3-f1ba-4502-bf62-07d7902ed46a", name: "Company A", role: "OWNER" as const },
  { tenantId: "1fbf02f7-39cc-47a2-b7fe-370dd338537d", name: "Company B", role: "VIEWER" as const },
];
const props = {
  companies, activeTenantId: companies[0].tenantId,
  companyName: "Company A", role: "OWNER" as const, contextVersion: 3,
};

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("automatic company entry", () => {
  it("opens via one POST action under Strict Mode without showing a selection list", async () => {
    mocks.enter.mockResolvedValue({ ok: true, destination: "/" });
    render(<StrictMode><NextIntlClientProvider locale="en" messages={messages}>
      <AutoCompanySelection />
    </NextIntlClientProvider></StrictMode>);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/"));
    expect(mocks.enter).toHaveBeenCalledOnce();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose a company" })).toBeNull();
  });

  it("stops on failure and permits only explicit retry", async () => {
    mocks.enter.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE" })
      .mockResolvedValueOnce({ ok: true, destination: "/select-company" });
    const user = userEvent.setup();
    render(<NextIntlClientProvider locale="en" messages={messages}><AutoCompanySelection /></NextIntlClientProvider>);
    expect(await screen.findByText(messages.Tenancy.errors.UNAVAILABLE)).toBeTruthy();
    expect(mocks.enter).toHaveBeenCalledOnce();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/select-company"));
    expect(mocks.enter).toHaveBeenCalledTimes(2);
  });

  it("returns expired sessions to sign-in", async () => {
    mocks.enter.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED" });
    render(<NextIntlClientProvider locale="ar" messages={arabicMessages}><AutoCompanySelection /></NextIntlClientProvider>);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/sign-in"));
  });
});

describe("responsive accessible company switcher", () => {
  it("shows name and role without an unnecessary single-company action", () => {
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <CompanySwitcher {...props} companies={[companies[0]]} />
    </NextIntlClientProvider>);
    expect(screen.getByText("Company A")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each(["en", "ar"] as const)("supports keyboard open/escape, focus return and switching in %s", async (locale) => {
    mocks.select.mockResolvedValue({ ok: true });
    const translation = locale === "ar" ? arabicMessages : messages;
    const user = userEvent.setup();
    render(<NextIntlClientProvider locale={locale} messages={translation}>
      <DirectionProvider dir={locale === "ar" ? "rtl" : "ltr"}>
        <CompanySwitcher {...props} />
      </DirectionProvider>
    </NextIntlClientProvider>);
    const trigger = screen.getByRole("button", { name: locale === "ar" ? "تبديل الشركة: Company A، المالك" : "Switch company: Company A, Owner" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: translation.Tenancy.selectionTitle })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}");
    const current = await screen.findByRole("button", { name: locale === "ar" ? "Company A، المالك" : "Company A, Owner" });
    expect(current.getAttribute("aria-current")).toBe("true");
    await user.click(current);
    expect(mocks.select).not.toHaveBeenCalled();
    await user.click(trigger);
    const target = await screen.findByRole("button", { name: locale === "ar" ? "Company B، المشاهد" : "Company B, Viewer" });
    target.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith({
      tenantId: companies[1].tenantId, expectedVersion: 3,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });
});
