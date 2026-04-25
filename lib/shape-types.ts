import type { ViewportPresetId } from "@/lib/viewports";

export type ShapeId = string & { __brand: "shape-id" };

export type ScreenShapeProps = {
  w: number;
  h: number;
  name: string;
  viewportId: ViewportPresetId;
  code: string;
  statusBarStyle: "light" | "dark";
  parentScreenId: string;
  dataEntityName?: string;
  dataRecordId?: string;
  variantGroupId?: string;
  variantName?: string;
  variantRole?: "main" | "alt";
};

export type ScreenShape = {
  id: ShapeId;
  type: "screen";
  x: number;
  y: number;
  props: ScreenShapeProps;
};
