import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "@/lib/scanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Camera, AlertTriangle } from "lucide-react";

const REGION_ID = "ls-camera-region";

export const CameraScanner = ({ open, onClose, onDetected }) => {
  const scannerRef = useRef(null);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState(null);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setError(null);

    const stop = async () => {
      runningRef.current = false;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { await s.stop(); } catch {}
        try { await s.clear(); } catch {}
      }
    };

    const start = async () => {
      try {
        // Wait for the portal DOM element to be ready
        await new Promise((resolve, reject) => {
          let attempts = 0;
          const check = () => {
            if (cancelledRef.current) return reject(new Error("Cancelled"));
            if (document.getElementById(REGION_ID)) return resolve();
            if (++attempts > 60) return reject(new Error("Camera region not found"));
            requestAnimationFrame(check);
          };
          check();
        });
        if (cancelledRef.current) return;

        const html5 = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = html5;
        await html5.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 260, height: 160 }, aspectRatio: 1.6 },
          (decodedText) => {
            if (cancelledRef.current) return;
            onDetectedRef.current?.(decodedText);
          },
          () => {}
        );
        runningRef.current = true;
      } catch (e) {
        if (!cancelledRef.current) {
          console.error("Camera start failed", e);
          setError(e?.message || "Could not start camera. Check permissions.");
        }
      }
    };

    start();

    return () => {
      cancelledRef.current = true;
      stop();
    };
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
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <p className="text-sm text-slate-700 text-center">{error}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onClose?.()}
                data-testid="scan-camera-close-button"
              >
                <X className="h-4 w-4 mr-1" /> Close
              </Button>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CameraScanner;
