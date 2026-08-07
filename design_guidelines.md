{
  "brand": {
    "product_name": "LabStock",
    "design_personality": [
      "clean clinical",
      "fast scan-first workflows",
      "data-dense but calm",
      "error-proof + compliant (audit-ready)",
      "high-contrast for bright lab lighting"
    ],
    "north_star": "Technicians can scan, confirm, and move on in <3 seconds with minimal cognitive load; supervisors can audit and act on alerts instantly."
  },

  "inspiration_refs": {
    "dashboard_layout_refs": [
      {
        "title": "Lab Inventory Management Dashboard (Behance)",
        "url": "https://www.behance.net/gallery/228800287/Visualisation-Dashboard-for-Lab-Inventory-Management",
        "takeaway": "Clinical KPI cards + dense tables; calm surfaces; clear alert grouping."
      },
      {
        "title": "MedStock medical inventory template (Aura)",
        "url": "https://www.aura.build/templates/medstock-medical-7",
        "takeaway": "Healthcare admin shell patterns; sidebar + topbar; card/table rhythm."
      }
    ],
    "scan_ui_refs": [
      {
        "title": "Material Design — Barcode scanning guidance",
        "url": "https://m2.material.io/design/machine-learning/barcode-scanning.html",
        "takeaway": "Viewfinder framing, overlays, immediate feedback, and error states for camera scanning."
      },
      {
        "title": "Scanbot Web Barcode Scanner — Ready-to-use UI",
        "url": "https://docs.scanbot.io/web/barcode-scanner-sdk/ready-to-use-ui/introduction/",
        "takeaway": "Practical web scanner UI controls (torch, camera switch) and post-scan confirmation patterns."
      }
    ],
    "data_dense_table_refs": [
      {
        "title": "Dense dashboard / data table patterns",
        "url": "https://dribbble.com/search/data-table-dense",
        "takeaway": "Compact rows, sticky headers, strong alignment, restrained color."
      }
    ]
  },

  "typography": {
    "google_fonts": {
      "heading": {
        "family": "Space Grotesk",
        "weights": ["500", "600", "700"],
        "why": "Technical/clinical feel with strong numerals; reads well in KPI cards and headers."
      },
      "body": {
        "family": "IBM Plex Sans",
        "weights": ["400", "500", "600"],
        "why": "Highly legible in dense tables; neutral, professional tone."
      },
      "mono": {
        "family": "IBM Plex Mono",
        "weights": ["400", "500"],
        "why": "Barcode/lot/location codes; improves scanability and reduces transcription errors."
      }
    },
    "tailwind_font_setup": {
      "instructions": "Add Google Fonts <link> in public/index.html (or via CSS @import) and set Tailwind fontFamily in tailwind.config.js. Use heading font for page titles + KPI numbers; body font for tables/forms; mono for codes.",
      "classes": {
        "heading": "font-[\"Space_Grotesk\"]",
        "body": "font-[\"IBM_Plex_Sans\"]",
        "mono": "font-[\"IBM_Plex_Mono\"]"
      }
    },
    "type_scale": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl",
      "h2": "text-base md:text-lg",
      "body": "text-sm md:text-base",
      "small": "text-xs"
    },
    "numeric_rules": [
      "Right-align numeric columns in tables (qty, min_stock, days_left).",
      "Use tabular numerals where possible (Tailwind: tabular-nums).",
      "Use mono font for barcode, lot, LOC: codes." 
    ]
  },

  "color_system": {
    "notes": [
      "Light theme only (clinical).",
      "Blue/teal core; avoid purple.",
      "Use color primarily for status + selection; keep tables mostly neutral.",
      "All status colors must also have text labels/icons (color is not the only signal)."
    ],
    "palette_hex": {
      "bg": "#F7FAFC",
      "surface": "#FFFFFF",
      "surface_2": "#F1F6FA",
      "text": "#0B1220",
      "text_muted": "#4B5563",
      "border": "#D7E2EC",

      "primary": "#0E7490",
      "primary_hover": "#155E75",
      "primary_soft": "#E6F6FA",

      "accent": "#2563EB",
      "accent_soft": "#EAF2FF",

      "success": "#1F7A4D",
      "success_soft": "#EAF7F0",

      "warning": "#B45309",
      "warning_soft": "#FFF4E6",

      "danger": "#B42318",
      "danger_soft": "#FFE9E7",

      "info": "#0B5CAD",
      "info_soft": "#E8F2FF"
    },
    "status_semantics": {
      "stock_ok": {
        "label": "OK",
        "bg": "success_soft",
        "fg": "success",
        "use_for": "qty >= min_stock and not expiring soon"
      },
      "low_stock": {
        "label": "Low",
        "bg": "warning_soft",
        "fg": "warning",
        "use_for": "qty < min_stock"
      },
      "expiring_90": {
        "label": "Expiring ≤90d",
        "bg": "info_soft",
        "fg": "info",
        "use_for": "expiry within 90 days"
      },
      "expiring_60": {
        "label": "Expiring ≤60d",
        "bg": "warning_soft",
        "fg": "warning",
        "use_for": "expiry within 60 days"
      },
      "expiring_30": {
        "label": "Expiring ≤30d",
        "bg": "danger_soft",
        "fg": "danger",
        "use_for": "expiry within 30 days"
      },
      "expired": {
        "label": "Expired",
        "bg": "#FFE1DE",
        "fg": "#7A1B14",
        "use_for": "expiry date passed"
      },
      "unknown_barcode": {
        "label": "Unregistered",
        "bg": "#EEF2F7",
        "fg": "#334155",
        "use_for": "barcode not found; triggers auto-register modal"
      }
    },
    "shadcn_tokens_hsl": {
      "instructions": "Update /app/frontend/src/index.css :root tokens to match this clinical palette. Keep dark mode tokens present but app defaults to light.",
      "tokens": {
        "--background": "210 33% 98%",
        "--foreground": "222 47% 9%",
        "--card": "0 0% 100%",
        "--card-foreground": "222 47% 9%",
        "--popover": "0 0% 100%",
        "--popover-foreground": "222 47% 9%",
        "--primary": "191 82% 31%",
        "--primary-foreground": "0 0% 100%",
        "--secondary": "210 33% 96%",
        "--secondary-foreground": "222 47% 12%",
        "--muted": "210 33% 96%",
        "--muted-foreground": "215 16% 40%",
        "--accent": "210 33% 96%",
        "--accent-foreground": "222 47% 12%",
        "--destructive": "4 74% 40%",
        "--destructive-foreground": "0 0% 100%",
        "--border": "210 22% 88%",
        "--input": "210 22% 88%",
        "--ring": "191 82% 31%",
        "--radius": "0.75rem"
      }
    },
    "allowed_gradients": {
      "rule": "Use gradients only as subtle section background accents (<=20% viewport).",
      "examples": [
        {
          "name": "hero-scan-accent",
          "css": "radial-gradient(900px circle at 20% 0%, rgba(14,116,144,0.10), transparent 55%), radial-gradient(700px circle at 90% 10%, rgba(37,99,235,0.08), transparent 50%)",
          "use": "Top of Scan page / Dashboard header band only"
        }
      ]
    }
  },

  "layout": {
    "grid": {
      "app_shell": "Desktop: 280px sidebar + fluid content; Tablet: collapsible sidebar (Sheet); Mobile: bottom quick actions + top bar.",
      "content_max_width": "max-w-[1400px] for dashboard tables; Scan page can be full-width.",
      "page_padding": "px-3 sm:px-6 lg:px-8 py-4"
    },
    "density": {
      "table_row_height": "Default dense: h-10 (40px). Ultra-dense optional: h-9 (36px) for supervisors.",
      "kpi_card_padding": "p-4 sm:p-5",
      "form_control_height": "h-11 for scan input + primary actions; h-10 for secondary inputs"
    },
    "navigation": {
      "pattern": "Sidebar + top utility bar (search, user, sync/backups indicator).",
      "mobile": "Use Sheet for nav; keep Scan as primary bottom action."
    }
  },

  "components": {
    "component_path": {
      "app_shell": [
        "/app/frontend/src/components/ui/sheet.jsx",
        "/app/frontend/src/components/ui/navigation-menu.jsx",
        "/app/frontend/src/components/ui/separator.jsx",
        "/app/frontend/src/components/ui/breadcrumb.jsx"
      ],
      "scan_mode": [
        "/app/frontend/src/components/ui/tabs.jsx",
        "/app/frontend/src/components/ui/toggle-group.jsx",
        "/app/frontend/src/components/ui/input.jsx",
        "/app/frontend/src/components/ui/button.jsx",
        "/app/frontend/src/components/ui/dialog.jsx",
        "/app/frontend/src/components/ui/drawer.jsx",
        "/app/frontend/src/components/ui/tooltip.jsx",
        "/app/frontend/src/components/ui/sonner.jsx"
      ],
      "dashboard": [
        "/app/frontend/src/components/ui/card.jsx",
        "/app/frontend/src/components/ui/badge.jsx",
        "/app/frontend/src/components/ui/table.jsx",
        "/app/frontend/src/components/ui/tabs.jsx",
        "/app/frontend/src/components/ui/select.jsx",
        "/app/frontend/src/components/ui/popover.jsx",
        "/app/frontend/src/components/ui/calendar.jsx",
        "/app/frontend/src/components/ui/progress.jsx",
        "/app/frontend/src/components/ui/skeleton.jsx"
      ],
      "audit_log": [
        "/app/frontend/src/components/ui/table.jsx",
        "/app/frontend/src/components/ui/scroll-area.jsx",
        "/app/frontend/src/components/ui/accordion.jsx"
      ],
      "auth": [
        "/app/frontend/src/components/ui/card.jsx",
        "/app/frontend/src/components/ui/input.jsx",
        "/app/frontend/src/components/ui/input-otp.jsx",
        "/app/frontend/src/components/ui/button.jsx",
        "/app/frontend/src/components/ui/label.jsx"
      ]
    },

    "scan_page_spec": {
      "primary_goal": "Always-ready scan input + 4 big mode actions; minimal friction.",
      "layout": [
        "Top band: page title + current mode + last scan result chip.",
        "Center: barcode input (auto-focused) + camera scan button.",
        "Below: 4 mode buttons (Use/Receive/Count/Move) as segmented control (ToggleGroup) with icons.",
        "Right/Bottom sheet: last 10 scans list (for quick undo / verify)."
      ],
      "mode_buttons": {
        "component": "ToggleGroup (type=single)",
        "tailwind": "grid grid-cols-2 sm:grid-cols-4 gap-2",
        "button_style": "h-12 sm:h-11 rounded-xl border bg-white hover:bg-[var(--primary-soft)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        "microcopy": "Short verbs only: Use, Receive, Count, Move",
        "data_testids": {
          "use": "scan-mode-use-toggle",
          "receive": "scan-mode-receive-toggle",
          "count": "scan-mode-count-toggle",
          "move": "scan-mode-move-toggle"
        }
      },
      "barcode_input": {
        "component": "Input",
        "behavior": [
          "Auto-focus on page load and after every successful submit.",
          "Enter key submits; scanner acts as keyboard.",
          "If input starts with 'LOC:' treat as location scan (Move/Count context).",
          "If unknown barcode: open auto-register modal immediately (Dialog on desktop, Drawer on mobile)."
        ],
        "tailwind": "h-12 text-base md:text-base rounded-xl bg-white border border-[color:var(--border)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        "data_testid": "scan-barcode-input"
      },
      "camera_scan": {
        "ui": "Button opens full-screen camera overlay on mobile; on desktop it can open a centered Dialog.",
        "controls": ["torch toggle", "switch camera", "close"],
        "overlay": "Use a translucent mask with a centered scan frame; show short instruction text.",
        "data_testids": {
          "open": "scan-camera-open-button",
          "close": "scan-camera-close-button",
          "torch": "scan-camera-torch-toggle",
          "switch": "scan-camera-switch-button"
        }
      },
      "unknown_barcode_modal": {
        "fields": [
          "Item name",
          "Unit (e.g., mL, tests)",
          "Default min_stock",
          "Default storage location (LOC:)",
          "Optional: vendor/catalog"
        ],
        "primary_action": "Register & Continue",
        "secondary_action": "Cancel",
        "data_testids": {
          "dialog": "unknown-barcode-dialog",
          "submit": "unknown-barcode-register-submit"
        }
      },
      "feedback": {
        "success": "Use Sonner toast: 'Recorded usage' / 'Added to receive queue' etc.",
        "error": "Inline error under input + toast; keep input focused.",
        "haptics": "On mobile, use navigator.vibrate(20) on success; vibrate(60) on error (guarded)."
      }
    },

    "dashboard_spec": {
      "kpis": [
        {
          "title": "Total inventory value",
          "visual": "Card with big number + small delta vs last week",
          "data_testid": "kpi-total-inventory-value"
        },
        {
          "title": "Low stock",
          "visual": "Card with count + badge 'Needs reorder'",
          "data_testid": "kpi-low-stock-count"
        },
        {
          "title": "Expiring",
          "visual": "Card with segmented mini badges 30/60/90",
          "data_testid": "kpi-expiring-count"
        }
      ],
      "tables": {
        "reorder_alerts": {
          "density": "dense",
          "columns": ["Item", "On hand", "Min", "Location", "Last used", "Action"],
          "row_actions": ["Create PO", "Mark ordered", "Snooze"],
          "data_testid": "reorder-alerts-table"
        },
        "expiring": {
          "buckets": ["≤30d", "≤60d", "≤90d"],
          "columns": ["Item", "Lot", "Expiry", "Days left", "Qty", "Location", "Action"],
          "data_testid": "expiring-soon-table"
        },
        "all_items": {
          "features": ["column filters", "sticky header", "inline edit for min_stock/location", "row virtualization if >500 rows"],
          "data_testid": "all-items-table"
        }
      }
    },

    "table_design_rules": {
      "header": "Sticky, subtle background (surface_2), uppercase tracking-wide text-xs.",
      "rows": "Use row hover highlight only (no zebra + border together). Prefer border-b lines.",
      "alignment": "Text left; numbers right; dates center or left consistently.",
      "badges": "Use Badge variants for status; keep them short.",
      "empty_states": "Use Card with icon + 1-line instruction (e.g., 'Scan an item to begin').",
      "data_testid_rule": "Every row action button must have data-testid including row id (e.g., all-items-edit-min-stock-button-<id>)."
    },

    "badge_variants": {
      "implementation": "Use shadcn Badge but add custom variants via className mapping.",
      "examples": {
        "ok": "bg-[#EAF7F0] text-[#1F7A4D] border border-[#BFE6D0]",
        "low": "bg-[#FFF4E6] text-[#B45309] border border-[#FFD7A8]",
        "expiring": "bg-[#E8F2FF] text-[#0B5CAD] border border-[#BBD7FF]",
        "expired": "bg-[#FFE1DE] text-[#7A1B14] border border-[#FFC2BC]"
      }
    },

    "login_pin_spec": {
      "layout": "Centered card on light clinical background with subtle radial accent (<=20% viewport).",
      "pin": "Use InputOTP for 4–6 digit PIN; show numeric keypad on mobile (inputMode=numeric).",
      "data_testids": {
        "username": "login-username-input",
        "password": "login-password-input",
        "pin": "login-pin-input",
        "submit": "login-submit-button"
      }
    }
  },

  "motion": {
    "principles": [
      "Motion must confirm actions (scan success, queued receive) and guide attention (unknown barcode modal).",
      "Keep durations short: 120–180ms for hover; 180–240ms for dialogs/drawers.",
      "Respect prefers-reduced-motion."
    ],
    "micro_interactions": [
      {
        "element": "Mode toggle buttons",
        "behavior": "On active: subtle background fill + 1px inset ring; on hover: slight lift shadow.",
        "tailwind": "transition-colors duration-150 hover:shadow-sm"
      },
      {
        "element": "Primary buttons",
        "behavior": "Press scale 0.98; focus ring visible.",
        "tailwind": "active:scale-[0.98] transition-[background-color,box-shadow] duration-150"
      },
      {
        "element": "Scan success",
        "behavior": "Flash a small success chip near input for 800ms; toast + optional vibration on mobile."
      }
    ],
    "library": {
      "optional": {
        "name": "framer-motion",
        "use_for": "Scan result chip entrance, drawer transitions, KPI count-up.",
        "install": "npm i framer-motion",
        "note": "Keep usage minimal; do not animate large tables."
      }
    }
  },

  "accessibility": {
    "requirements": [
      "WCAG AA contrast for text and interactive controls.",
      "Visible focus states on all inputs/buttons (ring color uses --ring).",
      "Do not rely on color alone for status: include label text and/or icon.",
      "Large tap targets on mobile: minimum 44px height for primary scan controls.",
      "Keyboard-first: Scan input must be reachable and focused; Enter submits; Esc closes dialogs."
    ],
    "aria_notes": [
      "Camera scanner overlay must have aria-labels for controls.",
      "Tables: ensure column headers are <th> and row actions have accessible names."
    ]
  },

  "libraries": {
    "recommended": [
      {
        "name": "lucide-react",
        "why": "Consistent clinical icons for modes/status; avoid emoji icons.",
        "usage": "Import icons for Use/Receive/Count/Move and status chips."
      },
      {
        "name": "sonner",
        "why": "Already present via shadcn; use for fast feedback to scans.",
        "usage": "Use <Toaster /> once in app shell; toast.success/error on scan outcomes."
      }
    ],
    "camera_scanning": {
      "options": [
        {
          "name": "html5-qrcode",
          "note": "Open-source; good for QR + some barcodes; validate barcode symbologies needed.",
          "install": "npm i html5-qrcode",
          "ui_guidance": "Wrap in full-screen overlay; keep controls large; show permission helper state."
        },
        {
          "name": "commercial SDK (Scanbot/Scandit/Dynamsoft)",
          "note": "If you need robust 1D barcode scanning on mobile web, consider SDK. UI patterns referenced above."
        }
      ]
    },
    "tables": {
      "optional": {
        "name": "@tanstack/react-table",
        "why": "Sorting/filtering/pagination for All Items + Audit Log.",
        "install": "npm i @tanstack/react-table",
        "note": "Keep UI shadcn Table; use TanStack for logic only."
      }
    }
  },

  "image_urls": {
    "policy": "Prefer minimal imagery; this is an internal tool. Use abstract clinical textures only if needed.",
    "categories": [
      {
        "category": "background_texture",
        "description": "Optional subtle noise/grain overlay (CSS) instead of photos.",
        "urls": []
      }
    ]
  },

  "css_tokens": {
    "add_to_index_css": {
      "instructions": "Add these CSS custom properties under :root (in addition to shadcn HSL tokens) for app-specific semantics.",
      "tokens": {
        "--ls-surface": "#FFFFFF",
        "--ls-surface-2": "#F1F6FA",
        "--ls-border": "#D7E2EC",
        "--ls-text": "#0B1220",
        "--ls-text-muted": "#4B5563",
        "--ls-primary": "#0E7490",
        "--ls-primary-soft": "#E6F6FA",
        "--ls-focus": "rgba(14,116,144,0.35)",
        "--ls-shadow-sm": "0 1px 2px rgba(16,24,40,0.06)",
        "--ls-shadow-md": "0 8px 24px rgba(16,24,40,0.10)",
        "--ls-radius": "12px"
      }
    }
  },

  "instructions_to_main_agent": [
    "Remove default CRA App.css centering/dark header styles; do not center the app container.",
    "Update shadcn tokens in index.css to the provided clinical palette; keep light theme default.",
    "Implement Scan page as the primary route; barcode input must auto-focus and re-focus after submit.",
    "Use shadcn ToggleGroup for the 4 scan modes; large tap targets; include lucide icons.",
    "Unknown barcode flow: open Dialog (desktop) / Drawer (mobile) with minimal required fields; primary action 'Register & Continue'.",
    "Tables: use shadcn Table with sticky header; dense row height; right-align numeric columns; add status badges.",
    "All interactive + key informational elements must include data-testid (kebab-case).",
    "Use Sonner toasts for scan feedback; keep durations short; do not animate large tables.",
    "Ensure accessibility: visible focus rings, AA contrast, keyboard shortcuts (Enter submit, Esc close)."
  ],

  "general_ui_ux_design_guidelines": "<General UI UX Design Guidelines>  \n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
