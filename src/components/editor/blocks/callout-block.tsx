"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { defaultBlockSpecs, BlockNoteSchema } from "@blocknote/core";
import { Info, AlertTriangle, Lightbulb, AlertCircle } from "lucide-react";

const calloutVariants = {
  info: {
    icon: Info,
    label: "Info",
    bgLight: "#e8f4fd",
    bgDark: "#1a2a3a",
    borderColor: "#3b82f6",
    textLight: "#1e40af",
    textDark: "#93c5fd",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    bgLight: "#fef9e7",
    bgDark: "#2a2514",
    borderColor: "#f59e0b",
    textLight: "#92400e",
    textDark: "#fcd34d",
  },
  tip: {
    icon: Lightbulb,
    label: "Tip",
    bgLight: "#ecfdf5",
    bgDark: "#0f291e",
    borderColor: "#10b981",
    textLight: "#065f46",
    textDark: "#6ee7b7",
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    bgLight: "#fef2f2",
    bgDark: "#2a1414",
    borderColor: "#ef4444",
    textLight: "#991b1b",
    textDark: "#fca5a5",
  },
} as const;

export type CalloutVariant = keyof typeof calloutVariants;

/**
 * Custom Callout block for BlockNote.
 * Renders as a colored box with icon and supports info/warning/tip/error variants.
 * Serializes to GitHub-flavored markdown admonitions: > [!NOTE], > [!WARNING], etc.
 */
export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout" as const,
    propSchema: {
      variant: {
        default: "info" as const,
        values: ["info", "warning", "tip", "error"] as const,
      },
    },
    content: "inline" as const,
  },
  {
    render: ({ block, contentRef, editor }) => {
      const variant = (block.props.variant as CalloutVariant) || "info";
      const config = calloutVariants[variant];
      const IconComponent = config.icon;

      // Detect dark mode from the editor wrapper
      const isDark =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");

      return (
        <div
          className="callout-block"
          data-variant={variant}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "8px",
            borderLeft: `4px solid ${config.borderColor}`,
            backgroundColor: isDark ? config.bgDark : config.bgLight,
            margin: "4px 0",
            position: "relative",
          }}
        >
          {/* Variant selector dropdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
            <select
              value={variant}
              onChange={(e) => {
                editor.updateBlock(block, {
                  props: { variant: e.target.value as CalloutVariant },
                });
              }}
              contentEditable={false}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "0",
                width: "20px",
                height: "20px",
                position: "absolute",
                top: "12px",
                left: "16px",
                opacity: 0,
                zIndex: 2,
              }}
            >
              {Object.entries(calloutVariants).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <div
              style={{
                color: config.borderColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                position: "relative",
                zIndex: 1,
              }}
              title={`Click to change type (${config.label})`}
            >
              <IconComponent size={20} />
            </div>
          </div>

          {/* Inline content area */}
          <div
            ref={contentRef}
            style={{
              flex: 1,
              minWidth: 0,
              color: isDark ? config.textDark : config.textLight,
            }}
          />
        </div>
      );
    },
    toExternalHTML: ({ block, contentRef }) => {
      const variant = (block.props.variant as CalloutVariant) || "info";
      const config = calloutVariants[variant];
      const IconComponent = config.icon;

      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "8px",
            borderLeft: `4px solid ${config.borderColor}`,
            backgroundColor: config.bgLight,
          }}
        >
          <IconComponent size={20} style={{ color: config.borderColor }} />
          <div ref={contentRef} style={{ flex: 1 }} />
        </div>
      );
    },
  },
);

/**
 * Creates a BlockNote schema that includes the Callout block
 * alongside all default blocks.
 */
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: CalloutBlock(),
  },
});

export { calloutVariants };
