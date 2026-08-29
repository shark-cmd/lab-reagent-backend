import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CameraScanner from "./CameraScanner";

// --- Mocks ---

const mockStart = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn().mockResolvedValue(undefined);
const mockClear = jest.fn().mockResolvedValue(undefined);
let mockDetected = null;

jest.mock("@/lib/scanner", () => ({
  Html5Qrcode: jest.fn().mockImplementation(() => ({
    start: (...args) => {
      mockDetected = args[2];
      return mockStart();
    },
    stop: mockStop,
    clear: mockClear,
  })),
}));

jest.mock("@/components/ui/dialog", () => {
  const Dialog = ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null);
  const DialogContent = ({ children, ...props }) => <div data-testid="dialog-content" {...props}>{children}</div>;
  const DialogHeader = ({ children }) => <div>{children}</div>;
  const DialogTitle = ({ children }) => <div>{children}</div>;
  return { Dialog, DialogContent, DialogHeader, DialogTitle };
});

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

beforeEach(() => {
  const { Html5Qrcode } = require("@/lib/scanner");
  Html5Qrcode.mockClear();
  mockDetected = null;
  mockStart.mockClear().mockResolvedValue(undefined);
  mockStop.mockClear().mockResolvedValue(undefined);
  mockClear.mockClear().mockResolvedValue(undefined);
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
});

describe("CameraScanner", () => {
  it("renders nothing when closed", () => {
    render(<CameraScanner open={false} onClose={jest.fn()} onDetected={jest.fn()} />);
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("renders camera UI when open", async () => {
    await act(async () => {
      render(<CameraScanner open={true} onClose={jest.fn()} onDetected={jest.fn()} />);
    });
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Scan barcode with camera/)).toBeInTheDocument();
    expect(screen.getByText(/Point the camera at a barcode/)).toBeInTheDocument();
    expect(screen.getByTestId("scan-camera-close-button")).toBeInTheDocument();
  });

  it("initializes Html5Qrcode and starts camera", async () => {
    const { Html5Qrcode } = require("@/lib/scanner");
    await act(async () => {
      render(<CameraScanner open={true} onClose={jest.fn()} onDetected={jest.fn()} />);
    });
    expect(Html5Qrcode).toHaveBeenCalledWith("ls-camera-region", { verbose: false });
    expect(mockStart).toHaveBeenCalled();
  });

  it("calls onDetected with decoded text on barcode scan", async () => {
    const onDetected = jest.fn();
    await act(async () => {
      render(<CameraScanner open={true} onClose={jest.fn()} onDetected={onDetected} />);
    });

    act(() => {
      mockDetected("TEST-BARCODE-123");
    });

    expect(onDetected).toHaveBeenCalledWith("TEST-BARCODE-123");
  });

  it("shows error when camera fails to start", async () => {
    mockStart.mockRejectedValueOnce(new Error("NotAllowedError: camera denied"));
    await act(async () => {
      render(<CameraScanner open={true} onClose={jest.fn()} onDetected={jest.fn()} />);
    });
    await waitFor(() => {
      expect(screen.getByText(/camera denied/)).toBeInTheDocument();
    });
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = jest.fn();
    await act(async () => {
      render(<CameraScanner open={true} onClose={onClose} onDetected={jest.fn()} />);
    });
    await userEvent.click(screen.getByTestId("scan-camera-close-button"));
    expect(onClose).toHaveBeenCalled();
  });

  it("stops scanner on unmount", async () => {
    const { unmount } = await act(async () =>
      render(<CameraScanner open={true} onClose={jest.fn()} onDetected={jest.fn()} />)
    );
    await act(async () => unmount());
    expect(mockStop).toHaveBeenCalled();
  });

  it("ignores detection after unmount", async () => {
    const onDetected = jest.fn();
    const { unmount } = await act(async () =>
      render(<CameraScanner open={true} onClose={jest.fn()} onDetected={onDetected} />)
    );
    await act(async () => unmount());
    if (mockDetected) act(() => mockDetected("STALE-BARCODE"));
    expect(onDetected).not.toHaveBeenCalled();
  });

  it("clears error on reopen", async () => {
    mockStart.mockRejectedValueOnce(new Error("Camera error"));
    const { rerender } = render(
      <CameraScanner open={true} onClose={jest.fn()} onDetected={jest.fn()} />
    );
    await waitFor(() => expect(screen.getByText(/Camera error/)).toBeInTheDocument());

    mockStart.mockResolvedValue(undefined);
    await act(async () => {
      rerender(<CameraScanner open={false} onClose={jest.fn()} onDetected={jest.fn()} />);
    });
    await act(async () => {
      rerender(<CameraScanner open={true} onClose={jest.fn()} onDetected={jest.fn()} />);
    });
    await waitFor(() => expect(screen.queryByText(/Camera error/)).not.toBeInTheDocument());
  });
});
