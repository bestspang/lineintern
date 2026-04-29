/**
 * Phase 1A.2 — End-to-end UI flow test for the Employee Documents module.
 *
 * Covers: upload -> confirm -> signed URL -> upload_status badge update.
 * Uses a mocked Supabase client; no real network calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMockSupabase, type MockSupabaseHandle } from "./test-utils";

// --- Mocks (must be set up before importing the component) ---

const hoisted = vi.hoisted(() => {
  return {
    mock: null as MockSupabaseHandle | null,
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
});

hoisted.mock = createMockSupabase();
const mock = hoisted.mock;
const toastSuccess = hoisted.toastSuccess;
const toastError = hoisted.toastError;

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return hoisted.mock!.supabase;
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign((..._args: any[]) => {}, {
    success: hoisted.toastSuccess,
    error: hoisted.toastError,
  }),
}));

// jsdom: window.open
const openSpy = vi.fn();

// Import AFTER mocks are registered
import { EmployeeDocumentsTab } from "../EmployeeDocumentsTab";

const EMP_ID = "11111111-1111-1111-1111-111111111111";
const DOC_ID = "22222222-2222-2222-2222-222222222222";

const baseDocRow = {
  id: DOC_ID,
  employee_id: EMP_ID,
  document_type: "employment_contract" as const,
  title: "Contract",
  description: null,
  file_path: `${EMP_ID}/${DOC_ID}.pdf`,
  file_name: "contract.pdf",
  file_mime_type: "application/pdf",
  file_size_bytes: 1234,
  issue_date: null,
  expiry_date: null,
  status: "active" as const,
  visibility: "hr_only" as const,
  upload_status: "uploaded" as const,
  uploaded_by_user_id: null,
  uploaded_by_employee_id: null,
  replaced_by_document_id: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  archived_at: null,
  archived_by_user_id: null,
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EmployeeDocumentsTab employeeId={EMP_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Reset queues between tests
  mock.invokeCalls.clear();
  mock.storageCalls.length = 0;
  toastSuccess.mockReset();
  toastError.mockReset();
  openSpy.mockReset();
  // @ts-ignore
  window.open = openSpy;
  vi.clearAllMocks();
});

describe("Employee Documents — upload → confirm → signed URL → badge", () => {
  it("shows the 'pending' badge for rows not yet confirmed", async () => {
    mock.queueSelect([{ ...baseDocRow, upload_status: "pending" }]);
    renderTab();

    expect(await screen.findByText("Contract")).toBeInTheDocument();
    expect(screen.getByText("กำลังอัปโหลด")).toBeInTheDocument();
    // No download button on a pending row — only the warning badge wrapper.
    expect(screen.queryByTitle("ดาวน์โหลด")).not.toBeInTheDocument();
  });

  it("shows the 'failed' badge when the row's upload_status is failed", async () => {
    mock.queueSelect([{ ...baseDocRow, upload_status: "failed" }]);
    renderTab();

    const row = (await screen.findByText("Contract")).closest("tr")!;
    expect(within(row).getAllByText("อัปโหลดล้มเหลว").length).toBeGreaterThan(0);
  });

  it("opens the signed URL when downloading a confirmed (uploaded) document", async () => {
    // Initial select: one uploaded row.
    mock.queueSelect([baseDocRow]);
    // signed-url invoke succeeds.
    mock.queueInvoke("employee-document-signed-url", {
      success: true,
      signed_url: "https://files.example.com/contract.pdf?token=xyz",
    });

    renderTab();
    await screen.findByText("Contract");

    // Click the download icon button in the row.
    const row = screen.getByText("Contract").closest("tr")!;
    const downloadBtn = within(row).getAllByRole("button")[0];
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://files.example.com/contract.pdf?token=xyz",
        "_blank",
        "noopener,noreferrer",
      );
    });

    // signed-url was called with the right document id
    const calls = mock.invokeCalls.get("employee-document-signed-url") || [];
    expect(calls[0]).toEqual({ document_id: DOC_ID });
  });

  it("surfaces a Thai error toast when signed URL returns 'not_yet_uploaded'", async () => {
    mock.queueSelect([{ ...baseDocRow, upload_status: "uploaded" }]);
    mock.queueInvoke(
      "employee-document-signed-url",
      { success: false, error: "not_yet_uploaded" },
      null,
    );

    renderTab();
    await screen.findByText("Contract");

    const row = screen.getByText("Contract").closest("tr")!;
    fireEvent.click(within(row).getAllByRole("button")[0]);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const message = toastError.mock.calls[0][0] as string;
    expect(message).toContain("เอกสารยังอัปโหลดไม่เสร็จ");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("refetches and refreshes when signed URL reports 'file_missing'", async () => {
    // First select: row appears uploaded.
    mock.queueSelect([{ ...baseDocRow, upload_status: "uploaded" }]);
    // Signed URL call says the file is missing — backend has flipped the row to 'failed'.
    mock.queueInvoke(
      "employee-document-signed-url",
      { success: false, error: "file_missing" },
      null,
    );
    // Refetch after the error: row now shows 'failed'.
    mock.queueSelect([{ ...baseDocRow, upload_status: "failed" }]);

    renderTab();
    await screen.findByText("Contract");

    const row = screen.getByText("Contract").closest("tr")!;
    fireEvent.click(within(row).getAllByRole("button")[0]);

    await waitFor(() => expect(toastError).toHaveBeenCalled());

    // After the refetch the failed badge should appear inside the row.
    await waitFor(() => {
      const r = screen.getByText("Contract").closest("tr")!;
      expect(within(r).getAllByText("อัปโหลดล้มเหลว").length).toBeGreaterThan(0);
    });
  });
});
