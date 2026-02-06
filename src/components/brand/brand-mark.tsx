import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkVariant = "icon" | "wordmark";
type BrandMarkTheme = "auto" | "light" | "dark";

interface BrandMarkProps {
  variant?: BrandMarkVariant;
  /** Pixel height for the mark. Width scales to preserve the asset ratio. */
  size?: number;
  className?: string;
  imageClassName?: string;
  lightImageClassName?: string;
  darkImageClassName?: string;
  theme?: BrandMarkTheme;
  alt?: string;
  priority?: boolean;
}

const ICON_RATIO = 265 / 235;
const WORDMARK_RATIO = 1152 / 235;

export function BrandMark({
  variant = "icon",
  size = 24,
  className,
  imageClassName,
  lightImageClassName,
  darkImageClassName,
  theme = "auto",
  alt = "ClawPad",
  priority = false,
}: BrandMarkProps) {
  const isIcon = variant === "icon";
  const height = size;
  const ratio = isIcon ? ICON_RATIO : WORDMARK_RATIO;
  const width = Math.round(size * ratio);
  const src = isIcon ? "/brand/icon.png" : "/brand/logo.png";
  const themedClassName =
    theme === "dark"
      ? darkImageClassName
      : theme === "light"
        ? lightImageClassName
        : undefined;

  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src={src}
        width={width}
        height={height}
        alt={alt}
        priority={priority}
        className={cn("block", imageClassName, themedClassName)}
      />
    </span>
  );
}
