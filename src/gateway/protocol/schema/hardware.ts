import { Type, type Static } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

const HardwareActionInputSchema = Type.Object({}, { additionalProperties: true });

export const HardwareAdaptersListParamsSchema = Type.Object({}, { additionalProperties: false });
export type HardwareAdaptersListParams = Static<typeof HardwareAdaptersListParamsSchema>;

export const HardwareResourcesListParamsSchema = Type.Object(
  {
    adapterId: Type.Optional(NonEmptyString),
    query: Type.Optional(NonEmptyString),
    includeState: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type HardwareResourcesListParams = Static<typeof HardwareResourcesListParamsSchema>;

export const HardwareResourceGetParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);
export type HardwareResourceGetParams = Static<typeof HardwareResourceGetParamsSchema>;

export const HardwareResourceActionParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    action: NonEmptyString,
    input: Type.Optional(HardwareActionInputSchema),
  },
  { additionalProperties: false },
);
export type HardwareResourceActionParams = Static<typeof HardwareResourceActionParamsSchema>;

export const HardwareWatchSubscribeParamsSchema = Type.Object(
  {
    adapterId: Type.Optional(NonEmptyString),
    id: Type.Optional(NonEmptyString),
    query: Type.Optional(NonEmptyString),
    includeState: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type HardwareWatchSubscribeParams = Static<typeof HardwareWatchSubscribeParamsSchema>;

export const HardwareWatchUnsubscribeParamsSchema = Type.Object(
  {
    subscriptionId: NonEmptyString,
  },
  { additionalProperties: false },
);
export type HardwareWatchUnsubscribeParams = Static<typeof HardwareWatchUnsubscribeParamsSchema>;
