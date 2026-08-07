import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export const Barcode = ({ value, height = 48, width = 1.6, fontSize = 12, displayValue = true }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          height,
          width,
          fontSize,
          displayValue,
          margin: 4,
          background: "#ffffff",
          lineColor: "#0b1220",
        });
      } catch (e) {
        // invalid value; ignore
      }
    }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} />;
};

export default Barcode;
