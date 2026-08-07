import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Camera } from "lucide-react";

const REGION_ID = "ls-camera-region";

export const CameraScanner = ({ open, onClose, onDetected }) => {
  const scannerRef = useRef(null);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!open) return;
      try {
        const html5 = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = html5;
        await html5.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 260, height: 160 }, aspectRatio: 1.6 },
          (decodedText) => {
            if (cancelled) return;
            onDetected?.(decodedText);
            stop();
          },
          () => {}
        );
        runningRef.current = true;
      } catch (e) {
        console.error("Camera start failed", e);
      }
    };
    const stop = async () => {
      try {
        if (scannerRef.current && runningRef.current) {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        }
      } catch (e) {
        /* noop */
      }
      runningRef.current = false;
      scannerRef.current = null;
    };
    if (open) start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-md p-0 overflow-hidden" data-testid="camera-scanner-dialog">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-[color:var(--ls-primary)]" /> Scan barcode with camera
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-4">
          <div className="relative rounded-xl overflow-hidden bg-black">
            <div id={REGION_ID} className="w-full min-h-[240px]" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[260px] h-[160px] border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Point the camera at a barcode / QR code. Allow camera permission if prompted.
          </p>
          <Button
            variant="outline"
            className="w-full mt-3"
            onClick={() => onClose?.()}
            data-testid="scan-camera-close-button"
          >
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CameraScanner;
