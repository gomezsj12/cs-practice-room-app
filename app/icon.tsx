import { createPwaIcon } from "@/lib/pwaIcon";

export const size = {
  width: 192,
  height: 192,
};

export const contentType = "image/png";

export default function Icon() {
  return createPwaIcon(192);
}